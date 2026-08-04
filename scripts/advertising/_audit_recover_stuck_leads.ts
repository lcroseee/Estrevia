/**
 * ONE-OFF — recover T+0 chart emails for leads whose 2026-05-17 first-attempt
 * silently failed at Resend (data:null,error:… without throwing) and left
 * sent_lead_emails.resend_message_id = NULL. Resend's idempotencyKey
 * `${leadId}:lead_chart` makes this safe to re-trigger:
 *   - if the original send DID reach the inbox, Resend returns the cached
 *     message id; we update sent_lead_emails and stop.
 *   - if it didn't, Resend processes anew and the recipient finally gets
 *     the chart email.
 *
 * Uses the locally-fixed sendLeadChartEmail (commit c94316f) which throws
 * on result.error instead of falsely reporting success.
 *
 * Run: `npx tsx scripts/advertising/_audit_recover_stuck_leads.ts`
 *      Add `DRY_RUN=true` env to skip Resend send and only print plan.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { sendLeadChartEmail } from '../../src/shared/lib/email';

interface StuckRow {
  id: string;
  email: string;
  locale: 'en' | 'es';
  chart_id: string | null;
  chart_data: unknown;
}

async function main(): Promise<void> {
  const DRY = process.env.DRY_RUN === 'true';
  const sql = neon(process.env.DATABASE_URL!);

  const stuck = (await sql`
    SELECT l.id, l.email, l.locale, l.chart_id, nc.chart_data
    FROM email_leads l
    JOIN sent_lead_emails s ON s.lead_id = l.id AND s.email_type = 'lead_chart'
    LEFT JOIN natal_charts nc ON nc.id = l.chart_id
    WHERE s.resend_message_id IS NULL
      AND l.unsubscribed_at IS NULL
      AND l.email_undeliverable = false
    ORDER BY l.created_at ASC
  `) as unknown as StuckRow[];

  console.log(`Found ${stuck.length} stuck leads (no resend_message_id).`);
  if (DRY) console.log('DRY_RUN=true — no sends will be attempted.\n');

  let sentNew = 0;
  let alreadyDelivered = 0;
  let failed = 0;

  for (const lead of stuck) {
    const email28 = lead.email.slice(0, 28).padEnd(28);
    const hasChart = lead.chart_data ? '✓chart' : '–chart';
    if (DRY) {
      console.log(`  [DRY] ${email28} ${lead.locale} ${hasChart}`);
      continue;
    }

    try {
      const res = await sendLeadChartEmail({
        leadId: lead.id,
        email: lead.email,
        locale: lead.locale,
        chart: (lead.chart_data ?? null) as never,
        chartId: lead.chart_id,
      });
      if (res.sent) {
        sentNew++;
        console.log(`  ✓ ${email28} ${lead.locale} ${hasChart}  → sent`);
      } else {
        alreadyDelivered++;
        console.log(`  • ${email28} ${lead.locale} ${hasChart}  → ${res.reason}`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${email28} ${lead.locale} ${hasChart}  → ${msg.slice(0, 80)}`);
    }

    // Pace under Resend rate limit: free tier is 10 req/s; we go 1/s to stay
    // comfortably below + avoid burstiness with their idempotency-lookup latency.
    await new Promise((r) => setTimeout(r, 1100));
  }

  console.log(`\nSummary: sent=${sentNew}  already_delivered=${alreadyDelivered}  failed=${failed}  total=${stuck.length}`);
  process.exit(failed > 0 && sentNew === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Catastrophic:', err);
  process.exit(2);
});
