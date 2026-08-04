// READ-ONLY — 2026-05-30. Verify trial-end charge failure causes (issuer decline vs affordability)
// and true renew/cancel state of the 2 active subs. Stripe retrieve/list only — never mutate.
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const usd = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const dt = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 16) : '—');

async function main() {
  // All subscriptions, true state
  console.log('=== ALL SUBSCRIPTIONS (status + cancel/ended + amount paid) ===');
  const subs = await stripe.subscriptions.list({ status: 'all', limit: 100, expand: ['data.customer'] });
  let active = 0, pastDue = 0, willRenew = 0;
  for (const s of subs.data) {
    const amt = s.items.data[0]?.price?.unit_amount || 0;
    const intv = s.items.data[0]?.price?.recurring?.interval || '?';
    const email = s.customer?.email || s.customer;
    if (s.status === 'active') active++;
    if (s.status === 'past_due') pastDue++;
    if (s.status === 'active' && !s.cancel_at_period_end) willRenew++;
    console.log(`  ${email} | ${s.status} | ${usd(amt)}/${intv} | cancel_at_period_end=${s.cancel_at_period_end} canceled_at=${dt(s.canceled_at)} ended_at=${dt(s.ended_at)}`);
  }
  console.log(`\n  active=${active} past_due=${pastDue} active-will-renew=${willRenew}`);

  // Decline codes on failed/open invoices
  console.log('\n=== FAILED FIRST-CHARGE DECLINE CODES (open + uncollectible invoices) ===');
  const invs = await stripe.invoices.list({ status: 'open', limit: 100, expand: ['data.payment_intent', 'data.customer'] });
  let issuerDecline = 0, total = 0;
  for (const inv of invs.data) {
    if ((inv.amount_due || 0) === 0) continue;
    total++;
    const pi = inv.payment_intent;
    const lpe = pi?.last_payment_error;
    const code = lpe?.decline_code || lpe?.code || '(no PI error)';
    const pm = lpe?.payment_method?.type || pi?.payment_method_types?.join('+') || '?';
    const email = inv.customer?.email || inv.customer;
    const affordability = /insufficient_funds|card_declined/.test(code);
    if (affordability || /transaction_not_allowed|do_not_honor|generic_decline|lost_card|stolen_card|pickup_card/.test(code)) issuerDecline++;
    console.log(`  ${email} | ${usd(inv.amount_due)} | attempt=${inv.attempt_count} | pm=${pm} | decline=${code}`);
  }
  console.log(`\n  invoices_with_due=${total} issuer/affordability-decline=${issuerDecline}`);

  await pool_noop();
}
const pool_noop = async () => {};
main().catch((e) => { console.error(e.message); process.exit(1); });
