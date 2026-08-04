// READ-ONLY: inspect UTM/source of post-fix es-419 sessions + the one paid ES session.
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

let all = [];
let starting_after;
do {
  const page = await stripe.checkout.sessions.list({ limit: 100, expand: ['data.subscription'], ...(starting_after ? { starting_after } : {}) });
  all = all.concat(page.data);
  starting_after = page.has_more ? page.data[page.data.length - 1].id : null;
} while (starting_after);

const es419 = all.filter(s => s.locale === 'es-419');
console.log(`=== ${es419.length} es-419 sessions: source/UTM detail ===`);
for (const s of es419) {
  const m = s.metadata || {};
  console.log(`\n  ${new Date(s.created*1000).toISOString().slice(0,16)}  status=${s.status} pay=${s.payment_status}`);
  console.log(`    utm_source=${m.utm_source||'-'} utm_medium=${m.utm_medium||'-'} utm_campaign=${m.utm_campaign||'-'} utm_content=${m.utm_content||'-'}`);
  console.log(`    anonymous_id=${m.anonymous_id?'set':'-'} client_ref=${s.client_reference_id?'set':'-'} amount_total=${s.amount_total} cur=${s.currency}`);
  if (s.payment_status === 'paid' || s.status === 'complete') {
    console.log(`    >>> PAID. customer=${s.customer} email=${s.customer_details?.email} sub=${typeof s.subscription==='object'?s.subscription?.id:s.subscription} subStatus=${typeof s.subscription==='object'?s.subscription?.status:'-'}`);
  }
}
console.log('\n=== DONE ===');
