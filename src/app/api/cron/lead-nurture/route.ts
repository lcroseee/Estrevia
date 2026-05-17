/**
 * GET /api/cron/lead-nurture
 *
 * Vercel Cron — runs hourly at minute 0.
 *
 * Sweeps `email_leads` for due nurture-drip sends:
 *
 *   1. T+0 recovery — `nurture_step=0 AND nurture_next_at IS NULL AND
 *      created_at < NOW() - 15min` (the original /api/v1/leads waitUntil
 *      send failed; retry the chart email here).
 *   2. T+24h — `nurture_step=1 AND nurture_next_at <= NOW()` → send the
 *      Moon/Asc email, advance to step=2 with nextAt=NOW()+48h.
 *   3. T+72h — `nurture_step=2 AND nurture_next_at <= NOW()` → send the
 *      paywall-teaser email, advance to step=3 with nextAt=null.
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
  sendLeadMoonAscEmail,
  sendLeadPaywallTeaserEmail,
} from '@/shared/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const STUCK_T0_GRACE_MS = 15 * 60 * 1000;
const T24_DELAY_MS = 24 * 60 * 60 * 1000;
const T48_AFTER_T24_MS = 48 * 60 * 60 * 1000; // step1→step2: +48h (total T+72h)
const BATCH_LIMIT = 100;
const RESEND_PACING_MS = 1100; // 1.1s between sends → under 1 req/s safety
                                // (Resend free tier: 10 req/s; we go conservative)

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
    //    step < 3 (final step), AND one of:
    //      - stuck T+0 (step=0, no nextAt, created >15min ago)
    //      - step1/step2 with nextAt <= NOW()
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
          lt(emailLeads.nurtureStep, 3),
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
            // step1→2 (T+24h) and step2→3 (T+72h)
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

        let sendResult: { sent: boolean; reason?: string };
        let nextStep: number;
        let nextAt: Date | null;

        if (lead.nurtureStep === 0) {
          sendResult = await sendLeadChartEmail({
            leadId: lead.id,
            email: lead.email,
            locale: lead.locale,
            chart,
            chartId: lead.chartId,
          });
          nextStep = 1;
          nextAt = new Date(Date.now() + T24_DELAY_MS);
        } else if (lead.nurtureStep === 1) {
          sendResult = await sendLeadMoonAscEmail({
            leadId: lead.id,
            email: lead.email,
            locale: lead.locale,
            chart,
            chartId: lead.chartId,
          });
          nextStep = 2;
          nextAt = new Date(Date.now() + T48_AFTER_T24_MS);
        } else if (lead.nurtureStep === 2) {
          sendResult = await sendLeadPaywallTeaserEmail({
            leadId: lead.id,
            email: lead.email,
            locale: lead.locale,
            chart,
            chartId: lead.chartId,
          });
          nextStep = 3;
          nextAt = null;
        } else {
          skipped++;
          continue;
        }

        if (sendResult.sent) {
          await db
            .update(emailLeads)
            .set({ nurtureStep: nextStep, nurtureNextAt: nextAt })
            .where(eq(emailLeads.id, lead.id));
          sent++;
        } else if (sendResult.reason === 'already_sent') {
          // Idempotency hit — advance step anyway so we don't re-select this
          // lead next hour and re-pay the no-op cost.
          await db
            .update(emailLeads)
            .set({ nurtureStep: nextStep, nurtureNextAt: nextAt })
            .where(eq(emailLeads.id, lead.id));
          skipped++;
        }

        // Pace to avoid Resend rate limits when batch is large enough
        // to matter; tiny batches don't.
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
