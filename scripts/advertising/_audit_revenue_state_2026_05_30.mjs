// Revenue state audit — 2026-05-30. READ-ONLY (list/retrieve only). No mutations, no email, no Stripe writes.
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

const ts = (e) => (e ? new Date(e * 1000).toISOString() : 'null');
const usd = (cents) => (cents == null ? null : (cents / 100));

async function listAll(method, params = {}) {
  const out = [];
  let startingAfter;
  for (;;) {
    const page = await method({ ...params, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    out.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return out;
}

// ── (2) Pro price + trial from env-referenced Price objects ────────────────
const PRICE_M = process.env.STRIPE_PRICE_ID_PRO_MONTHLY;
const PRICE_A = process.env.STRIPE_PRICE_ID_PRO_ANNUAL;
const prices = {};
for (const [label, id] of [['monthly', PRICE_M], ['annual', PRICE_A]]) {
  if (!id) { prices[label] = { error: 'env missing' }; continue; }
  try {
    const p = await stripe.prices.retrieve(id);
    prices[label] = {
      id: p.id, currency: p.currency, unit_amount: p.unit_amount, usd: usd(p.unit_amount),
      interval: p.recurring?.interval, interval_count: p.recurring?.interval_count,
      trial_period_days: p.recurring?.trial_period_days ?? null, active: p.active, nickname: p.nickname,
    };
  } catch (e) { prices[label] = { id, error: e.message }; }
}
console.log('=== (2) PRICES ===');
console.log(JSON.stringify(prices, null, 2));

// ── (1) Subscriptions: MRR, active, trialing, past_due, canceled-90d ───────
const allSubs = await listAll(
  (p) => stripe.subscriptions.list(p),
  { status: 'all', expand: ['data.customer'] }
);

const byStatus = {};
for (const s of allSubs) byStatus[s.status] = (byStatus[s.status] || 0) + 1;

// Per-sub normalized monthly USD contribution (only count true revenue-bearing: active, NOT trialing).
function monthlyUsd(sub) {
  let total = 0;
  for (const it of sub.items?.data ?? []) {
    const pr = it.price;
    if (!pr?.unit_amount || pr.currency !== 'usd') continue;
    const qty = it.quantity ?? 1;
    const amt = (pr.unit_amount / 100) * qty;
    const interval = pr.recurring?.interval;
    const ic = pr.recurring?.interval_count ?? 1;
    if (interval === 'month') total += amt / ic;
    else if (interval === 'year') total += amt / (12 * ic);
    else if (interval === 'week') total += (amt * 52) / 12 / ic;
    else if (interval === 'day') total += (amt * 365) / 12 / ic;
  }
  return total;
}

const now = Math.floor(Date.now() / 1000);
const since90d = now - 90 * 86400;

// "active" for MRR = status active AND not scheduled to cancel-before-renew that already ended.
const activeSubs = allSubs.filter((s) => s.status === 'active');
const trialingSubs = allSubs.filter((s) => s.status === 'trialing');
const pastDueSubs = allSubs.filter((s) => s.status === 'past_due');

// canceled in last 90d: status canceled with canceled_at (or ended_at) within window.
const canceled90d = allSubs.filter((s) => {
  if (s.status !== 'canceled') return false;
  const when = s.canceled_at ?? s.ended_at;
  return when != null && when >= since90d;
});

let mrr = 0;
const activeDetails = activeSubs.map((s) => {
  const m = monthlyUsd(s);
  mrr += m;
  const c = typeof s.customer === 'object' ? s.customer : null;
  return {
    sub_id: s.id, email: c?.email ?? s.customer, status: s.status,
    monthly_usd: Number(m.toFixed(2)),
    plan: s.items?.data?.[0]?.price?.id,
    interval: s.items?.data?.[0]?.price?.recurring?.interval,
    unit_amount_usd: usd(s.items?.data?.[0]?.price?.unit_amount),
    currency: s.items?.data?.[0]?.price?.currency,
    created: ts(s.created),
    current_period_end: ts(s.current_period_end),
    cancel_at_period_end: s.cancel_at_period_end,
    canceled_at: s.canceled_at ? ts(s.canceled_at) : null,
    ended_at: s.ended_at ? ts(s.ended_at) : null,
  };
});

console.log('\n=== (1) SUBSCRIPTIONS ===');
console.log('Total subs (all statuses):', allSubs.length);
console.log('By status:', JSON.stringify(byStatus));
console.log('\n--- ACTIVE (revenue-bearing) ---', activeSubs.length);
for (const d of activeDetails) console.log(JSON.stringify(d));
console.log('\nMRR (USD, active only):', Number(mrr.toFixed(2)));

console.log('\n--- TRIALING ---', trialingSubs.length);
for (const s of trialingSubs) {
  const c = typeof s.customer === 'object' ? s.customer : null;
  console.log(JSON.stringify({
    sub_id: s.id, email: c?.email ?? s.customer, created: ts(s.created),
    trial_end: ts(s.trial_end), cancel_at_period_end: s.cancel_at_period_end,
    plan: s.items?.data?.[0]?.price?.id, unit_amount_usd: usd(s.items?.data?.[0]?.price?.unit_amount),
  }));
}

console.log('\n--- PAST_DUE ---', pastDueSubs.length);
for (const s of pastDueSubs) {
  const c = typeof s.customer === 'object' ? s.customer : null;
  console.log(JSON.stringify({
    sub_id: s.id, email: c?.email ?? s.customer, created: ts(s.created),
    current_period_end: ts(s.current_period_end), plan: s.items?.data?.[0]?.price?.id,
    unit_amount_usd: usd(s.items?.data?.[0]?.price?.unit_amount),
  }));
}

console.log('\n--- CANCELED in last 90d ---', canceled90d.length);
for (const s of canceled90d) {
  const c = typeof s.customer === 'object' ? s.customer : null;
  console.log(JSON.stringify({
    sub_id: s.id, email: c?.email ?? s.customer, created: ts(s.created),
    canceled_at: s.canceled_at ? ts(s.canceled_at) : null, ended_at: s.ended_at ? ts(s.ended_at) : null,
    plan: s.items?.data?.[0]?.price?.id,
  }));
}

// Lifetime gross: sum of all paid invoices (sanity-check vs prior $14.97 claim).
let lifetimeGross = 0;
const paidInvoices = await listAll((p) => stripe.invoices.list(p), { status: 'paid' });
for (const inv of paidInvoices) {
  if (inv.currency === 'usd') lifetimeGross += (inv.amount_paid || 0) / 100;
}
console.log('\n--- LIFETIME GROSS (sum of paid USD invoices) ---');
console.log('paid invoices:', paidInvoices.length, '| total USD:', Number(lifetimeGross.toFixed(2)));

// ── (3) Coupons + promotion codes ──────────────────────────────────────────
const coupons = await listAll((p) => stripe.coupons.list(p));
const promos = await listAll((p) => stripe.promotionCodes.list(p));
console.log('\n=== (3) COUPONS & PROMOTION CODES ===');
console.log('Coupons:', coupons.length);
for (const c of coupons) {
  console.log(JSON.stringify({
    id: c.id, name: c.name, percent_off: c.percent_off, amount_off: usd(c.amount_off),
    currency: c.currency, duration: c.duration, duration_in_months: c.duration_in_months,
    valid: c.valid, times_redeemed: c.times_redeemed, max_redemptions: c.max_redemptions,
  }));
}
console.log('Promotion codes:', promos.length);
for (const pc of promos) {
  console.log(JSON.stringify({
    id: pc.id, code: pc.code, active: pc.active, coupon: pc.coupon?.id,
    percent_off: pc.coupon?.percent_off, times_redeemed: pc.times_redeemed,
    max_redemptions: pc.max_redemptions, expires_at: pc.expires_at ? ts(pc.expires_at) : null,
  }));
}

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify({
  mrr_usd: Number(mrr.toFixed(2)),
  active_subs: activeSubs.length,
  trialing: trialingSubs.length,
  past_due: pastDueSubs.length,
  canceled_90d: canceled90d.length,
  pro_monthly_price_usd: prices.monthly?.usd ?? null,
  pro_monthly_trial_days: prices.monthly?.trial_period_days ?? null,
  code_trial_period_days: 3,
  coupons: coupons.map((c) => c.id),
  promotion_codes: promos.map((p) => p.code),
  lifetime_gross_usd: Number(lifetimeGross.toFixed(2)),
}, null, 2));
