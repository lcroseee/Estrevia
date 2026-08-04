// READ-ONLY verification probe: ES Stripe completion (both `es` and `es-419` locales)
// Question: is ES Stripe completion truly still 0, or did es-419 (5849f22 fix) produce any completed session?
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const NOW = Math.floor(Date.now() / 1000);
const SINCE_30 = NOW - 30 * 86400;
const SINCE_14 = NOW - 14 * 86400;

// Paginate all sessions in last 30d
let all = [];
let starting_after;
for (let i = 0; i < 20; i++) {
  const page = await stripe.checkout.sessions.list({
    limit: 100,
    created: { gte: SINCE_30 },
    ...(starting_after ? { starting_after } : {}),
  });
  all = all.concat(page.data);
  if (!page.has_more) break;
  starting_after = page.data[page.data.length - 1].id;
}
console.log(`Fetched ${all.length} sessions created in last 30d (cap 2000).`);

function isES(s) {
  const loc = s.locale ?? '';
  const mloc = s.metadata?.locale ?? '';
  const camp = s.metadata?.utm_campaign ?? '';
  return loc === 'es' || loc === 'es-419' || mloc === 'es' || mloc === 'es-419' || camp.includes('_es');
}

const byLocale = {};
let esTotal = 0, esComplete = 0, esPaid = 0;
const esCompletedDetail = [];

for (const s of all) {
  if (!isES(s)) continue;
  esTotal++;
  const loc = s.locale ?? '(unset)';
  byLocale[loc] = byLocale[loc] || { total: 0, complete: 0, paid: 0 };
  byLocale[loc].total++;
  if (s.status === 'complete') { esComplete++; byLocale[loc].complete++; }
  if (s.payment_status === 'paid') { esPaid++; byLocale[loc].paid++; }
  if (s.status === 'complete' || s.payment_status === 'paid') {
    esCompletedDetail.push({
      id: s.id.slice(0, 24),
      created: new Date(s.created * 1000).toISOString(),
      locale: loc,
      status: s.status,
      payment_status: s.payment_status,
      amount: s.amount_total != null ? (s.amount_total / 100).toFixed(2) : 'null',
      currency: (s.currency ?? '').toUpperCase(),
      email: s.customer_email ?? s.metadata?.email ?? '(none)',
      mode: s.mode,
    });
  }
}

console.log('\n=== ES sessions (locale es OR es-419 OR utm _es), 30d ===');
console.log(`ES total=${esTotal}  status=complete:${esComplete}  payment_status=paid:${esPaid}`);
console.log('\nBy Stripe locale:');
console.table(byLocale);

console.log('\n=== ES sessions that COMPLETED or PAID ===');
if (esCompletedDetail.length === 0) console.log('  NONE — ES completion is genuinely 0.');
else console.table(esCompletedDetail);

// Also count es-419 specifically (the fix's new tag)
const es419 = all.filter((s) => s.locale === 'es-419');
const es419complete = es419.filter((s) => s.status === 'complete' || s.payment_status === 'paid');
console.log(`\nes-419 locale sessions (30d): ${es419.length} total, ${es419complete.length} completed/paid.`);
for (const s of es419complete) {
  console.log(`  COMPLETED es-419: ${s.id.slice(0,24)} ${new Date(s.created*1000).toISOString()} ${s.status}/${s.payment_status} ${(s.amount_total/100).toFixed(2)} ${s.currency.toUpperCase()} ${s.customer_email ?? s.metadata?.email ?? '?'}`);
}
