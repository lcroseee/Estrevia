// Resend engagement audit 2026-05-29 — CORRECTED.
// Root cause discovered 2026-05-29: resend.emails.get(id) returns opened_at/
// clicked_at = undefined (and sometimes null record) in this account. The
// real open/click signal lives in `last_event` on the LIST endpoint
// (delivered < opened < clicked progression). The prior audit
// (_audit_resend_2026_05_23.mjs) read .opened_at/.clicked_at and so reported
// a false 0% engagement across the board.
//
// This script paginates resend.emails.list(), builds a msgid->last_event map,
// then joins to sent_lead_emails to attribute engagement per drip step.
// last_event is a furthest-reached marker, so:
//   opened  = last_event IN (opened, clicked)
//   clicked = last_event = clicked
// (A clicked email was necessarily opened; Resend collapses to furthest stage.)
//
// READ-ONLY.
import { config } from 'dotenv';
config({ path: '.env' });
import { Resend } from 'resend';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const resend = new Resend(process.env.RESEND_API_KEY);
const CUTOFF = '2026-05-21 20:25:00+00';

// 1. Paginate the Resend list endpoint to cover all recent sends.
const byId = new Map();
let after;
let pages = 0;
for (let i = 0; i < 40; i++) {
  const opts = { limit: 100 };
  if (after) opts.after = after;
  const list = await resend.emails.list(opts).catch((e) => {
    console.error('list error', e.message);
    return null;
  });
  const rows = list?.data?.data ?? [];
  if (rows.length === 0) break;
  for (const r of rows) byId.set(r.id, { last_event: r.last_event, created_at: r.created_at });
  pages++;
  // cursor: resend pagination uses the last id
  after = rows[rows.length - 1].id;
  // stop once we've paged past the cutoff window
  const oldest = rows[rows.length - 1].created_at;
  if (oldest && oldest < '2026-05-21') break;
  if (rows.length < 100) break;
}
console.log(`Pulled ${byId.size} Resend records across ${pages} pages`);

// Status distribution across pulled set
const statusDist = {};
for (const v of byId.values()) statusDist[v.last_event ?? '?'] = (statusDist[v.last_event ?? '?'] || 0) + 1;
console.log('Resend last_event distribution (all pulled):', statusDist);

// 2. Pull DB sends since cutoff with msgid + step + locale.
const sent = await sql`
  SELECT s.email_type, s.locale_join AS locale, s.resend_message_id, s.sent_at
  FROM (
    SELECT se.email_type, se.resend_message_id, se.sent_at, l.locale AS locale_join
    FROM sent_lead_emails se JOIN email_leads l ON l.id = se.lead_id
    WHERE se.sent_at > ${CUTOFF}::timestamptz AND se.resend_message_id IS NOT NULL
  ) s
  ORDER BY s.sent_at ASC
`;
console.log(`DB sends since cutoff: ${sent.length}`);

const stepDelay = {
  lead_chart: 'T+0', lead_curiosity_hook: 'T+1h', lead_moon_asc: 'T+24h',
  lead_paywall_teaser: 'T+72h', lead_saturn_weekly: 'T+7d',
  lead_mini_reading: 'T+14d', lead_synastry_teaser: 'T+21d',
};
const stepOrder = {
  lead_chart: 1, lead_curiosity_hook: 2, lead_moon_asc: 3, lead_paywall_teaser: 4,
  lead_saturn_weekly: 5, lead_mini_reading: 6, lead_synastry_teaser: 7,
};

const OPEN_EVENTS = new Set(['opened', 'clicked']);
const CLICK_EVENTS = new Set(['clicked']);
const DELIVERED_PLUS = new Set(['delivered', 'opened', 'clicked']); // reached inbox

function classify(rows) {
  const agg = { sends: 0, matched: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, suppressed: 0, delayed: 0, sent_only: 0, unmatched: 0 };
  for (const r of rows) {
    agg.sends++;
    const rec = byId.get(r.resend_message_id);
    if (!rec) { agg.unmatched++; continue; }
    agg.matched++;
    const ev = rec.last_event;
    if (DELIVERED_PLUS.has(ev)) agg.delivered++;
    if (OPEN_EVENTS.has(ev)) agg.opened++;
    if (CLICK_EVENTS.has(ev)) agg.clicked++;
    if (ev === 'bounced') agg.bounced++;
    if (ev === 'suppressed') agg.suppressed++;
    if (ev === 'delivery_delayed') agg.delayed++;
    if (ev === 'sent') agg.sent_only++;
  }
  return agg;
}

// 3. Per-step (only matched records — older sends fall out of the 100*pages window)
const byStep = {};
for (const r of sent) (byStep[r.email_type] ??= []).push(r);
const table = Object.entries(byStep)
  .sort(([a], [b]) => (stepOrder[a] ?? 9) - (stepOrder[b] ?? 9))
  .map(([t, rows]) => {
    const a = classify(rows);
    return {
      step: stepDelay[t] ?? '?', email_type: t,
      sends: a.sends, matched: a.matched, unmatched: a.unmatched,
      delivered: a.delivered,
      opened: a.opened,
      open_rate_of_matched: a.matched ? `${((a.opened * 100) / a.matched).toFixed(1)}%` : '—',
      clicked: a.clicked,
      click_rate_of_matched: a.matched ? `${((a.clicked * 100) / a.matched).toFixed(1)}%` : '—',
      ctor: a.opened ? `${((a.clicked * 100) / a.opened).toFixed(1)}%` : '—',
      bounced: a.bounced, suppressed: a.suppressed,
    };
  });
console.log('\n=== Per-step engagement via last_event (matched = in Resend list window) ===');
console.table(table);

// 4. Overall on matched set
const allMatched = classify(sent);
console.log('\n=== Overall (matched subset) ===');
console.log({
  db_sends: allMatched.sends,
  matched_in_resend_window: allMatched.matched,
  delivered: allMatched.delivered,
  opened: allMatched.opened,
  open_rate: allMatched.matched ? `${((allMatched.opened * 100) / allMatched.matched).toFixed(1)}%` : '—',
  clicked: allMatched.clicked,
  click_rate: allMatched.matched ? `${((allMatched.clicked * 100) / allMatched.matched).toFixed(1)}%` : '—',
  bounced: allMatched.bounced,
  suppressed: allMatched.suppressed,
});

// 5. By locale on matched set
const byLoc = {};
for (const r of sent) (byLoc[r.locale] ??= []).push(r);
console.log('\n=== By locale (matched subset) ===');
console.table(Object.entries(byLoc).map(([loc, rows]) => {
  const a = classify(rows);
  return {
    locale: loc, sends: a.sends, matched: a.matched, opened: a.opened,
    open_rate: a.matched ? `${((a.opened * 100) / a.matched).toFixed(1)}%` : '—',
    clicked: a.clicked,
    click_rate: a.matched ? `${((a.clicked * 100) / a.matched).toFixed(1)}%` : '—',
    bounced: a.bounced,
  };
}));
