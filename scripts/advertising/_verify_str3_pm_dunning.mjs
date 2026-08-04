import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ts = (s) => (s ? new Date(s * 1000).toISOString() : null);

const cust = 'cus_UXLi3mJUjr3wYC';

// Payment methods on file
const pms = await stripe.paymentMethods.list({ customer: cust, limit: 20 });
console.log('=== PAYMENT METHODS ON FILE ===');
for (const pm of pms.data) {
  console.log(`  ${pm.id} type=${pm.type} card_brand=${pm.card?.brand ?? '-'} wallet=${pm.card?.wallet?.type ?? '-'} created=${ts(pm.created)}`);
}

// Customer invoice settings + default PM
const c = await stripe.customers.retrieve(cust);
console.log('\n=== CUSTOMER DEFAULT PM ===');
console.log('  invoice_settings.default_payment_method:', c.invoice_settings?.default_payment_method);
console.log('  default_source:', c.default_source);

// The open invoice payment intent (reveals which PM was attempted + decline reason)
const inv = await stripe.invoices.retrieve('in_1TZMUSDoVTUWyGzGrRrzwS5n', { expand: ['payment_intent'] });
console.log('\n=== OPEN INVOICE in_1TZMUS ===');
console.log('  status:', inv.status, 'attempt_count:', inv.attempt_count, 'next_payment_attempt:', ts(inv.next_payment_attempt));
const pi = inv.payment_intent;
if (pi && typeof pi === 'object') {
  console.log('  payment_intent:', pi.id, 'status:', pi.status);
  console.log('  last_payment_error:', JSON.stringify(pi.last_payment_error?.code ?? pi.last_payment_error?.decline_code ?? pi.last_payment_error?.message ?? null));
  console.log('  pi.payment_method_types:', pi.payment_method_types);
} else {
  console.log('  payment_intent:', pi);
}

// Dunning settings (how many retries before give up / what happens after)
const acct = await stripe.accounts.retrieve();
console.log('\n=== ACCOUNT ===', acct.id, acct.country);
