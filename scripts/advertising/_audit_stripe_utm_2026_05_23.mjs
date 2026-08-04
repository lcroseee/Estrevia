// Stripe utm_content snapshot — 2026-05-23
// Mirrors _audit_final_2026_05_21.mjs section B but for 7d window (vs baseline 14d).

import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sql = neon(process.env.DATABASE_URL);

console.log('=== A. Stripe sessions by utm_content (7d) ===');
const since7 = Math.floor(Date.now() / 1000) - 7 * 86400;
const sessions7d = (await stripe.checkout.sessions.list({ limit: 100, created: { gte: since7 } })).data;
console.log(`  Total sessions (7d): ${sessions7d.length}`);

const byContent = {};
for (const s of sessions7d) {
  const key = s.metadata?.utm_content || '(none)';
  if (!byContent[key]) byContent[key] = { total: 0, complete: 0, open: 0, expired: 0, locales: {} };
  byContent[key].total += 1;
  byContent[key][s.status] = (byContent[key][s.status] || 0) + 1;
  const loc = s.locale || 'auto';
  byContent[key].locales[loc] = (byContent[key].locales[loc] || 0) + 1;
}

console.log('\n  utm_content                     total  complete  open  expired  locales');
for (const [content, stats] of Object.entries(byContent).sort((a, b) => b[1].total - a[1].total)) {
  const locStr = Object.entries(stats.locales).map(([l, n]) => `${l}=${n}`).join(',');
  const pct = stats.total > 0 ? ((stats.complete || 0) / stats.total * 100).toFixed(0) : '0';
  console.log(`  ${content.slice(0, 30).padEnd(30)} ${String(stats.total).padStart(5)}  ${String(stats.complete || 0).padStart(8)}  ${String(stats.open || 0).padStart(4)}  ${String(stats.expired || 0).padStart(7)}  ${locStr}  [${pct}% complete]`);
}

console.log('\n=== B. Stripe sessions by utm_content (14d) — for trend ===');
const since14 = Math.floor(Date.now() / 1000) - 14 * 86400;
const sessions14d = (await stripe.checkout.sessions.list({ limit: 100, created: { gte: since14 } })).data;
console.log(`  Total sessions (14d): ${sessions14d.length}`);
const byContent14 = {};
for (const s of sessions14d) {
  const key = s.metadata?.utm_content || '(none)';
  if (!byContent14[key]) byContent14[key] = { total: 0, complete: 0, open: 0, expired: 0 };
  byContent14[key].total += 1;
  byContent14[key][s.status] = (byContent14[key][s.status] || 0) + 1;
}
console.log('\n  utm_content                     total  complete  open  expired  pct');
for (const [content, stats] of Object.entries(byContent14).sort((a, b) => b[1].total - a[1].total)) {
  const pct = stats.total > 0 ? ((stats.complete || 0) / stats.total * 100).toFixed(0) : '0';
  console.log(`  ${content.slice(0, 30).padEnd(30)} ${String(stats.total).padStart(5)}  ${String(stats.complete || 0).padStart(8)}  ${String(stats.open || 0).padStart(4)}  ${String(stats.expired || 0).padStart(7)}  ${pct}%`);
}

console.log('\n=== C. Sessions by Stripe locale + status (7d) ===');
const byLocaleStatus = {};
for (const s of sessions7d) {
  const k = `${s.locale || 'auto'}|${s.status}`;
  byLocaleStatus[k] = (byLocaleStatus[k] || 0) + 1;
}
for (const [k, n] of Object.entries(byLocaleStatus).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${n}`);
}

console.log('\n=== D. UTM source distribution (7d) ===');
const bySrc = {};
for (const s of sessions7d) {
  const k = s.metadata?.utm_source || '(none)';
  bySrc[k] = bySrc[k] || { total: 0, complete: 0 };
  bySrc[k].total += 1;
  if (s.status === 'complete') bySrc[k].complete += 1;
}
for (const [k, v] of Object.entries(bySrc).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${k.padEnd(20)} total=${v.total} complete=${v.complete}`);
}

console.log('\n=== E. DB lead UTM source funnel (14d) ===');
const sourceFunnel = await sql`
  SELECT
    COALESCE(utm_source, '(none)') AS source,
    COALESCE(utm_campaign, '(none)') AS campaign,
    COUNT(*)::int AS leads,
    COUNT(CASE WHEN converted_to_user_id IS NOT NULL THEN 1 END)::int AS converted
  FROM email_leads
  WHERE created_at > NOW() - INTERVAL '14 days'
  GROUP BY 1, 2
  ORDER BY leads DESC
`;
for (const r of sourceFunnel) {
  const cvr = r.leads > 0 ? ((r.converted / r.leads) * 100).toFixed(1) : '0.0';
  console.log(`  ${r.source.padEnd(20)} ${r.campaign.padEnd(28)} leads=${String(r.leads).padStart(4)} conv=${r.converted} (${cvr}%)`);
}

console.log('\n=== F. DB lead utm_content (14d) — granular ===');
const byContentDb = await sql`
  SELECT
    COALESCE(utm_content, '(none)') AS content,
    COUNT(*)::int AS leads,
    COUNT(CASE WHEN converted_to_user_id IS NOT NULL THEN 1 END)::int AS converted
  FROM email_leads
  WHERE created_at > NOW() - INTERVAL '14 days'
  GROUP BY 1
  ORDER BY leads DESC
`;
for (const r of byContentDb) {
  const cvr = r.leads > 0 ? ((r.converted / r.leads) * 100).toFixed(1) : '0.0';
  console.log(`  ${r.content.slice(0, 30).padEnd(30)} leads=${String(r.leads).padStart(4)} conv=${r.converted} (${cvr}%)`);
}

console.log('\n=== G. DB lead utm_content (last 48h) — recent ===');
const byContentDb48 = await sql`
  SELECT
    COALESCE(utm_content, '(none)') AS content,
    COUNT(*)::int AS leads
  FROM email_leads
  WHERE created_at > NOW() - INTERVAL '48 hours'
  GROUP BY 1
  ORDER BY leads DESC
`;
for (const r of byContentDb48) {
  console.log(`  ${r.content.slice(0, 30).padEnd(30)} leads=${String(r.leads).padStart(4)}`);
}

console.log('\n=== Done ===');
