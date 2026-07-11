#!/usr/bin/env node
/**
 * Backfill A (CRO Phase 0, P0-1c): replace `stripe-pending-*@placeholder.invalid`
 * emails in `users` with the real address, resolved from Stripe customer email
 * (primary) or Clerk (fallback for user_* ids). Also resets email_undeliverable
 * (the 14 bounces since 05-29 likely flipped it via the Resend webhook, which
 * would keep lifecycle crons suppressing these users even after repair).
 *
 * Dry-run by default. `node scripts/advertising/_backfill_placeholder_emails_2026_07_10.mjs --apply`
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';
import { createClerkClient } from '@clerk/backend';

const APPLY = process.argv.includes('--apply');
for (const k of ['DATABASE_URL', 'STRIPE_SECRET_KEY', 'CLERK_SECRET_KEY']) {
  if (!process.env[k]) {
    console.error(`${k} missing — abort`);
    process.exit(1);
  }
}
const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const rows = await sql`
  SELECT id, email, stripe_customer_id, email_undeliverable
  FROM users
  WHERE email LIKE 'stripe-pending-%@placeholder.invalid'
`;
console.log(`${rows.length} placeholder rows${APPLY ? '' : ' (DRY-RUN — pass --apply to write)'}\n`);

let fixed = 0;
let skipped = 0;
for (const r of rows) {
  let email = null;
  let source = null;
  if (r.stripe_customer_id) {
    try {
      const cust = await stripe.customers.retrieve(r.stripe_customer_id);
      email = cust && !cust.deleted ? cust.email : null;
      if (email) source = 'stripe';
    } catch (e) {
      console.warn(`  [${r.id}] stripe lookup failed: ${e.message}`);
    }
  }
  if (!email && String(r.id).startsWith('user_')) {
    try {
      const u = await clerk.users.getUser(r.id);
      email = u.emailAddresses[0]?.emailAddress ?? null;
      if (email) source = 'clerk';
    } catch (e) {
      console.warn(`  [${r.id}] clerk lookup failed: ${e.message}`);
    }
  }
  console.log(`  ${r.id}: ${r.email} -> ${email ?? 'UNRESOLVED'} (${source ?? '-'}) undeliverable=${r.email_undeliverable}`);
  if (!APPLY) continue;
  if (!email) {
    console.log('    SKIP: no email resolvable');
    skipped += 1;
    continue;
  }
  const taken = await sql`SELECT id FROM users WHERE lower(email) = ${email.toLowerCase()} AND id <> ${r.id}`;
  if (taken.length) {
    console.log(`    SKIP: email already on ${taken[0].id} — resolve manually (orphan-row case)`);
    skipped += 1;
    continue;
  }
  await sql`
    UPDATE users
    SET email = ${email}, email_undeliverable = false, updated_at = now()
    WHERE id = ${r.id}
  `;
  fixed += 1;
  console.log('    FIXED');
}
console.log(`\ndone: fixed=${fixed} skipped=${skipped}`);
