// READ-ONLY: count ES-locale Stripe Checkout sessions + completion, lifetime and since 5849f22 deploy.
// ES-locale identified via session.metadata.locale === 'es' OR session.locale startsWith 'es'.

import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 5849f22 authored 2026-05-23 15:31 UTC; prod deploy slightly after. Use 2026-05-23 16:00 UTC as cutoff.
const DEPLOY_TS = Math.floor(Date.parse('2026-05-23T16:00:00Z') / 1000);

let all = [];
let starting_after;
do {
  const page = await stripe.checkout.sessions.list({ limit: 100, ...(starting_after ? { starting_after } : {}) });
  all = all.concat(page.data);
  starting_after = page.has_more ? page.data[page.data.length - 1].id : null;
} while (starting_after);

console.log(`Total checkout sessions fetched: ${all.length}`);

function isEs(s) {
  const ml = s.metadata?.locale;
  const sl = s.locale;
  return ml === 'es' || (typeof sl === 'string' && sl.startsWith('es'));
}

const es = all.filter(isEs);
console.log(`\n=== ES-locale sessions (lifetime): ${es.length} ===`);
let esPaid = 0, esExpired = 0, esOpen = 0;
for (const s of es) {
  const dt = new Date(s.created * 1000).toISOString().slice(0, 16);
  const paid = s.payment_status === 'paid' || s.status === 'complete';
  if (paid) esPaid++;
  else if (s.status === 'expired') esExpired++;
  else esOpen++;
  const afterFix = s.created >= DEPLOY_TS ? 'POST-FIX' : '';
  console.log(`  ${dt}  status=${s.status?.padEnd(9)} pay=${(s.payment_status||'').padEnd(9)} locale=${(s.locale||'-').padEnd(7)} mLoc=${s.metadata?.locale||'-'} ${afterFix}`);
}
console.log(`  ES paid/complete=${esPaid}  expired=${esExpired}  open=${esOpen}`);

const esPostFix = es.filter(s => s.created >= DEPLOY_TS);
console.log(`\n=== ES-locale sessions AFTER 5849f22 deploy (>=2026-05-23 16:00 UTC): ${esPostFix.length} ===`);
for (const s of esPostFix) {
  console.log(`  ${new Date(s.created*1000).toISOString().slice(0,16)} status=${s.status} pay=${s.payment_status} locale=${s.locale}`);
}

// Did any session use es-419 locale (proof the new code ran in prod)?
const es419 = all.filter(s => s.locale === 'es-419');
console.log(`\n=== Sessions with locale='es-419' (proof new code path executed in prod): ${es419.length} ===`);
for (const s of es419) {
  console.log(`  ${new Date(s.created*1000).toISOString().slice(0,16)} status=${s.status} pay=${s.payment_status} custom_text.submit=${JSON.stringify(s.custom_text?.submit?.message)?.slice(0,40)}`);
}

console.log('\n=== DONE ===');
