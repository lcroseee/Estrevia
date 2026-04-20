import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requirePremium } from '@/modules/auth/lib/premium';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { synastryResults } from '@/shared/lib/schema';
import type { ApiResponse } from '@/shared/types';

interface AnalyzeResponse {
  analysis: string;
  cached: boolean;
}

interface SynastryRow {
  id: string;
  userId: string | null;
  overallScore: number;
  categoryScores: unknown;
  aspects: unknown;
  aiAnalysis: string | null;
}

interface CategoryScores {
  emotional?: number;
  communication?: number;
  passion?: number;
  stability?: number;
  growth?: number;
}

interface SynastryAspect {
  planet1?: string;
  planet2?: string;
  type?: string;
  orb?: number;
  weight?: number;
}

function buildPrompt(row: SynastryRow): string {
  const cats = (row.categoryScores ?? {}) as CategoryScores;
  const aspects = (row.aspects ?? []) as SynastryAspect[];
  const topAspects = aspects.slice(0, 12);

  const aspectLines = topAspects
    .map(
      (a) =>
        `- ${a.planet1 ?? '?'} ${a.type ?? '?'} ${a.planet2 ?? '?'} (orb ${a.orb?.toFixed(1) ?? '?'}°)`,
    )
    .join('\n');

  const catLines = [
    cats.emotional !== undefined ? `Emotional ${cats.emotional}/100` : null,
    cats.communication !== undefined ? `Communication ${cats.communication}/100` : null,
    cats.passion !== undefined ? `Passion ${cats.passion}/100` : null,
    cats.stability !== undefined ? `Stability ${cats.stability}/100` : null,
    cats.growth !== undefined ? `Growth ${cats.growth}/100` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return `You are an expert astrologer specializing in synastry (chart compatibility) using sidereal astrology (Lahiri ayanamsa). Interpret the following compatibility data.

Overall compatibility score: ${row.overallScore}/100
Category scores: ${catLines}

Top inter-chart aspects:
${aspectLines}

Provide an insightful, balanced synastry interpretation in 4–5 paragraphs:
1. Overall energetic dynamic between the two charts.
2. Strongest harmonious pattern and what it offers the relationship.
3. Most significant tension and how the two people can work with it.
4. Long-term potential — what this synastry rewards over time.

Use evocative language. Avoid the word "journey". Do NOT make medical, financial, or therapeutic claims. End with a one-sentence reminder that astrology is a lens for self-reflection, not a substitute for professional advice.`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<AnalyzeResponse>>> {
  // 1. Auth + premium
  let userId: string;
  try {
    await requirePremium();
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    return NextResponse.json(
      { success: false, data: null, error: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  // 2. Rate limit (Pro user, 5 req/min — these are expensive calls)
  const limiter = getRateLimiter('synastry/analyze');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // 3. Load synastry row + verify ownership
  const { id } = await params;
  const db = getDb();
  const rows = await db
    .select({
      id: synastryResults.id,
      userId: synastryResults.userId,
      overallScore: synastryResults.overallScore,
      categoryScores: synastryResults.categoryScores,
      aspects: synastryResults.aspects,
      aiAnalysis: synastryResults.aiAnalysis,
    })
    .from(synastryResults)
    .where(eq(synastryResults.id, id))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json(
      { success: false, data: null, error: 'NOT_FOUND' },
      { status: 404 },
    );
  }
  const row = rows[0] as SynastryRow;
  if (row.userId !== userId) {
    return NextResponse.json(
      { success: false, data: null, error: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  // 4. Cache hit — return existing analysis
  if (row.aiAnalysis) {
    return NextResponse.json(
      { success: true, data: { analysis: row.aiAnalysis, cached: true }, error: null },
      { status: 200 },
    );
  }

  // 5. Call Anthropic Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[synastry/analyze] ANTHROPIC_API_KEY not configured');
    return NextResponse.json(
      { success: false, data: null, error: 'SERVICE_UNAVAILABLE' },
      { status: 503 },
    );
  }

  try {
    const prompt = buildPrompt(row);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      console.error('[synastry/analyze] Anthropic API error:', response.status, errText);
      return NextResponse.json(
        { success: false, data: null, error: 'AI_SERVICE_ERROR' },
        { status: 502 },
      );
    }

    const result = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const analysis = result.content?.find((c) => c.type === 'text')?.text ?? null;

    if (!analysis) {
      return NextResponse.json(
        { success: false, data: null, error: 'EMPTY_RESPONSE' },
        { status: 502 },
      );
    }

    // 6. Persist
    await db
      .update(synastryResults)
      .set({ aiAnalysis: analysis })
      .where(eq(synastryResults.id, id));

    return NextResponse.json(
      { success: true, data: { analysis, cached: false }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[synastry/analyze] unexpected error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
