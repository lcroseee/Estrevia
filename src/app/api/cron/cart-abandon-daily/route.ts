/**
 * GET /api/cron/cart-abandon-daily
 *
 * Vercel Cron — runs once daily at 07:00 UTC.
 *
 * Queries PostHog for leads who fired `paywall_opened` or
 * `checkout_stripe_redirected` in the last 7 days but have NOT fired
 * `subscription_started`. Joins to `email_leads` table to get email + locale.
 * Sends a single cart-abandon email with a 20% off annual coupon (TEASER20 —
 * shared with paywall_teaser variant C; see T7 consolidation commit)
 * valid for 48h per the email copy.
 *
 * Idempotency: `sent_cart_abandon_emails` table enforces a 90-day frequency
 * cap (quarterly max 1 per lead). Double-runs within the same day are safe.
 *
 * Gated by CART_ABANDON_DRY_RUN env var (default "true"). When true, cohort
 * is logged but no emails are sent and no rows are written.
 *
 * Protected by CRON_SECRET (Vercel sends Bearer token in Authorization header).
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { emailLeads } from '@/shared/lib/schema';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { fetchTempChart } from '@/shared/lib/temp-chart';
import { sendCartAbandonEmail } from '@/shared/lib/email';
import { hasCartAbandonSentRecently } from '@/shared/lib/sent-cart-abandon-emails';
import { getCartAbandonCohort } from '@/modules/advertising/audiences/cart-abandon-cohort';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const RESEND_PACING_MS = 1100; // 1.1s between sends — well under Resend rate limits

export async function GET(request: Request) {
  // 1. Verify cron secret
  const authError = assertCronAuth(request);
  if (authError) return authError;

  const dryRun = (process.env.CART_ABANDON_DRY_RUN ?? 'true') !== 'false';
  const startMs = Date.now();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let cohortSize = 0;

  try {
    // 2. Fetch cohort from PostHog (7-day window, excluding last 1h)
    const cohort = await getCartAbandonCohort(7);
    cohortSize = cohort.length;

    console.info('[cron/cart-abandon] cohort', { cohortSize, dryRun });

    if (cohortSize === 0) {
      return NextResponse.json({ cohortSize: 0, sent: 0, skipped: 0, failed: 0, dryRun, durationMs: Date.now() - startMs });
    }

    // 3. Join cohort emails to email_leads (DB)
    const cohortEmails = cohort.map((e) => e.email.toLowerCase());
    const db = getDb();

    const leads = await db
      .select({
        id: emailLeads.id,
        email: emailLeads.email,
        locale: emailLeads.locale,
        chartId: emailLeads.chartId,
      })
      .from(emailLeads)
      .where(
        sql`LOWER(${emailLeads.email}) = ANY(${cohortEmails})
            AND ${emailLeads.convertedToUserId} IS NULL
            AND ${emailLeads.unsubscribedAt} IS NULL
            AND ${emailLeads.emailUndeliverable} = false`,
      );

    console.info('[cron/cart-abandon] dbLeads', { count: leads.length });

    // 4. Per-lead loop
    for (const lead of leads) {
      try {
        // Find matching cohort entry for metadata
        const cohortEntry = cohort.find((e) => e.email.toLowerCase() === lead.email.toLowerCase());

        // 4a. Frequency cap check
        const alreadySent = await hasCartAbandonSentRecently(lead.id);
        if (alreadySent) {
          skipped++;
          console.info('[cron/cart-abandon] skip', { leadId: lead.id, reason: 'already_sent' });
          continue;
        }

        // 4b. DRY_RUN gate
        if (dryRun) {
          skipped++;
          console.info('[cron/cart-abandon] dry_run skip', {
            leadId: lead.id,
            locale: lead.locale,
            checkoutClicks: cohortEntry?.checkoutClicks ?? 0,
          });
          continue;
        }

        // 4c. Fetch chart for Saturn personalization (best-effort)
        const chart = await fetchTempChart(lead.chartId);

        // 4d. Send
        const result = await sendCartAbandonEmail({
          leadId: lead.id,
          email: lead.email,
          locale: lead.locale,
          chart,
          chartId: lead.chartId,
          checkoutClicks: cohortEntry?.checkoutClicks ?? 0,
          posthogLastPaywallAt: cohortEntry?.lastPaywallAt,
        });

        if (result.sent) {
          sent++;
          console.info('[cron/cart-abandon] sent', { leadId: lead.id });
        } else {
          skipped++;
          console.info('[cron/cart-abandon] skip', { leadId: lead.id, reason: result.reason });
        }

        // Pace between sends
        if (leads.length > 5) {
          await new Promise((r) => setTimeout(r, RESEND_PACING_MS));
        }
      } catch (err) {
        failed++;
        // Log leadId only — never email, never PII.
        console.error('[cron/cart-abandon] send failed', {
          leadId: lead.id,
          err: err instanceof Error ? err.message : 'unknown',
        });
        Sentry.captureException(err, {
          tags: { cron: 'cart-abandon-daily', leadId: lead.id },
        });
      }
    }
  } catch (err) {
    // Catastrophic failure — return 200 so Vercel doesn't page on transient issues
    console.error('[cron/cart-abandon] catastrophic', err);
    Sentry.captureException(err, {
      tags: { cron: 'cart-abandon-daily', phase: 'catastrophic' },
    });
  }

  return NextResponse.json({
    cohortSize,
    sent,
    skipped,
    failed,
    dryRun,
    durationMs: Date.now() - startMs,
  });
}
