// READ-ONLY: confirm gatito66679 ES session -> subscription -> any paid charge?
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const s = await stripe.checkout.sessions.retrieve('cs_live_b1wV9mOvGN5G13srK...'.slice(0,0) + 'cs_live_b1wV9mOvGN5G13sr', { expand: ['subscription'] }).catch(async () => {
  // need full id; re-list to get it
  const list = await stripe.checkout.sessions.list({ limit: 100, created: { gte: Math.floor(Date.now()/1000) - 30*86400 } });
  return list.data.find((x) => x.id.startsWith('cs_live_b1wV9mOvGN5G13sr'));
});

const sess = s.id ? s : await (async () => {
  const list = await stripe.checkout.sessions.list({ limit: 100, created: { gte: Math.floor(Date.now()/1000) - 30*86400 } });
  return list.data.find((x) => x.id.startsWith('cs_live_b1wV9mOvGN5G13sr'));
})();

console.log('Session:', sess.id);
console.log('  status:', sess.status, 'payment_status:', sess.payment_status, 'mode:', sess.mode);
console.log('  customer:', sess.customer, 'email:', sess.customer_email ?? sess.metadata?.email);
console.log('  subscription:', sess.subscription);
console.log('  metadata.locale:', sess.metadata?.locale, 'metadata.utm_campaign:', sess.metadata?.utm_campaign);

if (sess.subscription) {
  const sub = await stripe.subscriptions.retrieve(sess.subscription);
  console.log('\nSubscription', sub.id);
  console.log('  status:', sub.status);
  console.log('  cancel_at_period_end:', sub.cancel_at_period_end);
  console.log('  canceled_at:', sub.canceled_at ? new Date(sub.canceled_at*1000).toISOString() : null);
  console.log('  ended_at:', sub.ended_at ? new Date(sub.ended_at*1000).toISOString() : null);
  console.log('  trial_end:', sub.trial_end ? new Date(sub.trial_end*1000).toISOString() : null);
  console.log('  current_period_end:', sub.current_period_end ? new Date(sub.current_period_end*1000).toISOString() : null);
  console.log('  price:', sub.items.data[0]?.price?.id, (sub.items.data[0]?.price?.unit_amount/100).toFixed(2), sub.items.data[0]?.price?.currency?.toUpperCase(), sub.items.data[0]?.price?.recurring?.interval);

  // charges for this customer
  const charges = await stripe.charges.list({ customer: sub.customer, limit: 10 });
  console.log('\nCharges for customer', sub.customer);
  let paidTotal = 0;
  for (const c of charges.data) {
    console.log(`  ${new Date(c.created*1000).toISOString()} ${c.status} ${(c.amount/100).toFixed(2)} ${c.currency.toUpperCase()} paid=${c.paid} refunded=${c.refunded}`);
    if (c.paid && !c.refunded) paidTotal += c.amount;
  }
  console.log(`  -> net paid for gatito: $${(paidTotal/100).toFixed(2)}`);

  // invoices
  const inv = await stripe.invoices.list({ customer: sub.customer, limit: 10 });
  console.log('\nInvoices for customer', sub.customer);
  for (const i of inv.data) {
    console.log(`  ${new Date(i.created*1000).toISOString()} ${i.status} due=${(i.amount_due/100).toFixed(2)} paid=${(i.amount_paid/100).toFixed(2)} ${i.currency.toUpperCase()} attempt=${i.attempt_count}`);
  }
}
