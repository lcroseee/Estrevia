import { NextResponse } from 'next/server';
import { requirePremium } from '@/modules/auth/lib/premium';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { requireAuth } from '@/modules/auth/lib/helpers';

interface CardInReading {
  position: string;
  cardId: string;
  cardName: string;
  reversed: boolean;
}

interface InterpretRequest {
  spreadType: string;
  cards: CardInReading[];
  sunSign?: string;
  moonSign?: string;
}

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

  // Parse body
  let body: InterpretRequest;
  try {
    const raw = await request.json();
    if (!Array.isArray(raw.cards) || raw.cards.length === 0) {
      throw new Error('cards array required');
    }
    body = {
      spreadType: String(raw.spreadType ?? 'reading'),
      cards: raw.cards,
      sunSign: raw.sunSign,
      moonSign: raw.moonSign,
    };
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_REQUEST' },
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
