// Query Stripe directly: what happened with recent ES checkout sessions?
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 1. Check Price objects (currency, amount)
console.log('═══ 1. Price IDs configuration ═══');
for (const [tag, id] of [
  ['MONTHLY', process.env.STRIPE_PRICE_ID_PRO_MONTHLY],
  ['ANNUAL', process.env.STRIPE_PRICE_ID_PRO_ANNUAL],
]) {
  const price = await stripe.prices.retrieve(id, { expand: ['product'] });
  console.log(`  ${tag.padEnd(8)} id=${id}  currency=${price.currency.toUpperCase()}  amount=${(price.unit_amount / 100).toFixed(2)}  recurring=${price.recurring?.interval}  product=${price.product.name}`);
}

// 2. Recent checkout sessions — last 50, look at completion + locale
console.log('\n═══ 2. Recent checkout sessions (last 50) ═══');
const sessions = await stripe.checkout.sessions.list({ limit: 50 });
const SINCE = Math.floor(new Date('2026-05-17').getTime() / 1000);

const filtered = sessions.data.filter((s) => s.created >= SINCE);
console.log(`  Found ${filtered.length} sessions since 2026-05-17`);

let stats = {
  total: 0,
  complete: 0,
  expired: 0,
  open: 0,
  paid: 0,
  unpaid: 0,
  trial: 0,
  byLocale: { es: 0, en: 0, auto: 0, unset: 0 },
  byUtm: {},
  byStatus: {},
  byCountry: {},
};

for (const s of filtered) {
  stats.total++;
  if (s.status === 'complete') stats.complete++;
  if (s.status === 'expired') stats.expired++;
  if (s.status === 'open') stats.open++;
  if (s.payment_status === 'paid') stats.paid++;
  if (s.payment_status === 'unpaid' || s.payment_status === 'no_payment_required') stats.unpaid++;
  const locale = s.locale ?? 'unset';
  stats.byLocale[locale] = (stats.byLocale[locale] ?? 0) + 1;
  const utm = s.metadata?.utm_campaign ?? '(none)';
  stats.byUtm[utm] = (stats.byUtm[utm] ?? 0) + 1;
  const key = `${s.status}_${s.payment_status}`;
  stats.byStatus[key] = (stats.byStatus[key] ?? 0) + 1;
}

console.log(`  Totals:  status: complete=${stats.complete}  expired=${stats.expired}  open=${stats.open}`);
console.log(`           payment_status: paid=${stats.paid}  unpaid=${stats.unpaid}`);
console.log(`  By locale:  ${JSON.stringify(stats.byLocale)}`);
console.log(`  By utm_campaign:  ${JSON.stringify(stats.byUtm)}`);
console.log(`  By status × payment_status:  ${JSON.stringify(stats.byStatus)}`);

// 3. Detail per ES session
console.log('\n═══ 3. ES-locale sessions (detailed) ═══');
const esSessions = filtered.filter((s) => s.locale === 'es' || s.metadata?.locale === 'es' || s.metadata?.utm_campaign?.includes('_es'));
for (const s of esSessions) {
  const created = new Date(s.created * 1000).toISOString();
  console.log(`\n  ${created}  id=${s.id.slice(0, 30)}...`);
  console.log(`    status=${s.status}  payment_status=${s.payment_status}  amount_total=${s.amount_total ?? 'null'} ${s.currency?.toUpperCase() ?? ''}`);
  console.log(`    locale=${s.locale ?? '(unset)'}  customer_email=${s.customer_email ?? '(none)'}`);
  console.log(`    metadata utm: source=${s.metadata?.utm_source ?? '—'} campaign=${s.metadata?.utm_campaign ?? '—'} locale=${s.metadata?.locale ?? '—'}`);
  console.log(`    payment_method_types: ${s.payment_method_types?.join(',') ?? '—'}`);
  console.log(`    automatic_payment_methods: ${JSON.stringify(s.automatic_payment_methods ?? {})}`);
  if (s.status === 'expired') console.log(`    ⚠️ EXPIRED — user never paid`);
  if (s.payment_intent) {
    try {
      const pi = await stripe.paymentIntents.retrieve(s.payment_intent);
      console.log(`    payment_intent status: ${pi.status}  last_payment_error: ${pi.last_payment_error?.message ?? '—'}`);
    } catch {}
  }
}

// 4. Most recent EN session for comparison
console.log('\n═══ 4. Recent EN sessions for comparison (first 3) ═══');
const enSessions = filtered.filter((s) => s.metadata?.utm_campaign?.includes('_en') || s.locale === 'en').slice(0, 3);
for (const s of enSessions) {
  const created = new Date(s.created * 1000).toISOString();
  console.log(`\n  ${created}  id=${s.id.slice(0, 30)}...`);
  console.log(`    status=${s.status}  payment_status=${s.payment_status}  amount_total=${s.amount_total ?? 'null'} ${s.currency?.toUpperCase() ?? ''}`);
  console.log(`    locale=${s.locale ?? '(unset)'}  email=${s.customer_email ?? '(none)'}`);
  console.log(`    payment_method_types: ${s.payment_method_types?.join(',') ?? '—'}`);
}

console.log('\n— End Stripe audit —');
