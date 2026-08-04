/**
 * RECONCILE #6 — did a non-card PMT leak into checkout? ("Bank app" on live page 07-10)
 * STRICTLY READ-ONLY: Stripe GET/list only.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

// (a) checkout sessions created 2026-07-10 UTC
const dayStart = Math.floor(Date.UTC(2026, 6, 10) / 1000);
console.log('═════ (a) Checkout sessions created 2026-07-10 (UTC) ═════');
const sessions = await stripe.checkout.sessions.list({
  created: { gte: dayStart },
  limit: 100,
});
console.log(`count: ${sessions.data.length}`);
for (const s of sessions.data) {
  console.log(JSON.stringify({
    id: s.id,
    created: new Date(s.created * 1000).toISOString(),
    status: s.status,
    mode: s.mode,
    ui_mode: s.ui_mode,
    locale: s.locale,
    customer_email: s.customer_email,
    customer_details_email: s.customer_details?.email ?? null,
    amount_total: s.amount_total,
    currency: s.currency,
    payment_method_types: s.payment_method_types,
    payment_method_options: s.payment_method_options,
    payment_method_configuration_details: s.payment_method_configuration_details ?? null,
    subscription: s.subscription,
    discounts: s.discounts,
    metadata: s.metadata,
  }, null, 2));
}

// Widen: last 3 days, in case the walkthrough session sits just before midnight UTC
console.log('\n═════ (a2) Sessions created 2026-07-07..07-10 (context) ═════');
const wide = await stripe.checkout.sessions.list({
  created: { gte: dayStart - 3 * 86400 },
  limit: 100,
});
for (const s of wide.data) {
  console.log(`${s.id} | ${new Date(s.created * 1000).toISOString()} | ${s.status} | pmt=${JSON.stringify(s.payment_method_types)} | pmc=${JSON.stringify(s.payment_method_configuration_details)} | email=${s.customer_details?.email ?? s.customer_email ?? '-'}`);
}

// (b) dashboard-level dynamic payment method configurations
console.log('\n═════ (b) payment_method_configurations.list ═════');
try {
  const cfgs = await stripe.paymentMethodConfigurations.list({ limit: 100 });
  for (const c of cfgs.data) {
    const active = Object.entries(c)
      .filter(([, v]) => v && typeof v === 'object' && 'available' in v)
      .map(([k, v]) => `${k}: available=${v.available} pref=${v.display_preference?.preference}/${v.display_preference?.value}`);
    console.log(`config ${c.id} "${c.name}" is_default=${c.is_default} active=${c.active}`);
    for (const line of active) console.log('   ', line);
  }
} catch (e) {
  console.log('payment_method_configurations.list failed:', e.message);
}

// (c) what funding did the failing `link` charges actually use? (off-session risk proof)
console.log('\n═════ (c) recent failed charges — payment_method_details (link funding) ═════');
const charges = await stripe.charges.list({ created: { gte: dayStart - 30 * 86400 }, limit: 100 });
const failed = charges.data.filter((ch) => ch.status === 'failed');
console.log(`failed charges last 30d: ${failed.length}`);
for (const ch of failed.slice(0, 20)) {
  console.log(JSON.stringify({
    id: ch.id,
    created: new Date(ch.created * 1000).toISOString(),
    email: ch.billing_details?.email,
    amount: ch.amount,
    decline_code: ch.outcome?.reason ?? ch.failure_code,
    failure_message: ch.failure_message,
    pm_type: ch.payment_method_details?.type,
    link_details: ch.payment_method_details?.link ?? null,
    card_details: ch.payment_method_details?.card
      ? { brand: ch.payment_method_details.card.brand, funding: ch.payment_method_details.card.funding, wallet: ch.payment_method_details.card.wallet?.type ?? null }
      : null,
  }));
}

// (c2) default payment methods on live subscriptions — what would bill off-session?
console.log('\n═════ (c2) subscriptions + default payment method types ═════');
const subs = await stripe.subscriptions.list({ status: 'all', limit: 100, expand: ['data.default_payment_method'] });
for (const s of subs.data) {
  const pm = s.default_payment_method;
  console.log(`${s.id} | ${s.status} | cancel_at_period_end=${s.cancel_at_period_end} | pm=${pm ? `${pm.type}${pm.type === 'link' ? ' (Link)' : ''}${pm.card ? ` card:${pm.card.brand}/${pm.card.funding}${pm.card.wallet ? ' wallet:' + pm.card.wallet.type : ''}` : ''}` : 'none'}`);
}
