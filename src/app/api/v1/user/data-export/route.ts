/**
 * GET /api/v1/user/data-export
 *
 * GDPR Article 20 — Right to Data Portability.
 * Exports all user data as a JSON document:
 *   - Account profile
 *   - All saved natal charts (with decrypted birth data)
 *   - All Cosmic Passport records
 *
 * Auth: required (Clerk JWT). Owner-only — cannot export another user's data.
 * Rate limit: 2 requests per hour per user (export is expensive).
 */

import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getDb } from '@/shared/lib/db';
import { natalCharts, cosmicPassports, users } from '@/shared/lib/schema';
import { decryptBirthData } from '@/shared/encryption/pii';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { getRateLimiter } from '@/shared/lib/rate-limit';

export async function GET(): Promise<NextResponse> {
  // ---------------------------------------------------------------------------
  // 1. Auth — JWT verification, no DB round-trip
  // ---------------------------------------------------------------------------
  let userId: string;
  let userEmail: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
    userEmail = user.email;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  // ---------------------------------------------------------------------------
  // 2. Rate limiting — 2 exports per hour (export is DB-heavy)
  // ---------------------------------------------------------------------------
  const limiter = getRateLimiter('chart/save'); // reuse existing limiter bucket
  const { success: rateLimitOk } = await limiter.limit(`data-export:${userId}`);

  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Fetch and assemble export package
  // ---------------------------------------------------------------------------
  try {
    const db = getDb();

    // User profile
    const [profile] = await db
      .select({
        id: users.id,
        email: users.email,
        consentAt: users.consentAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Saved charts
    const chartRows = await db
      .select()
      .from(natalCharts)
      .where(eq(natalCharts.userId, userId));

    // Decrypt birth data for each chart.
    // Any decryption failure is captured but does not abort the export —
    // we still return the rest of the data.
    const charts = chartRows.map((row) => {
      let birthData: ReturnType<typeof decryptBirthData> | null = null;
      try {
        birthData = decryptBirthData(row.encryptedBirthData);
      } catch (decryptErr) {
        // Log server-side only — never expose decryption errors to the client
        console.error('[data-export] decrypt failed for chart', row.id, decryptErr);
      }

      return {
        id: row.id,
        name: row.name ?? null,
        status: row.status,
        houseSystem: row.houseSystem,
        ayanamsa: row.ayanamsa,
        birthData,
        chartData: row.chartData,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    // Passport records (no PII — derived results only)
    // Use inArray to fetch only passports linked to this user's charts.
    const ownedChartIds = chartRows.map((c) => c.id);
    const passportRows =
      ownedChartIds.length > 0
        ? await db
            .select()
            .from(cosmicPassports)
            .where(inArray(cosmicPassports.chartId, ownedChartIds))
        : [];

    const passports = passportRows.map((p) => ({
        id: p.id,
        chartId: p.chartId,
        sunSign: p.sunSign,
        moonSign: p.moonSign,
        ascendantSign: p.ascendantSign ?? null,
        element: p.element,
        rulingPlanet: p.rulingPlanet,
        rarityPercent: p.rarityPercent,
        createdAt: p.createdAt.toISOString(),
      }));

    // ---------------------------------------------------------------------------
    // 4. Assemble export document
    // ---------------------------------------------------------------------------
    const exportDoc = {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      user: {
        id: profile?.id ?? userId,
        email: profile?.email ?? userEmail,
        consentAt: profile?.consentAt?.toISOString() ?? null,
        accountCreatedAt: profile?.createdAt?.toISOString() ?? null,
      },
      charts,
      passports,
    };

    // ---------------------------------------------------------------------------
    // 5. Analytics
    // ---------------------------------------------------------------------------
    trackServerEvent(userId, AnalyticsEvent.DATA_EXPORT_REQUESTED);

    // ---------------------------------------------------------------------------
    // 6. Return as downloadable JSON file
    // ---------------------------------------------------------------------------
    return new NextResponse(JSON.stringify(exportDoc, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="estrevia-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[data-export] unexpected error:', err);
    }

    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
