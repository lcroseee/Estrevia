import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { calcPlanet, SWEPH_BODY_IDS } from '@/modules/astro-engine';
import { getDb } from '@/shared/lib/db';
import { redis } from '@/shared/lib/redis';

/**
 * GET /api/health
 *
 * Comprehensive healthcheck: verifies sweph native addon, Neon DB, and
 * Upstash Redis are reachable. Returns 200 only if all three pass.
 * Returns 503 with per-service detail if any check fails.
 *
 * Used by uptime monitors and post-deploy verification.
 */

const J2000_JULIAN_DAY = 2451545.0;
const CHECK_TIMEOUT_MS = 2000;

type CheckResult = { ok: boolean; latencyMs?: number; error?: string };

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function checkSweph(): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    calcPlanet(J2000_JULIAN_DAY, SWEPH_BODY_IDS.SE_SUN);
    return { ok: true, latencyMs: Math.round(performance.now() - t0) };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - t0),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkDb(): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    const db = getDb();
    await withTimeout(db.execute(sql`SELECT 1`), CHECK_TIMEOUT_MS);
    return { ok: true, latencyMs: Math.round(performance.now() - t0) };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - t0),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    await withTimeout(redis.ping(), CHECK_TIMEOUT_MS);
    return { ok: true, latencyMs: Math.round(performance.now() - t0) };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - t0),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const [sweph, db, redisResult] = await Promise.all([
    checkSweph(),
    checkDb(),
    checkRedis(),
  ]);

  const allOk = sweph.ok && db.ok && redisResult.ok;

  const body = {
    status: allOk ? 'ok' : 'degraded',
    sweph: sweph.ok ? 'ok' : `error: ${sweph.error}`,
    db: db.ok ? 'ok' : `error: ${db.error}`,
    redis: redisResult.ok ? 'ok' : `error: ${redisResult.error}`,
    latency: {
      swephMs: sweph.latencyMs,
      dbMs: db.latencyMs,
      redisMs: redisResult.latencyMs,
    },
  };

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
