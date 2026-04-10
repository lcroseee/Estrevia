import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { cityQuerySchema } from '@/shared/validation/city';
import { searchCities } from '@/modules/astro-engine/cities';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import type { CitySearchResponse } from '@/shared/types/api';

// Route Handlers are dynamic by default in Next.js 16 — no `dynamic` export needed.
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Rate limiting — keyed by IP
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';

  const limiter = getRateLimiter('cities');
  const { success } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 },
    );
  }

  // request.nextUrl.searchParams is synchronous URLSearchParams on NextRequest
  const { searchParams } = request.nextUrl;

  const rawQ = searchParams.get('q') ?? '';
  const rawLimit = searchParams.get('limit');

  // Parse and validate query parameters
  const parseResult = cityQuerySchema.safeParse({
    q: rawQ,
    limit: rawLimit !== null ? parseInt(rawLimit, 10) : undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message ?? 'Invalid query parameters' },
      { status: 400 },
    );
  }

  const { q, limit } = parseResult.data;

  try {
    const results = searchCities(q, limit);
    const response: CitySearchResponse = { results };
    return NextResponse.json(response);
  } catch (error) {
    Sentry.captureException(error);
    console.error('[api/v1/cities] searchCities failed:', error);
    return NextResponse.json({ error: 'City search temporarily unavailable' }, { status: 503 });
  }
}
