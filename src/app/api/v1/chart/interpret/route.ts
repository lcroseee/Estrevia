import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import { requirePremium } from '@/modules/auth/lib/premium';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { chartReadings, natalCharts } from '@/shared/lib/schema';
import { buildChartInterpretationPrompt } from '@/modules/astro-engine/lib/chart-interpretation-prompt';
import type { ChartResult } from '@/shared/types';

const interpretSchema = z.object({
  chartId: z.string().min(1).max(64),
  locale: z.enum(['en', 'es']).default('en'),
});

/**
 * POST /api/v1/chart/interpret
 *
 * AI-powered natal chart interpretation. Pro feature only. Response is cached
 * in `chart_readings` keyed by (chart_id, locale) so revisits are free.
 */
export async function POST(request: Request) {
  // -----------------------------------------------------------------------
  // 1. Auth + premium check (single call; throws Response on failure)
  // -----------------------------------------------------------------------
  let userId: string;
  try {
    const user = await requirePremium();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { success: false, data: null, error: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  // -----------------------------------------------------------------------
  // 2. Rate limit (5/min per userId — mirrors tarot/interpret)
  // -----------------------------------------------------------------------
  const limiter = getRateLimiter('chart/interpret');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // -----------------------------------------------------------------------
  // 3. Parse + validate
  // -----------------------------------------------------------------------
  let body: z.infer<typeof interpretSchema>;
  try {
    const raw = await request.json();
    body = interpretSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, data: null, error: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const db = getDb();

  // -----------------------------------------------------------------------
  // 4. Cache hit?
  // -----------------------------------------------------------------------
  const cached = await db
    .select({ body: chartReadings.body })
    .from(chartReadings)
    .where(
      and(
        eq(chartReadings.chartId, body.chartId),
        eq(chartReadings.locale, body.locale),
      ),
    )
    .limit(1);

  if (cached.length > 0) {
    return NextResponse.json(
      { success: true, data: { reading: cached[0].body, source: 'cache' }, error: null },
      { status: 200 },
    );
  }

  // -----------------------------------------------------------------------
  // 5. Load chart data
  // -----------------------------------------------------------------------
  const rows = await db
    .select({ chartData: natalCharts.chartData })
    .from(natalCharts)
    .where(eq(natalCharts.id, body.chartId))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json(
      { success: false, data: null, error: 'CHART_NOT_FOUND' },
      { status: 404 },
    );
  }

  // -----------------------------------------------------------------------
  // 6. LLM call
  // -----------------------------------------------------------------------
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[chart/interpret] ANTHROPIC_API_KEY not configured');
    return NextResponse.json(
      { success: false, data: null, error: 'SERVICE_UNAVAILABLE' },
      { status: 503 },
    );
  }

  const chartData = rows[0].chartData as ChartResult;
  const prompt = buildChartInterpretationPrompt(chartData, body.locale);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      console.error('[chart/interpret] Anthropic API error:', response.status, errText);
      return NextResponse.json(
        { success: false, data: null, error: 'AI_SERVICE_ERROR' },
        { status: 502 },
      );
    }

    const result = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const reading = result.content?.find((c) => c.type === 'text')?.text ?? null;

    if (!reading) {
      return NextResponse.json(
        { success: false, data: null, error: 'EMPTY_RESPONSE' },
        { status: 502 },
      );
    }

    // -----------------------------------------------------------------------
    // 7. Cache write (best-effort; failure does NOT block the client response)
    // -----------------------------------------------------------------------
    try {
      await db
        .insert(chartReadings)
        .values({
          id: nanoid(),
          chartId: body.chartId,
          locale: body.locale,
          body: reading,
          model: 'claude-sonnet-4-20250514',
        })
        .onConflictDoNothing();
    } catch (err) {
      console.error('[chart/interpret] cache write failed:', err);
      // Don't fail the request — the user already has their reading.
    }

    return NextResponse.json(
      { success: true, data: { reading, source: 'generated' }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[chart/interpret] unexpected error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
