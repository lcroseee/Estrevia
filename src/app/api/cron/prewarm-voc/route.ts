/**
 * GET /api/cron/prewarm-voc
 *
 * Vercel Cron job — runs daily at 00:00 UTC.
 * Computes VOC Moon periods for the current month and the next calendar month,
 * then stores both results in Upstash Redis (key: voc:YYYY-MM, TTL: 25h).
 *
 * This prevents cold-start timeouts on the public VOC month endpoint:
 *   GET /api/v1/moon/void-of-course/:year/:month
 *
 * The computation is intentionally moved here (out of the user-facing request path)
 * because a full month requires ~132 000 sweph calls which exceed Vercel's 10s
 * cold-start function timeout.
 *
 * Schedule: configured in vercel.json under the "crons" key.
 * Auth: CRON_SECRET Bearer token (assertCronAuth).
 */

import { NextResponse } from 'next/server';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { computeVocMonth, writeVocCache } from '@/modules/astro-engine/voc-cache';

export const runtime = 'nodejs';

// Vercel Cron functions run up to 300 seconds (Pro plan). VOC computation
// for two months is expected to take 30–90 seconds on a warm function.
export const maxDuration = 300;

export async function GET(request: Request): Promise<NextResponse> {
  // Validate Vercel cron auth token
  const authError = assertCronAuth(request);
  if (authError) return authError;

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1; // 1-indexed

  // Also pre-warm next calendar month
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

  const results: Array<{ month: string; periods: number; durationMs: number }> = [];
  const errors: Array<{ month: string; error: string }> = [];

  const targets = [
    { year: currentYear, month: currentMonth },
    { year: nextYear, month: nextMonth },
  ];

  for (const { year, month } of targets) {
    const label = `${year}-${String(month).padStart(2, '0')}`;
    const t0 = Date.now();
    try {
      const periods = computeVocMonth(year, month);
      await writeVocCache(year, month, periods);
      results.push({ month: label, periods: periods.length, durationMs: Date.now() - t0 });
      console.log(`[prewarm-voc] ${label}: ${periods.length} periods in ${Date.now() - t0}ms`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ month: label, error: message });
      console.error(`[prewarm-voc] ${label} failed:`, err);

      try {
        const { captureException } = await import('@sentry/nextjs');
        captureException(err, { extra: { month: label } });
      } catch {
        // Sentry import failure is non-fatal
      }
    }
  }

  const allOk = errors.length === 0;
  return NextResponse.json(
    { ok: allOk, results, errors },
    { status: allOk ? 200 : 207 },
  );
}
