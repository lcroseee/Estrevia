/**
 * Email drip funnel audit — 2026-05-24
 *
 * Covers Q1–Q6:
 *   Q1 Lead volume + step distribution (last 14d)
 *   Q2 Send health (NULL resend_message_id, duplicates, watchdog)
 *   Q3 Resend open/click rates (post 2026-05-23 20:25 UTC tracking start)
 *   Q4 Lead → user → paid conversion
 *   Q5 Unsubscribe + complaint rates
 *   Q6 Paywall_teaser readiness (step 4 pipeline)
 *
 * READ-ONLY. Never writes to DB. Never POSTs to Resend.
 *
 * Usage:
 *   node scripts/advertising/_audit_resend_2026_05_24.mjs
 */

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.error('RESEND_API_KEY not set — Resend API calls will be skipped');
}

// ─────────────────────────────────────────────────────────────────────────────
// Q1 — Lead volume + step distribution (last 14 days)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log('Q1 — LEAD VOLUME + STEP DISTRIBUTION (last 14d)');
console.log('════════════════════════════════════════════════════════════');

const leadVolume = await sql`
  SELECT
    COUNT(*)::int                                                     AS total_leads_14d,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int  AS total_leads_7d,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')::int   AS total_leads_24h,
    COUNT(*) FILTER (WHERE locale = 'en')::int                        AS en_leads,
    COUNT(*) FILTER (WHERE locale = 'es')::int                        AS es_leads,
    COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int          AS unsubscribed,
    COUNT(*) FILTER (WHERE email_undeliverable = true)::int           AS undeliverable,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int     AS converted_to_user
  FROM email_leads
  WHERE created_at >= NOW() - INTERVAL '14 days'
`;
console.log('\n--- Lead volume summary ---');
console.table(leadVolume);

const stepDistribution = await sql`
  SELECT
    nurture_step,
    COUNT(*)::int                                                      AS total,
    COUNT(*) FILTER (WHERE locale = 'en')::int                        AS en,
    COUNT(*) FILTER (WHERE locale = 'es')::int                        AS es,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int     AS converted,
    COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int          AS unsubscribed,
    COUNT(*) FILTER (WHERE email_undeliverable = true)::int           AS undeliverable,
    COUNT(*) FILTER (WHERE nurture_next_at IS NOT NULL AND nurture_next_at > NOW())::int AS queued_future,
    COUNT(*) FILTER (WHERE nurture_next_at IS NOT NULL AND nurture_next_at <= NOW() AND converted_to_user_id IS NULL AND unsubscribed_at IS NULL AND email_undeliverable = false)::int AS overdue
  FROM email_leads
  WHERE created_at >= NOW() - INTERVAL '14 days'
  GROUP BY nurture_step
  ORDER BY nurture_step
`;
console.log('\n--- Current step distribution (leads from last 14d) ---');
console.log('Step 0=T+0 chart | 1=curiosity_hook(T+1h) | 2=moon_asc(T+24h) | 3=paywall_teaser(T+72h)');
console.log('Step 4=saturn_weekly(T+7d) | 5=mini_reading(T+14d) | 6=synastry_teaser(T+21d) | 7=terminal');
console.table(stepDistribution);

// Leads sent per step (from sent_lead_emails joined back)
const sendsPerStep = await sql`
  SELECT
    sle.email_type,
    COUNT(DISTINCT sle.lead_id)::int  AS unique_leads_sent,
    COUNT(*)::int                     AS total_sends,
    COUNT(*) FILTER (WHERE sle.resend_message_id IS NOT NULL)::int AS confirmed_sent,
    COUNT(*) FILTER (WHERE sle.resend_message_id IS NULL)::int     AS silent_fail
  FROM sent_lead_emails sle
  JOIN email_leads el ON el.id = sle.lead_id
  WHERE el.created_at >= NOW() - INTERVAL '14 days'
    AND sle.sent_at >= NOW() - INTERVAL '14 days'
  GROUP BY sle.email_type
  ORDER BY sle.email_type
`;
console.log('\n--- Sends per email type (leads from last 14d) ---');
console.table(sendsPerStep);

// ─────────────────────────────────────────────────────────────────────────────
// Q2 — Send health
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log('Q2 — SEND HEALTH (last 14d)');
console.log('════════════════════════════════════════════════════════════');

const sendHealth = await sql`
  SELECT
    COUNT(*)::int                                                         AS total_sends_14d,
    COUNT(*) FILTER (WHERE resend_message_id IS NOT NULL)::int            AS with_message_id,
    COUNT(*) FILTER (WHERE resend_message_id IS NULL)::int                AS null_message_id,
    ROUND(100.0 * COUNT(*) FILTER (WHERE resend_message_id IS NULL) / NULLIF(COUNT(*), 0), 2) AS null_pct
  FROM sent_lead_emails
  WHERE sent_at >= NOW() - INTERVAL '14 days'
`;
console.log('\n--- NULL resend_message_id (post-fix should be ~0) ---');
console.table(sendHealth);

// Duplicates check — same lead_id + email_type appearing more than once
const duplicates = await sql`
  SELECT
    COUNT(*)::int AS duplicate_pairs
  FROM (
    SELECT lead_id, email_type, COUNT(*) AS cnt
    FROM sent_lead_emails
    WHERE sent_at >= NOW() - INTERVAL '14 days'
    GROUP BY lead_id, email_type
    HAVING COUNT(*) > 1
  ) dups
`;
console.log('\n--- Duplicate sends (same lead_id + email_type, UNIQUE index should prevent) ---');
console.table(duplicates);

// Per-day send volume to detect storms
const dailySends = await sql`
  SELECT
    DATE_TRUNC('day', sent_at AT TIME ZONE 'UTC')::date AS day,
    COUNT(*)::int AS sends,
    COUNT(DISTINCT lead_id)::int AS unique_leads,
    COUNT(*) FILTER (WHERE resend_message_id IS NULL)::int AS null_ids
  FROM sent_lead_emails
  WHERE sent_at >= NOW() - INTERVAL '14 days'
  GROUP BY 1
  ORDER BY 1
`;
console.log('\n--- Daily send volume (watch for storms) ---');
console.table(dailySends);

// ─────────────────────────────────────────────────────────────────────────────
// Q3 data prep — get resend_message_ids for post-tracking-window emails
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log('Q3 — RESEND OPEN/CLICK RATES (post 2026-05-23 20:25 UTC)');
console.log('════════════════════════════════════════════════════════════');

const TRACKING_START = '2026-05-23T20:25:00Z';

const trackableIds = await sql`
  SELECT
    sle.id,
    sle.lead_id,
    sle.email_type,
    sle.resend_message_id,
    sle.sent_at,
    el.locale
  FROM sent_lead_emails sle
  JOIN email_leads el ON el.id = sle.lead_id
  WHERE sle.sent_at >= ${TRACKING_START}
    AND sle.resend_message_id IS NOT NULL
  ORDER BY sle.sent_at
`;
console.log(`\nEmails sent after tracking start (${TRACKING_START}): ${trackableIds.length}`);

if (trackableIds.length === 0) {
  console.log('No trackable emails found — Resend API calls skipped.');
} else {
  // Group by email_type for summary
  const byType = {};
  for (const row of trackableIds) {
    if (!byType[row.email_type]) {
      byType[row.email_type] = { ids: [], en: 0, es: 0 };
    }
    byType[row.email_type].ids.push(row.resend_message_id);
    if (row.locale === 'en') byType[row.email_type].en++;
    else byType[row.email_type].es++;
  }

  console.log('\n--- Trackable emails by type ---');
  for (const [type, data] of Object.entries(byType)) {
    console.log(`  ${type}: ${data.ids.length} total (EN=${data.en}, ES=${data.es})`);
  }

  // Fetch individual email details from Resend API
  // Resend rate limit: 10 req/s — we fetch up to 50 emails with pacing
  if (RESEND_API_KEY) {
    console.log(`\nFetching individual email details from Resend API (up to ${trackableIds.length} requests)...`);

    const MAX_FETCH = 60; // cap to avoid timeout
    const toFetch = trackableIds.slice(0, MAX_FETCH);

    const resendDetails = [];
    let resendErrors = 0;

    for (const row of toFetch) {
      try {
        const resp = await fetch(`https://api.resend.com/emails/${row.resend_message_id}`, {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          resendDetails.push({
            id: row.resend_message_id,
            email_type: row.email_type,
            locale: row.locale,
            sent_at: row.sent_at,
            // Resend fields
            from: data.from,
            subject: data.subject,
            last_event: data.last_event,
            opened_at: data.opened_at,
            clicked_at: data.clicked_at,
            clicks: data.clicks,
            open_count: data.open_count,
            click_count: data.click_count,
          });
        } else {
          const errText = await resp.text();
          console.warn(`  Resend fetch error for ${row.resend_message_id}: ${resp.status} ${errText.slice(0, 100)}`);
          resendErrors++;
        }
        // Pace: ~8 req/s to stay under 10/s limit
        await new Promise(r => setTimeout(r, 125));
      } catch (e) {
        console.warn(`  Network error fetching ${row.resend_message_id}: ${e.message}`);
        resendErrors++;
      }
    }

    console.log(`\nFetched: ${resendDetails.length}, Errors: ${resendErrors}`);

    // Aggregate stats per email_type
    const stats = {};
    for (const d of resendDetails) {
      if (!stats[d.email_type]) {
        stats[d.email_type] = {
          sends: 0, en: 0, es: 0,
          opened: 0, clicked: 0,
          bounced: 0, complained: 0, delivered: 0, unsubscribed: 0,
          events: {},
        };
      }
      const s = stats[d.email_type];
      s.sends++;
      if (d.locale === 'en') s.en++; else s.es++;

      const ev = d.last_event;
      s.events[ev] = (s.events[ev] || 0) + 1;

      if (ev === 'delivered' || ev === 'opened' || ev === 'clicked') s.delivered++;
      if (ev === 'opened' || ev === 'clicked') s.opened++;
      if (ev === 'clicked') s.clicked++;
      if (ev === 'bounced' || ev === 'hard_bounced' || ev === 'soft_bounced') s.bounced++;
      if (ev === 'complained') s.complained++;
      if (ev === 'unsubscribed') s.unsubscribed++;
    }

    console.log('\n--- Resend stats per email type (post-tracking) ---');
    console.log('(Only includes emails fetched from Resend API — first 60 if >60 total)');
    for (const [type, s] of Object.entries(stats)) {
      const openRate = s.sends > 0 ? ((s.opened / s.sends) * 100).toFixed(1) : 'n/a';
      const ctr = s.sends > 0 ? ((s.clicked / s.sends) * 100).toFixed(1) : 'n/a';
      const ctor = s.opened > 0 ? ((s.clicked / s.opened) * 100).toFixed(1) : 'n/a';
      console.log(`\n  ${type} (EN=${s.en}, ES=${s.es}):`);
      console.log(`    Sends: ${s.sends} | Delivered: ${s.delivered} | Opened: ${s.opened} (${openRate}%) | Clicked: ${s.clicked} (CTR ${ctr}% | CTOR ${ctor}%)`);
      console.log(`    Bounced: ${s.bounced} | Complained: ${s.complained} | Unsubscribed: ${s.unsubscribed}`);
      console.log(`    Last-event breakdown:`, s.events);
    }

    // Overall stats
    const all = resendDetails.reduce((acc, d) => {
      const ev = d.last_event;
      acc.sends++;
      if (ev === 'delivered' || ev === 'opened' || ev === 'clicked') acc.delivered++;
      if (ev === 'opened' || ev === 'clicked') acc.opened++;
      if (ev === 'clicked') acc.clicked++;
      if (ev === 'bounced' || ev === 'hard_bounced' || ev === 'soft_bounced') acc.bounced++;
      if (ev === 'complained') acc.complained++;
      if (ev === 'unsubscribed') acc.unsubscribed++;
      return acc;
    }, { sends: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 0 });

    console.log('\n--- Overall Resend stats (post-tracking) ---');
    console.log(`  Total fetched: ${all.sends}`);
    console.log(`  Delivered: ${all.delivered}`);
    console.log(`  Opened: ${all.opened} (${all.sends ? ((all.opened/all.sends)*100).toFixed(1) : 'n/a'}%)`);
    console.log(`  Clicked: ${all.clicked} (CTR ${all.sends ? ((all.clicked/all.sends)*100).toFixed(1) : 'n/a'}%)`);
    console.log(`  Bounced: ${all.bounced} (${all.sends ? ((all.bounced/all.sends)*100).toFixed(2) : 'n/a'}%)`);
    console.log(`  Complained: ${all.complained} (${all.sends ? ((all.complained/all.sends)*100).toFixed(2) : 'n/a'}%)`);
    console.log(`  Unsubscribed: ${all.unsubscribed}`);

    if (all.complained / all.sends > 0.001) {
      console.error('\n🚨 P0: COMPLAINT RATE > 0.1% — domain reputation at risk!');
    }
    if (all.bounced / all.sends > 0.05) {
      console.error('\n🚨 P0: BOUNCE RATE > 5% — deliverability at risk!');
    }
  } else {
    console.log('Skipping Resend API fetch — no API key');
  }
}

// Also try Resend list endpoint for recent emails overview
if (RESEND_API_KEY) {
  console.log('\n--- Resend /emails list (most recent 100) ---');
  try {
    const listResp = await fetch('https://api.resend.com/emails?limit=100', {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (listResp.ok) {
      const listData = await listResp.json();
      const emails = listData.data || [];
      console.log(`  Total returned: ${emails.length}`);
      // Group by last_event
      const evCounts = {};
      for (const e of emails) {
        const ev = e.last_event || 'unknown';
        evCounts[ev] = (evCounts[ev] || 0) + 1;
      }
      console.log('  Last-event distribution:', evCounts);
      if (emails.length > 0) {
        console.log(`  Oldest: ${emails[emails.length - 1]?.created_at}`);
        console.log(`  Newest: ${emails[0]?.created_at}`);
      }
    } else {
      console.warn(`  Resend list error: ${listResp.status}`);
    }
  } catch (e) {
    console.warn(`  Resend list network error: ${e.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Q4 — Lead → user → paid conversion
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log('Q4 — LEAD → USER → PAID CONVERSION');
console.log('════════════════════════════════════════════════════════════');

// Cohort: leads created 14+ days ago (full drip exposure possible)
const conversionFunnel = await sql`
  SELECT
    COUNT(*)::int                                                            AS cohort_leads,
    COUNT(*) FILTER (WHERE locale = 'en')::int                              AS en,
    COUNT(*) FILTER (WHERE locale = 'es')::int                              AS es,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int           AS converted_to_user,
    ROUND(100.0 * COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS lead_to_user_pct
  FROM email_leads
  WHERE created_at <= NOW() - INTERVAL '14 days'
`;
console.log('\n--- Cohort: leads created ≥14d ago (full drip exposure) ---');
console.table(conversionFunnel);

// Users who came from leads + their subscription status
const leadUserPaidFunnel = await sql`
  WITH lead_users AS (
    SELECT el.id AS lead_id, el.locale, el.converted_to_user_id, el.created_at AS lead_created_at
    FROM email_leads el
    WHERE el.converted_to_user_id IS NOT NULL
      AND el.created_at >= NOW() - INTERVAL '14 days'
  )
  SELECT
    COUNT(*)::int                                                              AS lead_users_14d,
    COUNT(*) FILTER (WHERE u.subscription_status IN ('active', 'trialing'))::int AS paid_or_trialing,
    COUNT(*) FILTER (WHERE u.subscription_status = 'active')::int              AS active_paid,
    COUNT(*) FILTER (WHERE u.subscription_status = 'trialing')::int            AS trialing,
    COUNT(*) FILTER (WHERE u.plan = 'free')::int                               AS still_free,
    ROUND(100.0 * COUNT(*) FILTER (WHERE u.subscription_status IN ('active', 'trialing')) / NULLIF(COUNT(*), 0), 2) AS user_to_paid_pct
  FROM lead_users lu
  JOIN users u ON u.id = lu.converted_to_user_id
`;
console.log('\n--- Lead users from last 14d → subscription status ---');
console.table(leadUserPaidFunnel);

// Overall conversion numbers (all time for context)
const allTimeConversion = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM email_leads)                                          AS total_leads_ever,
    (SELECT COUNT(*)::int FROM email_leads WHERE converted_to_user_id IS NOT NULL)   AS total_converted_ever,
    (SELECT COUNT(*)::int FROM users)                                                 AS total_users,
    (SELECT COUNT(*)::int FROM users WHERE subscription_status IN ('active', 'trialing')) AS paid_or_trialing,
    (SELECT COUNT(*)::int FROM users WHERE subscription_status = 'active')           AS active_subs,
    (SELECT COUNT(*)::int FROM users WHERE subscription_status = 'trialing')         AS trialing_subs
`;
console.log('\n--- All-time conversion context ---');
console.table(allTimeConversion);

// ─────────────────────────────────────────────────────────────────────────────
// Q5 — Unsubscribe and complaint rates
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log('Q5 — UNSUBSCRIBE + COMPLAINT RATES');
console.log('════════════════════════════════════════════════════════════');

const unsubStats = await sql`
  SELECT
    COUNT(*)::int                                                            AS total_sends_14d,
    COUNT(DISTINCT lead_id)::int                                             AS unique_leads_sent,
    -- unsubscribes from email_leads
    (SELECT COUNT(*)::int FROM email_leads WHERE unsubscribed_at >= NOW() - INTERVAL '14 days') AS unsubs_14d,
    -- undeliverable (bounces + complaints result in this flag being set)
    (SELECT COUNT(*)::int FROM email_leads WHERE email_undeliverable = true
       AND created_at >= NOW() - INTERVAL '14 days') AS undeliverable_14d,
    ROUND(
      100.0 * (SELECT COUNT(*) FROM email_leads WHERE unsubscribed_at >= NOW() - INTERVAL '14 days')
      / NULLIF(COUNT(*), 0), 3
    ) AS unsub_pct
  FROM sent_lead_emails
  WHERE sent_at >= NOW() - INTERVAL '14 days'
`;
console.log('\n--- Unsubscribe + bounce rates (last 14d) ---');
console.table(unsubStats);

// All-time unsubscribes
const unsubAllTime = await sql`
  SELECT
    COUNT(*)::int AS total_leads,
    COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS total_unsubs,
    COUNT(*) FILTER (WHERE email_undeliverable = true)::int AS total_undeliverable,
    ROUND(100.0 * COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS unsub_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE email_undeliverable = true) / NULLIF(COUNT(*), 0), 2) AS undeliverable_pct
  FROM email_leads
`;
console.log('\n--- All-time unsubscribe/undeliverable rates ---');
console.table(unsubAllTime);

// ─────────────────────────────────────────────────────────────────────────────
// Q6 — Paywall teaser pipeline (step 3→4) + step 4-6 status
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log('Q6 — PAYWALL_TEASER PIPELINE + ADVANCED STEPS');
console.log('════════════════════════════════════════════════════════════');

// Who's due for paywall_teaser (step 3, nurture_next_at <= NOW() or soon)
const paywallTeaserDue = await sql`
  SELECT
    COUNT(*)::int                                                            AS on_step_3,
    COUNT(*) FILTER (WHERE nurture_next_at <= NOW())::int                   AS overdue_now,
    COUNT(*) FILTER (WHERE nurture_next_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours')::int AS due_next_24h,
    COUNT(*) FILTER (WHERE nurture_next_at BETWEEN NOW() + INTERVAL '24 hours' AND NOW() + INTERVAL '7 days')::int AS due_next_7d,
    MIN(nurture_next_at) AS earliest_due
  FROM email_leads
  WHERE nurture_step = 3
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
`;
console.log('\n--- Step 3 (paywall_teaser T+72h) pipeline ---');
console.table(paywallTeaserDue);

// Any leads on step 4, 5, 6?
const advancedSteps = await sql`
  SELECT
    nurture_step,
    COUNT(*)::int                                                            AS total,
    COUNT(*) FILTER (WHERE nurture_next_at <= NOW())::int                   AS overdue,
    COUNT(*) FILTER (WHERE nurture_next_at > NOW())::int                    AS queued,
    COUNT(*) FILTER (WHERE nurture_step = 7)::int                          AS terminal,
    MIN(nurture_next_at) AS earliest_due
  FROM email_leads
  WHERE nurture_step >= 4
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
  GROUP BY nurture_step
  ORDER BY nurture_step
`;
console.log('\n--- Steps 4-7 (saturn_weekly / mini_reading / synastry_teaser / terminal) ---');
console.table(advancedSteps);

// Sent paywall_teaser count (all time)
const paywallTeaserSent = await sql`
  SELECT
    COUNT(*)::int                                                            AS total_sent,
    COUNT(*) FILTER (WHERE resend_message_id IS NOT NULL)::int              AS confirmed,
    COUNT(*) FILTER (WHERE resend_message_id IS NULL)::int                  AS silent_fail,
    MIN(sent_at) AS first_sent,
    MAX(sent_at) AS last_sent
  FROM sent_lead_emails
  WHERE email_type = 'lead_paywall_teaser'
`;
console.log('\n--- lead_paywall_teaser sends (all time) ---');
console.table(paywallTeaserSent);

// ─────────────────────────────────────────────────────────────────────────────
// Additional: Leads with stuck T+0 (recovery candidates)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log('BONUS — STUCK T+0 CANDIDATES (recovery check)');
console.log('════════════════════════════════════════════════════════════');

const stuckT0 = await sql`
  SELECT
    COUNT(*)::int AS stuck_t0_count,
    MIN(created_at) AS oldest_stuck,
    MAX(created_at) AS newest_stuck
  FROM email_leads
  WHERE nurture_step = 0
    AND nurture_next_at IS NULL
    AND created_at < NOW() - INTERVAL '15 minutes'
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
`;
console.log('\n--- Stuck T+0 leads (cron should pick these up) ---');
console.table(stuckT0);

console.log('\n════════════════════════════════════════════════════════════');
console.log('AUDIT COMPLETE');
console.log('════════════════════════════════════════════════════════════\n');
