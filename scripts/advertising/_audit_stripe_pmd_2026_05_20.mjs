// Verify Payment Method Domain (new API for Apple Pay + Google Pay + Link)
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const DOMAIN_ID = process.argv[2] || 'pmd_1TZKaHDoVTUWyGzG71MkHmdP';

console.log(`═══ Payment Method Domain: ${DOMAIN_ID} ═══`);
try {
  const pmd = await stripe.paymentMethodDomains.retrieve(DOMAIN_ID);
  console.log(`  domain_name: ${pmd.domain_name}`);
  console.log(`  enabled: ${pmd.enabled}`);
  console.log(`  livemode: ${pmd.livemode}`);
  console.log(`  created: ${new Date(pmd.created * 1000).toISOString()}`);
  console.log('');
  console.log('  Per-method status:');
  for (const method of ['apple_pay', 'google_pay', 'link', 'paypal']) {
    const m = pmd[method];
    if (!m) { console.log(`    ${method}: not in response`); continue; }
    const ok = m.status === 'active';
    console.log(`    ${ok ? '✅' : '⚠️ '} ${method.padEnd(12)} status=${m.status}`);
    if (m.status_details?.error_message) {
      console.log(`         error: ${m.status_details.error_message}`);
    }
  }
} catch (e) {
  console.log(`  ERR: ${e.message}`);
}

console.log('\n═══ All payment method domains in account ═══');
try {
  const all = await stripe.paymentMethodDomains.list({ limit: 20 });
  for (const d of all.data) {
    console.log(`  domain=${d.domain_name.padEnd(25)}  id=${d.id}  enabled=${d.enabled}  apple_pay=${d.apple_pay?.status}  google_pay=${d.google_pay?.status}  link=${d.link?.status}`);
  }
} catch (e) {
  console.log(`  ERR: ${e.message}`);
}

// Verify the well-known file is still 404
console.log('\n═══ Well-known file check ═══');
for (const domain of ['estrevia.app', 'www.estrevia.app']) {
  try {
    const r = await fetch(`https://${domain}/.well-known/apple-developer-merchantid-domain-association`);
    const sample = r.ok ? (await r.text()).slice(0, 50) : null;
    console.log(`  https://${domain}/.well-known/apple-developer-merchantid-domain-association  status=${r.status}  preview="${sample}"`);
  } catch (e) {
    console.log(`  ${domain}: ${e.message}`);
  }
}

// Re-validate the domain (trigger Stripe to check the file again)
console.log('\n═══ Triggering re-validation ═══');
try {
  const validated = await stripe.paymentMethodDomains.validate(DOMAIN_ID);
  console.log(`  Re-validation result: enabled=${validated.enabled}`);
  for (const method of ['apple_pay', 'google_pay', 'link']) {
    const m = validated[method];
    if (m) console.log(`    ${method.padEnd(12)} status=${m.status}${m.status_details?.error_message ? ` — ${m.status_details.error_message}` : ''}`);
  }
} catch (e) {
  console.log(`  ERR: ${e.message}`);
}

console.log('\n— End PMD audit —');
