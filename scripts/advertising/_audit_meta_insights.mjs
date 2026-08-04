// Pull Meta insights for Lead campaign since 2026-05-17 (post-fix window).
import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCT = process.env.META_AD_ACCOUNT_ID;
const API = 'https://graph.facebook.com/v23.0';
const LEAD_CAMP = '120243116761600527';
const LPV_CAMP  = '120243025911300527';
const EN_ADSET = '120243116854610527';
const ES_ADSET = '120243116822500527';
const ACTION_BREAK_DOWN = 'actions,action_values,unique_actions,cost_per_action_type,outbound_clicks';

async function g(url) {
  const r = await fetch(url);
  return r.json();
}

async function insights(level, id, since, until) {
  const fields = `spend,impressions,reach,clicks,inline_link_clicks,cpc,cpm,ctr,frequency,${ACTION_BREAK_DOWN}`;
  const params = `time_range={'since':'${since}','until':'${until}'}&time_increment=1&fields=${fields}&access_token=${TOKEN}`;
  const url = `${API}/${id}/insights?${params}`;
  return g(url);
}

function actionLookup(arr, type) {
  if (!Array.isArray(arr)) return 0;
  const found = arr.find((a) => a.action_type === type);
  return Number(found?.value ?? 0);
}

// ─── 30d window (overall trend) ─────────────────────────────────────────────
console.log('═══ 30d account-level (post-fix audit) ═══');
const acct30 = await insights('account', ACCT, '2026-04-17', '2026-05-17');
let total = { spend: 0, impr: 0, clk: 0, lpv: 0, lead: 0 };
for (const row of acct30.data ?? []) {
  const lpv = actionLookup(row.actions, 'landing_page_view');
  const lead = actionLookup(row.actions, 'lead') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_lead');
  const sub = actionLookup(row.actions, 'subscribe');
  const purchase = actionLookup(row.actions, 'purchase');
  console.log(`  ${row.date_start}  $${row.spend}  impr=${row.impressions}  clk=${row.clicks}  lpv=${lpv}  lead=${lead}  sub=${sub}  purchase=${purchase}`);
  total.spend += +row.spend;
  total.impr += +row.impressions;
  total.clk += +row.clicks;
  total.lpv += lpv;
  total.lead += lead;
}
console.log(`  ────`);
console.log(`  TOTAL  $${total.spend.toFixed(2)}  impr=${total.impr}  clk=${total.clk}  lpv=${total.lpv}  lead=${total.lead}`);

// ─── Today only ─────────────────────────────────────────────────────────────
console.log('\n═══ 2026-05-17 by ad set ═══');
for (const adsetId of [EN_ADSET, ES_ADSET]) {
  const tag = adsetId === EN_ADSET ? 'EN' : 'ES';
  const today = await insights('adset', adsetId, '2026-05-17', '2026-05-17');
  for (const row of today.data ?? []) {
    const lpv = actionLookup(row.actions, 'landing_page_view');
    const lead = actionLookup(row.actions, 'lead') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_lead');
    const sub = actionLookup(row.actions, 'subscribe') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_subscribe');
    const purchase = actionLookup(row.actions, 'purchase') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_purchase');
    console.log(`  ${tag}  spend=$${row.spend}  impr=${row.impressions}  clk=${row.clicks}  ctr=${row.ctr}%  cpc=$${row.cpc}  cpm=$${row.cpm}  freq=${row.frequency}`);
    console.log(`     actions: lpv=${lpv}  lead=${lead}  sub=${sub}  purchase=${purchase}`);
    const cpl = lead > 0 ? (Number(row.spend) / lead).toFixed(2) : 'inf';
    console.log(`     CPL=$${cpl}`);
  }
}

// ─── 7d ad-level performance (creative ranking) ─────────────────────────────
console.log('\n═══ Ad-level last 7d ═══');
for (const adsetId of [EN_ADSET, ES_ADSET]) {
  const tag = adsetId === EN_ADSET ? 'EN' : 'ES';
  const adsRes = await g(`${API}/${adsetId}/ads?fields=id,name&limit=20&access_token=${TOKEN}`);
  for (const ad of adsRes.data ?? []) {
    const insight = await insights('ad', ad.id, '2026-05-10', '2026-05-17');
    let spend = 0, lpv = 0, lead = 0, clk = 0, impr = 0;
    for (const row of insight.data ?? []) {
      spend += +row.spend;
      clk += +row.clicks;
      impr += +row.impressions;
      lpv += actionLookup(row.actions, 'landing_page_view');
      lead += actionLookup(row.actions, 'lead') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_lead');
    }
    const ctr = impr > 0 ? ((clk / impr) * 100).toFixed(2) : '0';
    const cpc = clk > 0 ? (spend / clk).toFixed(2) : 'inf';
    const cpl = lead > 0 ? (spend / lead).toFixed(2) : 'inf';
    if (spend > 0) console.log(`  ${tag}  ${ad.name.slice(-32).padEnd(32)}  $${spend.toFixed(2)}  impr=${impr}  ctr=${ctr}%  cpc=$${cpc}  lpv=${lpv}  lead=${lead}  CPL=$${cpl}`);
  }
}

// ─── LPV campaign (now paused) — 30d trail ──────────────────────────────────
console.log('\n═══ Old LPV campaign 30d (now paused) ═══');
const lpvIns = await insights('campaign', LPV_CAMP, '2026-04-17', '2026-05-17');
let lpvT = { spend: 0, lpv: 0, lead: 0 };
for (const row of lpvIns.data ?? []) {
  lpvT.spend += +row.spend;
  lpvT.lpv += actionLookup(row.actions, 'landing_page_view');
  lpvT.lead += actionLookup(row.actions, 'lead');
}
console.log(`  LPV camp 30d:  $${lpvT.spend.toFixed(2)}  lpv=${lpvT.lpv}  lead=${lpvT.lead}`);

// ─── Lead campaign trend (Pixel attribution per Meta) ───────────────────────
console.log('\n═══ Lead campaign 7d trend ═══');
const leadIns = await insights('campaign', LEAD_CAMP, '2026-05-10', '2026-05-17');
for (const row of leadIns.data ?? []) {
  const lpv = actionLookup(row.actions, 'landing_page_view');
  const lead = actionLookup(row.actions, 'lead') + actionLookup(row.actions, 'offsite_conversion.fb_pixel_lead');
  const sub = actionLookup(row.actions, 'subscribe');
  const purchase = actionLookup(row.actions, 'purchase');
  console.log(`  ${row.date_start}  $${row.spend}  impr=${row.impressions}  clk=${row.clicks}  lpv=${lpv}  lead=${lead}  sub=${sub}  purchase=${purchase}`);
}
