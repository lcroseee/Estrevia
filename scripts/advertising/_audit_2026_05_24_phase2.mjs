/**
 * Phase 2 — slice the raw audit dump to answer the specific questions:
 *  - per-ad-set 7d vs 14d
 *  - per-ad creatives in EN (which of the 2026-05-23 ones are running)
 *  - per-day spend trend (was there a 2026-05-23 idempotency-fix inflection?)
 *  - locale split via campaign-name heuristics
 *  - country breakdown
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';

dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env.meta', override: true });

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
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
    url = next.replace(API, '');
  }
  return { data: all };
}

const today = new Date();
const isoDay = (d) => d.toISOString().slice(0, 10);
const since14 = isoDay(new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000));
const since30 = isoDay(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));
const until = isoDay(today);

const INSIGHT_FIELDS = [
  'date_start',
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
  'cost_per_action_type',
].join(',');
const ATTR = encodeURIComponent(JSON.stringify(['7d_click', '1d_view']));

// Daily account spend for last 30 days — to find 05-23 inflection
console.log('[phase2] daily account spend 30d');
{
  const tr = encodeURIComponent(JSON.stringify({ since: since30, until }));
  const r = await paged(
    `/${acct}/insights?level=account&time_range=${tr}&time_increment=1&fields=${INSIGHT_FIELDS}&action_attribution_windows=${ATTR}&limit=200`,
  );
  RAW.dailyAccount30d = r.data;
}

// Daily per-ad-set
console.log('[phase2] daily adset spend 14d');
{
  const tr = encodeURIComponent(JSON.stringify({ since: since14, until }));
  const r = await paged(
    `/${acct}/insights?level=adset&time_range=${tr}&time_increment=1&fields=${INSIGHT_FIELDS}&action_attribution_windows=${ATTR}&limit=500`,
  );
  RAW.dailyAdset14d = r.data;
}

// Per-ad insights 14d
console.log('[phase2] per-ad insights 14d');
{
  const tr = encodeURIComponent(JSON.stringify({ since: since14, until }));
  const r = await paged(
    `/${acct}/insights?level=ad&time_range=${tr}&fields=${INSIGHT_FIELDS}&action_attribution_windows=${ATTR}&limit=500`,
  );
  RAW.adInsights14d = r.data;
}

// adactivity for the active ad set — to see config-changes around 05-23
console.log('[phase2] activities for active ad set');
RAW.adsetActivity = await fb(
  `/${acct}/activities?since=${since30}&until=${until}&category=AD_SET&limit=200`,
);

// adsets ACTIVE-OR-PAUSED detailed
console.log('[phase2] adsets ALL (any status)');
{
  const r = await paged(
    `/${acct}/adsets?fields=id,name,status,effective_status,configured_status,optimization_goal,billing_event,daily_budget,lifetime_budget,campaign_id,start_time,end_time,targeting&limit=300&filtering=[]`,
  );
  RAW.allAdsets = r.data;
}

writeFileSync(
  'tmp/audit-2026-05-24/meta-raw.json',
  JSON.stringify(RAW, null, 2),
);

// Print key things
function sumAct(actions, ...types) {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (types.includes(a.action_type)) total += Number(a.value) || 0;
  }
  return total;
}

console.log('\n=== DAILY ACCOUNT SPEND 30d ===');
const daily = (RAW.dailyAccount30d || []).sort((a, b) =>
  a.date_start.localeCompare(b.date_start),
);
for (const r of daily) {
  const leads = sumAct(
    r.actions,
    'lead',
    'offsite_conversion.fb_pixel_lead',
    'onsite_conversion.lead_grouped',
  );
  const ic = sumAct(
    r.actions,
    'initiate_checkout',
    'offsite_conversion.fb_pixel_initiate_checkout',
  );
  const lpv = sumAct(r.actions, 'landing_page_view');
  const purch = sumAct(
    r.actions,
    'purchase',
    'offsite_conversion.fb_pixel_purchase',
  );
  console.log(
    `  ${r.date_start}: $${Number(r.spend).toFixed(2)}  impr=${r.impressions}  lpv=${lpv}  leads=${leads}  ic=${ic}  purch=${purch}`,
  );
}

console.log('\n=== ADSET DAILY 14d ===');
const dailyByAdset = {};
for (const r of RAW.dailyAdset14d || []) {
  const k = r.adset_name || r.adset_id;
  if (!dailyByAdset[k]) dailyByAdset[k] = [];
  dailyByAdset[k].push(r);
}
for (const k of Object.keys(dailyByAdset)) {
  console.log(`\n  ${k}:`);
  const sorted = dailyByAdset[k].sort((a, b) =>
    a.date_start.localeCompare(b.date_start),
  );
  for (const r of sorted) {
    const leads = sumAct(
      r.actions,
      'lead',
      'offsite_conversion.fb_pixel_lead',
      'onsite_conversion.lead_grouped',
    );
    const ic = sumAct(
      r.actions,
      'initiate_checkout',
      'offsite_conversion.fb_pixel_initiate_checkout',
    );
    const lpv = sumAct(r.actions, 'landing_page_view');
    console.log(
      `    ${r.date_start}: $${Number(r.spend).toFixed(2)}  impr=${r.impressions}  lpv=${lpv}  leads=${leads}  ic=${ic}`,
    );
  }
}

console.log('\n=== ADS 14d (per-ad) ===');
const adInsights = RAW.adInsights14d || [];
for (const r of adInsights.sort(
  (a, b) => Number(b.spend) - Number(a.spend),
)) {
  const leads = sumAct(
    r.actions,
    'lead',
    'offsite_conversion.fb_pixel_lead',
    'onsite_conversion.lead_grouped',
  );
  const ic = sumAct(
    r.actions,
    'initiate_checkout',
    'offsite_conversion.fb_pixel_initiate_checkout',
  );
  const lpv = sumAct(r.actions, 'landing_page_view');
  console.log(
    `  ${r.ad_name} (${r.ad_id}) adset=${r.adset_name}\n    spend=$${Number(r.spend).toFixed(2)} impr=${r.impressions} freq=${r.frequency} ctr=${r.ctr}% link_ctr=${r.inline_link_click_ctr}% lpv=${lpv} leads=${leads} ic=${ic}`,
  );
}

console.log('\n=== ALL ADSETS (status) ===');
for (const a of RAW.allAdsets || []) {
  console.log(
    `  ${a.name} id=${a.id} eff=${a.effective_status} cfg=${a.configured_status} goal=${a.optimization_goal} bill=${a.billing_event} daily=${a.daily_budget ? '$' + (Number(a.daily_budget) / 100).toFixed(2) : '-'} start=${a.start_time?.slice(0, 10)} end=${a.end_time?.slice(0, 10)}`,
  );
}

console.log('\n=== ADSET ACTIVITY (last 30d) ===');
for (const ev of (RAW.adsetActivity?.data || []).slice(0, 50)) {
  console.log(
    `  ${ev.event_time}  ${ev.event_type}  ${ev.object_name || ev.object_id}: ${ev.extra_data?.slice(0, 200) || ''}`,
  );
}

console.log('\n[phase2] done');
