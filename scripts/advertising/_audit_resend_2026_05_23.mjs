// Resend engagement audit 2026-05-23 — first audit with open/click tracking.
// Tracking enabled 2026-05-21 ~20:25 UTC via links.estrevia.app CNAME.
// READ-ONLY. Fetches resend.emails.get(id) for every msgid in
// sent_lead_emails sent_at > cutoff.
//
// Output:
//  1. Engagement rates per email_type
//  2. Engagement by send hour
//  3. Best/worst subject lines
//  4. ES vs EN engagement
//  5. Click destinations
//  6. Drip → user / drip → paid attribution
//  7. Delivery health (bounce/complain/delayed)

import { config } from 'dotenv';
config({ path: '.env' });
import { Resend } from 'resend';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const resend = new Resend(process.env.RESEND_API_KEY);

const TRACKING_CUTOFF = '2026-05-21 20:25:00+00';

// ─────────────────────────────────────────────────────────────────────
// 0. Pull every (msgid, lead_id, email_type, sent_at) since tracking
// ─────────────────────────────────────────────────────────────────────
const sent = await sql`
  SELECT s.id AS row_id, s.lead_id, s.email_type, s.sent_at, s.resend_message_id,
         l.email, l.locale, l.utm_source, l.utm_campaign, l.utm_content,
         l.converted_to_user_id, l.created_at AS lead_created_at
  FROM sent_lead_emails s
  JOIN email_leads l ON l.id = s.lead_id
  WHERE s.sent_at > ${TRACKING_CUTOFF}::timestamptz
    AND s.resend_message_id IS NOT NULL
  ORDER BY s.sent_at ASC
`;
console.log(`\n=== Engagement-eligible cohort ===`);
console.log(`${sent.length} sends since ${TRACKING_CUTOFF}\n`);

// ─────────────────────────────────────────────────────────────────────
// 1. Deep-fetch each Resend record (sequential — respects rate limits)
// ─────────────────────────────────────────────────────────────────────
console.log('Fetching Resend details… (may take 30-60s)');
const records = [];
let fetched = 0;
for (const row of sent) {
  try {
    const r = await resend.emails.get(row.resend_message_id);
    const d = r?.data;
    if (!d) {
      records.push({ ...row, _missing: true });
      continue;
    }
    records.push({
      ...row,
      subject: d.subject ?? null,
      last_event: d.last_event ?? null,
      created_at_resend: d.created_at ?? null,
      delivered_at: d.last_event === 'delivered' ? d.created_at : null,
      bounced_at: d.bounced_at ?? null,
      complained_at: d.complained_at ?? null,
      opened_at: d.opened_at ?? null,
      clicked_at: d.clicked_at ?? null,
      // events array if present (used for click destinations)
      events: d.events ?? null,
    });
    fetched++;
    if (fetched % 25 === 0) console.log(`  fetched ${fetched}/${sent.length}…`);
  } catch (e) {
    records.push({ ...row, _err: e.message });
  }
}
console.log(`Done. ${records.length} records, ${records.filter((r) => r._missing).length} missing, ${records.filter((r) => r._err).length} errors.\n`);

// ─────────────────────────────────────────────────────────────────────
// 1.a Engagement rates per email_type
// ─────────────────────────────────────────────────────────────────────
const stepOrder = {
  lead_chart: 1,
  lead_curiosity_hook: 2,
  lead_moon_asc: 3,
  lead_paywall_teaser: 4,
  lead_saturn_weekly: 5,
  lead_mini_reading: 6,
  lead_synastry_teaser: 7,
};
const stepDelay = {
  lead_chart: 'T+0',
  lead_curiosity_hook: 'T+1h',
  lead_moon_asc: 'T+24h',
  lead_paywall_teaser: 'T+72h',
  lead_saturn_weekly: 'T+7d',
  lead_mini_reading: 'T+14d',
  lead_synastry_teaser: 'T+21d',
};

const byType = {};
for (const r of records) {
  if (r._missing || r._err) continue;
  const t = r.email_type;
  if (!byType[t]) byType[t] = { sends: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, other: 0 };
  byType[t].sends++;
  if (r.last_event === 'delivered') byType[t].delivered++;
  else if (r.last_event === 'bounced' || r.bounced_at) byType[t].bounced++;
  else if (r.last_event === 'complained' || r.complained_at) byType[t].complained++;
  else byType[t].other++;
  if (r.opened_at) byType[t].opened++;
  if (r.clicked_at) byType[t].clicked++;
}

const table1 = Object.entries(byType)
  .sort(([a], [b]) => (stepOrder[a] ?? 99) - (stepOrder[b] ?? 99))
  .map(([t, v]) => ({
    step: stepDelay[t] ?? '?',
    email_type: t,
    sends: v.sends,
    delivered: v.delivered,
    delivery_rate: `${((v.delivered * 100) / v.sends).toFixed(0)}%`,
    opened: v.opened,
    open_rate: v.delivered ? `${((v.opened * 100) / v.delivered).toFixed(1)}%` : '—',
    clicked: v.clicked,
    click_rate: v.delivered ? `${((v.clicked * 100) / v.delivered).toFixed(1)}%` : '—',
    ctor: v.opened ? `${((v.clicked * 100) / v.opened).toFixed(1)}%` : '—',
    bounced: v.bounced,
    complained: v.complained,
  }));
console.log('=== 1. Engagement rates per email_type (since 2026-05-21 20:25 UTC) ===');
console.table(table1);

// ─────────────────────────────────────────────────────────────────────
// 2. Engagement by send hour (UTC)
// ─────────────────────────────────────────────────────────────────────
const byHour = {};
for (const r of records) {
  if (r._missing || r._err) continue;
  const h = new Date(r.sent_at).getUTCHours();
  if (!byHour[h]) byHour[h] = { sends: 0, delivered: 0, opened: 0, clicked: 0 };
  byHour[h].sends++;
  if (r.last_event === 'delivered') byHour[h].delivered++;
  if (r.opened_at) byHour[h].opened++;
  if (r.clicked_at) byHour[h].clicked++;
}
const table2 = Array.from({ length: 24 }, (_, h) => h)
  .filter((h) => byHour[h])
  .map((h) => ({
    hour_utc: `${String(h).padStart(2, '0')}:00`,
    sends: byHour[h].sends,
    delivered: byHour[h].delivered,
    opened: byHour[h].opened,
    open_rate: byHour[h].delivered ? `${((byHour[h].opened * 100) / byHour[h].delivered).toFixed(1)}%` : '—',
    clicked: byHour[h].clicked,
    click_rate: byHour[h].delivered ? `${((byHour[h].clicked * 100) / byHour[h].delivered).toFixed(1)}%` : '—',
  }));
console.log('\n=== 2. Engagement by send hour (UTC) ===');
console.table(table2);

// ─────────────────────────────────────────────────────────────────────
// 3. Best/worst subject lines
// ─────────────────────────────────────────────────────────────────────
const bySubject = {};
for (const r of records) {
  if (r._missing || r._err) continue;
  if (!r.subject) continue;
  // Trim variable bits (sign names) so similar subjects bucket together — but keep distinct EN vs ES
  const key = r.subject;
  if (!bySubject[key]) bySubject[key] = { sends: 0, opened: 0, clicked: 0, sample_type: r.email_type, locale: r.locale };
  bySubject[key].sends++;
  if (r.opened_at) bySubject[key].opened++;
  if (r.clicked_at) bySubject[key].clicked++;
}
const subjects = Object.entries(bySubject)
  .map(([s, v]) => ({
    subject: s.length > 60 ? s.slice(0, 57) + '…' : s,
    locale: v.locale,
    type: v.sample_type,
    sends: v.sends,
    opened: v.opened,
    open_rate: v.sends >= 3 ? +((v.opened * 100) / v.sends).toFixed(1) : null,
    clicked: v.clicked,
    click_rate: v.sends >= 3 ? +((v.clicked * 100) / v.sends).toFixed(1) : null,
  }))
  .filter((s) => s.sends >= 3);
const topOpen = [...subjects].sort((a, b) => b.open_rate - a.open_rate).slice(0, 5);
const botOpen = [...subjects].sort((a, b) => a.open_rate - b.open_rate).slice(0, 5);
console.log('\n=== 3a. Top-5 subject lines by open rate (n≥3 sends) ===');
console.table(topOpen);
console.log('\n=== 3b. Bottom-5 subject lines by open rate (n≥3 sends) ===');
console.table(botOpen);
console.log('\n=== 3c. All distinct subject lines observed (n≥1) ===');
console.table(
  Object.entries(bySubject).map(([s, v]) => ({
    subject: s.length > 70 ? s.slice(0, 67) + '…' : s,
    locale: v.locale,
    type: v.sample_type,
    sends: v.sends,
    opened: v.opened,
    clicked: v.clicked,
  })).sort((a, b) => b.sends - a.sends)
);

// ─────────────────────────────────────────────────────────────────────
// 4. ES vs EN engagement
// ─────────────────────────────────────────────────────────────────────
const byLocale = {};
for (const r of records) {
  if (r._missing || r._err) continue;
  const k = `${r.locale}/${r.email_type}`;
  if (!byLocale[k]) byLocale[k] = { sends: 0, delivered: 0, opened: 0, clicked: 0 };
  byLocale[k].sends++;
  if (r.last_event === 'delivered') byLocale[k].delivered++;
  if (r.opened_at) byLocale[k].opened++;
  if (r.clicked_at) byLocale[k].clicked++;
}
const table4 = Object.entries(byLocale)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => {
    const [locale, type] = k.split('/');
    return {
      locale,
      type,
      step: stepDelay[type] ?? '?',
      sends: v.sends,
      delivered: v.delivered,
      opened: v.opened,
      open_rate: v.delivered ? `${((v.opened * 100) / v.delivered).toFixed(1)}%` : '—',
      clicked: v.clicked,
      click_rate: v.delivered ? `${((v.clicked * 100) / v.delivered).toFixed(1)}%` : '—',
    };
  });
console.log('\n=== 4. ES vs EN engagement breakdown ===');
console.table(table4);

// Locale rollup
const byLocaleAll = {};
for (const r of records) {
  if (r._missing || r._err) continue;
  if (!byLocaleAll[r.locale]) byLocaleAll[r.locale] = { sends: 0, delivered: 0, opened: 0, clicked: 0 };
  byLocaleAll[r.locale].sends++;
  if (r.last_event === 'delivered') byLocaleAll[r.locale].delivered++;
  if (r.opened_at) byLocaleAll[r.locale].opened++;
  if (r.clicked_at) byLocaleAll[r.locale].clicked++;
}
console.log('\n=== 4b. Locale rollup (all email types combined) ===');
console.table(
  Object.entries(byLocaleAll).map(([loc, v]) => ({
    locale: loc,
    sends: v.sends,
    delivered: v.delivered,
    opened: v.opened,
    open_rate: v.delivered ? `${((v.opened * 100) / v.delivered).toFixed(1)}%` : '—',
    clicked: v.clicked,
    click_rate: v.delivered ? `${((v.clicked * 100) / v.delivered).toFixed(1)}%` : '—',
  }))
);

// ─────────────────────────────────────────────────────────────────────
// 5. Click destinations — pull events for emails with clicked_at
// ─────────────────────────────────────────────────────────────────────
console.log('\n=== 5. Click destinations (raw event log) ===');
const clicked = records.filter((r) => r.clicked_at && !r._err);
console.log(`${clicked.length} clicked emails. Fetching event details for first 50…`);

const clickDest = {};
const clickedDetail = [];
for (const r of clicked.slice(0, 50)) {
  // The /emails/{id} response in the latest Resend API includes events[] with type=email.clicked + data.click.link
  // We already have r.events from the deep-fetch.
  let foundClick = false;
  if (Array.isArray(r.events)) {
    for (const ev of r.events) {
      const type = ev?.type ?? ev?.name ?? null;
      const link = ev?.data?.click?.link ?? ev?.data?.link ?? ev?.link ?? null;
      if (type && (type.includes('clicked') || type.includes('click')) && link) {
        foundClick = true;
        // Normalize: keep path only
        let path = link;
        try { path = new URL(link).pathname + (new URL(link).search ?? ''); } catch {}
        clickDest[path] = (clickDest[path] || 0) + 1;
        if (clickedDetail.length < 30) clickedDetail.push({
          id: r.resend_message_id.slice(0, 10),
          type: r.email_type,
          locale: r.locale,
          link: link.length > 90 ? link.slice(0, 87) + '…' : link,
        });
      }
    }
  }
  if (!foundClick) {
    clickDest['(no_event_link)'] = (clickDest['(no_event_link)'] || 0) + 1;
  }
}
console.log('Click destination distribution:');
console.table(
  Object.entries(clickDest)
    .sort(([, a], [, b]) => b - a)
    .map(([dest, n]) => ({ dest, n }))
);
console.log('\nSample click events (up to 30):');
console.table(clickedDetail);

// ─────────────────────────────────────────────────────────────────────
// 6. Drip → user / drip → paid attribution
// ─────────────────────────────────────────────────────────────────────
console.log('\n=== 6. Drip → user / paid attribution ===');

// For each lead that received a paywall_teaser (T+72h or later), check users table
const teaserCohort = records.filter((r) =>
  ['lead_paywall_teaser', 'lead_saturn_weekly', 'lead_mini_reading'].includes(r.email_type)
);
const teaserLeadIds = [...new Set(teaserCohort.map((r) => r.lead_id))];
console.log(`Unique leads in T+72h-or-later cohort: ${teaserLeadIds.length}`);

const usersFromTeaser = teaserLeadIds.length
  ? await sql`
      SELECT l.id AS lead_id, l.email, l.locale, l.converted_to_user_id,
             u.id AS user_id, u.created_at AS user_created_at,
             u.stripe_customer_id, u.subscription_status, u.stripe_subscription_id,
             u.plan
      FROM email_leads l
      LEFT JOIN users u ON LOWER(u.email) = LOWER(l.email)
      WHERE l.id = ANY(${teaserLeadIds})
    `
  : [];

const converted = usersFromTeaser.filter((u) => u.user_id);
const trialing = usersFromTeaser.filter((u) => u.subscription_status === 'trialing');
const active = usersFromTeaser.filter((u) => u.subscription_status === 'active');
const past_due = usersFromTeaser.filter((u) => u.subscription_status === 'past_due');
const canceled = usersFromTeaser.filter((u) => u.subscription_status === 'canceled');
console.log(`T+72h+ cohort: ${teaserLeadIds.length} leads → ${converted.length} users (${((converted.length * 100) / teaserLeadIds.length).toFixed(1)}%)`);
console.log(`  trialing: ${trialing.length}`);
console.log(`  active:   ${active.length}`);
console.log(`  past_due: ${past_due.length}`);
console.log(`  canceled: ${canceled.length}`);
if (converted.length > 0) {
  console.log('\nConverted leads from teaser cohort:');
  console.table(converted.map((u) => ({
    email: u.email?.slice(0, 28),
    locale: u.locale,
    user_id: u.user_id?.slice(0, 12),
    user_created: u.user_created_at?.toISOString?.().slice(0, 16),
    sub_status: u.subscription_status,
    plan: u.plan,
  })));
}

// Whole-cohort attribution (any email type)
const allCohortLeadIds = [...new Set(records.filter((r) => !r._err).map((r) => r.lead_id))];
const usersAllCohort = allCohortLeadIds.length
  ? await sql`
      SELECT l.id AS lead_id, l.email, l.locale,
             u.id AS user_id, u.subscription_status
      FROM email_leads l
      LEFT JOIN users u ON LOWER(u.email) = LOWER(l.email)
      WHERE l.id = ANY(${allCohortLeadIds})
    `
  : [];
const convertedAny = usersAllCohort.filter((u) => u.user_id);
const paidAny = usersAllCohort.filter((u) => ['trialing', 'active'].includes(u.subscription_status));
console.log(`\nAll-cohort (any email received since cutoff):`);
console.log(`  Unique leads: ${allCohortLeadIds.length}`);
console.log(`  → users:     ${convertedAny.length} (${((convertedAny.length * 100) / allCohortLeadIds.length).toFixed(1)}%)`);
console.log(`  → paid/trial: ${paidAny.length} (${((paidAny.length * 100) / allCohortLeadIds.length).toFixed(1)}%)`);

// Cross-check: drip-attributed Stripe sessions
// Note: users table has no utm_* columns — drip attribution must come from Stripe Checkout
// session metadata (utm_source=lead-nurture). Pull Stripe sessions instead.
console.log('\n=== 6b. Drip-attributed Stripe sessions (utm_source=lead-nurture in metadata) ===');
console.log('Note: users table lacks utm columns; drip-attribution lives in Stripe Checkout metadata.');
console.log('Run scripts/advertising/_audit_full_funnel_2026_05_21.mjs section "By UTM source (Stripe metadata)" for that view.');

// ─────────────────────────────────────────────────────────────────────
// 7. Delivery health
// ─────────────────────────────────────────────────────────────────────
console.log('\n=== 7. Delivery health (all engagement-eligible) ===');
const total = records.filter((r) => !r._err && !r._missing).length;
const totalBounced = records.filter((r) => r.bounced_at || r.last_event === 'bounced').length;
const totalComplained = records.filter((r) => r.complained_at || r.last_event === 'complained').length;
const totalDelayed = records.filter((r) => r.last_event === 'delivery_delayed').length;
const totalDelivered = records.filter((r) => r.last_event === 'delivered').length;
console.log({
  total,
  delivered: totalDelivered,
  delivered_pct: `${((totalDelivered * 100) / total).toFixed(2)}%`,
  bounced: totalBounced,
  bounced_pct: `${((totalBounced * 100) / total).toFixed(2)}%`,
  complained: totalComplained,
  complained_pct: `${((totalComplained * 100) / total).toFixed(2)}%`,
  delayed: totalDelayed,
  delayed_pct: `${((totalDelayed * 100) / total).toFixed(2)}%`,
});

const issues = records.filter((r) => r.bounced_at || r.complained_at || r.last_event === 'delivery_delayed' || r.last_event === 'bounced' || r.last_event === 'complained');
if (issues.length) {
  console.log('\nIndividual delivery issues:');
  console.table(issues.map((r) => ({
    msgid: r.resend_message_id?.slice(0, 10),
    type: r.email_type,
    locale: r.locale,
    email: r.email?.slice(0, 28),
    sent_at: new Date(r.sent_at).toISOString().slice(5, 16),
    last_event: r.last_event,
    bounced_at: r.bounced_at?.slice?.(0, 16) ?? null,
    complained_at: r.complained_at?.slice?.(0, 16) ?? null,
  })));
}

// ─────────────────────────────────────────────────────────────────────
// 8. Time-to-open / time-to-click (engagement velocity)
// ─────────────────────────────────────────────────────────────────────
console.log('\n=== 8. Engagement velocity ===');
const ttoSamples = [];
const ttcSamples = [];
for (const r of records) {
  if (r._err || !r.sent_at) continue;
  const sent = new Date(r.sent_at).getTime();
  if (r.opened_at) {
    const t = (new Date(r.opened_at).getTime() - sent) / (1000 * 60); // minutes
    if (t > 0 && t < 100000) ttoSamples.push({ type: r.email_type, t });
  }
  if (r.clicked_at) {
    const t = (new Date(r.clicked_at).getTime() - sent) / (1000 * 60);
    if (t > 0 && t < 100000) ttcSamples.push({ type: r.email_type, t });
  }
}
function pctile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (s.length - 1));
  return s[idx];
}
const ttoMins = ttoSamples.map((s) => s.t);
const ttcMins = ttcSamples.map((s) => s.t);
console.log(`Time-to-open (n=${ttoMins.length}): p50=${pctile(ttoMins, 50)?.toFixed(0)}min, p90=${pctile(ttoMins, 90)?.toFixed(0)}min, median=${pctile(ttoMins, 50)?.toFixed(0)}min`);
console.log(`Time-to-click (n=${ttcMins.length}): p50=${pctile(ttcMins, 50)?.toFixed(0)}min, p90=${pctile(ttcMins, 90)?.toFixed(0)}min`);

// ─────────────────────────────────────────────────────────────────────
// 9. Raw sample of records (debug)
// ─────────────────────────────────────────────────────────────────────
console.log('\n=== 9. Sample of records ===');
console.table(records.slice(0, 12).map((r) => ({
  msgid: r.resend_message_id?.slice(0, 10),
  type: r.email_type,
  locale: r.locale,
  sent: new Date(r.sent_at).toISOString().slice(5, 16),
  subject: (r.subject ?? '').slice(0, 30),
  last_event: r.last_event,
  opened: r.opened_at ? '✓' : '–',
  clicked: r.clicked_at ? '✓' : '–',
})));

console.log('\n=== Done ===');
