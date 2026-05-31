/**
 * HALF50 discount-blast sender — 2026-05-30  (GATED)
 *
 * Sends the one-off DiscountLaunchEmail (50% off, HALF50) to all ADDRESSABLE
 * leads + recoverable users. DRY-RUN by default. `--apply` actually sends and
 * is REFUSED unless every guard env var is set:
 *   STRIPE_COUPON_HALF50  (offer would degrade to no-discount)
 *   COMPANY_POSTAL_ADDRESS (CAN-SPAM §5 — commercial mail needs a postal address)
 *   EMAIL_UNSUBSCRIBE_SECRET, RESEND_API_KEY
 *
 * Run as TS (server-only modules render inline, like the launch backfill):
 *   npx tsx scripts/advertising/_send_discount_blast_2026_05_30.mjs            # dry-run
 *   npx tsx scripts/advertising/_send_discount_blast_2026_05_30.mjs --limit 50 # cap batch
 *   npx tsx scripts/advertising/_send_discount_blast_2026_05_30.mjs --apply    # SEND (founder OK only)
 *
 * Idempotent: skips any recipient already in sent_discount_blast_emails for HALF50.
 * Throttle: --limit N (default 100) per run, so a 2-3 batch ramp can watch complaints.
 */
import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { createElement } from 'react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : 100;
const COUPON = 'HALF50';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://estrevia.app';
const FROM = 'Estrevia <hello@estrevia.app>';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // mirror unsubscribe-token.ts

// --- gates -----------------------------------------------------------------
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
if (APPLY) {
  const missing = ['STRIPE_COUPON_HALF50', 'COMPANY_POSTAL_ADDRESS', 'EMAIL_UNSUBSCRIBE_SECRET', 'RESEND_API_KEY']
    .filter((k) => !process.env[k] || (k === 'EMAIL_UNSUBSCRIBE_SECRET' && process.env[k].length < 32));
  if (missing.length) {
    console.error(`\n  REFUSING --apply. Missing/invalid: ${missing.join(', ')}`);
    console.error('  COMPANY_POSTAL_ADDRESS is the CAN-SPAM blocker — set it (founder postal address) before sending.\n');
    process.exit(1);
  }
}

// --- unsubscribe token (replicates server-only unsubscribe-token.ts format) -
function signUnsub(kind, id) {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  const exp = Date.now() + TTL_MS;
  const payload = `${kind}.${id}.${exp}`;
  const sig = crypto.createHmac('sha256', secret ?? 'dryrun-not-sent').update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

// --- resolve email template (tsx double-wraps the default export) ----------
const mod = await import('../../src/emails/DiscountLaunchEmail');
const DiscountLaunchEmail = mod.default?.default ?? mod.default;
if (typeof DiscountLaunchEmail !== 'function') {
  throw new Error(`template did not resolve to a function (got ${typeof DiscountLaunchEmail})`);
}

const sql = neon(process.env.DATABASE_URL);
const resend = APPLY ? new Resend(process.env.RESEND_API_KEY) : null;

// --- audience: addressable leads + recoverable users, exclude active payers -
const leads = await sql`
  SELECT id AS source_id, 'lead' AS kind, email, locale
  FROM email_leads
  WHERE converted_to_user_id IS NULL AND unsubscribed_at IS NULL AND email_undeliverable = false
`;
const usersRows = await sql`
  SELECT id AS source_id, 'user' AS kind, email, locale
  FROM users
  WHERE id LIKE 'user_%' AND email IS NOT NULL
    AND marketing_email_opt_in = true AND email_undeliverable = false
    AND (subscription_status IS NULL OR subscription_status NOT IN ('active', 'trialing'))
`;
// already-sent (idempotency). Table is added by migration 0018 (founder-applied);
// tolerate its absence in dry-run, but refuse --apply until it exists (else no dedupe).
let alreadySent = new Set();
try {
  const rows = await sql`SELECT recipient FROM sent_discount_blast_emails WHERE coupon_code = ${COUPON}`;
  alreadySent = new Set(rows.map((r) => r.recipient));
} catch {
  if (APPLY) {
    console.error('\n  REFUSING --apply: sent_discount_blast_emails missing. Apply migration 0018 on prod first.\n');
    process.exit(1);
  }
  console.warn('  (dry-run) sent_discount_blast_emails not present yet — treating as 0 already-sent.\n');
}

// dedupe by email — users win (account-scoped unsubscribe token), then leads
const byEmail = new Map();
for (const r of usersRows) if (!byEmail.has(r.email)) byEmail.set(r.email, r);
for (const r of leads) if (!byEmail.has(r.email)) byEmail.set(r.email, r);
const all = [...byEmail.values()];
const pending = all.filter((r) => !alreadySent.has(r.email));

const byLocale = (rows) => rows.reduce((a, r) => ((a[r.locale] = (a[r.locale] || 0) + 1), a), {});
console.log(`${APPLY ? '=== LIVE — WILL SEND ===' : '=== DRY RUN ==='}  coupon=${COUPON} limit=${LIMIT}`);
console.log(`addressable unique:  ${all.length}  ${JSON.stringify(byLocale(all))}`);
console.log(`already sent (skip):  ${all.length - pending.length}`);
console.log(`pending this run:     ${Math.min(pending.length, LIMIT)} of ${pending.length}  ${JSON.stringify(byLocale(pending))}\n`);

let sent = 0;
let failed = 0;
for (const r of pending.slice(0, LIMIT)) {
  const locale = r.locale === 'es' ? 'es' : 'en';
  const base = `${SITE_URL}/${locale === 'es' ? 'es/' : ''}`;
  const trialUrl = `${base}checkout/start?plan=pro_monthly&coupon=${COUPON}&utm_source=discount-blast&utm_medium=email&utm_campaign=half50`;
  const unsubToken = signUnsub(r.kind, r.source_id);
  // Footer link → human confirmation PAGE (GET); List-Unsubscribe header → POST
  // API route (RFC 8058 one-click). Same token, two endpoints.
  const unsubscribeUrl = `${base}unsubscribe?token=${unsubToken}`;
  const unsubscribePostUrl = `${SITE_URL}/api/v1/unsubscribe?token=${unsubToken}`;
  const subject = locale === 'es'
    ? '50% de descuento en tu lectura sideral — solo esta semana'
    : '50% off your full sidereal reading — this week only';

  const props = { locale, trialUrl, unsubscribeUrl };
  const html = await render(createElement(DiscountLaunchEmail, props));
  const text = await render(createElement(DiscountLaunchEmail, props), { plainText: true });

  if (!APPLY) {
    console.log(`  [dry] ${r.kind}:${r.email} (${locale}) — ${html.length}B`);
    continue;
  }
  try {
    const res = await resend.emails.send({
      from: FROM,
      to: r.email,
      subject,
      html,
      text,
      headers: { 'List-Unsubscribe': `<${unsubscribePostUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      tags: [{ name: 'channel', value: 'discount-blast' }, { name: 'coupon', value: COUPON }],
    });
    if (res.error) { failed += 1; console.error(`  FAIL ${r.email}: ${JSON.stringify(res.error)}`); continue; }
    await sql`
      INSERT INTO sent_discount_blast_emails (recipient, lead_id, user_id, coupon_code, resend_message_id)
      VALUES (${r.email}, ${r.kind === 'lead' ? r.source_id : null}, ${r.kind === 'user' ? r.source_id : null}, ${COUPON}, ${res.data.id})
      ON CONFLICT (recipient, coupon_code) DO NOTHING
    `;
    sent += 1;
    console.log(`  SENT ${r.email} (${locale}) id=${res.data.id}`);
  } catch (e) {
    failed += 1;
    console.error(`  ERROR ${r.email}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log(`\nDone. ${APPLY ? `sent=${sent} failed=${failed}` : 'dry-run — no sends'}`);
if (APPLY && sent > 0) console.log('Watch Resend complaint rate after this batch; abort if > ~0.1%.');
