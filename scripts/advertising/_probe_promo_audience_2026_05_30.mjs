// READ-ONLY probe: size the addressable email audience for a possible
// one-week discount campaign (EN + ES/LATAM).  2026-05-30.
//
// Buckets by locale (en / es / unknown) and reports which cohorts are
// addressable_for_promo (exclude active payers, exclude unsubscribed,
// exclude undeliverable / opted-out).
//
// SELECT-only. Never writes, never mutates Stripe, never sends email.
//
// Schema source of truth: src/shared/lib/schema.ts
//   email_leads: converted_to_user_id, unsubscribed_at, email_undeliverable, locale
//   users:       id (Clerk), subscription_tier ('free'|'premium'),
//                subscription_status ('free'|'trialing'|'active'|'canceled'|
//                'past_due'|'incomplete'|'unpaid'), locale,
//                marketing_email_opt_in, email_undeliverable, updated_at,
//                trial_end, current_period_end
//   NOTE: there is NO canceled_at column on users; updated_at is used as the
//         recency proxy for "canceled in last 90 days" (see CAVEAT in output).
import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function row(label, r) {
  const en = r?.en ?? 0, es = r?.es ?? 0, unk = r?.unknown ?? 0;
  const tot = en + es + unk;
  console.log(
    `  ${label.padEnd(52)} en=${String(en).padStart(5)}  es=${String(es).padStart(5)}  unknown=${String(unk).padStart(5)}  TOTAL=${String(tot).padStart(6)}`
  );
  return { en, es, unknown: unk, total: tot };
}

// Locale bucketing: schema constrains locale to enum('en','es') NOT NULL
// default 'en', so 'unknown' should normally be 0 — but we still bucket
// anything outside en/es (or NULL) into 'unknown' to surface drift.
const LOCALE_CASE = (col) => `
  COUNT(*) FILTER (WHERE ${col} = 'en')::int                                   AS en,
  COUNT(*) FILTER (WHERE ${col} = 'es')::int                                   AS es,
  COUNT(*) FILTER (WHERE ${col} IS NULL OR ${col} NOT IN ('en','es'))::int     AS unknown`;

async function main() {
  console.log('================================================================');
  console.log(' ESTREVIA — Promo Addressable Audience Probe  (' + new Date().toISOString() + ')');
  console.log(' READ-ONLY. SELECT only.');
  console.log('================================================================\n');

  const out = {};

  // -------------------------------------------------------------------------
  // (1) email_leads
  // -------------------------------------------------------------------------
  console.log('## (1) EMAIL LEADS');
  out.leads_total = row('leads — total rows',
    (await pool.query(`SELECT ${LOCALE_CASE('locale')} FROM email_leads`)).rows[0]);

  out.leads_unconverted = row('leads — NOT converted (converted_to_user_id IS NULL)',
    (await pool.query(`SELECT ${LOCALE_CASE('locale')} FROM email_leads WHERE converted_to_user_id IS NULL`)).rows[0]);

  out.leads_unsubscribed = row('leads — unsubscribed (unsubscribed_at IS NOT NULL)',
    (await pool.query(`SELECT ${LOCALE_CASE('locale')} FROM email_leads WHERE unsubscribed_at IS NOT NULL`)).rows[0]);

  out.leads_undeliverable = row('leads — undeliverable (email_undeliverable = true)',
    (await pool.query(`SELECT ${LOCALE_CASE('locale')} FROM email_leads WHERE email_undeliverable = true`)).rows[0]);

  // ADDRESSABLE LEADS: unconverted AND not unsubscribed AND deliverable.
  out.leads_addressable = row('leads — ADDRESSABLE (unconverted, !unsub, deliverable)',
    (await pool.query(`
      SELECT ${LOCALE_CASE('locale')} FROM email_leads
      WHERE converted_to_user_id IS NULL
        AND unsubscribed_at IS NULL
        AND email_undeliverable = false
    `)).rows[0]);

  // -------------------------------------------------------------------------
  // (2) Free-tier signed-up users with REAL Clerk ids
  // -------------------------------------------------------------------------
  console.log('\n## (2) SIGNED-UP FREE USERS (real Clerk id, subscription_tier=free)');
  out.free_users_all = row("free users — id LIKE 'user_%' AND subscription_tier='free'",
    (await pool.query(`
      SELECT ${LOCALE_CASE('locale')} FROM users
      WHERE id LIKE 'user_%' AND subscription_tier = 'free'
    `)).rows[0]);

  // ADDRESSABLE FREE USERS: opted-in to marketing AND deliverable.
  out.free_users_addressable = row('free users — ADDRESSABLE (opt-in, deliverable)',
    (await pool.query(`
      SELECT ${LOCALE_CASE('locale')} FROM users
      WHERE id LIKE 'user_%' AND subscription_tier = 'free'
        AND marketing_email_opt_in = true
        AND email_undeliverable = false
    `)).rows[0]);

  // Diagnostic: how many free users would be excluded and why.
  out.free_users_optout = row('free users — excluded: marketing_email_opt_in=false',
    (await pool.query(`
      SELECT ${LOCALE_CASE('locale')} FROM users
      WHERE id LIKE 'user_%' AND subscription_tier = 'free' AND marketing_email_opt_in = false
    `)).rows[0]);
  out.free_users_undeliverable = row('free users — excluded: email_undeliverable=true',
    (await pool.query(`
      SELECT ${LOCALE_CASE('locale')} FROM users
      WHERE id LIKE 'user_%' AND subscription_tier = 'free' AND email_undeliverable = true
    `)).rows[0]);

  // Sanity: non-clerk-id rows (test/seed data) that we deliberately exclude.
  const nonClerk = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM users WHERE id NOT LIKE 'user_%'`
  )).rows[0].n;
  console.log(`  (sanity) users with non-Clerk id (excluded from (2)): ${nonClerk}`);

  // -------------------------------------------------------------------------
  // (3) Trialing users
  // -------------------------------------------------------------------------
  console.log('\n## (3) TRIALING USERS (subscription_status=trialing)');
  out.trialing = row('users — trialing (ACTIVE PAYER PATH — NOT a promo target)',
    (await pool.query(`
      SELECT ${LOCALE_CASE('locale')} FROM users WHERE subscription_status = 'trialing'
    `)).rows[0]);

  // -------------------------------------------------------------------------
  // (4) Past_due users
  // -------------------------------------------------------------------------
  console.log('\n## (4) PAST_DUE USERS (subscription_status=past_due)');
  out.past_due = row('users — past_due (recoverable; deliverable+opt-in below)',
    (await pool.query(`
      SELECT ${LOCALE_CASE('locale')} FROM users WHERE subscription_status = 'past_due'
    `)).rows[0]);
  out.past_due_addressable = row('users — past_due ADDRESSABLE (opt-in, deliverable)',
    (await pool.query(`
      SELECT ${LOCALE_CASE('locale')} FROM users
      WHERE subscription_status = 'past_due'
        AND marketing_email_opt_in = true AND email_undeliverable = false
    `)).rows[0]);

  // -------------------------------------------------------------------------
  // (5) Canceled in last 90 days (win-back). No canceled_at column ->
  //     use updated_at as recency proxy. CAVEAT noted in summary.
  // -------------------------------------------------------------------------
  console.log('\n## (5) CANCELED — WIN-BACK (subscription_status=canceled)');
  out.canceled_all = row('users — canceled (any time)',
    (await pool.query(`
      SELECT ${LOCALE_CASE('locale')} FROM users WHERE subscription_status = 'canceled'
    `)).rows[0]);
  out.canceled_90d = row('users — canceled w/ updated_at >= NOW()-90d (proxy)',
    (await pool.query(`
      SELECT ${LOCALE_CASE('locale')} FROM users
      WHERE subscription_status = 'canceled' AND updated_at >= NOW() - INTERVAL '90 days'
    `)).rows[0]);
  out.canceled_90d_addressable = row('users — canceled<=90d ADDRESSABLE (opt-in, deliverable)',
    (await pool.query(`
      SELECT ${LOCALE_CASE('locale')} FROM users
      WHERE subscription_status = 'canceled' AND updated_at >= NOW() - INTERVAL '90 days'
        AND marketing_email_opt_in = true AND email_undeliverable = false
    `)).rows[0]);

  // -------------------------------------------------------------------------
  // Cross-cohort overlap guard: are any addressable leads' emails already
  // a signed-up user? (converted_to_user_id IS NULL should prevent this, but
  // a lead could pre-date conversion linkage.) Report dedupe magnitude.
  // -------------------------------------------------------------------------
  console.log('\n## OVERLAP / DEDUPE CHECK');
  const overlap = (await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM email_leads l
    WHERE l.converted_to_user_id IS NULL
      AND l.unsubscribed_at IS NULL
      AND l.email_undeliverable = false
      AND EXISTS (SELECT 1 FROM users u WHERE u.email = l.email)
  `)).rows[0].n;
  console.log(`  Addressable leads whose email ALSO exists in users (dedupe before send): ${overlap}`);

  // -------------------------------------------------------------------------
  // ADDRESSABLE TOTALS
  // -------------------------------------------------------------------------
  console.log('\n## ADDRESSABLE-FOR-PROMO SUMMARY (dedup overlap NOT subtracted)');
  const addr = {
    leads:        out.leads_addressable,
    free_users:   out.free_users_addressable,
    past_due:     out.past_due_addressable,
    canceled_90d: out.canceled_90d_addressable,
  };
  let gEn = 0, gEs = 0, gUnk = 0;
  for (const [k, v] of Object.entries(addr)) {
    console.log(`  ${k.padEnd(14)} en=${String(v.en).padStart(5)} es=${String(v.es).padStart(5)} unknown=${String(v.unknown).padStart(5)} total=${String(v.total).padStart(6)}`);
    gEn += v.en; gEs += v.es; gUnk += v.unknown;
  }
  const grand = gEn + gEs + gUnk;
  console.log(`  ${'GRAND TOTAL'.padEnd(14)} en=${String(gEn).padStart(5)} es=${String(gEs).padStart(5)} unknown=${String(gUnk).padStart(5)} total=${String(grand).padStart(6)}`);
  console.log(`  (overlap leads<->users to dedupe: ${overlap})`);

  // Machine-readable dump for the orchestrator.
  console.log('\n@@JSON@@' + JSON.stringify({ ...out, overlap_leads_in_users: overlap,
    grand_addressable: { en: gEn, es: gEs, unknown: gUnk, total: grand } }));

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
