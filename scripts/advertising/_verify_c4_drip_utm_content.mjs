// READ-ONLY verification probe for finding C4 (2026-05-29):
// "Drip emails never set utm_content -> drip->Stripe conversions unattributable"
// Cross-checks Stripe checkout sessions: do lead-nurture (drip) sessions carry utm_content?
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const since = Math.floor(Date.now() / 1000) - 30 * 86400; // 30d window
const sessions = (await stripe.checkout.sessions.list({ limit: 100, created: { gte: since } })).data;
console.log(`Total checkout sessions (30d): ${sessions.length}\n`);

// Group by utm_source, then report how many of each have a non-null utm_content.
const bySource = {};
for (const s of sessions) {
  const src = s.metadata?.utm_source || '(none)';
  const content = s.metadata?.utm_content;
  const campaign = s.metadata?.utm_campaign || '(none)';
  if (!bySource[src]) bySource[src] = { total: 0, withContent: 0, complete: 0, campaigns: {} };
  bySource[src].total += 1;
  if (content) bySource[src].withContent += 1;
  if (s.status === 'complete') bySource[src].complete += 1;
  bySource[src].campaigns[campaign] = (bySource[src].campaigns[campaign] || 0) + 1;
}

console.log('utm_source            total  hasUtmContent  complete  campaigns');
for (const [src, st] of Object.entries(bySource).sort((a, b) => b[1].total - a[1].total)) {
  const camps = Object.entries(st.campaigns).map(([c, n]) => `${c}=${n}`).join(',');
  console.log(`${src.padEnd(20)} ${String(st.total).padStart(5)}  ${String(st.withContent).padStart(13)}  ${String(st.complete).padStart(8)}  ${camps}`);
}

// Explicitly list any lead-nurture (drip) sessions and their utm_content value.
console.log('\n--- Drip (utm_source=lead-nurture) sessions detail ---');
const drip = sessions.filter((s) => s.metadata?.utm_source === 'lead-nurture');
if (drip.length === 0) {
  console.log('  none in 30d (acquisition was OFF since ~05-23; drip clicks rare)');
} else {
  for (const s of drip) {
    console.log(`  ${s.id} status=${s.status} utm_campaign=${s.metadata?.utm_campaign} utm_content=${s.metadata?.utm_content ?? 'NULL'}`);
  }
}

// Also check subscriptions (the actual attribution unit for stripe-attribution.ts).
console.log('\n--- Subscriptions (30d) utm_source x utm_content ---');
const subs = [];
for await (const sub of stripe.subscriptions.list({ created: { gte: since }, limit: 100 })) subs.push(sub);
console.log(`Total subs (30d): ${subs.length}`);
const subBySource = {};
for (const sub of subs) {
  const src = sub.metadata?.utm_source || '(none)';
  const content = sub.metadata?.utm_content;
  if (!subBySource[src]) subBySource[src] = { total: 0, withContent: 0 };
  subBySource[src].total += 1;
  if (content) subBySource[src].withContent += 1;
}
for (const [src, st] of Object.entries(subBySource)) {
  console.log(`  ${src.padEnd(20)} total=${st.total} hasUtmContent=${st.withContent}`);
}
