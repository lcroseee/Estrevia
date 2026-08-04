// Comprehensive funnel audit run 2026-05-19.
// Pulls Meta 7d + today, PostHog funnel, DB funnel — single shot for cross-reference.
import { Pool } from '@neondatabase/serverless';

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCT = process.env.META_AD_ACCOUNT_ID;
const POSTHOG_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const POSTHOG_PROJECT = process.env.POSTHOG_PROJECT_ID;
const API = 'https://graph.facebook.com/v23.0';
const POSTHOG_API = 'https://us.posthog.com';

const LEAD_CAMP = '120243116761600527';
const LPV_CAMP  = '120243025911300527';
const EN_ADSET  = '120243116854610527';
const ES_ADSET  = '120243116822500527';

const SINCE_7D = '2026-05-12';
const TODAY = '2026-05-19';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function actionLookup(arr, type) {
  if (!Array.isArray(arr)) return 0;
  const found = arr.find((a) => a.action_type === type);
  return Number(found?.value ?? 0);
}

async function metaInsights(level, id, since, until) {
  const fields = 'spend,impressions,reach,clicks,inline_link_clicks,cpc,cpm,ctr,frequency,actions,action_values,unique_actions,cost_per_action_type,outbound_clicks';
  const url = `${API}/${id}/insights?time_range={'since':'${since}','until':'${until}'}&time_increment=1&fields=${fields}&access_token=${TOKEN}`;
  const r = await fetch(url);
  return r.json();
}

async function hogql(query) {
  const r = await fetch(`${POSTHOG_API}/api/projects/${POSTHOG_PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${POSTHOG_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  return r.json();
}

function table(label, rows, cols) {
  console.log(`\n═══ ${label} ═══`);
  if (!rows?.length) { console.log('  (no data)'); return; }
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i] ?? '').length)));
  console.log('  ' + cols.map((c, i) => c.padEnd(widths[i])).join(' │ '));
  console.log('  ' + widths.map(w => '─'.repeat(w)).join('─┼─'));
  for (const row of rows) {
    console.log('  ' + row.map((v, i) => String(v ?? '').slice(0, widths[i]).padEnd(widths[i])).join(' │ '));
  }
}

// ─── META: 7d account-level trend ───────────────────────────────
console.log('═══ Meta account-level (7d trend) ═══');
const acct7 = await metaInsights('account', ACCT, SINCE_7D, TODAY);
let total = { spend: 0, impr: 0, clk: 0, lpv: 0, lead: 0, sub: 0, purchase: 0 };
for (const row of acct7.data ?? []) {
  const lpv = actionLookup(row.actions, 'landing_page_view');
  const lead = actionLookup(row.actions, 'lead') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_lead');
  const sub = actionLookup(row.actions, 'subscribe') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_subscribe');
  const purchase = actionLookup(row.actions, 'purchase') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_purchase');
  console.log(`  ${row.date_start}  $${row.spend}  impr=${row.impressions}  clk=${row.clicks}  lpv=${lpv}  lead=${lead}  sub=${sub}  purchase=${purchase}`);
  total.spend += +row.spend;
  total.impr += +row.impressions;
  total.clk += +row.clicks;
  total.lpv += lpv;
  total.lead += lead;
  total.sub += sub;
  total.purchase += purchase;
}
console.log(`  ─── 7d TOTAL  $${total.spend.toFixed(2)}  impr=${total.impr}  clk=${total.clk}  lpv=${total.lpv}  lead=${total.lead}  sub=${total.sub}  purchase=${total.purchase}`);
if (total.lead > 0) console.log(`  CPL 7d = $${(total.spend / total.lead).toFixed(2)}`);

// ─── META: today by ad set ─────────────────────────────────────
console.log('\n═══ Meta today (2026-05-19) by ad set ═══');
for (const [adset, tag] of [[EN_ADSET, 'EN'], [ES_ADSET, 'ES']]) {
  const today = await metaInsights('adset', adset, TODAY, TODAY);
  for (const row of today.data ?? []) {
    const lpv = actionLookup(row.actions, 'landing_page_view');
    const lead = actionLookup(row.actions, 'lead') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_lead');
    const sub = actionLookup(row.actions, 'subscribe') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_subscribe');
    const purchase = actionLookup(row.actions, 'purchase') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_purchase');
    const cpl = lead > 0 ? (Number(row.spend) / lead).toFixed(2) : 'inf';
    console.log(`  ${tag}  spend=$${row.spend}  ctr=${row.ctr}%  cpc=$${row.cpc}  cpm=$${row.cpm}  freq=${row.frequency}  lpv=${lpv}  lead=${lead}  sub=${sub}  purchase=${purchase}  CPL=$${cpl}`);
  }
  if ((today.data ?? []).length === 0) console.log(`  ${tag}: no spend today`);
}

// ─── META: ad-level 7d (creative ranking) ──────────────────────
console.log('\n═══ Meta ad-level last 7d (winners/losers) ═══');
const adWins = [];
for (const [adset, tag] of [[EN_ADSET, 'EN'], [ES_ADSET, 'ES']]) {
  const adsRes = await (await fetch(`${API}/${adset}/ads?fields=id,name&limit=50&access_token=${TOKEN}`)).json();
  for (const ad of adsRes.data ?? []) {
    const ins = await metaInsights('ad', ad.id, SINCE_7D, TODAY);
    let spend = 0, lpv = 0, lead = 0, clk = 0, impr = 0, sub = 0;
    for (const row of ins.data ?? []) {
      spend += +row.spend;
      clk += +row.clicks;
      impr += +row.impressions;
      lpv += actionLookup(row.actions, 'landing_page_view');
      lead += actionLookup(row.actions, 'lead') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_lead');
      sub += actionLookup(row.actions, 'subscribe') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_subscribe');
    }
    const ctr = impr > 0 ? ((clk / impr) * 100).toFixed(2) : '0';
    const cpc = clk > 0 ? (spend / clk).toFixed(2) : 'inf';
    const cpl = lead > 0 ? (spend / lead).toFixed(2) : 'inf';
    if (spend > 0) {
      adWins.push({ tag, name: ad.name.slice(-44), spend, impr, ctr, cpc, lpv, lead, sub, cpl });
    }
  }
}
adWins.sort((a, b) => b.spend - a.spend);
for (const a of adWins) {
  console.log(`  ${a.tag}  ${a.name.padEnd(44)}  $${a.spend.toFixed(2).padStart(6)}  impr=${String(a.impr).padStart(5)}  ctr=${a.ctr}%  cpc=$${a.cpc}  lpv=${a.lpv}  lead=${a.lead}  sub=${a.sub}  CPL=$${a.cpl}`);
}

// ─── PostHog funnel (last 7d) ─────────────────────────────────
console.log('\n═══ PostHog funnel (last 7d) ═══');
const funnel = await hogql(`
  SELECT
    countDistinctIf(distinct_id, event = '$pageview') AS pv,
    countDistinctIf(distinct_id, event = 'cookie_consent_accepted') AS consent,
    countDistinctIf(distinct_id, event = 'chart_calculated') AS chart_calc,
    countDistinctIf(distinct_id, event = 'email_gate_viewed') AS email_gate,
    countDistinctIf(distinct_id, event = 'email_lead_submitted') AS lead,
    countDistinctIf(distinct_id, event = 'paywall_opened') AS paywall_open,
    countDistinctIf(distinct_id, event = 'paywall_cta_viewed') AS paywall_view,
    countDistinctIf(distinct_id, event = 'paywall_trial_clicked') AS trial_click,
    countDistinctIf(distinct_id, event = 'checkout_auth_redirect') AS checkout_auth,
    countDistinctIf(distinct_id, event = 'checkout_stripe_redirected') AS checkout_stripe,
    countDistinctIf(distinct_id, event = 'subscription_started') AS subscribed
  FROM events
  WHERE timestamp >= now() - INTERVAL 7 DAY
`);
if (funnel?.results?.[0]) {
  const r = funnel.results[0];
  const cols = ['pv', 'consent', 'chart_calc', 'email_gate', 'lead', 'paywall_open', 'paywall_view', 'trial_click', 'checkout_auth', 'checkout_stripe', 'subscribed'];
  for (let i = 0; i < cols.length; i++) {
    const prev = i === 0 ? r[i] : r[i - 1];
    const pct = prev > 0 ? ((r[i] / prev) * 100).toFixed(1) : '–';
    const fromPV = r[0] > 0 ? ((r[i] / r[0]) * 100).toFixed(1) : '–';
    console.log(`  ${cols[i].padEnd(18)}: ${String(r[i]).padStart(5)}  (${pct}% of prev, ${fromPV}% of pv)`);
  }
}

// ─── PostHog by UTM source (last 7d) ──────────────────────────
const utmFunnel = await hogql(`
  SELECT
    properties.utm_source AS src,
    countDistinctIf(distinct_id, event = '$pageview') AS pv,
    countDistinctIf(distinct_id, event = 'chart_calculated') AS chart_calc,
    countDistinctIf(distinct_id, event = 'email_lead_submitted') AS lead,
    countDistinctIf(distinct_id, event = 'paywall_opened') AS paywall,
    countDistinctIf(distinct_id, event = 'checkout_stripe_redirected') AS checkout,
    countDistinctIf(distinct_id, event = 'subscription_started') AS sub
  FROM events
  WHERE timestamp >= now() - INTERVAL 7 DAY
  GROUP BY src
  ORDER BY pv DESC
  LIMIT 15
`);
table('PostHog 7d funnel by utm_source', utmFunnel?.results,
  ['src', 'pv', 'chart_calc', 'lead', 'paywall', 'checkout', 'sub']);

// ─── PostHog top pages 7d ─────────────────────────────────────
const pages = await hogql(`
  SELECT
    properties.\$pathname AS path,
    COUNT() AS pv,
    COUNT(DISTINCT distinct_id) AS distinct_visitors
  FROM events
  WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY
  GROUP BY path
  ORDER BY pv DESC
  LIMIT 20
`);
table('Top pages 7d', pages?.results, ['path', 'pv', 'distinct']);

// ─── PostHog paywall events 7d ────────────────────────────────
const paywall = await hogql(`
  SELECT
    event,
    properties.feature AS feature,
    properties.paywall_source AS src,
    COUNT() AS n,
    COUNT(DISTINCT distinct_id) AS distinct
  FROM events
  WHERE event LIKE 'paywall%' OR event LIKE 'checkout%' OR event = 'subscription_started'
    AND timestamp >= now() - INTERVAL 7 DAY
  GROUP BY event, feature, src
  ORDER BY n DESC
`);
table('Paywall + checkout 7d', paywall?.results, ['event', 'feature', 'src', 'n', 'distinct']);

// ─── DB cross-check ───────────────────────────────────────────
console.log('\n═══ DB funnel cross-reference (30d) ═══');
const dbF = (await pool.query(`
  SELECT
    (SELECT COUNT(*)::int FROM email_leads WHERE created_at >= NOW() - INTERVAL '7 days') AS leads_7d,
    (SELECT COUNT(*)::int FROM email_leads WHERE created_at >= NOW() - INTERVAL '30 days') AS leads_30d,
    (SELECT COUNT(*)::int FROM email_leads WHERE converted_to_user_id IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days') AS converted_30d,
    (SELECT COUNT(*)::int FROM email_leads WHERE unsubscribed_at IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days') AS unsub_30d,
    (SELECT COUNT(*)::int FROM sent_lead_emails WHERE sent_at >= NOW() - INTERVAL '7 days') AS emails_7d,
    (SELECT COUNT(DISTINCT user_id)::int FROM chart_readings WHERE created_at >= NOW() - INTERVAL '30 days') AS chart_readings_users,
    (SELECT COUNT(*)::int FROM chart_readings WHERE created_at >= NOW() - INTERVAL '30 days') AS chart_readings_total
`)).rows[0];
for (const [k, v] of Object.entries(dbF)) console.log(`  ${k.padEnd(28)}: ${v}`);

// ─── Lead source breakdown ────────────────────────────────────
console.log('\n═══ Lead source breakdown (30d) ═══');
const src = (await pool.query(`
  SELECT
    COALESCE(NULLIF(utm_source, ''), 'direct') AS src,
    COALESCE(NULLIF(utm_campaign, ''), '(none)') AS campaign,
    COUNT(*)::int AS n,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int AS converted,
    ROUND(100.0 * COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL) / COUNT(*), 2) AS cvr_pct
  FROM email_leads
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY src, campaign
  ORDER BY n DESC
  LIMIT 15
`)).rows;
for (const r of src) console.log(`  ${(r.src + ' / ' + r.campaign).padEnd(45)}: ${String(r.n).padStart(4)} leads → ${r.converted} converted (${r.cvr_pct}%)`);

// ─── Email pipeline health ────────────────────────────────────
console.log('\n═══ Lead nurture pipeline health ═══');
const nurture = (await pool.query(`
  SELECT
    nurture_step,
    COUNT(*)::int AS n,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int AS converted,
    COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS unsub
  FROM email_leads
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY nurture_step
  ORDER BY nurture_step
`)).rows;
for (const r of nurture) console.log(`  step ${r.nurture_step}: ${String(r.n).padStart(4)} leads, ${r.converted} converted, ${r.unsub} unsub`);

const emailTypes = (await pool.query(`
  SELECT
    email_type,
    COUNT(*)::int AS sent,
    COUNT(*) FILTER (WHERE resend_message_id IS NULL)::int AS null_msg,
    COUNT(*) FILTER (WHERE sent_at >= NOW() - INTERVAL '2 days')::int AS last2d
  FROM sent_lead_emails
  GROUP BY email_type
  ORDER BY email_type
`)).rows;
console.log('\n  ─── email-type sent breakdown:');
for (const r of emailTypes) console.log(`  ${r.email_type.padEnd(18)}: total=${String(r.sent).padStart(4)}  null_msg_id=${r.null_msg}  last_2d=${r.last2d}`);

// ─── Spend ────────────────────────────────────────────────────
console.log('\n═══ Spend daily (last 7d) ═══');
const spend = (await pool.query(`
  SELECT date, spent_usd, cap_usd, triggered_halt
  FROM advertising_spend_daily
  WHERE date >= CURRENT_DATE - INTERVAL '7 days'
  ORDER BY date DESC
`)).rows;
for (const r of spend) console.log(`  ${r.date} | spent=$${r.spent_usd} / cap=$${r.cap_usd} | halt=${r.triggered_halt}`);

await pool.end();
