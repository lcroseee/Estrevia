// Meta audit — 2026-05-23
// Comprehensive 48h/7d/14d snapshot for follow-up traffic audit vs 2026-05-21 14:29 UTC baseline.
// READ-ONLY: only ads_get_* / ads_insights_* equivalents (no mutations).

import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACT = process.env.META_AD_ACCOUNT_ID || 'act_1435842067150024';
const VER = 'v23.0';

if (!TOKEN) {
  console.log('META_ACCESS_TOKEN missing — abort');
  process.exit(1);
}

async function fb(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${VER}/${path}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const r = await fetch(url);
  if (!r.ok) {
    const txt = await r.text();
    console.log(`  WARN ${path} -> ${r.status} ${txt.slice(0, 200)}`);
    return { data: [] };
  }
  return r.json();
}

const day = (n) => new Date(Date.now() - n * 86400 * 1000).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);

// ============================================================
// 0. SNAPSHOT TIMESTAMP
// ============================================================
console.log('===============================================================');
console.log('  META TRAFFIC AUDIT  —  2026-05-23');
console.log(`  Run at: ${new Date().toISOString()}`);
console.log(`  Account: ${ACT}`);
console.log('===============================================================\n');

// ============================================================
// A. ACCOUNT-LEVEL INSIGHTS — 48h, 7d, 14d
// ============================================================
console.log('=== A. ACCOUNT-LEVEL — 3 windows ===');
const acctFields = 'spend,impressions,clicks,reach,frequency,actions,cost_per_action_type,cpm,cpc,ctr';
for (const [label, since, until] of [
  ['Last 48h', day(2), today],
  ['Last 7d', day(7), today],
  ['Last 14d', day(14), today],
]) {
  const r = (await fb(`${ACT}/insights`, {
    time_range: { since, until },
    fields: acctFields,
    level: 'account',
  })).data?.[0];
  if (!r) {
    console.log(`  ${label}: (no data)`);
    continue;
  }
  const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || '0';
  const cplA = (r.cost_per_action_type || []).find(a => a.action_type === 'lead')?.value;
  console.log(`  ${label.padEnd(10)} spend=$${r.spend} impr=${r.impressions} clicks=${r.clicks} reach=${r.reach}`);
  console.log(`             CTR=${r.ctr}% CPM=$${r.cpm} CPC=$${r.cpc} freq=${r.frequency}`);
  console.log(`             leads=${leads}  CPL=${cplA ? `$${cplA}` : 'N/A'}`);
  // Surface all action types for context (small list — easy to scan)
  const types = (r.actions || []).map(a => `${a.action_type}=${a.value}`).join(', ');
  console.log(`             actions: ${types}`);
  console.log('');
}

// ============================================================
// B. AD-SET BREAKDOWN — 48h vs 7d vs 14d
// ============================================================
console.log('=== B. AD-SET — 3 windows ===');
const adsetFields = 'adset_id,adset_name,campaign_name,spend,impressions,clicks,reach,frequency,actions,cost_per_action_type,ctr,cpm';
for (const [label, since, until] of [
  ['Last 48h', day(2), today],
  ['Last 7d', day(7), today],
  ['Last 14d', day(14), today],
]) {
  console.log(`\n  -- ${label} --`);
  const ins = await fb(`${ACT}/insights`, {
    time_range: { since, until },
    fields: adsetFields,
    level: 'adset',
    limit: 50,
  });
  for (const r of (ins.data || []).sort((a, b) => Number(b.spend) - Number(a.spend))) {
    const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || '0';
    const cplA = (r.cost_per_action_type || []).find(a => a.action_type === 'lead')?.value;
    console.log(`    ${(r.adset_name || '').slice(0, 32).padEnd(32)} spend=$${Number(r.spend).toFixed(2).padStart(7)} impr=${String(r.impressions).padStart(6)} CTR=${Number(r.ctr).toFixed(2)}% CPM=$${Number(r.cpm).toFixed(2)} freq=${Number(r.frequency).toFixed(2)} leads=${leads} CPL=${cplA ? `$${Number(cplA).toFixed(2)}` : '-'}`);
  }
}

// ============================================================
// C. AD-SET STATUS  (must be cached — show effective_status + budget + age)
// ============================================================
console.log('\n=== C. AD-SET STATUS / RUN DAYS ===');
const adsets = await fb(`${ACT}/adsets`, {
  fields: 'id,name,status,effective_status,daily_budget,optimization_goal,billing_event,destination_type,created_time,start_time,campaign{name}',
  limit: 50,
});
for (const a of (adsets.data || [])) {
  const created = new Date(a.created_time);
  const daysOld = ((Date.now() - created.getTime()) / 86400000).toFixed(1);
  const budget = a.daily_budget ? `$${(a.daily_budget / 100).toFixed(2)}/d` : 'no daily';
  console.log(`  ${(a.name || '').slice(0, 32).padEnd(32)} ${a.effective_status.padEnd(18)} ${budget.padEnd(12)} opt=${a.optimization_goal} dest=${a.destination_type} age=${daysOld}d`);
}

// ============================================================
// D. AD-LEVEL (creative) — 7d + 14d
// ============================================================
console.log('\n=== D. AD-LEVEL — 7d ===');
const adFields = 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpm,reach,frequency,actions,cost_per_action_type';
{
  const ins = await fb(`${ACT}/insights`, {
    time_range: { since: day(7), until: today },
    level: 'ad',
    fields: adFields,
    limit: 100,
  });
  for (const r of (ins.data || []).sort((a, b) => Number(b.spend) - Number(a.spend))) {
    const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || 0;
    const lpv = (r.actions || []).find(a => a.action_type === 'landing_page_view')?.value || 0;
    const cpl = leads > 0 ? (Number(r.spend) / Number(leads)).toFixed(2) : '-';
    console.log(`    ${(r.ad_name || '').slice(0, 36).padEnd(36)} spend=$${Number(r.spend).toFixed(2).padStart(7)} impr=${String(r.impressions).padStart(6)} CTR=${Number(r.ctr).toFixed(2)}% freq=${Number(r.frequency).toFixed(2)} LPV=${lpv} leads=${leads} CPL=$${cpl}  adset="${(r.adset_name || '').slice(0, 24)}"`);
  }
}

console.log('\n=== D. AD-LEVEL — 14d ===');
{
  const ins = await fb(`${ACT}/insights`, {
    time_range: { since: day(14), until: today },
    level: 'ad',
    fields: adFields,
    limit: 100,
  });
  for (const r of (ins.data || []).sort((a, b) => Number(b.spend) - Number(a.spend))) {
    const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || 0;
    const lpv = (r.actions || []).find(a => a.action_type === 'landing_page_view')?.value || 0;
    const cpl = leads > 0 ? (Number(r.spend) / Number(leads)).toFixed(2) : '-';
    console.log(`    ${(r.ad_name || '').slice(0, 36).padEnd(36)} spend=$${Number(r.spend).toFixed(2).padStart(7)} impr=${String(r.impressions).padStart(6)} CTR=${Number(r.ctr).toFixed(2)}% freq=${Number(r.frequency).toFixed(2)} LPV=${lpv} leads=${leads} CPL=$${cpl}`);
  }
}

// ============================================================
// E. AD CREATIVE NAME -> map to utm_content
// (Top 25 ads, decode object_story_spec link_data for URL)
// ============================================================
console.log('\n=== E. AD CREATIVE -> URL (decode utm_content) ===');
const adIns = await fb(`${ACT}/insights`, {
  time_range: { since: day(14), until: today },
  level: 'ad',
  fields: 'ad_id,ad_name,spend',
  limit: 100,
});
const ad_ids = (adIns.data || []).sort((a, b) => Number(b.spend) - Number(a.spend)).slice(0, 25).map(r => r.ad_id);
if (ad_ids.length > 0) {
  const cs = await fb(`?ids=${ad_ids.join(',')}`, {
    fields: 'creative{id,title,body,object_story_spec,name,thumbnail_url},name,effective_status',
  });
  for (const id of ad_ids) {
    const c = cs[id];
    if (!c) continue;
    const oss = c.creative?.object_story_spec || {};
    const linkData = oss.link_data || oss.video_data || {};
    const url = linkData.link || linkData.call_to_action?.value?.link || '(no link)';
    const utm = url.match(/utm_content=([^&]+)/)?.[1];
    console.log(`    ${c.name.slice(0, 44).padEnd(44)} ${c.effective_status.padEnd(20)}  utm_content=${utm || '-'}`);
  }
}

// ============================================================
// F. PLACEMENT — 7d  (audience_network breakdown)
// ============================================================
console.log('\n=== F. PLACEMENT — last 7d ===');
const placements = await fb(`${ACT}/insights`, {
  time_range: { since: day(7), until: today },
  level: 'account',
  fields: 'spend,impressions,clicks,ctr,cpm,actions,cost_per_action_type',
  breakdowns: 'publisher_platform,platform_position',
});
for (const p of (placements.data || []).sort((a, b) => Number(b.spend) - Number(a.spend))) {
  const leads = (p.actions || []).find(a => a.action_type === 'lead')?.value || 0;
  const cpl = leads > 0 ? (Number(p.spend) / Number(leads)).toFixed(2) : '-';
  console.log(`    ${(p.publisher_platform + '/' + p.platform_position).padEnd(40)} spend=$${Number(p.spend).toFixed(2).padStart(7)} impr=${String(p.impressions).padStart(6)} CTR=${Number(p.ctr).toFixed(2)}% leads=${leads} CPL=$${cpl}`);
}

// ============================================================
// G. GEOGRAPHY — 7d
// ============================================================
console.log('\n=== G. GEOGRAPHY — last 7d ===');
const country = await fb(`${ACT}/insights`, {
  time_range: { since: day(7), until: today },
  fields: 'spend,impressions,clicks,actions,cpm,ctr',
  breakdowns: 'country',
  level: 'account',
  limit: 30,
});
for (const r of (country.data || []).sort((a, b) => Number(b.spend) - Number(a.spend)).slice(0, 18)) {
  const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || 0;
  const cpl = leads > 0 ? (Number(r.spend) / Number(leads)).toFixed(2) : '-';
  console.log(`    ${r.country}  spend=$${Number(r.spend).toFixed(2).padStart(7)} impr=${String(r.impressions).padStart(6)} CTR=${Number(r.ctr).toFixed(2)}% CPM=$${Number(r.cpm).toFixed(2)} leads=${leads} CPL=$${cpl}`);
}

// ============================================================
// H. AGE + GENDER — 7d
// ============================================================
console.log('\n=== H. AGE + GENDER — last 7d ===');
const ageGender = await fb(`${ACT}/insights`, {
  time_range: { since: day(7), until: today },
  fields: 'spend,impressions,clicks,actions,ctr',
  breakdowns: 'age,gender',
  level: 'account',
  limit: 60,
});
for (const r of (ageGender.data || []).sort((a, b) => Number(b.spend) - Number(a.spend))) {
  const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || 0;
  const cpl = leads > 0 ? (Number(r.spend) / Number(leads)).toFixed(2) : '-';
  console.log(`    age=${r.age} gender=${r.gender}  spend=$${Number(r.spend).toFixed(2).padStart(7)} impr=${String(r.impressions).padStart(6)} CTR=${Number(r.ctr).toFixed(2)}% leads=${leads} CPL=$${cpl}`);
}

// ============================================================
// I. HOURLY — 7d
// ============================================================
console.log('\n=== I. HOURLY (advertiser TZ) — last 7d ===');
const hours = await fb(`${ACT}/insights`, {
  time_range: { since: day(7), until: today },
  fields: 'spend,impressions,clicks,actions',
  breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
  level: 'account',
});
for (const h of (hours.data || []).sort((a, b) => a.hourly_stats_aggregated_by_advertiser_time_zone.localeCompare(b.hourly_stats_aggregated_by_advertiser_time_zone))) {
  const leads = (h.actions || []).find(a => a.action_type === 'lead')?.value || 0;
  const spend = Number(h.spend);
  const bar = '#'.repeat(Math.min(Math.round(spend), 20));
  const ratio = spend > 0 ? (leads / spend).toFixed(2) : '0';
  console.log(`    ${h.hourly_stats_aggregated_by_advertiser_time_zone}  ${bar.padEnd(20)} $${spend.toFixed(2).padStart(7)} leads=${leads} L/$=${ratio}`);
}

// ============================================================
// J. DEVICE — 7d
// ============================================================
console.log('\n=== J. DEVICE — last 7d ===');
const devices = await fb(`${ACT}/insights`, {
  time_range: { since: day(7), until: today },
  level: 'account',
  fields: 'spend,impressions,clicks,ctr,cpm,actions',
  breakdowns: 'device_platform',
});
for (const d of (devices.data || []).sort((a, b) => Number(b.spend) - Number(a.spend))) {
  const leads = (d.actions || []).find(a => a.action_type === 'lead')?.value || 0;
  const cpl = leads > 0 ? (Number(d.spend) / Number(leads)).toFixed(2) : '-';
  console.log(`    ${d.device_platform.padEnd(15)} spend=$${Number(d.spend).toFixed(2).padStart(7)} impr=${String(d.impressions).padStart(6)} CTR=${Number(d.ctr).toFixed(2)}% leads=${leads} CPL=$${cpl}`);
}

// ============================================================
// K. AD-SET FREQUENCY — 14d (saturation check)
// ============================================================
console.log('\n=== K. AD-SET FREQUENCY — last 14d (saturation) ===');
{
  const ins = await fb(`${ACT}/insights`, {
    time_range: { since: day(14), until: today },
    level: 'adset',
    fields: 'adset_id,adset_name,impressions,reach,frequency,spend',
    limit: 50,
  });
  for (const r of (ins.data || []).sort((a, b) => Number(b.frequency) - Number(a.frequency))) {
    const flag = Number(r.frequency) >= 2.0 ? '  >> SATURATION' : Number(r.frequency) >= 1.5 ? '  > approaching' : '';
    console.log(`    ${(r.adset_name || '').slice(0, 32).padEnd(32)} freq=${Number(r.frequency).toFixed(2)}  reach=${r.reach}  impr=${r.impressions}  spend=$${r.spend}${flag}`);
  }
}

// ============================================================
// L. DAILY TIME-SERIES — 14d (trend visibility)
// ============================================================
console.log('\n=== L. DAILY SPEND + LEADS — 14d ===');
{
  const ins = await fb(`${ACT}/insights`, {
    time_range: { since: day(14), until: today },
    level: 'account',
    fields: 'spend,impressions,clicks,actions,cpm,ctr',
    time_increment: 1,
    limit: 100,
  });
  for (const r of (ins.data || []).sort((a, b) => a.date_start.localeCompare(b.date_start))) {
    const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || 0;
    const cpl = leads > 0 ? (Number(r.spend) / Number(leads)).toFixed(2) : '-';
    console.log(`    ${r.date_start}  spend=$${Number(r.spend).toFixed(2).padStart(7)} impr=${String(r.impressions).padStart(6)} CTR=${Number(r.ctr).toFixed(2)}% leads=${String(leads).padStart(3)} CPL=$${cpl}`);
  }
}

console.log('\n=== AUDIT COMPLETE ===');
