/**
 * Self-contained trial-expiration backfill for durand+hailey.
 *
 * Bypasses src/shared/lib/trial-expiration-email.ts because that file
 * imports `server-only` which throws under tsx/node execution context.
 *
 * Renders email templates inline + posts to Resend + writes
 * sent_trial_emails row. Idempotent (UNIQUE INDEX on subscription_id+step).
 *
 * Usage:
 *   npx tsx scripts/qa/_send_trial_expiration_backfill_inline.mts          # dry
 *   npx tsx scripts/qa/_send_trial_expiration_backfill_inline.mts --live   # send
 */
import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { createElement } from 'react';
const mod = await import('../../src/emails/TrialReminder3dEmail');
// tsx double-wraps CJS default exports: module.default.default
type EmailFn = (props: { locale: 'en' | 'es'; trialEndDate: Date; proUrl: string; billingPortalUrl: string }) => unknown;
const TrialReminder3dEmail = (
  (mod as { default?: { default?: EmailFn } }).default?.default
    ?? (mod as { default?: EmailFn }).default
) as EmailFn;
if (typeof TrialReminder3dEmail !== 'function') {
  throw new Error(`Email template did not resolve to a function (got ${typeof TrialReminder3dEmail})`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const IS_LIVE = process.argv.includes('--live');
const TARGETS = ['durand.lisaanne@gmail.com', 'haileyanda8399@icloud.com'];
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://estrevia.app';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
if (IS_LIVE && !process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');

console.log(IS_LIVE ? '=== LIVE MODE — WILL SEND ===' : '=== DRY RUN ===');

const sql = postgres(process.env.DATABASE_URL);
const resend = IS_LIVE ? new Resend(process.env.RESEND_API_KEY) : null;

interface UserRow {
  id: string;
  email: string;
  locale: 'en' | 'es' | null;
  stripe_subscription_id: string | null;
  trial_end: Date | null;
  subscription_status: string | null;
  plan: string | null;
}

const users = await sql<UserRow[]>`
  SELECT id, email, locale, stripe_subscription_id, trial_end, subscription_status, plan
  FROM users WHERE email = ANY(${TARGETS})
`;

for (const u of users) {
  console.log(`\n--- ${u.email} (${u.stripe_subscription_id}) ---`);
  console.log(`   trial_end: ${u.trial_end?.toISOString()}, status: ${u.subscription_status}`);

  if (!u.stripe_subscription_id || !u.trial_end) {
    console.log('   SKIP: missing subscription_id or trial_end');
    continue;
  }
  if (u.subscription_status === 'active') {
    console.log('   SKIP: already active');
    continue;
  }

  // Idempotency check
  const existing = await sql<{ step: string }[]>`
    SELECT step FROM sent_trial_emails
    WHERE subscription_id = ${u.stripe_subscription_id} AND step = 'reminder_3d'
  `;
  if (existing.length > 0) {
    console.log('   SKIP: reminder_3d already sent');
    continue;
  }

  // Render reminder_3d
  const locale = (u.locale === 'es' ? 'es' : 'en') as 'en' | 'es';
  const proUrl = `${SITE_URL}/${locale === 'es' ? 'es/' : ''}pricing?utm_source=trial-expiration&utm_medium=email&utm_campaign=reminder_3d`;
  const billingPortalUrl = `${SITE_URL}/${locale === 'es' ? 'es/' : ''}settings?tab=billing`;

  const html = await render(
    createElement(TrialReminder3dEmail, { locale, trialEndDate: u.trial_end, proUrl, billingPortalUrl }),
  );
  const text = await render(
    createElement(TrialReminder3dEmail, { locale, trialEndDate: u.trial_end, proUrl, billingPortalUrl }),
    { plainText: true },
  );

  const subject = locale === 'es'
    ? `Tu prueba de Estrevia Pro termina en 3 días`
    : `Your Estrevia Pro trial ends in 3 days`;

  console.log(`   Subject: ${subject}`);
  console.log(`   HTML ${html.length} bytes, text ${text.length} bytes`);

  if (!IS_LIVE) {
    console.log('   [DRY RUN] not sending');
    continue;
  }

  try {
    const res = await resend!.emails.send({
      from: 'Estrevia <hello@estrevia.app>',
      to: u.email,
      subject,
      html,
      text,
      tags: [
        { name: 'channel', value: 'trial-expiration' },
        { name: 'step', value: 'reminder_3d' },
        { name: 'backfill', value: '2026-05-24' },
      ],
    });
    if (res.error) {
      console.error(`   RESEND ERROR: ${JSON.stringify(res.error)}`);
      continue;
    }
    const messageId = res.data!.id;
    console.log(`   SENT resend_message_id=${messageId}`);

    await sql`
      INSERT INTO sent_trial_emails (subscription_id, user_id, step, resend_message_id)
      VALUES (${u.stripe_subscription_id}, ${u.id}, 'reminder_3d', ${messageId})
    `;
    console.log('   ROW INSERTED');
  } catch (err: unknown) {
    console.error(`   SEND ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

await sql.end();
console.log('\nDone.');
