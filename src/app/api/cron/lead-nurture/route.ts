/**
 * GET /api/cron/lead-nurture
 *
 * Vercel Cron — runs hourly at minute 0.
 *
 * Sweeps `email_leads` for due nurture-drip sends via a table-driven
 * step dispatcher. After 2026-05-19 curiosity-drip rebuild, the steps are:
 *
 *   step 0 → T+0 chart email           (cliffhanger: Sun + planet tease)
 *   step 1 → T+1h curiosity hook       (NEW: dominant-planet reveal + paywall)
 *   step 2 → T+24h moon-asc            (deeper reveals + AI-reading teaser)
 *   step 3 → T+72h paywall teaser      (third paywall push)
 *   step 4 → T+7d saturn weekly        (brand-building)
 *   step 5 → T+14d mini reading        (brand-building)
 *   step 6 → T+21d synastry teaser     (brand-building)
 *   step 7 → terminal                  (no further sends)
 *
 * Also handles T+0 recovery: leads with `nurture_step=0 AND nurture_next_at
 * IS NULL AND created_at < NOW() - 15min` had the initial waitUntil send
 * fail; the hourly cron retries.
 *
 * Filters out leads that have converted, unsubscribed, or marked as
 * undeliverable. Idempotency is enforced inside the send functions via
 * a UNIQUE INDEX on (lead_id, email_type) in sent_lead_emails — so
 * double-runs of this cron cannot send the same email twice.
 *
 * Per-lead failures are caught and logged (Sentry) — the loop continues
 * so a single Resend 5xx does not block other leads. Catastrophic failures
 * (DB unreachable) return 200 with summary rather than 500 — we do not
 * want Vercel to page on transient infra; the next hour retries naturally.
 *
 * Pacing: when the batch is >5 leads we sleep 1.1s between sends to stay
 * comfortably under Resend rate limits.
 *
 * Protected by CRON_SECRET (Vercel sends Bearer token in Authorization header).
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { emailLeads } from '@/shared/lib/schema';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { fetchTempChart } from '@/shared/lib/temp-chart';
import {
  sendLeadChartEmail,
  sendLeadCuriosityHookEmail,
  sendLeadMoonAscEmail,
  sendLeadPaywallTeaserEmail,
  sendLeadSaturnWeeklyEmail,
  sendLeadMiniReadingEmail,
  sendLeadSynastryTeaserEmail,
} from '@/shared/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const STUCK_T0_GRACE_MS = 15 * 60 * 1000;
const BATCH_LIMIT = 100;
const RESEND_PACING_MS = 1100; // 1.1s between sends — well under Resend free-tier 10 req/s.

// Step dispatch table. Each row: which step number triggers which send
// function, what email_type it represents, and the delay until the NEXT
// step's nurture_next_at. nextDelayMs=null marks the terminal step.
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Delay between step=0 (registered, T+0 chart sent) and step=1 (cron will
 * pick up to send T+1h curiosity_hook). Exported so the /api/v1/leads
 * waitUntil block can stay in sync — prevents the drift that produced
 * the 24h-vs-1h bug found 2026-05-20.
 */
export const STEP_0_TO_1_DELAY_MS = 1 * HOUR;

interface StepHandler {
  fromStep: number;
  toStep: number;
  send: (params: {
    leadId: string;
    email: string;
    locale: 'en' | 'es';
    chart: Awaited<ReturnType<typeof fetchTempChart>>;
    chartId: string | null;
  }) => Promise<{ sent: boolean; reason?: string }>;
  nextDelayMs: number | null;
}

const STEP_HANDLERS: StepHandler[] = [
  { fromStep: 0, toStep: 1, send: sendLeadChartEmail,           nextDelayMs: STEP_0_TO_1_DELAY_MS },
  { fromStep: 1, toStep: 2, send: sendLeadCuriosityHookEmail,   nextDelayMs: 23 * HOUR },
  { fromStep: 2, toStep: 3, send: sendLeadMoonAscEmail,         nextDelayMs: 2 * DAY },
  { fromStep: 3, toStep: 4, send: sendLeadPaywallTeaserEmail,   nextDelayMs: 4 * DAY },
  { fromStep: 4, toStep: 5, send: sendLeadSaturnWeeklyEmail,    nextDelayMs: 7 * DAY },
  { fromStep: 5, toStep: 6, send: sendLeadMiniReadingEmail,     nextDelayMs: 7 * DAY },
  { fromStep: 6, toStep: 7, send: sendLeadSynastryTeaserEmail,  nextDelayMs: null },
];

export async function GET(request: Request) {
  // ---------------------------------------------------------------------------
  // 1. Verify cron secret
  // ---------------------------------------------------------------------------
  const authError = assertCronAuth(request);
  if (authError) return authError;

  const now = new Date();
  const stuckCutoff = new Date(now.getTime() - STUCK_T0_GRACE_MS);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const startMs = Date.now();
  try {
    const db = getDb();

    // -------------------------------------------------------------------------
    // 2. Select due candidates (cap at BATCH_LIMIT).
    //    Filters: not yet converted, not unsubscribed, not undeliverable,
    //    step < 7 (final step is 7 after T+21d synastry teaser), AND one of:
    //      - stuck T+0 (step=0, no nextAt, created >15min ago)
    //      - steps 1..6 with nextAt <= NOW()
    // -------------------------------------------------------------------------
    const candidates = await db
      .select({
        id: emailLeads.id,
        email: emailLeads.email,
        locale: emailLeads.locale,
        chartId: emailLeads.chartId,
        nurtureStep: emailLeads.nurtureStep,
        nurtureNextAt: emailLeads.nurtureNextAt,
        createdAt: emailLeads.createdAt,
      })
      .from(emailLeads)
      .where(
        and(
          lt(emailLeads.nurtureStep, 7),
          isNull(emailLeads.convertedToUserId),
          isNull(emailLeads.unsubscribedAt),
          eq(emailLeads.emailUndeliverable, false),
          or(
            // T+0 recovery: stuck step=0
            and(
              eq(emailLeads.nurtureStep, 0),
              isNull(emailLeads.nurtureNextAt),
              lt(emailLeads.createdAt, stuckCutoff),
            ),
            // steps 1..6 with due nextAt (T+1h, T+24h, T+72h, T+7d, T+14d, T+21d)
            sql`${emailLeads.nurtureNextAt} IS NOT NULL AND ${emailLeads.nurtureNextAt} <= NOW()`,
          ),
        ),
      )
      .limit(BATCH_LIMIT);

    console.info('[cron/lead-nurture] candidates', { count: candidates.length });

    // -------------------------------------------------------------------------
    // 3. Per-lead loop — error-isolated, paced if batch >5
    // -------------------------------------------------------------------------
    for (const lead of candidates) {
      try {
        const chart = await fetchTempChart(lead.chartId);
        const handler = STEP_HANDLERS.find((h) => h.fromStep === lead.nurtureStep);

        if (!handler) {
          skipped++;
          continue;
        }

        const sendResult = await handler.send({
          leadId: lead.id,
          email: lead.email,
          locale: lead.locale,
          chart,
          chartId: lead.chartId,
        });

        const nextAt = handler.nextDelayMs == null ? null : new Date(Date.now() + handler.nextDelayMs);

        if (sendResult.sent) {
          await db
            .update(emailLeads)
            .set({ nurtureStep: handler.toStep, nurtureNextAt: nextAt })
            .where(eq(emailLeads.id, lead.id));
          sent++;
        } else if (sendResult.reason === 'already_sent') {
          // Idempotency hit — advance step anyway so we don't re-select this
          // lead next hour and re-pay the no-op cost.
          await db
            .update(emailLeads)
            .set({ nurtureStep: handler.toStep, nurtureNextAt: nextAt })
            .where(eq(emailLeads.id, lead.id));
          skipped++;
        }

        if (candidates.length > 5) {
          await new Promise((r) => setTimeout(r, RESEND_PACING_MS));
        }
      } catch (err) {
        failed++;
        // Log lead.id only — never email, never PII.
        console.error('[cron/lead-nurture] send failed', {
          leadId: lead.id,
          step: lead.nurtureStep,
          err: err instanceof Error ? err.message : 'unknown',
        });
        Sentry.captureException(err, {
          tags: {
            cron: 'lead-nurture',
            leadId: lead.id,
            step: String(lead.nurtureStep),
          },
        });
      }
    }
  } catch (err) {
    // Catastrophic failure (DB unreachable, etc.) — return 200 with summary
    // so Vercel doesn't mark the cron as failed and trigger pager alerts
    // for transient issues. Next hour will retry.
    console.error('[cron/lead-nurture] catastrophic', err);
    Sentry.captureException(err, {
      tags: { cron: 'lead-nurture', phase: 'catastrophic' },
    });
  }

  return NextResponse.json({
    candidates: sent + failed + skipped,
    sent,
    failed,
    skipped,
    durationMs: Date.now() - startMs,
  });
}
