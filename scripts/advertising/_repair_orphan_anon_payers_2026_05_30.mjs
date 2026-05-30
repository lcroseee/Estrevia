/**
 * Repair orphaned anonymous payers — 2026-05-30
 *
 * Before the fix in docs/superpowers/specs/2026-05-30-anon-checkout-signin-fix-design.md,
 * an anonymous checkout wrote a premium `users` row keyed on the raw anonymous_id
 * (id NOT starting with 'user_') with a `stripe-pending-…@placeholder.invalid`
 * email, while the real Clerk user (created when the person later signed up)
 * stayed on the free tier. Those payers are locked out of what they paid for.
 *
 * This script finds those rows and (with --apply) re-keys premium onto the real
 * Clerk user resolved from the Stripe customer email.
 *
 * DRY-RUN by default (no writes). Mutations require --apply.
 *   node scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs           # report only
 *   node scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs --apply   # mutate (FOUNDER-CONFIRMED)
 *
 * READ-ONLY by default. --apply creates Clerk users + mutates the users table.
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';
import { createClerkClient } from '@clerk/backend';

const APPLY = process.argv.includes('--apply');
const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

function isOrphanId(id) {
  return !String(id).startsWith('user_');
}

const rows = await sql`
  SELECT id, email, stripe_customer_id, stripe_subscription_id, subscription_tier, subscription_status
  FROM users
  WHERE subscription_tier = 'premium'
    AND (id NOT LIKE 'user_%' OR email LIKE 'stripe-pending-%@placeholder.invalid')
`;

console.log(`Found ${rows.length} candidate orphan premium row(s). APPLY=${APPLY}\n`);

let repaired = 0;
let skipped = 0;

for (const r of rows) {
  // Resolve the real email from Stripe.
  let email = null;
  try {
    if (r.stripe_customer_id) {
      const cust = await stripe.customers.retrieve(r.stripe_customer_id);
      email = cust && !cust.deleted ? cust.email : null;
    }
  } catch (e) {
    console.warn(`  [${r.id}] stripe lookup failed: ${e.message}`);
  }

  console.log(
    `- id=${r.id} orphanId=${isOrphanId(r.id)} placeholderEmail=${String(r.email).includes('placeholder.invalid')} stripeEmail=${email ?? 'unknown'} sub=${r.stripe_subscription_id ?? 'none'} status=${r.subscription_status}`,
  );

  if (!APPLY) continue;
  if (!email) {
    console.log('  SKIP: no email resolvable from Stripe');
    skipped += 1;
    continue;
  }

  // Find-or-create the real Clerk user, then move premium onto it.
  const list = await clerk.users.getUserList({ emailAddress: [email] });
  let realId = list.totalCount > 0 ? list.data[0].id : null;
  if (!realId) {
    const created = await clerk.users.createUser({
      emailAddress: [email],
      skipPasswordChecks: true,
      skipPasswordRequirement: true,
    });
    realId = created.id;
    console.log(`  created clerk user ${realId}`);
  }
  if (realId === r.id) {
    console.log('  already keyed correctly — no change');
    skipped += 1;
    continue;
  }

  // Upsert premium onto the real Clerk id, then demote the orphan row.
  await sql`
    INSERT INTO users (id, email, stripe_customer_id, stripe_subscription_id, subscription_tier, subscription_status, updated_at)
    VALUES (${realId}, ${email}, ${r.stripe_customer_id}, ${r.stripe_subscription_id}, 'premium', ${r.subscription_status}, now())
    ON CONFLICT (id) DO UPDATE SET
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      subscription_tier = 'premium',
      subscription_status = EXCLUDED.subscription_status,
      updated_at = now()
  `;
  await sql`
    UPDATE users SET subscription_tier = 'free', stripe_subscription_id = NULL, updated_at = now()
    WHERE id = ${r.id}
  `;
  console.log(`  re-keyed premium ${r.id} -> ${realId}`);
  repaired += 1;
}

console.log(`\nDone. ${APPLY ? `repaired=${repaired} skipped=${skipped}` : 'dry-run only — no writes made'}`);
