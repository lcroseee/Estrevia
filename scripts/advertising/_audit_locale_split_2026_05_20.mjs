// One-shot Meta insights: EN vs ES economics across full Lead-campaign run.
// 2026-05-17 (campaign activated) → 2026-05-20 (today).
import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const API = 'https://graph.facebook.com/v23.0';
const ACCT = process.env.META_AD_ACCOUNT_ID;
const LEAD_CAMP = '120243116761600527';
const EN_ADSET = '120243116854610527';
const ES_ADSET = '120243116822500527';
const FIELDS = 'spend,impressions,reach,clicks,inline_link_clicks,cpc,cpm,ctr,frequency,actions';

async function g(url) {
  const r = await fetch(url);
  if (!r.ok) {
    console.error('HTTP', r.status, await r.text());
    return null;
  }
  return r.json();
}

async function insights(id, since, until) {
  const params = `time_range={'since':'${since}','until':'${until}'}&fields=${FIELDS}&access_token=${TOKEN}`;
  return g(`${API}/${id}/insights?${params}`);
}

function pickAction(arr, type) {
  if (!Array.isArray(arr)) return 0;
  const found = arr.find((a) => a.action_type === type);
  return Number(found?.value ?? 0);
}

function summarize(rows) {
  let spend = 0, impr = 0, clk = 0, lpv = 0, lead = 0;
  for (const row of rows ?? []) {
    spend += +row.spend;
    impr += +row.impressions;
    clk += +row.clicks;
    lpv += pickAction(row.actions, 'landing_page_view');
    lead += pickAction(row.actions, 'lead') + pickAction(row.actions, 'offsite_conversion.fb_pixel_lead');
  }
  return { spend, impr, clk, lpv, lead };
}

function fmt(s) {
  return `spend=$${s.spend.toFixed(2)}  impr=${s.impr}  clk=${s.clk}  lpv=${s.lpv}  lead=${s.lead}  ` +
         `CTR=${s.impr ? ((s.clk / s.impr) * 100).toFixed(2) : 0}%  ` +
         `CPC=$${s.clk ? (s.spend / s.clk).toFixed(2) : 'inf'}  ` +
         `LPV-CVR=${s.clk ? ((s.lpv / s.clk) * 100).toFixed(1) : 0}%  ` +
         `Lead-CVR=${s.lpv ? ((s.lead / s.lpv) * 100).toFixed(1) : 0}%  ` +
         `CPL=$${s.lead ? (s.spend / s.lead).toFixed(2) : 'inf'}`;
}

const SINCE = '2026-05-13';   // Last 7d (covers full Lead-campaign run)
const UNTIL = '2026-05-20';   // Today

console.log(`\n═══ Account-level last 7d (${SINCE} → ${UNTIL}) ═══`);
const acct = await insights(ACCT, SINCE, UNTIL);
console.log(' ', fmt(summarize(acct?.data)));

console.log(`\n═══ Lead campaign last 7d ═══`);
const camp = await insights(LEAD_CAMP, SINCE, UNTIL);
console.log(' ', fmt(summarize(camp?.data)));

console.log(`\n═══ EN ad set (last 7d) ═══`);
const en = await insights(EN_ADSET, SINCE, UNTIL);
console.log(' ', fmt(summarize(en?.data)));

console.log(`\n═══ ES ad set (last 7d) ═══`);
const es = await insights(ES_ADSET, SINCE, UNTIL);
console.log(' ', fmt(summarize(es?.data)));

console.log(`\n═══ EN ad set (last 30d) ═══`);
const en30 = await insights(EN_ADSET, '2026-04-20', UNTIL);
console.log(' ', fmt(summarize(en30?.data)));

console.log(`\n═══ ES ad set (last 30d) ═══`);
const es30 = await insights(ES_ADSET, '2026-04-20', UNTIL);
console.log(' ', fmt(summarize(es30?.data)));

console.log(`\n═══ Daily breakdown last 7d by ad set ═══`);
for (const [tag, id] of [['EN', EN_ADSET], ['ES', ES_ADSET]]) {
  const daily = await insights(id, SINCE, UNTIL).then((r) => r?.data ?? []);
  // Re-fetch with time_increment=1
  const r = await fetch(`${API}/${id}/insights?time_range={'since':'${SINCE}','until':'${UNTIL}'}&time_increment=1&fields=${FIELDS}&access_token=${TOKEN}`);
  const j = await r.json();
  console.log(`  ── ${tag} ──`);
  for (const row of j.data ?? []) {
    const lead = pickAction(row.actions, 'lead') + pickAction(row.actions, 'offsite_conversion.fb_pixel_lead');
    const lpv = pickAction(row.actions, 'landing_page_view');
    const cpl = lead > 0 ? (Number(row.spend) / lead).toFixed(2) : '—';
    console.log(`    ${row.date_start}  spend=$${row.spend}  impr=${row.impressions}  clk=${row.clicks}  lpv=${lpv}  lead=${lead}  CPL=$${cpl}`);
  }
}

// Per-ad breakdown last 7d (creative ranking)
console.log(`\n═══ Per-ad last 7d ═══`);
for (const [tag, id] of [['EN', EN_ADSET], ['ES', ES_ADSET]]) {
  const ads = await g(`${API}/${id}/ads?fields=id,name,status&limit=50&access_token=${TOKEN}`);
  for (const ad of ads?.data ?? []) {
    const r = await insights(ad.id, SINCE, UNTIL);
    const s = summarize(r?.data);
    if (s.spend > 0) {
      console.log(`  ${tag}  ${ad.status.padEnd(8)}  ${ad.name.slice(-40).padEnd(40)}  ${fmt(s)}`);
    }
  }
}

console.log('\n— End audit —');
