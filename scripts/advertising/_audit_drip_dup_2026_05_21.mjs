// Continuation audit — fix sent_at column + drip→stripe attribution detail + duplicate-sub check
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sql = neon(process.env.DATABASE_URL);

console.log('═══ A. SCHEMA: sent_lead_emails columns ═══');
const cols = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'sent_lead_emails' ORDER BY ordinal_position
`;
for (const c of cols) console.log(`  ${c.column_name.padEnd(28)} ${c.data_type}`);

console.log('\n═══ B. DRIP SENDS — break by type (last 7d, by sent_at) ═══');
const drip = await sql`
  SELECT email_type, COUNT(*)::int AS n,
         MIN(sent_at) AS first_sent, MAX(sent_at) AS last_sent,
         COUNT(CASE WHEN resend_message_id IS NOT NULL THEN 1 END)::int AS with_msgid
  FROM sent_lead_emails
  WHERE sent_at > NOW() - INTERVAL '7 days'
  GROUP BY email_type
  ORDER BY n DESC
`;
for (const r of drip) {
  console.log(`  ${r.email_type.padEnd(28)} n=${String(r.n).padStart(4)} msgid=${r.with_msgid} first=${r.first_sent.toISOString().slice(0,19)} last=${r.last_sent.toISOString().slice(0,19)}`);
}

console.log('\n═══ C. LEAD NURTURE STEP DISTRIBUTION ═══');
const steps = await sql`
  SELECT nurture_step, COUNT(*)::int AS leads,
         COUNT(CASE WHEN converted_to_user_id IS NOT NULL THEN 1 END)::int AS converted,
         COUNT(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 END)::int AS unsub,
         COUNT(CASE WHEN email_undeliverable THEN 1 END)::int AS undeliv,
         COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END)::int AS rec24h
  FROM email_leads GROUP BY 1 ORDER BY 1
`;
for (const r of steps) {
  console.log(`  step=${r.nurture_step}  leads=${String(r.leads).padStart(4)}  conv=${r.converted}  unsub=${r.unsub}  undeliv=${r.undeliv}  rec24h=${r.rec24h}`);
}

console.log('\n═══ D. CHARTS → LEAD CAPTURE by locale (14d) ═══');
const chartLocale = await sql`
  SELECT
    CASE WHEN locale IS NULL THEN '(none)' ELSE locale END AS locale,
    COUNT(*)::int AS charts,
    COUNT(DISTINCT lead_id) FILTER (WHERE lead_id IS NOT NULL)::int AS with_lead
  FROM natal_charts
  WHERE created_at > NOW() - INTERVAL '14 days'
  GROUP BY 1
`;
for (const r of chartLocale) {
  const captureRate = r.charts > 0 ? ((r.with_lead / r.charts) * 100).toFixed(1) : '0.0';
  console.log(`  locale=${r.locale.padEnd(10)} charts=${String(r.charts).padStart(4)} with_lead=${r.with_lead} (${captureRate}% capture)`);
}

console.log('\n═══ E. DUPLICATE SUBSCRIPTION ANALYSIS — Stripe ═══');
const since30 = Math.floor(Date.now() / 1000) - 30 * 86400;
const allSubs = await stripe.subscriptions.list({ limit: 100, status: 'all', created: { gte: since30 } });
const byCustomer = {};
for (const s of allSubs.data) {
  if (!byCustomer[s.customer]) byCustomer[s.customer] = [];
  byCustomer[s.customer].push(s);
}
const dupes = Object.entries(byCustomer).filter(([_, subs]) => subs.length > 1);
console.log(`  Customers with >1 subscription: ${dupes.length}`);
for (const [cust, subs] of dupes) {
  const customer = await stripe.customers.retrieve(cust).catch(() => ({}));
  console.log(`  ${customer.email || cust} — ${subs.length} subs:`);
  for (const sub of subs.sort((a,b) => a.created - b.created)) {
    const amt = (sub.items.data[0]?.price?.unit_amount || 0) / 100;
    const interval = sub.items.data[0]?.price?.recurring?.interval || '?';
    const created = new Date(sub.created * 1000).toISOString().slice(0,19);
    const canceled = sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString().slice(0,19) : '—';
    console.log(`    ${sub.id.slice(0,24)} status=${sub.status} amt=$${amt}/${interval} created=${created} canceled=${canceled}`);
  }
}

console.log('\n═══ F. STRIPE CHECKOUT SESSIONS BY UTM_CONTENT (14d) ═══');
const sessions14d = (await stripe.checkout.sessions.list({ limit: 100, created: { gte: Math.floor(Date.now()/1000) - 14*86400 } })).data;
const byContent = {};
for (const s of sessions14d) {
  const key = s.metadata?.utm_content || '(none)';
  if (!byContent[key]) byContent[key] = { total: 0, complete: 0, open: 0, expired: 0 };
  byContent[key].total += 1;
  byContent[key][s.status] = (byContent[key][s.status] || 0) + 1;
}
console.log(`  utm_content                    total  complete  open  expired`);
for (const [content, stats] of Object.entries(byContent).sort((a,b) => b[1].total - a[1].total)) {
  console.log(`  ${content.padEnd(28)} ${String(stats.total).padStart(5)}  ${String(stats.complete || 0).padStart(8)}  ${String(stats.open || 0).padStart(4)}  ${String(stats.expired || 0).padStart(7)}`);
}

console.log('\n═══ G. LEAD CHECKOUT-ABANDONERS (open sessions detail) ═══');
const openSessions = sessions14d.filter(s => s.status === 'open');
console.log(`  ${openSessions.length} open sessions in 14d`);
for (const s of openSessions) {
  const created = new Date(s.created * 1000).toISOString().slice(0,19);
  const expires = s.expires_at ? new Date(s.expires_at * 1000).toISOString().slice(0,19) : '—';
  const cust = s.customer_email || s.customer_details?.email || '?';
  console.log(`  ${created} ${cust.slice(0,30).padEnd(30)} expires=${expires} client_ref=${s.client_reference_id?.slice(0,10) || '?'}`);
  console.log(`    utm=${s.metadata?.utm_source || '?'}/${s.metadata?.utm_campaign || '?'} amt=${s.amount_total || 0}`);
}

console.log('\n═══ H. POSTHOG-LIKE: chart→lead by source UTM (DB-side, 14d) ═══');
const sourceFunnel = await sql`
  SELECT
    COALESCE(utm_source, '(none)') AS source,
    COALESCE(utm_campaign, '(none)') AS campaign,
    COUNT(*)::int AS leads,
    COUNT(CASE WHEN converted_to_user_id IS NOT NULL THEN 1 END)::int AS converted,
    MIN(created_at) AS first_lead,
    MAX(created_at) AS last_lead
  FROM email_leads
  WHERE created_at > NOW() - INTERVAL '14 days'
  GROUP BY 1,2
  ORDER BY leads DESC
`;
for (const r of sourceFunnel) {
  const cvr = r.leads > 0 ? ((r.converted / r.leads) * 100).toFixed(1) : '0.0';
  console.log(`  ${r.source.padEnd(20)} ${r.campaign.padEnd(28)} leads=${String(r.leads).padStart(4)} conv=${r.converted} (${cvr}%)`);
}

console.log('\n— End drip-dup audit —');
