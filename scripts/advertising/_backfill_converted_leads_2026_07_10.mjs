#!/usr/bin/env node
/**
 * Backfill B (CRO Phase 0, P0-1d): set email_leads.converted_to_user_id for
 * leads belonging to payers. Match key: lower(lead.email) IN
 * { lower(users.email), lower(stripe customer email) }.
 *
 * Why: every drip sender already filters converted_to_user_id IS NULL
 * (lead-nurture route.ts:143, cart-abandon:77, blast script:75) — the defect
 * is that webhook-time linking missed for anon payers (audit: the sole active
 * payer was cross-sold lead_paywall_teaser after paying). Run after Backfill A.
 *
 * Dry-run by default. `node scripts/advertising/_backfill_converted_leads_2026_07_10.mjs --apply`
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';

const APPLY = process.argv.includes('--apply');
for (const k of ['DATABASE_URL', 'STRIPE_SECRET_KEY']) {
  if (!process.env[k]) {
    console.error(`${k} missing — abort`);
    process.exit(1);
  }
}
const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

const payers = await sql`
  SELECT id, email, stripe_customer_id
  FROM users
  WHERE stripe_customer_id IS NOT NULL
    AND email NOT LIKE 'stripe-pending-%@placeholder.invalid'
`;
console.log(`${payers.length} users with a Stripe customer${APPLY ? '' : ' (DRY-RUN — pass --apply to write)'}\n`);

let linked = 0;
for (const u of payers) {
  const emails = new Set([u.email.toLowerCase()]);
  try {
    const cust = await stripe.customers.retrieve(u.stripe_customer_id);
    if (cust && !cust.deleted && cust.email) emails.add(cust.email.toLowerCase());
  } catch (e) {
    console.warn(`  [${u.id}] stripe lookup failed: ${e.message}`);
  }
  const leads = await sql`
    SELECT id, email, nurture_step
    FROM email_leads
    WHERE lower(email) = ANY(${[...emails]})
      AND converted_to_user_id IS NULL
  `;
  if (leads.length === 0) continue;
  for (const l of leads) {
    console.log(`  lead ${l.id} (${l.email}, step=${l.nurture_step}) -> user ${u.id}`);
  }
  if (!APPLY) continue;
  const ids = leads.map((l) => l.id);
  await sql`
    UPDATE email_leads
    SET converted_to_user_id = ${u.id}, converted_at = now()
    WHERE id = ANY(${ids})
  `;
  linked += leads.length;
}
console.log(`\ndone: linked=${linked}${APPLY ? '' : ' (dry-run; nothing written)'}`);
