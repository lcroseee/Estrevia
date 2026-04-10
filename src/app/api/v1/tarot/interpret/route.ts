import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requirePremium } from '@/modules/auth/lib/premium';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { requireAuth } from '@/modules/auth/lib/helpers';

const cardSchema = z.object({
  position: z.string().min(1).max(100),
  cardId: z.string().min(1).max(64),
  cardName: z.string().min(1).max(100),
  reversed: z.boolean(),
});

const interpretRequestSchema = z.object({
  spreadType: z.string().min(1).max(50).default('reading'),
  cards: z.array(cardSchema).min(1).max(15),
  sunSign: z.string().max(30).optional(),
  moonSign: z.string().max(30).optional(),
});

type InterpretRequest = z.infer<typeof interpretRequestSchema>;

function buildPrompt(data: InterpretRequest): string {
  const cardsText = data.cards
    .map(
      (c) =>
        `- Position "${c.position}": ${c.cardName}${c.reversed ? ' (Reversed)' : ''}`,
    )
    .join('\n');

  const natalContext =
    data.sunSign || data.moonSign
      ? `\nThe querent's natal placements: Sun in ${data.sunSign ?? 'unknown'}, Moon in ${data.moonSign ?? 'unknown'}.`
      : '';

  return `You are an expert tarot reader in the Thoth tradition (Aleister Crowley). Interpret the following ${data.spreadType} reading.

Cards drawn:
${cardsText}
${natalContext}

Provide a concise, insightful interpretation (3-5 paragraphs). Focus on:
1. How the cards relate to each other and their positions
2. The overall narrative arc of the reading
3. Practical guidance based on the cards

Use evocative language appropriate to the Thoth tradition. Do NOT use the word "journey". Include the disclaimer that tarot is for self-reflection, not professional advice.`;
}

/**
 * POST /api/v1/tarot/interpret
 * AI-powered tarot reading interpretation. Pro feature only.
 */
export async function POST(request: Request) {
  // Auth + premium check
  let userId: string;
  try {
    await requirePremium();
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { success: false, data: null, error: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  // Rate limiting
  const limiter = getRateLimiter('tarot/interpret');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // Parse and validate body
  let body: InterpretRequest;
  try {
    const raw = await request.json();
    body = interpretRequestSchema.parse(raw);
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

  // Call Anthropic Claude API
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[tarot/interpret] ANTHROPIC_API_KEY not configured');
    return NextResponse.json(
      { success: false, data: null, error: 'SERVICE_UNAVAILABLE' },
      { status: 503 },
    );
  }

  try {
    const prompt = buildPrompt(body);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      console.error('[tarot/interpret] Anthropic API error:', response.status, errText);
      return NextResponse.json(
        { success: false, data: null, error: 'AI_SERVICE_ERROR' },
        { status: 502 },
      );
    }

    const result = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    const interpretation =
      result.content?.find((c) => c.type === 'text')?.text ?? null;

    if (!interpretation) {
      return NextResponse.json(
        { success: false, data: null, error: 'EMPTY_RESPONSE' },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: { interpretation },
        error: null,
      },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[tarot/interpret] unexpected error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
