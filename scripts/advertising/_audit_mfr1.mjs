// Hunt the MFR1 anonymous Meta EN trial.
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';
const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

// 1. Find the MFR1 trial in Stripe by UTM
const since = Math.floor((Date.now() - 7 * 86400000) / 1000);
const subs = await stripe.subscriptions.list({ created: { gte: since }, limit: 100, status: 'all' });
console.log(`Found ${subs.data.length} subs in last 7d.\n`);
for (const s of subs.data) {
  const md = s.metadata || {};
  const cust = await stripe.customers.retrieve(s.customer).catch(() => null);
  console.log({
    sub_id: s.id,
    status: s.status,
    created: new Date(s.created * 1000).toISOString(),
    trial_end: s.trial_end ? new Date(s.trial_end * 1000).toISOString() : null,
    customer: s.customer,
    customer_email: cust?.email,
    metadata: md,
    cancel_at_period_end: s.cancel_at_period_end,
    latest_invoice: s.latest_invoice,
  });
}

// 2. Search email_leads for utm_content matching any sub's content metadata
console.log('\n=== Lead lookup by utm_content from Stripe sub metadata ===');
for (const s of subs.data) {
  const md = s.metadata || {};
  if (!md.utm_content) continue;
  const lead = await sql`
    SELECT id, email, locale, created_at, converted_to_user_id, utm_source, utm_campaign, utm_content,
           nurture_step, nurture_next_at, email_undeliverable
    FROM email_leads
    WHERE id = ${md.utm_content} OR utm_content = ${md.utm_content}
    LIMIT 1
  `;
  if (lead[0]) {
    console.log({
      from_stripe: { sub: s.id, utm_content: md.utm_content },
      lead: lead[0],
    });
  } else {
    console.log({ from_stripe: { sub: s.id, utm_content: md.utm_content }, lead: 'NOT FOUND in email_leads' });
  }
}

// 3. Show recent leads tagged with meta source
console.log('\n=== Recent meta leads (last 7d) ===');
const recentMetaLeads = await sql`
  SELECT id, email, locale, created_at, converted_to_user_id, utm_campaign, utm_content,
         nurture_step, email_undeliverable
  FROM email_leads
  WHERE utm_source = 'meta' AND created_at > NOW() - INTERVAL '7 days'
  ORDER BY created_at DESC
  LIMIT 30
`;
console.table(recentMetaLeads.map((l) => ({
  id: l.id?.slice(0, 10),
  email: l.email?.slice(0, 24),
  locale: l.locale,
  utm_campaign: l.utm_campaign,
  nurture: l.nurture_step,
  converted: l.converted_to_user_id ? '✓' : '–',
  undeliv: l.email_undeliverable ? '✓' : '–',
  created: l.created_at?.toISOString?.().slice(5, 16),
})));

// 4. Aggregate stats
const stats = await sql`
  SELECT
    COUNT(*) FILTER (WHERE utm_source = 'meta' AND created_at > NOW() - INTERVAL '7 days')::int AS meta_7d,
    COUNT(*) FILTER (WHERE utm_source = 'meta' AND created_at > NOW() - INTERVAL '24 hours')::int AS meta_24h,
    COUNT(*) FILTER (WHERE utm_source = 'meta' AND converted_to_user_id IS NOT NULL)::int AS meta_converted,
    COUNT(*) FILTER (WHERE utm_source IS NULL OR utm_source NOT IN ('meta', 'google'))::int AS organic_all,
    COUNT(*) FILTER (WHERE email_undeliverable = true)::int AS undeliverable,
    COUNT(*) FILTER (WHERE nurture_step >= 1)::int AS advanced_to_t24h,
    COUNT(*) FILTER (WHERE nurture_step >= 2)::int AS advanced_to_t72h,
    COUNT(*)::int AS total_leads
  FROM email_leads
`;
console.log('\n=== Lead-source aggregates ===');
console.table(stats);
