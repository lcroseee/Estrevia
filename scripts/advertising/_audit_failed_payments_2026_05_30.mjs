// READ-ONLY forensic of failed payments — 2026-05-30
// Question: WHY are payments failing — is it the customer's bank declining, or something else?
// Pulls failed Charges + PaymentIntent.last_payment_error across the account, extracts the
// granular decline_code / outcome, and buckets each into bank-issuer vs not-bank categories.
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

// --- decline-code taxonomy -------------------------------------------------
const ISSUER_AFFORDABILITY = new Set(['insufficient_funds', 'partner_insufficient_funds']);
const ISSUER_RULE = new Set([
  'do_not_honor', 'transaction_not_allowed', 'generic_decline', 'card_not_supported',
  'currency_not_supported', 'restricted_card', 'security_violation', 'service_not_allowed',
  'stop_payment_order', 'revocation_of_authorization', 'revocation_of_all_authorizations',
  'no_action_taken', 'not_permitted', 'card_velocity_exceeded', 'withdrawal_count_limit_exceeded',
  'merchant_blacklist',
]);
const CARD_PROBLEM = new Set([
  'expired_card', 'incorrect_cvc', 'invalid_cvc', 'incorrect_number', 'invalid_number',
  'invalid_account', 'invalid_expiry_month', 'invalid_expiry_year', 'lost_card', 'stolen_card',
  'pickup_card', 'card_not_supported',
]);
const AUTH = new Set(['authentication_required', 'authentication_failure']);
const WALLET = new Set(['cashapp_payment_declined']);
const STRIPE_PROC = new Set(['processing_error', 'try_again_later', 'issuer_not_available', 'approve_with_id', 'reenter_transaction']);

function bucket(code) {
  if (!code) return 'unknown(no decline_code)';
  if (ISSUER_AFFORDABILITY.has(code)) return 'BANK — affordability (no funds)';
  if (ISSUER_RULE.has(code)) return 'BANK — issuer rule/block';
  if (CARD_PROBLEM.has(code)) return 'CARD — bad/expired card data';
  if (AUTH.has(code)) return 'AUTH — 3DS/SCA required';
  if (WALLET.has(code)) return 'WALLET — method declined';
  if (STRIPE_PROC.has(code)) return 'PROCESSING — transient/Stripe';
  return `OTHER(${code})`;
}

// --- 1) failed Charges (the primary source of decline detail) --------------
const failedCharges = [];
for await (const c of stripe.charges.list({ limit: 100, expand: ['data.customer'] })) {
  if (c.status !== 'failed') continue;
  failedCharges.push(c);
  if (failedCharges.length >= 100) break;
}

// --- 2) PaymentIntents with a last_payment_error (catches PI-level failures
//        incl. off-session sub renewals + wallet redirects without a Charge) -
const failedPIs = [];
for await (const pi of stripe.paymentIntents.list({ limit: 100, expand: ['data.customer'] })) {
  if (pi.last_payment_error) failedPIs.push(pi);
  if (failedPIs.length >= 100) break;
}

const fmt = (cents, cur) => `${(cents / 100).toFixed(2)} ${String(cur || 'usd').toUpperCase()}`;
const counts = {};
const byEmail = {};
const add = (b, email) => {
  counts[b] = (counts[b] || 0) + 1;
  if (email) (byEmail[email] = byEmail[email] || []).push(b);
};

console.log('=== FAILED CHARGES (status=failed) ===');
console.log(`count: ${failedCharges.length}\n`);
for (const c of failedCharges) {
  const email = c.billing_details?.email || c.customer?.email || c.receipt_email || '?';
  const pmType = c.payment_method_details?.type || '?';
  const code = c.outcome?.reason || c.failure_code || null;
  const b = bucket(code);
  add(b, email);
  const when = new Date(c.created * 1000).toISOString().slice(0, 16).replace('T', ' ');
  console.log(`- ${when}  ${fmt(c.amount, c.currency)}  pm=${pmType}  code=${code ?? '—'}  outcome=${c.outcome?.type ?? '—'}/${c.outcome?.network_status ?? '—'}`);
  console.log(`    email=${email}  msg="${c.failure_message || c.outcome?.seller_message || ''}"  -> ${b}`);
}

console.log('\n=== PAYMENT INTENTS with last_payment_error ===');
console.log(`count: ${failedPIs.length}\n`);
for (const pi of failedPIs) {
  const e = pi.last_payment_error;
  const email = e.payment_method?.billing_details?.email || pi.customer?.email || pi.receipt_email || '?';
  const pmType = e.payment_method?.type || '?';
  const code = e.decline_code || e.code || null;
  const b = bucket(e.decline_code || null);
  // count PI bucket separately to avoid double-counting charges already seen; tag source
  counts[`PI:${b}`] = (counts[`PI:${b}`] || 0) + 1;
  const when = new Date(pi.created * 1000).toISOString().slice(0, 16).replace('T', ' ');
  console.log(`- ${when}  ${fmt(pi.amount, pi.currency)}  status=${pi.status}  pm=${pmType}  code=${code ?? '—'} (errType=${e.type})`);
  console.log(`    email=${email}  msg="${e.message || ''}"  -> ${b}`);
}

console.log('\n=== BUCKET SUMMARY (charges) ===');
for (const [k, v] of Object.entries(counts).filter(([k]) => !k.startsWith('PI:')).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${v.toString().padStart(3)}  ${k}`);
}
console.log('\n=== BUCKET SUMMARY (payment intents) ===');
for (const [k, v] of Object.entries(counts).filter(([k]) => k.startsWith('PI:')).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${v.toString().padStart(3)}  ${k.slice(3)}`);
}

console.log('\n=== per-customer failure pattern ===');
for (const [email, bs] of Object.entries(byEmail)) {
  console.log(`  ${email}: ${bs.length} fail(s) — ${[...new Set(bs)].join(', ')}`);
}

console.log('\nREAD-ONLY — list/retrieve only, no writes.');
