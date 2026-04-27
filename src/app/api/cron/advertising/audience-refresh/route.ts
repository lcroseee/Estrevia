/**
 * GET /api/cron/advertising/audience-refresh
 *
 * Vercel Cron — runs daily at 06:00 UTC (schedule: "0 6 * * *").
 * Calls S5's runDailyAudienceRefresh() to sync converted user lists,
 * update retargeting pools, and rebuild lookalike seed audiences.
 *
 * Protected by CRON_SECRET. Respects ADVERTISING_AGENT_ENABLED kill switch.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { runDailyAudienceRefresh } from '@/modules/advertising/audiences/refresh-cycle';
import type { ExclusionsDeps } from '@/modules/advertising/audiences/exclusions';
import type { RetargetingDeps } from '@/modules/advertising/audiences/retargeting';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 1. Auth
  const authError = assertCronAuth(request);
  if (authError) return authError;

  // 2. Kill switch
  if (process.env.ADVERTISING_AGENT_ENABLED !== 'true') {
    return NextResponse.json({ success: false, reason: 'kill_switch' });
  }

  // 3. Run audience refresh
  try {
    const exclusionsDeps = buildExclusionsDeps();
    const retargetingDeps = buildRetargetingDeps();

    const report = await runDailyAudienceRefresh({
      exclusions: exclusionsDeps,
      retargeting: retargetingDeps,
    });

    const summary = {
      ran_at: report.ran_at.toISOString(),
      total_audiences: report.total_audiences,
      failed_audiences: report.failed_audiences,
      outcomes: report.outcomes.map((o) => ({
        kind: o.kind,
        ...(o.error !== undefined ? { error: o.error } : {}),
        ...('result' in o && o.result !== undefined
          ? {
              result:
                'skipped' in o.result && o.result.skipped
                  ? { skipped: true }
                  : { audience_id: (o.result as { audience_id: string }).audience_id },
            }
          : {}),
      })),
    };

    console.info('[cron/advertising/audience-refresh] completed', summary);
    return NextResponse.json({ success: true, summary });
  } catch (e) {
    console.error('[cron/advertising/audience-refresh] failed', e);
    Sentry.captureException(e, {
      tags: { cron: true, route: '/api/cron/advertising/audience-refresh' },
    });
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Dependency factories — Phase 2 will wire in real SDK clients
// ---------------------------------------------------------------------------

function buildExclusionsDeps(): ExclusionsDeps {
  return {
    stripe: {
      listActiveCustomers: async () => {
        // Phase 2: real Stripe SDK call
        return [];
      },
    },
    posthog: {
      getRecentlyRegisteredEmails: async (_sinceDate: Date): Promise<string[]> => {
        // Phase 2: posthog-node SDK query
        return [];
      },
    },
    metaApi: {
      upsertCustomAudience: async (_opts) => {
        // Phase 2: Meta Custom Audiences API
        throw new Error('[audience-refresh] upsertCustomAudience not yet implemented');
      },
    },
    db: {
      upsertAudienceRow: async (row) => {
        // Phase 2: Drizzle insert
        return { id: 'placeholder', ...row } as ReturnType<ExclusionsDeps['db']['upsertAudienceRow']> extends Promise<infer T> ? T : never;
      },
    },
  };
}

function buildRetargetingDeps(): RetargetingDeps {
  return {
    posthog: {
      getCalcNoRegisterEmails: async (_windowDays: number): Promise<string[]> => {
        // Phase 2: posthog-node SDK query
        return [];
      },
      getRegisterNoPaidEmails: async (_windowDays: number): Promise<string[]> => {
        // Phase 2: posthog-node SDK query
        return [];
      },
    },
    metaApi: {
      upsertCustomAudience: async (_opts) => {
        // Phase 2: Meta Custom Audiences API
        throw new Error('[audience-refresh] upsertCustomAudience not yet implemented');
      },
    },
    db: {
      upsertAudienceRow: async (row) => {
        // Phase 2: Drizzle insert
        return { id: 'placeholder', ...row } as ReturnType<RetargetingDeps['db']['upsertAudienceRow']> extends Promise<infer T> ? T : never;
      },
      getFeatureGateMode: async (_featureId: string): Promise<string | null> => {
        // Phase 2: real DB query
        return null;
      },
      activateFeatureGate: async (_featureId: string): Promise<void> => {
        // Phase 2: real DB update
        console.info('[audience-refresh] activating feature gate:', _featureId);
      },
    },
  };
}
