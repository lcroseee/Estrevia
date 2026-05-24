/**
 * Phase 3 — Build the structured numbers I need:
 *  - per-ad-set 7d AND 14d
 *  - country breakdown (EN ad set vs ES ad set countries delivering impressions)
 *  - frequency / CTR by ad
 *  - per-day account totals already in phase2; here derive EN vs ES daily for last 7d
 *  - EMQ via Pixel: count of dedup'd vs non-dedup'd events (CAPI Match Quality)
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';

dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env.meta', override: true });

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const META_PIXEL_ID = process.env.META_PIXEL_ID;
const acct = META_AD_ACCOUNT_ID.startsWith('act_')
  ? META_AD_ACCOUNT_ID
  : `act_${META_AD_ACCOUNT_ID}`;
const API = 'https://graph.facebook.com/v22.0';

const RAW = JSON.parse(
  readFileSync('tmp/audit-2026-05-24/meta-raw.json', 'utf8'),
);

async function fb(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API}${path}${sep}access_token=${encodeURIComponent(
    META_ACCESS_TOKEN,
  )}`;
  const r = await fetch(url);
  const text = await r.text();
  if (!r.ok) {
    return { error: { status: r.status, body: text.slice(0, 500) } };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: { parse: text.slice(0, 500) } };
  }
}

async function paged(path, max = 2000) {
  let url = path;
  const all = [];
  while (url && all.length < max) {
    const res = await fb(url);
    if (res.error) return { data: all, error: res.error };
    if (Array.isArray(res.data)) all.push(...res.data);
    const next = res.paging?.next;
    if (!next) break;
    url = next.replace(API, '');
  }
  return { data: all };
}

const today = new Date();
const isoDay = (d) => d.toISOString().slice(0, 10);
const since7 = isoDay(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));
const since14 = isoDay(new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000));
const until = isoDay(today);

const ATTR = encodeURIComponent(JSON.stringify(['7d_click', '1d_view']));

// Country breakdown 7d
console.log('[phase3] country breakdown 7d');
{
  const tr = encodeURIComponent(JSON.stringify({ since: since7, until }));
  const r = await paged(
    `/${acct}/insights?level=adset&time_range=${tr}&fields=adset_id,adset_name,spend,impressions,reach,actions&breakdowns=country&action_attribution_windows=${ATTR}&limit=500`,
  );
  RAW.countryBreakdown7d = r.data;
}

// Daily by ad set 7d (already done in phase2 for 14d - re-use)
// Pixel dedup: get Pixel-level event stats by event source
console.log('[phase3] pixel agg events 14d');
if (META_PIXEL_ID) {
  RAW.pixelStatsAggEvent = await fb(
    `/${META_PIXEL_ID}/stats?aggregation=event_source&start_time=${since14}T00:00:00Z&end_time=${until}T23:59:59Z`,
  );
  RAW.pixelStatsAggDeviceType = await fb(
    `/${META_PIXEL_ID}/stats?aggregation=device_type&start_time=${since14}T00:00:00Z&end_time=${until}T23:59:59Z`,
  );
  RAW.pixelStatsAggBrowserType = await fb(
    `/${META_PIXEL_ID}/stats?aggregation=browser_type&start_time=${since14}T00:00:00Z&end_time=${until}T23:59:59Z`,
  );
  RAW.pixelStatsAggEventDedup = await fb(
    `/${META_PIXEL_ID}/stats?aggregation=event_dedup_quality&start_time=${since14}T00:00:00Z&end_time=${until}T23:59:59Z`,
  );
  // The official Match Quality endpoint
  RAW.pixelMatchQuality = await fb(
    `/${META_PIXEL_ID}?fields=conversion_history{action_type,event_count,date}`,
  );
  // Try assigned_users + connected business + connection details
  RAW.pixelConfig = await fb(
    `/${META_PIXEL_ID}?fields=can_proxy,code,enable_automatic_matching,first_party_cookie_status,is_consolidated_container,is_created_by_business,is_crm,is_unavailable,is_mta_use,last_fired_time,name`,
  );
}

// Get image_hash on creatives for the new 2026-05-23 ads + creative title/body
const newAdIds = (RAW.ads || [])
  .filter((a) => Date.parse(a.created_time) >= Date.parse('2026-05-23T00:00:00Z'))
  .map((a) => a.id);
console.log('[phase3] new-ad creative bodies', newAdIds);
RAW.newAdsDetail = {};
for (const id of newAdIds) {
  RAW.newAdsDetail[id] = await fb(
    `/${id}?fields=name,status,effective_status,created_time,creative{id,name,object_story_spec,body,title,call_to_action_type,asset_feed_spec,thumbnail_url,image_url,effective_object_story_id}`,
  );
}

// Account: ad-review-related fields
console.log('[phase3] account ads-review state');
RAW.accountAdsState = await fb(
  `/${acct}?fields=ads_review_state,disable_reason,offsite_pixels_tos_accepted,line_numbers,is_personal,owner,disable_reason_payload`,
);

writeFileSync(
  'tmp/audit-2026-05-24/meta-raw.json',
  JSON.stringify(RAW, null, 2),
);

// --- printers ---
function sumAct(actions, ...types) {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (types.includes(a.action_type)) total += Number(a.value) || 0;
  }
  return total;
}

console.log('\n=== 7d COUNTRY BREAKDOWN BY ADSET ===');
const byAdsetCountry = {};
for (const r of RAW.countryBreakdown7d || []) {
  const k = r.adset_name || r.adset_id;
  if (!byAdsetCountry[k]) byAdsetCountry[k] = {};
  byAdsetCountry[k][r.country] = byAdsetCountry[k][r.country] || {
    spend: 0,
    impressions: 0,
    reach: 0,
    leads: 0,
    lpv: 0,
  };
  byAdsetCountry[k][r.country].spend += Number(r.spend) || 0;
  byAdsetCountry[k][r.country].impressions += Number(r.impressions) || 0;
  byAdsetCountry[k][r.country].reach += Number(r.reach) || 0;
  byAdsetCountry[k][r.country].leads += sumAct(
    r.actions,
    'lead',
    'offsite_conversion.fb_pixel_lead',
    'onsite_conversion.lead_grouped',
  );
  byAdsetCountry[k][r.country].lpv += sumAct(r.actions, 'landing_page_view');
}
for (const k of Object.keys(byAdsetCountry)) {
  console.log(`\n  ${k}:`);
  const entries = Object.entries(byAdsetCountry[k]).sort(
    (a, b) => b[1].spend - a[1].spend,
  );
  for (const [cc, s] of entries) {
    const cpl = s.leads ? s.spend / s.leads : 0;
    console.log(
      `    ${cc}: spend=$${s.spend.toFixed(2)} impr=${s.impressions} reach=${s.reach} lpv=${s.lpv} leads=${s.leads} cpl=${cpl ? '$' + cpl.toFixed(2) : '-'}`,
    );
  }
}

console.log('\n=== PIXEL AGG (event_source) ===');
console.log(JSON.stringify(RAW.pixelStatsAggEvent, null, 2));

console.log('\n=== PIXEL AGG (browser_type) ===');
console.log(JSON.stringify(RAW.pixelStatsAggBrowserType, null, 2));

console.log('\n=== NEW ADS (2026-05-23) detail ===');
for (const [id, d] of Object.entries(RAW.newAdsDetail)) {
  console.log(`\n  ${id} status=${d.effective_status} created=${d.created_time}`);
  const c = d.creative || {};
  console.log(`    creative_id=${c.id} title="${c.title}" body="${c.body}"`);
  const oss = c.object_story_spec || {};
  console.log(`    page_id=${oss.page_id} link_data=${JSON.stringify(oss.link_data, null, 2).slice(0, 300)}`);
}

console.log('\n=== ACCOUNT ADS STATE ===');
console.log(JSON.stringify(RAW.accountAdsState, null, 2));

console.log('\n[phase3] done');
