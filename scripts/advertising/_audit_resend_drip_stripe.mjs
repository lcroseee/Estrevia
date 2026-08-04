// Drip → Stripe attribution probe (paired with _audit_resend_2026_05_23.mjs)
// Looks at Stripe sessions where metadata.utm_source = 'lead-nurture'
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const since14 = Math.floor(Date.now() / 1000) - 14 * 86400;
let sessions = [];
let starting_after;
for (let i = 0; i < 30; i++) {
  const opts = { limit: 100, created: { gte: since14 } };
  if (starting_after) opts.starting_after = starting_after;
  const page = await stripe.checkout.sessions.list(opts);
  sessions.push(...page.data);
  if (!page.has_more) break;
  starting_after = page.data[page.data.length - 1].id;
}
console.log(`Total Stripe sessions (last 14d): ${sessions.length}`);

const drip = sessions.filter((s) => s.metadata?.utm_source === 'lead-nurture');
console.log(`\n=== Drip-attributed Stripe sessions (utm_source=lead-nurture) ===`);
console.log(`Count: ${drip.length}`);

const byCamp = {};
const byStatus = {};
for (const s of drip) {
  const c = s.metadata?.utm_campaign ?? '(none)';
  byCamp[c] = (byCamp[c] || 0) + 1;
  byStatus[s.status] = (byStatus[s.status] || 0) + 1;
}
console.log('By utm_campaign:');
console.table(Object.entries(byCamp).map(([k,v])=>({utm_campaign:k,n:v})));
console.log('By status:');
console.table(Object.entries(byStatus).map(([k,v])=>({status:k,n:v})));

console.log('\nDetail rows:');
console.table(drip.map((s) => ({
  id: s.id.slice(0, 18),
  email: (s.customer_email || s.customer_details?.email || '').slice(0, 26),
  campaign: s.metadata?.utm_campaign,
  content: s.metadata?.utm_content?.slice(0, 22),
  status: s.status,
  mode: s.mode,
  locale: s.locale,
  created: new Date(s.created * 1000).toISOString().slice(5, 16),
})));

// Bonus: sessions only AFTER tracking cutoff
const cutoff = Math.floor(new Date('2026-05-21T20:25:00Z').getTime() / 1000);
const postCutoff = sessions.filter((s) => s.created >= cutoff);
console.log(`\n=== Sessions since 2026-05-21 20:25 UTC: ${postCutoff.length} ===`);
const postCompletion = postCutoff.filter((s) => s.status === 'complete').length;
console.log(`  Completion: ${postCompletion}/${postCutoff.length} = ${((postCompletion*100)/postCutoff.length).toFixed(1)}%`);

const dripPost = postCutoff.filter((s) => s.metadata?.utm_source === 'lead-nurture');
console.log(`  utm=lead-nurture: ${dripPost.length}`);
const dripPostComplete = dripPost.filter((s) => s.status === 'complete').length;
console.log(`  utm=lead-nurture complete: ${dripPostComplete}/${dripPost.length}`);
