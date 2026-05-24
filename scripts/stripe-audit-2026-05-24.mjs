/**
 * Stripe audit script — 2026-05-24
 * READ-ONLY. No mutations.
 * Uses STRIPE_SECRET_KEY and DATABASE_URL from .env (parent project)
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load from parent project .env (contains STRIPE_SECRET_KEY)
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY not found in env');
  process.exit(1);
}

// Dynamic import Stripe
const { default: Stripe } = await import('stripe');
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

// ── helpers ────────────────────────────────────────────────────────────────

const ts = (epoch) => epoch ? new Date(epoch * 1000).toISOString() : 'null';
const ynull = (v) => v === null || v === undefined ? 'null' : v;

async function listAll(method, params = {}) {
  const results = [];
  let hasMore = true;
  let startingAfter = undefined;
  while (hasMore) {
    const page = await method({ ...params, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    results.push(...page.data);
    hasMore = page.has_more;
    if (hasMore && page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id;
    }
  }
  return results;
}

// ── Q1 + Q2: Checkout sessions ────────────────────────────────────────────

console.log('\n=== Q1/Q2: Fetching checkout sessions (last 14d) ===');

const since14d = Math.floor(Date.now() / 1000) - 14 * 24 * 3600;
const since23may16utc = Math.floor(new Date('2026-05-23T16:00:00Z').getTime() / 1000);

const sessions = await listAll(
  (p) => stripe.checkout.sessions.list(p),
  { created: { gte: since14d }, expand: ['data.subscription', 'data.payment_intent'] }
);

console.log(`Total sessions in last 14d: ${sessions.length}`);

// Group by status
const byStatus = {};
const byLocale = {};
const byMode = {};
const completedByLocale = {};
const createdByLocale = {};

for (const s of sessions) {
  byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  byMode[s.mode] = (byMode[s.mode] || 0) + 1;

  // Detect locale: from metadata or url
  const locale = s.metadata?.locale || s.locale || 'unknown';
  byLocale[locale] = (byLocale[locale] || 0) + 1;

  // Normalize locale bucket for EN vs ES comparison
  const localeBucket = (locale === 'es' || locale === 'es-419' || locale === 'es_419') ? 'es' :
                       (locale === 'en' || locale === 'auto') ? 'en' : locale;

  createdByLocale[localeBucket] = (createdByLocale[localeBucket] || 0) + 1;
  if (s.status === 'complete') {
    completedByLocale[localeBucket] = (completedByLocale[localeBucket] || 0) + 1;
  }
}

console.log('By status:', JSON.stringify(byStatus, null, 2));
console.log('By mode:', JSON.stringify(byMode, null, 2));
console.log('By Stripe locale field:', JSON.stringify(byLocale, null, 2));

// Q2: Post-fix sessions
const postFixSessions = sessions.filter(s => s.created >= since23may16utc);
const postFixComplete = postFixSessions.filter(s => s.status === 'complete');
console.log(`\nQ2 Post-idempotency fix (since 2026-05-23 16:00 UTC):`);
console.log(`  Created: ${postFixSessions.length}, Completed: ${postFixComplete.length}`);

// Detailed session listing
const sessionDetails = sessions.map(s => {
  const locale = s.metadata?.locale || s.locale || 'unknown';
  const localeBucket = (locale === 'es' || locale === 'es-419') ? 'es' :
                       (locale === 'en' || locale === 'auto') ? 'en' : locale;
  return {
    id: s.id,
    created: ts(s.created),
    status: s.status,
    mode: s.mode,
    locale_raw: locale,
    locale_bucket: localeBucket,
    email: s.customer_details?.email || s.customer_email || 'anon',
    amount_total: s.amount_total ? (s.amount_total / 100).toFixed(2) : null,
    currency: s.currency,
    payment_status: s.payment_status,
    subscription_id: s.subscription?.id || s.subscription || null,
    expires_at: s.expires_at ? ts(s.expires_at) : null,
    url_has_es: s.url?.includes('/es/') || false,
  };
});

// ── Q3: Subscriptions ─────────────────────────────────────────────────────

console.log('\n=== Q3: Fetching all subscriptions ===');

const allSubs = await listAll(
  (p) => stripe.subscriptions.list(p),
  { status: 'all', expand: ['data.customer', 'data.latest_invoice.payment_intent'] }
);

console.log(`Total subscriptions: ${allSubs.length}`);

const subsByStatus = {};
for (const s of allSubs) {
  subsByStatus[s.status] = (subsByStatus[s.status] || 0) + 1;
}
console.log('By status:', JSON.stringify(subsByStatus, null, 2));

const activeSubs = allSubs.filter(s => ['trialing', 'active', 'past_due', 'incomplete', 'unpaid', 'paused'].includes(s.status));
console.log(`\nActive/trialing/past_due count: ${activeSubs.length}`);

const subDetails = activeSubs.map(s => {
  const customer = typeof s.customer === 'object' ? s.customer : null;
  const invoice = s.latest_invoice;
  const pi = invoice?.payment_intent;

  return {
    sub_id: s.id,
    status: s.status,
    email: customer?.email || 'unknown',
    customer_id: customer?.id || s.customer,
    created: ts(s.created),
    trial_end: s.trial_end ? ts(s.trial_end) : null,
    current_period_end: ts(s.current_period_end),
    cancel_at_period_end: s.cancel_at_period_end,
    canceled_at: s.canceled_at ? ts(s.canceled_at) : null,
    ended_at: s.ended_at ? ts(s.ended_at) : null,
    plan: s.items?.data?.[0]?.price?.id || 'unknown',
    plan_interval: s.items?.data?.[0]?.price?.recurring?.interval || 'unknown',
    amount: s.items?.data?.[0]?.price?.unit_amount ? (s.items.data[0].price.unit_amount / 100).toFixed(2) : null,
    latest_invoice_status: invoice?.status || null,
    latest_invoice_amount: invoice?.amount_paid ? (invoice.amount_paid / 100).toFixed(2) : null,
    payment_intent_status: pi?.status || null,
    payment_intent_last_error: pi?.last_payment_error?.message || null,
    payment_method_last4: pi?.payment_method?.card?.last4 || null,
    metadata: s.metadata,
  };
});

// ── Q4: Customer deduplication ────────────────────────────────────────────

console.log('\n=== Q4: Customer deduplication (last 7d) ===');

const since7d = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
const recentCustomers = await listAll(
  (p) => stripe.customers.list(p),
  { created: { gte: since7d } }
);

console.log(`Customers created in last 7d: ${recentCustomers.length}`);

// Group by email
const customersByEmail = {};
for (const c of recentCustomers) {
  if (!c.email) continue;
  const email = c.email.toLowerCase().trim();
  if (!customersByEmail[email]) customersByEmail[email] = [];
  customersByEmail[email].push({
    id: c.id,
    created: ts(c.created),
    email: c.email,
    metadata: c.metadata,
    deleted: c.deleted || false,
  });
}

const duplicates = Object.entries(customersByEmail).filter(([, v]) => v.length > 1);
console.log(`Duplicate emails in last 7d: ${duplicates.length}`);
if (duplicates.length > 0) {
  console.log('Duplicates:', JSON.stringify(duplicates, null, 2));
}

// gabrieljlugo check — find by email
let gabrielCustomers = [];
try {
  const gabrielSearch = await stripe.customers.search({
    query: 'email:"gabrieljlugo@gmail.com"',
    limit: 10,
  });
  gabrielCustomers = gabrielSearch.data;
  console.log(`\ngabrieljlugo customers found: ${gabrielCustomers.length}`);
  for (const c of gabrielCustomers) {
    console.log(`  ${c.id} created=${ts(c.created)} deleted=${c.deleted}`);
  }
} catch (e) {
  console.log('Customer search error:', e.message);
  // fallback: search all customers
  const allRecentCusts = await listAll(
    (p) => stripe.customers.list(p),
    { created: { gte: Math.floor(Date.now() / 1000) - 30 * 24 * 3600 } }
  );
  gabrielCustomers = allRecentCusts.filter(c =>
    c.email && c.email.toLowerCase().includes('gabrieljlugo')
  );
  console.log(`gabrieljlugo (fallback search): ${gabrielCustomers.length}`);
}

// Get subs for gabrieljlugo customers
const gabrielSubDetails = [];
for (const c of gabrielCustomers) {
  const subs = await listAll(
    (p) => stripe.subscriptions.list(p),
    { customer: c.id, status: 'all', expand: ['data.latest_invoice.payment_intent'] }
  );
  for (const s of subs) {
    const inv = s.latest_invoice;
    gabrielSubDetails.push({
      customer_id: c.id,
      email: c.email,
      sub_id: s.id,
      status: s.status,
      created: ts(s.created),
      trial_end: s.trial_end ? ts(s.trial_end) : null,
      current_period_end: ts(s.current_period_end),
      cancel_at_period_end: s.cancel_at_period_end,
      canceled_at: s.canceled_at ? ts(s.canceled_at) : null,
      latest_invoice_status: inv?.status || null,
      latest_invoice_amount_paid: inv?.amount_paid ? (inv.amount_paid / 100).toFixed(2) : null,
      payment_intent_status: inv?.payment_intent?.status || null,
    });
  }
}

// destinig7996 and jaderising44 — search by email pattern
const trialEmails = ['destinig7996', 'jaderising44'];
const cohortDetails = {};
for (const emailPart of trialEmails) {
  try {
    const results = await stripe.customers.search({
      query: `email~"${emailPart}"`,
      limit: 10,
    });
    cohortDetails[emailPart] = [];
    for (const c of results.data) {
      const subs = await listAll(
        (p) => stripe.subscriptions.list(p),
        { customer: c.id, status: 'all', expand: ['data.latest_invoice.payment_intent'] }
      );
      cohortDetails[emailPart].push({
        customer_id: c.id,
        email: c.email,
        subscriptions: subs.map(s => {
          const inv = s.latest_invoice;
          return {
            sub_id: s.id,
            status: s.status,
            created: ts(s.created),
            trial_end: s.trial_end ? ts(s.trial_end) : null,
            current_period_end: ts(s.current_period_end),
            cancel_at_period_end: s.cancel_at_period_end,
            canceled_at: s.canceled_at ? ts(s.canceled_at) : null,
            ended_at: s.ended_at ? ts(s.ended_at) : null,
            latest_invoice_status: inv?.status || null,
            latest_invoice_amount_paid: inv?.amount_paid ? (inv.amount_paid / 100).toFixed(2) : null,
            payment_intent_status: typeof inv?.payment_intent === 'object'
              ? inv.payment_intent?.status : null,
          };
        }),
      });
    }
    console.log(`${emailPart}: ${results.data.length} customers`);
  } catch (e) {
    console.log(`Search for ${emailPart} failed:`, e.message);
    cohortDetails[emailPart] = [{ error: e.message }];
  }
}

// ── Q5: DB sync (via direct postgres) ─────────────────────────────────────

console.log('\n=== Q5: DB sync check ===');
let dbStats = null;

const DATABASE_URL = process.env.DATABASE_URL;
if (DATABASE_URL) {
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    // Users with/without stripe_customer_id
    const userStatsResult = await client.query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(stripe_customer_id) as users_with_stripe_customer,
        COUNT(*) - COUNT(stripe_customer_id) as users_without_stripe_customer,
        COUNT(stripe_subscription_id) as users_with_stripe_sub_id,
        COUNT(CASE WHEN subscription_status NOT IN ('free') THEN 1 END) as users_with_active_plan
      FROM users
    `);

    // Sub status distribution in DB
    const subStatusResult = await client.query(`
      SELECT subscription_status, plan, COUNT(*) as count
      FROM users
      WHERE subscription_status != 'free' OR plan != 'free'
      GROUP BY subscription_status, plan
      ORDER BY count DESC
    `);

    // Check if Stripe active subs have matching DB records
    const stripeSubIds = activeSubs.map(s => `'${s.id}'`).join(',');
    let syncGapResult = null;
    if (activeSubs.length > 0) {
      syncGapResult = await client.query(`
        SELECT stripe_subscription_id, subscription_status, email
        FROM users
        WHERE stripe_subscription_id IN (${stripeSubIds})
      `);
    }

    // Recent DB users (last 7d)
    const recentUsersResult = await client.query(`
      SELECT id, email, stripe_customer_id, stripe_subscription_id,
             subscription_status, plan, created_at
      FROM users
      WHERE created_at >= NOW() - INTERVAL '14 days'
      ORDER BY created_at DESC
    `);

    dbStats = {
      user_stats: userStatsResult.rows[0],
      sub_status_dist: subStatusResult.rows,
      db_users_matching_stripe_subs: syncGapResult?.rows || [],
      recent_users_14d: recentUsersResult.rows.map(r => ({
        ...r,
        email: r.email, // keep email for cross-reference
        created_at: r.created_at?.toISOString(),
      })),
    };

    await client.end();
    console.log('DB stats:', JSON.stringify(dbStats.user_stats, null, 2));
  } catch (e) {
    console.error('DB error:', e.message);
    dbStats = { error: e.message };
  }
} else {
  console.log('DATABASE_URL not found, skipping DB checks');
  dbStats = { error: 'DATABASE_URL not set' };
}

// ── Q6: Expired/Open session analysis ────────────────────────────────────

console.log('\n=== Q6: Session analysis (last 7d) ===');

const since7dSessions = sessions.filter(s => s.created >= since7d);
const openSessions = since7dSessions.filter(s => s.status === 'open');
const expiredSessions = since7dSessions.filter(s => s.status === 'expired');
const completeSessions = since7dSessions.filter(s => s.status === 'complete');

console.log(`Last 7d sessions: total=${since7dSessions.length} open=${openSessions.length} expired=${expiredSessions.length} complete=${completeSessions.length}`);

// ES vs EN completion rates
const es7d = since7dSessions.filter(s => {
  const l = s.metadata?.locale || s.locale || '';
  return l === 'es' || l === 'es-419' || l === 'es_419';
});
const en7d = since7dSessions.filter(s => {
  const l = s.metadata?.locale || s.locale || '';
  return l === 'en' || l === 'auto';
});
const esComplete7d = es7d.filter(s => s.status === 'complete');
const enComplete7d = en7d.filter(s => s.status === 'complete');

console.log(`ES 7d: ${es7d.length} sessions, ${esComplete7d.length} complete (${es7d.length > 0 ? ((esComplete7d.length/es7d.length)*100).toFixed(1) : 'N/A'}%)`);
console.log(`EN 7d: ${en7d.length} sessions, ${enComplete7d.length} complete (${en7d.length > 0 ? ((enComplete7d.length/en7d.length)*100).toFixed(1) : 'N/A'}%)`);

// Expired sessions — time to expiry
const expiredDetails = expiredSessions.map(s => {
  const locale = s.metadata?.locale || s.locale || 'unknown';
  const lifespanMin = s.expires_at ? Math.round((s.expires_at - s.created) / 60) : null;
  return {
    id: s.id.slice(0, 20),
    created: ts(s.created),
    expires_at: s.expires_at ? ts(s.expires_at) : null,
    lifespan_hours: lifespanMin ? (lifespanMin/60).toFixed(1) : null,
    locale,
    amount: s.amount_total ? (s.amount_total/100).toFixed(2) : null,
    email: s.customer_details?.email || 'anon',
    payment_status: s.payment_status,
  };
});

// ── Compile new paying customers since 2026-05-23 ─────────────────────────

const since23may = Math.floor(new Date('2026-05-23T00:00:00Z').getTime() / 1000);
const newPaying = allSubs.filter(s => {
  // Active sub created after 2026-05-23, OR trial that converted (invoice paid after that date)
  if (s.created >= since23may && s.status === 'active') return true;
  const inv = s.latest_invoice;
  if (inv && typeof inv === 'object' && inv.status === 'paid' && inv.paid) {
    // Check if first successful payment is after 2026-05-23
    if (inv.status_transitions?.paid_at >= since23may) return true;
  }
  return false;
});

console.log(`\nNew paying customers since 2026-05-23: ${newPaying.length}`);

// ── Write all data to JSON for report generation ──────────────────────────

const auditData = {
  generated_at: new Date().toISOString(),
  q1_sessions: {
    total_14d: sessions.length,
    by_status: byStatus,
    by_mode: byMode,
    by_stripe_locale: byLocale,
    created_by_locale_bucket: createdByLocale,
    completed_by_locale_bucket: completedByLocale,
    session_details: sessionDetails,
  },
  q2_post_fix: {
    since: '2026-05-23T16:00:00Z',
    total: postFixSessions.length,
    complete: postFixComplete.length,
    conversion_pct: postFixSessions.length > 0
      ? ((postFixComplete.length / postFixSessions.length) * 100).toFixed(1)
      : 'N/A',
    details: postFixSessions.map(s => ({
      id: s.id.slice(0, 20),
      created: ts(s.created),
      status: s.status,
      locale: s.metadata?.locale || s.locale,
      email: s.customer_details?.email || 'anon',
    })),
  },
  q3_subscriptions: {
    total: allSubs.length,
    by_status: subsByStatus,
    active_details: subDetails,
    new_paying_since_2026_05_23: newPaying.map(s => ({
      sub_id: s.id,
      status: s.status,
      customer: typeof s.customer === 'object' ? s.customer?.email : s.customer,
      created: ts(s.created),
      trial_end: s.trial_end ? ts(s.trial_end) : null,
    })),
  },
  q4_dedup: {
    customers_last_7d: recentCustomers.length,
    duplicate_emails: duplicates.map(([email, customers]) => ({ email, customers })),
    gabrieljlugo: {
      customers: gabrielCustomers.map(c => ({
        id: c.id,
        email: c.email,
        created: ts(c.created),
        deleted: c.deleted || false,
      })),
      subscriptions: gabrielSubDetails,
    },
    cohort_2026_05_21: cohortDetails,
  },
  q5_db_sync: dbStats,
  q6_session_analysis: {
    last_7d: {
      total: since7dSessions.length,
      open: openSessions.length,
      expired: expiredSessions.length,
      complete: completeSessions.length,
    },
    es_vs_en_7d: {
      es: { created: es7d.length, complete: esComplete7d.length, pct: es7d.length > 0 ? ((esComplete7d.length/es7d.length)*100).toFixed(1) : 'N/A' },
      en: { created: en7d.length, complete: enComplete7d.length, pct: en7d.length > 0 ? ((enComplete7d.length/en7d.length)*100).toFixed(1) : 'N/A' },
    },
    expired_session_details: expiredDetails,
  },
};

const outputPath = path.resolve(__dirname, '../tmp/audit-2026-05-24/stripe-raw.json');
fs.writeFileSync(outputPath, JSON.stringify(auditData, null, 2));
console.log(`\nData written to: ${outputPath}`);
console.log('Done.');
