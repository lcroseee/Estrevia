/**
 * _send_trial_expiration_backfill.mjs
 *
 * One-off backfill for trial users whose Stripe trial_will_end webhook
 * fired on 2026-05-23 but was not handled (T2 feature not yet deployed).
 *
 * Current cohort (due 2026-05-26):
 *   durand.lisaanne@gmail.com  — pro_monthly $4.99/mo, trial ends 2026-05-26 05:07 UTC
 *   haileyanda8399@icloud.com  — pro_annual $34.99/yr, trial ends 2026-05-26 02:36 UTC
 *
 * IDEMPOTENT: checks sent_trial_emails before sending. Safe to re-run.
 *
 * Usage:
 *   node scripts/qa/_send_trial_expiration_backfill.mjs         # dry run (default)
 *   node scripts/qa/_send_trial_expiration_backfill.mjs --live  # actually sends
 *
 * Prerequisites:
 *   - DATABASE_URL, RESEND_API_KEY in .env
 *   - npm run db:migrate (migration 0014 must be applied first)
 *   - TRIAL_WINBACK_COUPON_CODE (optional, for trial_ended win-back)
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const IS_LIVE = process.argv.includes('--live');

if (!IS_LIVE) {
  console.log('');
  console.log('=== DRY RUN MODE (pass --live to actually send) ===');
  console.log('');
  // Set DRY_RUN env so sendTrialExpirationEmail honours it
  process.env.DRY_RUN = 'true';
} else {
  console.log('');
  console.log('=== LIVE MODE — WILL SEND REAL EMAILS ===');
  console.log('');
  process.env.DRY_RUN = 'false';
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in env. Add it to .env and retry.');
  process.exit(1);
}

if (IS_LIVE && !process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY not found in env. Required for --live mode.');
  process.exit(1);
}

// Target cohort — hardcoded, one-shot use
const TARGET_EMAILS = [
  'durand.lisaanne@gmail.com',
  'haileyanda8399@icloud.com',
];

const sql = postgres(DATABASE_URL);

async function run() {
  console.log(`Querying users for emails: ${TARGET_EMAILS.join(', ')}`);
  console.log('');

  const rows = await sql`
    SELECT
      u.id,
      u.email,
      u.locale,
      u.stripe_subscription_id,
      u.trial_end,
      u.subscription_status,
      u.plan
    FROM users u
    WHERE u.email = ANY(${TARGET_EMAILS})
  `;

  if (rows.length === 0) {
    console.log('No users found for target emails. Check DATABASE_URL or email addresses.');
    await sql.end();
    return;
  }

  for (const user of rows) {
    console.log(`--- ${user.email} ---`);
    console.log(`  id:                   ${user.id}`);
    console.log(`  subscription_id:      ${user.stripe_subscription_id ?? 'NULL'}`);
    console.log(`  trial_end:            ${user.trial_end ?? 'NULL'}`);
    console.log(`  subscription_status:  ${user.subscription_status ?? 'NULL'}`);
    console.log(`  plan:                 ${user.plan ?? 'NULL'}`);
    console.log(`  locale:               ${user.locale ?? 'en'}`);

    if (!user.stripe_subscription_id) {
      console.log('  SKIP: no stripe_subscription_id');
      console.log('');
      continue;
    }

    if (!user.trial_end) {
      console.log('  SKIP: no trial_end');
      console.log('');
      continue;
    }

    if (user.subscription_status === 'active') {
      console.log('  SKIP: already converted to active subscriber');
      console.log('');
      continue;
    }

    // Check what steps have already been sent
    const sentRows = await sql`
      SELECT step, resend_message_id, sent_at
      FROM sent_trial_emails
      WHERE subscription_id = ${user.stripe_subscription_id}
    `;
    const sentByStep = Object.fromEntries(sentRows.map((r) => [r.step, r]));

    console.log(`  sent_trial_emails:`);
    for (const step of ['reminder_3d', 'reminder_1d', 'trial_ended']) {
      const row = sentByStep[step];
      if (row) {
        console.log(`    ${step}: sent ${row.sent_at?.toISOString()} (msgid=${row.resend_message_id ?? 'NULL'})`);
      } else {
        console.log(`    ${step}: not sent`);
      }
    }

    // We send reminder_3d (the one the webhook missed).
    // If trial_end is within 26h, also send reminder_1d.
    // If trial_end is already past, also send trial_ended.
    const stepsToSend = [];
    const now = new Date();
    const trialEnd = new Date(user.trial_end);
    const hoursUntilEnd = (trialEnd.getTime() - now.getTime()) / (60 * 60 * 1000);

    if (!sentByStep['reminder_3d']) {
      stepsToSend.push('reminder_3d');
    }
    if (hoursUntilEnd <= 26 && hoursUntilEnd > 0 && !sentByStep['reminder_1d']) {
      stepsToSend.push('reminder_1d');
    }
    if (hoursUntilEnd <= 0 && !sentByStep['trial_ended']) {
      stepsToSend.push('trial_ended');
    }

    if (stepsToSend.length === 0) {
      console.log('  All relevant steps already sent or not due yet — nothing to do');
      console.log('');
      continue;
    }

    console.log(`  Will send: ${stepsToSend.join(', ')}`);

    if (!IS_LIVE) {
      console.log('  [DRY RUN] Would call sendTrialExpirationEmail for each step above');
      console.log('');
      continue;
    }

    // LIVE: dynamically import and call sendTrialExpirationEmail
    // This works because the script runs in the project root with tsx or node+register
    const { sendTrialExpirationEmail } = await import(
      path.resolve(__dirname, '../../src/shared/lib/trial-expiration-email.js')
    ).catch(async () => {
      // Fallback: try .ts path via tsx (if running with tsx)
      return import(path.resolve(__dirname, '../../src/shared/lib/trial-expiration-email.ts'));
    });

    for (const step of stepsToSend) {
      try {
        console.log(`  Sending ${step}...`);
        const result = await sendTrialExpirationEmail({
          subscriptionId: user.stripe_subscription_id,
          userId: user.id,
          email: user.email,
          locale: user.locale ?? 'en',
          step,
          trialEndDate: trialEnd,
          plan: user.plan ?? 'pro_monthly',
        });
        console.log(`  ${step}: ${JSON.stringify(result)}`);
      } catch (err) {
        console.error(`  ${step}: ERROR — ${err.message}`);
      }
    }
    console.log('');
  }

  await sql.end();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
