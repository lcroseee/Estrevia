/**
 * READ-ONLY Meta Ads audit for 2026-05-24.
 *
 * Pulls:
 *  - Account-level + ad-set-level insights for 7d AND 14d windows
 *  - Ad-level insights with creative info (to find creatives added after 2026-05-23)
 *  - Ad-set targeting JSON (to verify 2026-05-23 hygiene stuck)
 *  - Account funding/status, disapproval rate
 *  - Pixel event activity (last received Lead, dedup signal)
 *
 * Writes a JSON dump to tmp/audit-2026-05-24/meta-raw.json so we can re-analyze
 * without re-fetching, then prints a human summary on stdout.
 *
 * Usage: node scripts/advertising/_audit_2026_05_24.mjs
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';

dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env.meta', override: true });

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const META_PIXEL_ID = process.env.META_PIXEL_ID;

if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
  console.error('Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID');
  process.exit(1);
}

const API = 'https://graph.facebook.com/v22.0';
const acct = META_AD_ACCOUNT_ID.startsWith('act_')
  ? META_AD_ACCOUNT_ID
  : `act_${META_AD_ACCOUNT_ID}`;

const today = new Date();
const isoDay = (d) => d.toISOString().slice(0, 10);
const since7 = isoDay(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));
const since14 = isoDay(new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000));
const until = isoDay(today);

console.log(`[audit] acct=${acct} pixel=${META_PIXEL_ID} until=${until}`);

async function fb(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API}${path}${sep}access_token=${encodeURIComponent(
    META_ACCESS_TOKEN,
  )}`;
  const r = await fetch(url);
  const text = await r.text();
  if (!r.ok) {
    console.error(`HTTP ${r.status} ${path}: ${text.slice(0, 300)}`);
    return { error: { status: r.status, body: text.slice(0, 300) } };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: { parse: text.slice(0, 300) } };
  }
}

async function paged(path, max = 1000) {
  let url = path;
  const all = [];
  while (url && all.length < max) {
    const res = await fb(url);
    if (res.error) return { data: all, error: res.error };
    if (Array.isArray(res.data)) all.push(...res.data);
    const next = res.paging?.next;
    if (!next) break;
    // strip the host because fb() prepends API
    url = next.replace(API, '');
  }
  return { data: all };
}

const INSIGHT_FIELDS = [
  'account_id',
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'spend',
  'impressions',
  'reach',
  'frequency',
  'clicks',
  'inline_link_clicks',
  'ctr',
  'inline_link_click_ctr',
  'cpm',
  'cpc',
  'actions',
  'action_values',
  'cost_per_action_type',
].join(',');

const ATTR = encodeURIComponent(JSON.stringify(['7d_click', '1d_view']));

async function insights(level, since) {
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  // separated locale fields are returned via `breakdowns`
  const res = await paged(
    `/${acct}/insights?level=${level}&time_range=${tr}&fields=${INSIGHT_FIELDS}&action_attribution_windows=${ATTR}&limit=200`,
  );
  return res.data;
}

const RAW = {};

console.log('[audit] fetching account-level insights 7d/14d');
RAW.accountInsights7d = await insights('account', since7);
RAW.accountInsights14d = await insights('account', since14);

console.log('[audit] fetching campaign-level insights 7d/14d');
RAW.campaignInsights7d = await insights('campaign', since7);
RAW.campaignInsights14d = await insights('campaign', since14);

console.log('[audit] fetching adset-level insights 7d/14d');
RAW.adsetInsights7d = await insights('adset', since7);
RAW.adsetInsights14d = await insights('adset', since14);

console.log('[audit] fetching ad-level insights 7d');
RAW.adInsights7d = await insights('ad', since7);

console.log('[audit] fetching campaigns');
const camps = await paged(
  `/${acct}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget,buying_type,special_ad_categories,start_time,stop_time,issues_info&limit=100`,
);
RAW.campaigns = camps.data;

console.log('[audit] fetching adsets');
const adsets = await paged(
  `/${acct}/adsets?fields=id,name,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget,campaign_id,start_time,end_time,targeting,attribution_spec,destination_type,is_dynamic_creative,issues_info,promoted_object&limit=200`,
);
RAW.adsets = adsets.data;

console.log('[audit] fetching ads');
const ads = await paged(
  `/${acct}/ads?fields=id,name,status,effective_status,adset_id,creative{id,name,object_story_spec,asset_feed_spec,thumbnail_url,effective_object_story_id,instagram_actor_id},configured_status,created_time,updated_time,issues_info&limit=300`,
);
RAW.ads = ads.data;

console.log('[audit] fetching account-level info');
RAW.account = await fb(
  `/${acct}?fields=id,name,account_status,disable_reason,balance,amount_spent,currency,timezone_name,funding_source,funding_source_details,spend_cap,business_country_code,age,owner,capabilities,tos_accepted,end_advertiser,end_advertiser_name`,
);

console.log('[audit] fetching account-level delivery issues');
RAW.accountIssues = await fb(
  `/${acct}?fields=adtrust_dsl{min_daily_budget,currency},user_role,users_can_create_lead_gen_forms,is_prepay_account,is_personal,offsite_pixels_tos_accepted`,
);

if (META_PIXEL_ID) {
  console.log('[audit] fetching pixel info');
  RAW.pixel = await fb(
    `/${META_PIXEL_ID}?fields=id,name,last_fired_time,is_unavailable,creation_time,enable_automatic_matching,automatic_matching_fields,event_stats{count,event}`,
  );

  // events per day for last 14d (Pixel Stats API)
  RAW.pixelStats14d = await fb(
    `/${META_PIXEL_ID}/stats?aggregation=event&start_time=${since14}T00:00:00Z&end_time=${until}T23:59:59Z`,
  );
  RAW.pixelStats7d = await fb(
    `/${META_PIXEL_ID}/stats?aggregation=event&start_time=${since7}T00:00:00Z&end_time=${until}T23:59:59Z`,
  );
}

// Locale breakdown — Meta does not surface user-locale, but we can do
// publisher_platform + country.
console.log('[audit] fetching country breakdown 14d');
{
  const tr = encodeURIComponent(JSON.stringify({ since: since14, until }));
  RAW.countryBreakdown14d = await paged(
    `/${acct}/insights?level=adset&time_range=${tr}&fields=adset_id,adset_name,spend,impressions,reach,actions&breakdowns=country&action_attribution_windows=${ATTR}&limit=500`,
  );
}

console.log('[audit] fetching platform breakdown 14d');
{
  const tr = encodeURIComponent(JSON.stringify({ since: since14, until }));
  RAW.platformBreakdown14d = await paged(
    `/${acct}/insights?level=adset&time_range=${tr}&fields=adset_id,adset_name,spend,impressions,reach&breakdowns=publisher_platform&limit=500`,
  );
}

mkdirSync('tmp/audit-2026-05-24', { recursive: true });
writeFileSync(
  'tmp/audit-2026-05-24/meta-raw.json',
  JSON.stringify(RAW, null, 2),
);
console.log(
  '[audit] wrote tmp/audit-2026-05-24/meta-raw.json (',
  JSON.stringify(RAW).length.toLocaleString(),
  'bytes)',
);

// ---------- Summary -----------------------------------------------------
function sumAct(actions, ...types) {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (types.includes(a.action_type)) total += Number(a.value) || 0;
  }
  return total;
}

function summariseInsight(rows) {
  let spend = 0,
    impressions = 0,
    reach = 0,
    clicks = 0,
    linkClicks = 0,
    leads = 0,
    purchases = 0,
    initCheckouts = 0,
    lpv = 0;
  let freqSum = 0,
    freqW = 0;
  for (const r of rows || []) {
    spend += Number(r.spend) || 0;
    impressions += Number(r.impressions) || 0;
    reach += Number(r.reach) || 0;
    clicks += Number(r.clicks) || 0;
    linkClicks += Number(r.inline_link_clicks) || 0;
    leads += sumAct(
      r.actions,
      'lead',
      'offsite_conversion.fb_pixel_lead',
      'onsite_conversion.lead_grouped',
    );
    purchases += sumAct(
      r.actions,
      'purchase',
      'offsite_conversion.fb_pixel_purchase',
      'web_in_store_purchase',
    );
    initCheckouts += sumAct(
      r.actions,
      'initiate_checkout',
      'offsite_conversion.fb_pixel_initiate_checkout',
    );
    lpv += sumAct(r.actions, 'landing_page_view');
    const f = Number(r.frequency);
    const i = Number(r.impressions);
    if (Number.isFinite(f) && Number.isFinite(i) && i > 0) {
      freqSum += f * i;
      freqW += i;
    }
  }
  const ctr = impressions ? (clicks / impressions) * 100 : 0;
  const linkCtr = impressions ? (linkClicks / impressions) * 100 : 0;
  const cpm = impressions ? (spend / impressions) * 1000 : 0;
  const cpl = leads ? spend / leads : 0;
  const cpic = initCheckouts ? spend / initCheckouts : 0;
  const cpa = purchases ? spend / purchases : 0;
  const cppurchase = purchases ? spend / purchases : 0;
  const frequency = freqW ? freqSum / freqW : 0;
  return {
    spend,
    impressions,
    reach,
    clicks,
    linkClicks,
    ctr,
    linkCtr,
    cpm,
    leads,
    purchases,
    initCheckouts,
    lpv,
    cpl,
    cpic,
    cpa,
    cppurchase,
    frequency,
  };
}

console.log('\n=== ACCOUNT TOTALS ===');
console.log('7d:', summariseInsight(RAW.accountInsights7d));
console.log('14d:', summariseInsight(RAW.accountInsights14d));

console.log('\n=== CAMPAIGN-LEVEL 14d ===');
for (const r of RAW.campaignInsights14d || []) {
  const s = summariseInsight([r]);
  console.log(
    `  ${r.campaign_name} (${r.campaign_id}): spend=$${s.spend.toFixed(2)} leads=${s.leads} ic=${s.initCheckouts} lpv=${s.lpv} purch=${s.purchases} freq=${s.frequency.toFixed(2)}`,
  );
}

console.log('\n=== ADSET-LEVEL 14d ===');
for (const r of RAW.adsetInsights14d || []) {
  const s = summariseInsight([r]);
  console.log(
    `  ${r.adset_name} (${r.adset_id}): spend=$${s.spend.toFixed(2)} leads=${s.leads} ic=${s.initCheckouts} lpv=${s.lpv} purch=${s.purchases} freq=${s.frequency.toFixed(2)}`,
  );
}

console.log('\n=== ACTIVE ADSETS ===');
const activeAdsets = (RAW.adsets || []).filter(
  (a) => a.effective_status === 'ACTIVE',
);
for (const a of activeAdsets) {
  const t = a.targeting || {};
  console.log(
    `  ${a.name} id=${a.id} goal=${a.optimization_goal} bill=${a.billing_event} daily=${a.daily_budget ? '$' + (Number(a.daily_budget) / 100).toFixed(2) : a.lifetime_budget ? 'LIFETIME $' + (Number(a.lifetime_budget) / 100).toFixed(2) : 'CBO'}`,
  );
  console.log(
    `      age=${t.age_min}..${t.age_max} pubs=${(t.publisher_platforms || []).join(',')} positions=${(t.facebook_positions || []).join(',')}|${(t.instagram_positions || []).join(',')}`,
  );
  console.log(
    `      countries=${(t.geo_locations?.countries || []).join(',') || '-'} excluded=${(t.excluded_geo_locations?.countries || []).join(',') || '-'}`,
  );
}

console.log('\n=== CREATED-AFTER-2026-05-23 ADS ===');
const cutoff = Date.parse('2026-05-23T00:00:00Z');
for (const ad of (RAW.ads || []).filter(
  (a) => Date.parse(a.created_time) >= cutoff,
)) {
  console.log(
    `  ${ad.name} id=${ad.id} created=${ad.created_time} status=${ad.effective_status} adset=${ad.adset_id}`,
  );
}

console.log('\n=== PIXEL ===');
if (RAW.pixel) {
  console.log(`  id=${RAW.pixel.id} name=${RAW.pixel.name}`);
  console.log(
    `  last_fired_time=${RAW.pixel.last_fired_time} is_unavailable=${RAW.pixel.is_unavailable}`,
  );
  if (RAW.pixel.event_stats) {
    for (const e of RAW.pixel.event_stats.data || RAW.pixel.event_stats || []) {
      console.log(`    ${e.event}=${e.count}`);
    }
  }
}

console.log('\n=== ACCOUNT ===');
console.log(
  `  status=${RAW.account?.account_status} disable_reason=${RAW.account?.disable_reason} balance=${RAW.account?.balance} spent=${RAW.account?.amount_spent} cur=${RAW.account?.currency}`,
);

console.log('\n[audit] done');
