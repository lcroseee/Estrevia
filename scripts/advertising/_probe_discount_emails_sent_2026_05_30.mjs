// READ-ONLY: how many DISCOUNT-bearing emails have actually been sent? (2026-05-30)
// Two channels carry the TEASER20 20%-off offer:
//   1) paywall_teaser VARIANT C  -> sent_lead_emails(email_type='lead_paywall_teaser')
//      joined to email_leads.paywall_teaser_variant='C'. The coupon param is only
//      appended when STRIPE_COUPON_TEASER20 env is set at send time (else degrades to plain trial link).
//   2) cart-abandon -> every row in sent_cart_abandon_emails (URL = /checkout/start?coupon=TEASER20).
// Dunning emails are "update your card" (no coupon) -> NOT counted as discount.
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// 1) paywall_teaser sends, split by the lead's assigned variant.
const teaserByVariant = await sql`
  SELECT COALESCE(el.paywall_teaser_variant, 'NULL(pre-exp→A)') AS variant,
         count(*) AS n,
         min(sle.sent_at) AS first_sent,
         max(sle.sent_at) AS last_sent
  FROM sent_lead_emails sle
  JOIN email_leads el ON el.id = sle.lead_id
  WHERE sle.email_type = 'lead_paywall_teaser'
  GROUP BY COALESCE(el.paywall_teaser_variant, 'NULL(pre-exp→A)')
  ORDER BY variant
`;

// Variant C with locale split (the actual discount emails).
const teaserCByLocale = await sql`
  SELECT el.locale, count(*) AS n
  FROM sent_lead_emails sle
  JOIN email_leads el ON el.id = sle.lead_id
  WHERE sle.email_type = 'lead_paywall_teaser'
    AND el.paywall_teaser_variant = 'C'
  GROUP BY el.locale ORDER BY el.locale
`;

// 2) cart-abandon — entire table is discount-bearing.
const cartAbandon = await sql`
  SELECT count(*) AS n, min(sent_at) AS first_sent, max(sent_at) AS last_sent
  FROM sent_cart_abandon_emails
`;
const cartByLocale = await sql`
  SELECT el.locale, count(*) AS n
  FROM sent_cart_abandon_emails ca
  JOIN email_leads el ON el.id = ca.lead_id
  GROUP BY el.locale ORDER BY el.locale
`;

// Context: total paywall_teaser + dunning (for comparison, dunning NOT a discount).
const dunning = await sql`SELECT count(*) AS n FROM sent_dunning_emails`;

console.log('=== paywall_teaser sends by assigned variant ===');
let teaserC = 0;
for (const r of teaserByVariant) {
  console.log(`  variant ${r.variant}: ${r.n}  (first ${r.first_sent ?? '—'} … last ${r.last_sent ?? '—'})`);
  if (r.variant === 'C') teaserC = Number(r.n);
}
console.log('  variant C by locale:', teaserCByLocale.map((r) => `${r.locale}=${r.n}`).join(' ') || '(none)');

console.log('\n=== cart-abandon sends (all carry ?coupon=TEASER20) ===');
console.log(`  total: ${cartAbandon[0].n}  (first ${cartAbandon[0].first_sent ?? '—'} … last ${cartAbandon[0].last_sent ?? '—'})`);
console.log('  by locale:', cartByLocale.map((r) => `${r.locale}=${r.n}`).join(' ') || '(none)');

const totalDiscount = teaserC + Number(cartAbandon[0].n);
console.log('\n=== DISCOUNT EMAILS SENT TOTAL ===');
console.log(`  paywall_teaser variant C : ${teaserC}`);
console.log(`  cart-abandon             : ${cartAbandon[0].n}`);
console.log(`  ----------------------------------`);
console.log(`  TOTAL discount emails    : ${totalDiscount}`);
console.log(`\n  (context, NOT discount) dunning emails sent: ${dunning[0].n}`);

console.log('\n=== env at probe time ===');
console.log(`  STRIPE_COUPON_TEASER20 set locally: ${process.env.STRIPE_COUPON_TEASER20 ? 'yes ('+process.env.STRIPE_COUPON_TEASER20+')' : 'NO — variant C would degrade to plain trial link if prod env also unset'}`);
console.log('\nREAD-ONLY — no writes.');
