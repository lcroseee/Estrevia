// Final continuation — duplicate sub check, utm_content perf, abandoned-session country
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sql = neon(process.env.DATABASE_URL);

console.log('═══ A. DUPLICATE SUBSCRIPTION ANALYSIS — Stripe (30d) ═══');
const since30 = Math.floor(Date.now() / 1000) - 30 * 86400;
const allSubs = await stripe.subscriptions.list({ limit: 100, status: 'all', created: { gte: since30 } });
const byCustomer = {};
for (const s of allSubs.data) {
  if (!byCustomer[s.customer]) byCustomer[s.customer] = [];
  byCustomer[s.customer].push(s);
}
const dupes = Object.entries(byCustomer).filter(([_, subs]) => subs.length > 1);
console.log(`  Customers with >1 sub in 30d: ${dupes.length}`);
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

console.log('\n═══ B. SESSIONS BY UTM_CONTENT (14d) ═══');
const since14 = Math.floor(Date.now() / 1000) - 14*86400;
const sessions14d = (await stripe.checkout.sessions.list({ limit: 100, created: { gte: since14 } })).data;
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

console.log('\n═══ C. ABANDONED SESSION COUNTRY (where they came from) ═══');
const abandoned = sessions14d.filter(s => s.status === 'open' || s.status === 'expired');
console.log(`  Total abandoned: ${abandoned.length}`);
const byCountry = {};
const byLocale = {};
for (const s of abandoned) {
  const c = s.customer_details?.address?.country || s.shipping_details?.address?.country || 'unknown';
  byCountry[c] = (byCountry[c] || 0) + 1;
  const l = s.locale || 'auto';
  byLocale[l] = (byLocale[l] || 0) + 1;
}
console.log('  By country:');
for (const [c, n] of Object.entries(byCountry).sort((a,b) => b[1] - a[1])) {
  console.log(`    ${c.padEnd(12)} ${n}`);
}
console.log('  By Stripe locale param:');
for (const [c, n] of Object.entries(byLocale).sort((a,b) => b[1] - a[1])) {
  console.log(`    ${c.padEnd(12)} ${n}`);
}

console.log('\n═══ D. CHART SCHEMA CHECK ═══');
const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'natal_charts' ORDER BY ordinal_position
`;
console.log('  Columns:', cols.map(c => c.column_name).join(', '));

console.log('\n═══ E. SOURCE FUNNEL DB-side (14d) ═══');
const sourceFunnel = await sql`
  SELECT
    COALESCE(utm_source, '(none)') AS source,
    COALESCE(utm_campaign, '(none)') AS campaign,
    COUNT(*)::int AS leads,
    COUNT(CASE WHEN converted_to_user_id IS NOT NULL THEN 1 END)::int AS converted
  FROM email_leads
  WHERE created_at > NOW() - INTERVAL '14 days'
  GROUP BY 1,2
  ORDER BY leads DESC
`;
for (const r of sourceFunnel) {
  const cvr = r.leads > 0 ? ((r.converted / r.leads) * 100).toFixed(1) : '0.0';
  console.log(`  ${r.source.padEnd(20)} ${r.campaign.padEnd(28)} leads=${String(r.leads).padStart(4)} conv=${r.converted} (${cvr}%)`);
}

console.log('\n═══ F. LEAD_CHART → PAYWALL_TEASER DELIVERY HEALTH ═══');
const payHealth = await sql`
  SELECT
    DATE_TRUNC('hour', sent_at) AS hr,
    COUNT(*)::int AS n,
    COUNT(CASE WHEN resend_message_id IS NOT NULL THEN 1 END)::int AS with_msgid
  FROM sent_lead_emails
  WHERE email_type = 'lead_paywall_teaser' AND sent_at > NOW() - INTERVAL '24 hours'
  GROUP BY 1 ORDER BY 1
`;
for (const r of payHealth) {
  console.log(`  ${r.hr.toISOString().slice(0,16).replace('T',' ')} n=${r.n} msgid=${r.with_msgid}`);
}

console.log('\n═══ G. UNIQUE LEAD→USER MATCHES (14d) ═══');
const matches = await sql`
  SELECT
    el.email, el.utm_source, el.utm_campaign, el.utm_content,
    el.created_at AS lead_at,
    u.created_at AS user_at,
    u.subscription_tier, u.subscription_status,
    EXTRACT(EPOCH FROM (u.created_at - el.created_at))/60 AS mins_to_signup
  FROM email_leads el
  JOIN users u ON u.email = el.email
  WHERE el.created_at > NOW() - INTERVAL '14 days'
  ORDER BY u.created_at DESC
`;
for (const m of matches) {
  const mins = m.mins_to_signup != null ? Number(m.mins_to_signup).toFixed(0) : 'N/A';
  console.log(`  ${m.email.padEnd(36)} tier=${m.subscription_tier.padEnd(8)} status=${m.subscription_status.padEnd(9)} mins=${mins}`);
  console.log(`    utm: ${m.utm_source||'?'}/${m.utm_campaign||'?'}/${(m.utm_content||'?').slice(0,15)}  lead_at=${m.lead_at.toISOString().slice(0,16)}`);
}

console.log('\n— End final audit —');
