// Why ES Stripe checkout sessions expire — deep diagnostic
// Read-only: session detail + payment_intent state + events + payment-method-availability
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;

console.log('=== ES Stripe sessions (last 30d) — full lifecycle ===\n');

const list = await stripe.checkout.sessions.list({
  limit: 100,
  created: { gte: cutoff },
  expand: ['data.payment_intent', 'data.customer'],
});

const esSessions = list.data.filter(
  (s) =>
    s.locale === 'es' ||
    s.metadata?.locale === 'es' ||
    (s.success_url || '').includes('/es/') ||
    (s.cancel_url || '').includes('/es/')
);

console.log(`Found ${esSessions.length} ES sessions in 30d.\n`);

const buckets = { complete: 0, open: 0, expired: 0, other: 0 };
const details = [];

for (const s of esSessions) {
  buckets[s.status] = (buckets[s.status] || 0) + 1;

  const created = new Date(s.created * 1000);
  const expiresAt = s.expires_at ? new Date(s.expires_at * 1000) : null;
  const ttlHours = expiresAt
    ? ((expiresAt.getTime() - created.getTime()) / 3600000).toFixed(1)
    : null;

  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;

  details.push({
    id: s.id,
    status: s.status,
    created: created.toISOString().slice(0, 16),
    expires_at: expiresAt?.toISOString().slice(0, 16),
    ttl_h: ttlHours,
    locale: s.locale,
    meta_locale: s.metadata?.locale,
    utm_source: s.metadata?.utm_source,
    utm_content: s.metadata?.utm_content?.slice(0, 12),
    currency: s.currency,
    amount: s.amount_total ? (s.amount_total / 100).toFixed(2) : null,
    mode: s.mode,
    customer_email: s.customer_email || s.customer_details?.email,
    customer_country: s.customer_details?.address?.country,
    payment_status: s.payment_status,
    payment_method_types: (s.payment_method_types || []).join(','),
    auto_pm: s.automatic_payment_methods?.enabled,
    pi_status: pi?.status,
    pi_last_error: pi?.last_payment_error?.code,
    pi_last_error_msg: pi?.last_payment_error?.message?.slice(0, 50),
    pi_charges: pi?.charges?.data?.length ?? 0,
  });
}

console.log('=== Status distribution ===');
console.table(buckets);

console.log('\n=== Per-session detail ===');
console.table(details);

// ─── Check related events for each expired session
console.log('\n=== Events around expired sessions ===\n');
for (const s of esSessions.filter((x) => x.status === 'expired')) {
  const created = s.created;
  const expired = s.expires_at;

  // List events for the time window covering this session
  const events = await stripe.events.list({
    type: 'checkout.session.expired',
    created: { gte: created, lte: expired + 60 },
    limit: 5,
  });

  const matching = events.data.find((e) => e.data?.object?.id === s.id);
  if (matching) {
    const obj = matching.data.object;
    console.log(`session=${s.id} expired_at=${new Date(matching.created * 1000).toISOString()}`);
    console.log(`  customer_email_collected=${!!obj.customer_email || !!obj.customer_details?.email}`);
    console.log(`  payment_status=${obj.payment_status}`);
    console.log(`  total_details=${JSON.stringify(obj.total_details)}`);

    // Did they enter ANY data? Check customer_details
    if (obj.customer_details) {
      console.log(
        `  customer_details: name=${!!obj.customer_details.name} email=${!!obj.customer_details.email} address=${!!obj.customer_details.address} phone=${!!obj.customer_details.phone}`
      );
    }

    // Time alive before expiry
    const aliveHours = ((expired - created) / 3600).toFixed(1);
    console.log(`  total_alive_h=${aliveHours} (Stripe default TTL = 24h for most modes)`);
    console.log('');
  }
}

// ─── Check what payment methods are currently available for ES users
console.log('\n=== Payment method capability test (ES + MX/CO/AR scenarios) ===\n');

// Try creating a test session WITH automatic_payment_methods to see what Stripe offers
// (but as preview only — won't actually charge)
console.log('Current product configuration in code:');
console.log('  - 478e88d helper findOrPrepareCustomer');
console.log('  - e195f7c payment_method_types = ["card", "link"]   ← only these');
console.log('  - automatic_payment_methods: NOT enabled (verified from code)');
console.log('');
console.log('Implication: LATAM users see ONLY card+link options.');
console.log('  No OXXO (MX), no Mercado Pago, no PSE (CO), no Boleto (BR), no Pix (BR).');
console.log('  Their local debit cards may or may not work for USD international purchases.');
console.log('');

// ─── Look up account capabilities — what Stripe could enable
const account = await stripe.accounts.retrieve();
console.log(`Stripe account country: ${account.country}`);
console.log(`Default currency: ${account.default_currency}`);
const caps = account.capabilities || {};
const interesting = ['oxxo_payments', 'mercado_pago_payments', 'boleto_payments', 'pix_payments', 'card_payments', 'link_payments', 'cashapp_payments', 'klarna_payments', 'amazon_pay_payments'];
console.log('\nAccount capabilities:');
for (const c of interesting) {
  if (caps[c]) console.log(`  ${c.padEnd(28)}: ${caps[c]}`);
}

// ─── Cross-check: for COMPLETE sessions (EN) what did they actually pay with?
console.log('\n=== Cross-check: how EN users actually paid (the ones who completed) ===\n');
const enComplete = list.data.filter((s) => s.status === 'complete');
for (const s of enComplete.slice(0, 10)) {
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : await stripe.paymentIntents.retrieve(s.payment_intent).catch(() => null);
  const charge = pi?.charges?.data?.[0];
  console.log(`  ${s.id.slice(0, 18)} email=${(s.customer_details?.email || s.customer_email || '?').slice(0, 25).padEnd(25)} country=${s.customer_details?.address?.country || '?'} pm=${charge?.payment_method_details?.type || '?'} card=${charge?.payment_method_details?.card?.country || '?'}`);
}
