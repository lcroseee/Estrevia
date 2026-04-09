import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { calculateChart } from '@/modules/astro-engine';
import { calculateSynastryAspects } from '@/modules/astro-engine/synastry';
import { calculateCompatibilityScores } from '@/modules/astro-engine/synastry-scoring';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { natalCharts, synastryResults } from '@/shared/lib/schema';
import type { ChartResult } from '@/shared/types';
import { HouseSystem } from '@/shared/types';

// Placeholder for temp charts not yet encrypted/saved
const TEMP_BIRTH_DATA_PLACEHOLDER = 'PENDING';

interface BirthDataInput {
  name?: string;
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  houseSystem: string | null;
}

interface RequestBody {
  birthData1: BirthDataInput;
  birthData2: BirthDataInput;
}

function validateBirthData(data: unknown, label: string): BirthDataInput {
  if (!data || typeof data !== 'object') {
    throw new Error(`${label} is required`);
  }
  const d = data as Record<string, unknown>;
  if (typeof d.date !== 'string' || !d.date) throw new Error(`${label}.date is required`);
  if (typeof d.latitude !== 'number') throw new Error(`${label}.latitude is required`);
  if (typeof d.longitude !== 'number') throw new Error(`${label}.longitude is required`);
  if (typeof d.timezone !== 'string') throw new Error(`${label}.timezone is required`);
  return {
    name: typeof d.name === 'string' ? d.name : undefined,
    date: d.date,
    time: typeof d.time === 'string' ? d.time : null,
    latitude: d.latitude,
    longitude: d.longitude,
    timezone: d.timezone,
    houseSystem: typeof d.houseSystem === 'string' ? d.houseSystem : null,
  };
}

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

  // 2. Parse request body
  let body: RequestBody;
  try {
    const raw = await request.json();
    body = {
      birthData1: validateBirthData(raw.birthData1, 'birthData1'),
      birthData2: validateBirthData(raw.birthData2, 'birthData2'),
    };
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : 'INVALID_REQUEST',
      },
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
      houseSystem: (body.birthData1.houseSystem as HouseSystem) ?? HouseSystem.Placidus,
    });
    chart2 = calculateChart({
      date: body.birthData2.date,
      time: body.birthData2.time,
      latitude: body.birthData2.latitude,
      longitude: body.birthData2.longitude,
      timezone: body.birthData2.timezone,
      houseSystem: (body.birthData2.houseSystem as HouseSystem) ?? HouseSystem.Placidus,
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
        houseSystem: body.birthData1.houseSystem ?? 'Placidus',
        ayanamsa: 'lahiri',
        chartData: chart1,
      },
      {
        id: chart2Id,
        userId,
        status: 'temp',
        encryptedBirthData: TEMP_BIRTH_DATA_PLACEHOLDER,
        houseSystem: body.birthData2.houseSystem ?? 'Placidus',
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
