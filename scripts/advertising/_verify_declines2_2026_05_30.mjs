// READ-ONLY — 2026-05-30. Pull real decline codes via failed charges (affordability vs issuer-rule vs wallet).
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const usd = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const dt = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 16) : '—');

async function main() {
  console.log('=== FAILED CHARGES (last 100) — decline taxonomy ===');
  const charges = await stripe.charges.list({ limit: 100 });
  const failed = charges.data.filter((c) => c.status === 'failed' || c.outcome?.network_status === 'declined_by_network');
  const buckets = { affordability: 0, issuer_rule: 0, wallet_offsession: 0, other: 0 };
  for (const c of failed) {
    const code = c.outcome?.reason || c.decline_code || c.failure_code || c.failure_message || '?';
    const dc = c.decline_code || '';
    const pm = c.payment_method_details?.type || '?';
    let bucket = 'other';
    if (/insufficient_funds/.test(dc) || /insufficient/.test(code)) bucket = 'affordability';
    else if (/transaction_not_allowed|do_not_honor|generic_decline|restricted|not_permitted|card_not_supported/.test(dc + code)) bucket = 'issuer_rule';
    else if (/cashapp|klarna|amazon|wallet/.test(pm)) bucket = 'wallet_offsession';
    buckets[bucket]++;
    console.log(`  ${dt(c.created)} | ${usd(c.amount)} | pm=${pm} | decline_code=${dc || '-'} | reason=${code} | ${bucket}`);
  }
  console.log(`\n  buckets: ${JSON.stringify(buckets)}  (failed charges=${failed.length})`);

  // Also: list invoices that already collected money (true paid)
  console.log('\n=== PAID INVOICES (real money collected) ===');
  const paid = await stripe.invoices.list({ status: 'paid', limit: 100 });
  let gross = 0, n = 0;
  for (const inv of paid.data) {
    if ((inv.amount_paid || 0) > 0) { gross += inv.amount_paid; n++;
      console.log(`  ${dt(inv.created)} | ${usd(inv.amount_paid)} | ${inv.customer_email || inv.customer}`); }
  }
  console.log(`\n  paid invoices w/ money=${n}  lifetime_gross=${usd(gross)}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
