import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { z, ZodError } from 'zod';
import { calculateChart } from '@/modules/astro-engine';
import { calculateSynastryAspects } from '@/modules/astro-engine/synastry';
import { calculateCompatibilityScores } from '@/modules/astro-engine/synastry-scoring';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { natalCharts, synastryResults } from '@/shared/lib/schema';
import { coordinatesSchema, isoDateSchema, timeSchema, timezoneSchema, houseSystemSchema } from '@/shared/validation';
import type { ChartResult } from '@/shared/types';
import { HouseSystem } from '@/shared/types';

// Placeholder for temp charts not yet encrypted/saved
const TEMP_BIRTH_DATA_PLACEHOLDER = 'PENDING';

const birthDataSchema = z.object({
  name: z.string().max(100).optional(),
  date: isoDateSchema,
  time: timeSchema.nullable(),
  latitude: coordinatesSchema.shape.latitude,
  longitude: coordinatesSchema.shape.longitude,
  timezone: timezoneSchema,
  houseSystem: houseSystemSchema.nullable().optional(),
});

const synastryRequestSchema = z.object({
  birthData1: birthDataSchema,
  birthData2: birthDataSchema,
});

export async function POST(request: Request) {
  // 1. Auth — synastry requires authentication to prevent abuse
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  // 2. Rate limiting (keyed by userId, not IP)
  const limiter = getRateLimiter('synastry/calculate');
  const { success: rateLimitOk } = await limiter.limit(userId);

  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // 2. Parse and validate request body
  let body: z.infer<typeof synastryRequestSchema>;
  try {
    const raw = await request.json();
    body = synastryRequestSchema.parse(raw);
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

  // 3. Calculate both charts
  let chart1: ChartResult;
  let chart2: ChartResult;
  try {
    chart1 = calculateChart({
      date: body.birthData1.date,
      time: body.birthData1.time,
      latitude: body.birthData1.latitude,
      longitude: body.birthData1.longitude,
      timezone: body.birthData1.timezone,
      houseSystem: body.birthData1.houseSystem ?? HouseSystem.Placidus,
    });
    chart2 = calculateChart({
      date: body.birthData2.date,
      time: body.birthData2.time,
      latitude: body.birthData2.latitude,
      longitude: body.birthData2.longitude,
      timezone: body.birthData2.timezone,
      houseSystem: body.birthData2.houseSystem ?? HouseSystem.Placidus,
    });
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[synastry/calculate] calculation error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'CALCULATION_ERROR' },
      { status: 500 },
    );
  }

  // 4. Calculate synastry aspects and scores
  const aspects = calculateSynastryAspects(chart1, chart2);
  const scores = calculateCompatibilityScores(aspects);

  // 5. Persist charts and synastry result
  const chart1Id = nanoid();
  const chart2Id = nanoid();
  const synastryId = nanoid();

  try {
    const db = getDb();
    await db.insert(natalCharts).values([
      {
        id: chart1Id,
        userId,
        status: 'temp',
        encryptedBirthData: TEMP_BIRTH_DATA_PLACEHOLDER,
        houseSystem: body.birthData1.houseSystem ?? HouseSystem.Placidus,
        ayanamsa: 'lahiri',
        chartData: chart1,
      },
      {
        id: chart2Id,
        userId,
        status: 'temp',
        encryptedBirthData: TEMP_BIRTH_DATA_PLACEHOLDER,
        houseSystem: body.birthData2.houseSystem ?? HouseSystem.Placidus,
        ayanamsa: 'lahiri',
        chartData: chart2,
      },
    ]);

    await db.insert(synastryResults).values({
      id: synastryId,
      userId,
      chart1Id,
      chart2Id,
      overallScore: scores.overall,
      categoryScores: scores.categories,
      aspects,
      aiAnalysis: null,
    });
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[synastry/calculate] db insert error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }

  // 6. Build summary for each chart
  const chart1Summary = {
    sunSign: chart1.planets.find((p) => p.planet === 'Sun')?.sign ?? null,
    moonSign: chart1.planets.find((p) => p.planet === 'Moon')?.sign ?? null,
    ascendant: chart1.ascendant?.sign ?? null,
    name: body.birthData1.name ?? null,
  };
  const chart2Summary = {
    sunSign: chart2.planets.find((p) => p.planet === 'Sun')?.sign ?? null,
    moonSign: chart2.planets.find((p) => p.planet === 'Moon')?.sign ?? null,
    ascendant: chart2.ascendant?.sign ?? null,
    name: body.birthData2.name ?? null,
  };

  return NextResponse.json(
    {
      success: true,
      data: {
        id: synastryId,
        aspects,
        scores,
        chart1Summary,
        chart2Summary,
      },
      error: null,
    },
    { status: 200 },
  );
}
