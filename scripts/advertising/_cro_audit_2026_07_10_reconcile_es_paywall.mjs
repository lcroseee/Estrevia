// CRO audit 2026-07-10 — RECONCILE contradiction #3: where does the ES paywall funnel leak?
// 07-paywall.md: ES modal open→click 60% vs EN 77% (uniques since 05-13, locale by pathname)
// 09-es.md:      ES 49% vs EN 100% (all-time, locale prop + es-path buckets) → "terminal break at Stripe"
//
// ONE consistent method: HogQL, unique persons, window 2026-05-13 → 2026-07-10 (inclusive),
// locale from $pathname prefix (/es/ vs not) at the paywall_* event itself.
// Steps: paywall_cta_viewed → paywall_opened → paywall_trial_clicked (modal-origin only,
// i.e. source != 'pricing') → checkout_stripe_redirected (modal-origin: has trigger)
// → Stripe checkout.session created (metadata.locale) → session complete.
//
// STRICTLY READ-ONLY. HogQL SELECT + Stripe GET only.

import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const API_HOST = 'https://us.posthog.com';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

if (!KEY || !PROJECT) { console.error('missing posthog env'); process.exit(1); }

const WIN = `timestamp >= toDateTime('2026-05-13 00:00:00') AND timestamp < toDateTime('2026-07-11 00:00:00')`;
const LOC = `multiIf(startsWith(toString(properties.$pathname), '/es/') OR toString(properties.$pathname) = '/es', 'es', 'en')`;

async function hog(q, label) {
  const r = await fetch(`${API_HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const d = await r.json();
  if (!r.ok || d.error || d.detail) {
    console.error(`ERR ${label}: ${r.status} ${JSON.stringify(d).slice(0, 500)}`);
    return null;
  }
  return d.results;
}

function table(label, rows, cols) {
  console.log(`\n═══ ${label} ═══`);
  if (!rows?.length) { console.log('  (no data)'); return; }
  const w = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i] ?? '').length)));
  console.log('  ' + cols.map((c, i) => c.padEnd(w[i])).join(' │ '));
  console.log('  ' + w.map((x) => '─'.repeat(x)).join('─┼─'));
  for (const r of rows) console.log('  ' + r.map((v, i) => String(v ?? '').padEnd(w[i])).join(' │ '));
}

// ── Q1: canonical per-step uniques by pathname-locale, modal-origin funnel ──
// clicked_modal: paywall_trial_clicked NOT from /pricing (pricing fires source='pricing', no trigger)
// redir_modal:   checkout_stripe_redirected with a trigger property (PaywallModal only;
//                pricing fires source='pricing'; /checkout/start fires neither)
const q1 = await hog(`
  SELECT
    ${LOC} AS loc,
    count(DISTINCT if(event = 'paywall_cta_viewed', person_id, NULL)) AS cta_u,
    count(DISTINCT if(event = 'paywall_opened', person_id, NULL)) AS opened_u,
    count(DISTINCT if(event = 'paywall_trial_clicked'
        AND (toString(properties.source) IS NULL OR toString(properties.source) != 'pricing'), person_id, NULL)) AS clicked_modal_u,
    count(DISTINCT if(event = 'checkout_stripe_redirected'
        AND toString(properties.trigger) IS NOT NULL, person_id, NULL)) AS redir_modal_u,
    count(DISTINCT if(event = 'paywall_trial_clicked', person_id, NULL)) AS clicked_any_u,
    count(DISTINCT if(event = 'checkout_stripe_redirected', person_id, NULL)) AS redir_any_u
  FROM events
  WHERE event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected')
    AND ${WIN}
  GROUP BY loc ORDER BY loc
`, 'Q1');
table('Q1 canonical: per-step uniques, pathname locale, 05-13→07-10 (modal vs any origin)', q1,
  ['loc', 'cta_u', 'opened_u', 'clicked_MODAL_u', 'redir_MODAL_u', 'clicked_any_u', 'redir_any_u']);

// ── Q2: strict conditioned funnel (same person must have prior step, same locale bucket) ──
const q2 = await hog(`
  SELECT loc,
    countIf(cta) AS cta_u,
    countIf(opened) AS opened_u,
    countIf(opened AND clicked) AS opened_and_clicked,
    countIf(opened AND clicked AND redirected) AS o_c_redirected,
    countIf(clicked AND NOT opened) AS clicked_wo_open
  FROM (
    SELECT person_id, ${LOC} AS loc,
      max(event = 'paywall_cta_viewed') AS cta,
      max(event = 'paywall_opened') AS opened,
      max(event = 'paywall_trial_clicked'
        AND (toString(properties.source) IS NULL OR toString(properties.source) != 'pricing')) AS clicked,
      max(event = 'checkout_stripe_redirected' AND toString(properties.trigger) IS NOT NULL) AS redirected
    FROM events
    WHERE event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected')
      AND ${WIN}
    GROUP BY person_id, loc
  )
  GROUP BY loc ORDER BY loc
`, 'Q2');
table('Q2 conditioned: same-person same-locale step chain, 05-13→07-10', q2,
  ['loc', 'cta_u', 'opened_u', 'opened∧clicked', 'o∧c∧redir', 'clicked w/o open']);

// ── Q3: replicate 07-paywall.md — natal-chart trigger only, pathname locale, since 05-13 ──
const q3 = await hog(`
  SELECT ${LOC} AS loc, toString(properties.trigger) AS trig,
    count(DISTINCT if(event = 'paywall_cta_viewed', person_id, NULL)) AS cta_u,
    count(DISTINCT if(event = 'paywall_opened', person_id, NULL)) AS opened_u,
    count(DISTINCT if(event = 'paywall_trial_clicked', person_id, NULL)) AS clicked_u,
    count(DISTINCT if(event = 'checkout_stripe_redirected', person_id, NULL)) AS redir_u
  FROM events
  WHERE event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected')
    AND ${WIN}
  GROUP BY loc, trig ORDER BY loc, cta_u DESC
`, 'Q3');
table('Q3 replicate 07: by locale × trigger (07 quoted natal-chart rows)', q3,
  ['loc', 'trigger', 'cta_u', 'opened_u', 'clicked_u', 'redir_u']);

// ── Q4: replicate 09-es.md — ALL-TIME, locale-PROP buckets, no origin filter ──
const q4 = await hog(`
  SELECT
    multiIf(
      toString(properties.locale) = 'en', 'en (prop)',
      toString(properties.locale) = 'es', 'es (prop)',
      (toString(properties.locale) IS NULL OR toString(properties.locale) = '')
        AND (startsWith(toString(properties.$pathname),'/es/') OR toString(properties.$pathname)='/es'), 'es-path (prop null)',
      'en-path (prop null)'
    ) AS bucket,
    count(DISTINCT if(event = 'paywall_cta_viewed', person_id, NULL)) AS cta_u,
    count(DISTINCT if(event = 'paywall_opened', person_id, NULL)) AS opened_u,
    count(DISTINCT if(event = 'paywall_trial_clicked', person_id, NULL)) AS clicked_u,
    count(DISTINCT if(event = 'checkout_stripe_redirected', person_id, NULL)) AS redir_u
  FROM events
  WHERE event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected')
  GROUP BY bucket ORDER BY bucket
`, 'Q4');
table('Q4 replicate 09: ALL-TIME, locale-prop buckets, all origins incl. pricing', q4,
  ['bucket', 'cta_u', 'opened_u', 'clicked_u', 'redir_u']);

// ── Q4b: how much of 09's EN clicked came from /pricing (no modal open needed) ──
const q4b = await hog(`
  SELECT
    multiIf(toString(properties.locale)='en','en (prop)', toString(properties.locale)='es','es (prop)',
      (toString(properties.locale) IS NULL OR toString(properties.locale)='')
        AND (startsWith(toString(properties.$pathname),'/es/') OR toString(properties.$pathname)='/es'),'es-path','en-path') AS bucket,
    multiIf(toString(properties.source)='pricing','pricing',
            toString(properties.trigger) IS NOT NULL,'modal','other') AS origin,
    count(DISTINCT person_id) AS clicked_u, count() AS clicked_n
  FROM events WHERE event = 'paywall_trial_clicked'
  GROUP BY bucket, origin ORDER BY bucket, origin
`, 'Q4b');
table('Q4b: all-time paywall_trial_clicked by locale-prop bucket × origin', q4b,
  ['bucket', 'origin', 'clicked_u', 'clicked_n']);

// ── Q5: 15 essay opens on EN paths w/ locale=es — quantify the cross-attribution ──
const q5 = await hog(`
  SELECT ${LOC} AS path_loc, toString(properties.locale) AS prop_loc,
    count(DISTINCT person_id) AS u, count() AS n
  FROM events WHERE event = 'paywall_opened' AND ${WIN}
  GROUP BY path_loc, prop_loc ORDER BY path_loc, prop_loc
`, 'Q5');
table('Q5: paywall_opened path-locale vs locale-prop cross-tab (05-13→07-10)', q5,
  ['path_loc', 'prop_loc', 'uniques', 'events']);

// ── Stripe: sessions created 05-13→07-10, bucket by metadata.locale ──
console.log('\n═══ Stripe checkout.sessions 2026-05-13 → 2026-07-10 (metadata.locale) ═══');
const gte = Math.floor(new Date('2026-05-13T00:00:00Z').getTime() / 1000);
const lt = Math.floor(new Date('2026-07-11T00:00:00Z').getTime() / 1000);
const buckets = {};
let all = [];
for await (const s of stripe.checkout.sessions.list({ created: { gte, lt }, limit: 100 })) {
  all.push(s);
  const loc = s.metadata?.locale === 'es' ? 'es' : 'en/unset';
  buckets[loc] ??= { created: 0, complete: 0, expired: 0, open: 0 };
  buckets[loc].created++;
  buckets[loc][s.status] = (buckets[loc][s.status] ?? 0) + 1;
}
for (const [loc, b] of Object.entries(buckets)) {
  console.log(`  ${loc.padEnd(9)} created=${b.created}  complete=${b.complete ?? 0}  expired=${b.expired ?? 0}  open=${b.open ?? 0}`);
}
console.log('  — per-session detail (created, locale-meta, stripe-locale, status, mode, amount):');
for (const s of all.sort((a, b) => a.created - b.created)) {
  console.log(`    ${new Date(s.created * 1000).toISOString().slice(0, 10)} meta.locale=${s.metadata?.locale ?? '-'} locale=${s.locale ?? '-'} status=${s.status} paid=${s.payment_status} amt=${s.amount_total}`);
}
console.log('\ndone');
