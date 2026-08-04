// What payment methods are actually available in this Stripe account?
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 1. Account info — country, capabilities
console.log('═══ 1. Stripe account info ═══');
const account = await stripe.accounts.retrieve();
console.log(`  Country: ${account.country}`);
console.log(`  Default currency: ${account.default_currency}`);
console.log(`  Charges enabled: ${account.charges_enabled}`);
console.log(`  Type: ${account.type}`);

console.log('\n═══ 2. Enabled capabilities (payment methods) ═══');
const caps = account.capabilities ?? {};
const active = Object.entries(caps).filter(([, status]) => status === 'active');
const pending = Object.entries(caps).filter(([, status]) => status === 'pending' || status === 'inactive');
console.log(`  Active (${active.length}):`);
for (const [name, status] of active) console.log(`    ✅ ${name}`);
console.log(`\n  Inactive/Pending (${pending.length}):`);
for (const [name, status] of pending) console.log(`    ⚠️  ${name}: ${status}`);

// 3. What payment_method_configurations exist?
console.log('\n═══ 3. Payment method configurations ═══');
try {
  const configs = await stripe.paymentMethodConfigurations.list({ limit: 10 });
  for (const cfg of configs.data) {
    console.log(`\n  Config: ${cfg.name} (id=${cfg.id})  is_default=${cfg.is_default}`);
    const methods = Object.entries(cfg).filter(([, v]) =>
      v && typeof v === 'object' && 'display_preference' in v
    );
    for (const [methodName, methodConfig] of methods) {
      const pref = methodConfig.display_preference?.value;
      const available = methodConfig.available;
      if (available) {
        console.log(`    ${pref === 'on' ? '✅' : '⚪'} ${methodName.padEnd(25)} pref=${pref}`);
      }
    }
  }
} catch (e) {
  console.log(`  ERR: ${e.message}`);
}

// 4. Simulate what ES user from MX would see — create test session with automatic_payment_methods
console.log('\n═══ 4. What would ES user see with automatic_payment_methods? (simulation) ═══');
try {
  const testSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID_PRO_MONTHLY, quantity: 1 }],
    customer_email: 'test-mx@estrevia.app',
    locale: 'es',
    automatic_payment_methods: { enabled: true },
    subscription_data: { trial_period_days: 3 },
    success_url: 'https://estrevia.app/test',
    cancel_url: 'https://estrevia.app/test',
  });
  console.log(`  Created test session: ${testSession.id}`);
  console.log(`  Payment methods Stripe will surface: ${testSession.payment_method_types?.join(', ')}`);
  console.log(`  ⚠️  Note: actual rendering depends on user's geo-IP at Checkout page load`);
  console.log(`  Test URL (don't share publicly): ${testSession.url.slice(0, 80)}...`);
  // Expire immediately so it's not a real session
  await stripe.checkout.sessions.expire(testSession.id);
  console.log(`  (session expired immediately for cleanup)`);
} catch (e) {
  console.log(`  ERR: ${e.message}`);
}

console.log('\n═══ 5. Check Mercado Pago and Stripe LATAM options availability ═══');
const LATAM_METHODS_TO_CHECK = [
  'mercado_pago', 'mercadopago', 'pix', 'boleto', 'oxxo',
  'apple_pay', 'google_pay', 'link', 'sepa_debit',
  'card_present',
];
for (const m of LATAM_METHODS_TO_CHECK) {
  const cap = caps[`${m}_payments`] ?? caps[m] ?? null;
  console.log(`  ${m.padEnd(20)} → ${cap ?? '(no such capability)'}`);
}

console.log('\n— End payment methods audit —');
