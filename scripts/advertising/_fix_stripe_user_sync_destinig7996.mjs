/**
 * One-off retroactive fix: re-run the same upsert pattern that the Stripe
 * webhook does (src/app/api/webhooks/stripe/route.ts:336-367) against the
 * users table for cus_UXLi3mJUjr → user_3DsXX2DHB.
 *
 * Idempotent. Email-allowlist gated.
 *
 * Usage:
 *   node scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs --dry-run
 *   node scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';

const DRY = process.argv.includes('--dry-run');
const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

const CUSTOMER_ID = 'cus_UXLi3mJUjr3wYC';
const TARGET_EMAIL = 'destinig7996@gmail.com';

// 1. Pull current Stripe subscription state
const subs = await stripe.subscriptions.list({ customer: CUSTOMER_ID, limit: 5 });
if (subs.data.length === 0) {
  console.error(`No subscriptions found for ${CUSTOMER_ID}`);
  process.exit(1);
}
const sub = subs.data[0];
const priceId = sub.items.data[0]?.price.id;
const plan = sub.items.data[0]?.price.recurring?.interval === 'year' ? 'pro_annual' : 'pro_monthly';
const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
// Stripe SDK v22 moved current_period_end off Subscription onto SubscriptionItem
const periodEndUnix = sub.items?.data?.[0]?.current_period_end ?? null;
const currentPeriodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

const upsertData = {
  stripe_customer_id: CUSTOMER_ID,
  stripe_subscription_id: sub.id,
  subscription_tier: 'premium',
  subscription_status: sub.status,
  subscription_expires_at: currentPeriodEnd,
  plan,
  trial_end: trialEnd,
  current_period_end: currentPeriodEnd,
  updated_at: new Date(),
};

console.log('Target upsert payload:');
console.log(JSON.stringify(upsertData, null, 2));

if (DRY) {
  console.log('\n[DRY RUN] No DB write executed.');
  process.exit(0);
}

// 2. Apply upsert by email (idempotent — matches webhook handler line 336-367 semantics).
// Email lookup is reliable: Clerk webhook fires after sign-up and stores user.email; Stripe
// customer also has email. They are the only common key when stripe_customer_id linkage is broken.
const result = await sql`
  UPDATE users SET
    stripe_customer_id = ${CUSTOMER_ID},
    stripe_subscription_id = ${sub.id},
    subscription_tier = 'premium',
    subscription_status = ${sub.status},
    subscription_expires_at = ${currentPeriodEnd},
    plan = ${plan},
    trial_end = ${trialEnd},
    current_period_end = ${currentPeriodEnd},
    updated_at = NOW()
  WHERE email = ${TARGET_EMAIL}
  RETURNING id, email, subscription_tier, subscription_status, stripe_customer_id
`;

if (result.length === 0) {
  console.error(`No user row matched email=${TARGET_EMAIL}. Aborting.`);
  process.exit(1);
}
console.log('\n✓ Updated user:');
console.table(result);
