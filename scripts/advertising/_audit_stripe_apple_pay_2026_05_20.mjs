// Verify Apple Pay domain registration in Stripe
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

console.log('═══ Apple Pay domains registered in Stripe ═══');
try {
  const domains = await stripe.applePayDomains.list({ limit: 50 });
  if (!domains.data.length) {
    console.log('  ❌ NO domains registered for Apple Pay');
  } else {
    for (const d of domains.data) {
      const created = new Date(d.created * 1000).toISOString();
      console.log(`  ✅ ${d.domain_name.padEnd(30)} id=${d.id.slice(0, 30)}  livemode=${d.livemode}  created=${created}`);
    }
  }
} catch (e) {
  console.log(`  ERR: ${e.message}`);
}

// Check if the well-known file is accessible on production
console.log('\n═══ Verifying well-known file accessibility ═══');
for (const domain of ['estrevia.app', 'www.estrevia.app']) {
  try {
    const url = `https://${domain}/.well-known/apple-developer-merchantid-domain-association`;
    const r = await fetch(url, { method: 'GET' });
    console.log(`  ${url}`);
    console.log(`    status=${r.status}  content-length=${r.headers.get('content-length')}  content-type=${r.headers.get('content-type')}`);
    if (r.ok) {
      const text = await r.text();
      console.log(`    preview: "${text.slice(0, 60)}..."`);
    }
  } catch (e) {
    console.log(`    ERR: ${e.message}`);
  }
}

// Now create a test session and check if Apple Pay surfaces
console.log('\n═══ Test session: payment_method_types Stripe will surface ═══');
const testSession = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{ price: process.env.STRIPE_PRICE_ID_PRO_MONTHLY, quantity: 1 }],
  customer_email: 'test-mx@estrevia.app',
  locale: 'es',
  subscription_data: { trial_period_days: 3 },
  success_url: 'https://estrevia.app/test',
  cancel_url: 'https://estrevia.app/test',
});
console.log(`  Test session id: ${testSession.id}`);
console.log(`  payment_method_types: ${testSession.payment_method_types?.join(', ')}`);
console.log(`  payment_method_configuration: ${testSession.payment_method_configuration ?? 'default'}`);
console.log(`  Note: Apple Pay/Google Pay added CLIENT-SIDE based on device + domain verification`);
console.log(`  Note: To see what real LATAM-mobile user sees, open this URL on iOS Safari from MX VPN:`);
console.log(`        ${testSession.url}`);
// Expire immediately
await stripe.checkout.sessions.expire(testSession.id);
console.log(`  (test session expired for cleanup)`);

console.log('\n— End Apple Pay audit —');
