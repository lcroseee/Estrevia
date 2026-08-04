// Stripe + Conversion attribution audit — 2026-05-20.
// Open questions from surface audit:
//   - 3 complete checkout sessions, revenue $0.00 — what was bought?
//   - Who are the 6 "converted" leads? Did any come via drip CTA?
//   - 1 premium_active — who and via what funnel?
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';
const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

console.log('═════ 1. Complete checkout sessions — full detail ═════');
const sessions = await stripe.checkout.sessions.list({ limit: 100 });
const complete = sessions.data.filter((s) => s.status === 'complete');
console.log(`Complete sessions: ${complete.length}`);
for (const s of complete) {
  const li = await stripe.checkout.sessions.listLineItems(s.id, { limit: 5 });
  console.log({
    id: s.id.slice(0, 18),
    created: new Date(s.created * 1000).toISOString().slice(0, 16),
    amount_total: s.amount_total,
    currency: s.currency,
    customer: s.customer?.toString().slice(0, 14),
    email: s.customer_email ?? s.customer_details?.email ?? '?',
    mode: s.mode,
    subscription: s.subscription,
    line_items: li.data.map((l) => ({ price: l.price?.id, qty: l.quantity, amount: l.amount_total })),
    metadata: s.metadata,
    utm_source: s.metadata?.utm_source,
    utm_campaign: s.metadata?.utm_campaign,
    utm_content: s.metadata?.utm_content,
  });
}

console.log('\n═════ 2. Subscriptions detail ═════');
const subs = await stripe.subscriptions.list({ limit: 50, status: 'all' });
for (const s of subs.data) {
  console.log({
    id: s.id.slice(0, 18),
    status: s.status,
    customer: s.customer?.toString().slice(0, 14),
    created: new Date(s.created * 1000).toISOString().slice(0, 10),
    trial_end: s.trial_end ? new Date(s.trial_end * 1000).toISOString().slice(0, 10) : null,
    current_period_end: new Date(s.current_period_end * 1000).toISOString().slice(0, 10),
    price: s.items.data[0]?.price?.id,
    discount: s.discount ? { coupon: s.discount.coupon?.id, percent_off: s.discount.coupon?.percent_off } : null,
  });
}

console.log('\n═════ 3. 6 converted leads — who and via what UTM? ═════');
const convertedLeads = await sql`
  SELECT
    LEFT(id, 10) AS lead_id,
    locale,
    utm_source, utm_campaign, utm_content,
    nurture_step,
    created_at,
    converted_to_user_id,
    converted_at,
    EXTRACT(EPOCH FROM (converted_at - created_at))/3600 AS hours_to_convert
  FROM email_leads
  WHERE converted_to_user_id IS NOT NULL
  ORDER BY converted_at DESC NULLS LAST
`;
console.table(convertedLeads);

console.log('\n═════ 4. Users with premium tier — who and when? ═════');
const premiumUsers = await sql`
  SELECT
    LEFT(id, 14) AS user_id,
    email,
    locale,
    subscription_tier,
    subscription_status,
    created_at,
    updated_at,
    stripe_customer_id
  FROM users
  WHERE subscription_tier = 'premium' OR subscription_status IS NOT NULL
  ORDER BY created_at DESC
`;
console.table(premiumUsers);

console.log('\n═════ 5. Drip-sourced clicks (utm_source=lead-nurture) — any in Stripe? ═════');
// Stripe stores Checkout session URLs but session_metadata is what we set.
const dripSessions = sessions.data.filter((s) => s.metadata?.utm_source === 'lead-nurture');
console.log(`Sessions with utm_source=lead-nurture metadata: ${dripSessions.length}`);
for (const s of dripSessions.slice(0, 10)) {
  console.log({
    id: s.id.slice(0, 18),
    status: s.status,
    amount_total: s.amount_total,
    metadata: s.metadata,
  });
}

console.log('\n═════ 6. Cron health — last 24h sent_lead_emails per hour ═════');
const cronHealth = await sql`
  SELECT
    TO_CHAR(DATE_TRUNC('hour', sent_at), 'MM-DD HH24:00') AS hour,
    COUNT(*)::int AS sends,
    COUNT(DISTINCT email_type)::int AS types,
    STRING_AGG(DISTINCT email_type, ', ' ORDER BY email_type) AS type_list
  FROM sent_lead_emails
  WHERE sent_at >= NOW() - INTERVAL '36 hours'
  GROUP BY DATE_TRUNC('hour', sent_at)
  ORDER BY DATE_TRUNC('hour', sent_at) DESC
`;
console.table(cronHealth);

console.log('\n═════ 7. Lead pacing — last 24h by hour ═════');
const leadPacing = await sql`
  SELECT
    TO_CHAR(DATE_TRUNC('hour', created_at), 'MM-DD HH24:00') AS hour,
    COUNT(*)::int AS leads,
    COUNT(*) FILTER (WHERE locale = 'en')::int AS en,
    COUNT(*) FILTER (WHERE locale = 'es')::int AS es
  FROM email_leads
  WHERE created_at >= NOW() - INTERVAL '36 hours'
  GROUP BY DATE_TRUNC('hour', created_at)
  ORDER BY DATE_TRUNC('hour', created_at) DESC
`;
console.table(leadPacing);
