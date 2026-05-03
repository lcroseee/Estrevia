/**
 * GET /api/cron/advertising/audience-refresh
 *
 * Vercel Cron — runs daily at 06:00 UTC (schedule: "0 6 * * *").
 * Calls runDailyAudienceRefresh() to sync converted user lists,
 * update retargeting pools, and rebuild lookalike seed audiences.
 *
 * Protected by CRON_SECRET. Respects ADVERTISING_AGENT_ENABLED kill switch.
 *
 * Wave 1 / Track 7: real Stripe / PostHog / Meta CA implementations are
 * wired in below. Each per-audience-kind error path tags Sentry with
 * `subsystem: 'audiences'` so on-call can filter alerts.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { runDailyAudienceRefresh } from '@/modules/advertising/audiences/refresh-cycle';
import type { ExclusionsDeps } from '@/modules/advertising/audiences/exclusions';
import type { RetargetingDeps } from '@/modules/advertising/audiences/retargeting';
import { listActiveCustomers } from '@/modules/advertising/audiences/stripe-client';
import {
  getRecentlyRegisteredEmails,
  getCalcNoRegisterEmails,
  getRegisterNoPaidEmails,
} from '@/modules/advertising/audiences/posthog-emails';
import { upsertCustomAudience } from '@/modules/advertising/audiences/meta-custom-audiences';
import { upsertAudienceRow } from '@/modules/advertising/audiences/audience-row-store';

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

    // Per-outcome Sentry tagging — each failed audience surfaces with
    // `subsystem: 'audiences'` and `kind: '<outcome.kind>'` so on-call can
    // filter alerts to just this cron path.
    for (const outcome of report.outcomes) {
      if (outcome.error !== undefined) {
        Sentry.captureException(new Error(outcome.error), {
          tags: {
            cron: true,
            route: '/api/cron/advertising/audience-refresh',
            subsystem: 'audiences',
            kind: outcome.kind,
          },
        });
      }
    }

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
      tags: {
        cron: true,
        route: '/api/cron/advertising/audience-refresh',
        subsystem: 'audiences',
      },
    });
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Dependency factories — wire real Stripe / PostHog / Meta CA modules
// (Wave 1 / Track 7). Each external client throws on misconfiguration so the
// cron's outer try/catch reports the failure to Sentry with proper tags.
// ---------------------------------------------------------------------------

function buildExclusionsDeps(): ExclusionsDeps {
  return {
    stripe: { listActiveCustomers },
    posthog: { getRecentlyRegisteredEmails },
    metaApi: { upsertCustomAudience },
    db: { upsertAudienceRow },
  };
}

function buildRetargetingDeps(): RetargetingDeps {
  return {
    posthog: {
      getCalcNoRegisterEmails,
      getRegisterNoPaidEmails,
    },
    metaApi: { upsertCustomAudience },
    db: {
      upsertAudienceRow,
      // Feature-gate flipping is out of scope for v3a Track 7 — the
      // retargeting audiences are built but kept inactive until v3b enables
      // gate management. Stubs return safe defaults so the refresh succeeds.
      getFeatureGateMode: async (_featureId: string): Promise<string | null> => null,
      activateFeatureGate: async (featureId: string): Promise<void> => {
        console.info('[audience-refresh] feature-gate flip stub:', featureId);
      },
    },
  };
}
