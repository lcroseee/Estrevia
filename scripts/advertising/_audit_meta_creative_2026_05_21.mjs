// Meta creative-level audit — 2026-05-21
// Pulls ad-level insights: which creatives drive cheap leads, which fatigue, which are dead weight.

import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID; // e.g. act_1435842067150024
const VER = 'v23.0';

async function fb(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${VER}/${path}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  META CREATIVE-LEVEL AUDIT — 2026-05-21');
console.log('═══════════════════════════════════════════════════════════════\n');

// ───────── A. AD-LEVEL INSIGHTS — last 14d ─────────
console.log('═══ A. AD-LEVEL INSIGHTS — 14d ═══');
const ads = await fb(`${ACCOUNT_ID}/insights`, {
  date_preset: 'last_14d',
  level: 'ad',
  fields: 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpm,reach,frequency,actions,cost_per_action_type',
  limit: 100,
});
const rows = (ads.data || []).sort((a, b) => Number(b.spend) - Number(a.spend));

console.log(`  Total ads with data: ${rows.length}`);
console.log('');
for (const ad of rows) {
  const leads = (ad.actions || []).find(a => a.action_type === 'lead')?.value || 0;
  const cpl = leads > 0 ? (Number(ad.spend) / Number(leads)).toFixed(2) : '—';
  const lpv = (ad.actions || []).find(a => a.action_type === 'landing_page_view')?.value || 0;
  console.log(`  ${ad.ad_name.slice(0, 70).padEnd(70)}`);
  console.log(`    spend=$${Number(ad.spend).toFixed(2).padStart(7)} CTR=${Number(ad.ctr).toFixed(2)}% CPM=$${Number(ad.cpm).toFixed(2)} freq=${Number(ad.frequency).toFixed(2)}`);
  console.log(`    impr=${ad.impressions} clicks=${ad.clicks} LPV=${lpv} leads=${leads} CPL=$${cpl}`);
  console.log(`    adset="${ad.adset_name.slice(0, 50)}"`);
  console.log('');
}

// ───────── B. AD-LEVEL CREATIVE THUMBS ─────────
console.log('═══ B. AD CREATIVE — name decode ═══');
const ad_ids = rows.slice(0, 25).map(r => r.ad_id);
if (ad_ids.length > 0) {
  const creatives = await fb(`?ids=${ad_ids.join(',')}`, {
    fields: 'creative{id,title,body,object_story_spec,name},name,effective_status',
  });
  for (const id of ad_ids) {
    const c = creatives[id];
    if (!c) continue;
    const status = c.effective_status;
    const creative = c.creative || {};
    const oss = creative.object_story_spec || {};
    const linkData = oss.link_data || oss.video_data || {};
    const title = creative.title || linkData.title || '(no title)';
    const body = creative.body || linkData.message || '(no body)';
    console.log(`  ${c.name.slice(0, 60).padEnd(60)} status=${status}`);
    console.log(`    title="${title.slice(0, 80)}"`);
    console.log(`    body="${body.slice(0, 120).replace(/\n/g, ' ')}"`);
    console.log('');
  }
}

// ───────── C. PLACEMENT BREAKDOWN — 7d ─────────
console.log('═══ C. PLACEMENT BREAKDOWN — last 7d ═══');
const placements = await fb(`${ACCOUNT_ID}/insights`, {
  date_preset: 'last_7d',
  level: 'account',
  fields: 'spend,impressions,clicks,ctr,cpm,actions,cost_per_action_type',
  breakdowns: 'publisher_platform,platform_position',
});
for (const p of (placements.data || []).sort((a, b) => Number(b.spend) - Number(a.spend))) {
  const leads = (p.actions || []).find(a => a.action_type === 'lead')?.value || 0;
  const cpl = leads > 0 ? (Number(p.spend) / Number(leads)).toFixed(2) : '—';
  console.log(`  ${(p.publisher_platform + '/' + p.platform_position).padEnd(40)} spend=$${Number(p.spend).toFixed(2).padStart(7)} CTR=${Number(p.ctr).toFixed(2)}% leads=${leads} CPL=$${cpl}`);
}

// ───────── D. DEVICE BREAKDOWN — 7d ─────────
console.log('\n═══ D. DEVICE PLATFORM — last 7d ═══');
const devices = await fb(`${ACCOUNT_ID}/insights`, {
  date_preset: 'last_7d',
  level: 'account',
  fields: 'spend,impressions,clicks,ctr,cpm,actions',
  breakdowns: 'device_platform',
});
for (const d of (devices.data || []).sort((a, b) => Number(b.spend) - Number(a.spend))) {
  const leads = (d.actions || []).find(a => a.action_type === 'lead')?.value || 0;
  const cpl = leads > 0 ? (Number(d.spend) / Number(leads)).toFixed(2) : '—';
  console.log(`  ${d.device_platform.padEnd(15)} spend=$${Number(d.spend).toFixed(2).padStart(7)} CTR=${Number(d.ctr).toFixed(2)}% leads=${leads} CPL=$${cpl}`);
}

// ───────── E. HOURLY BREAKDOWN — 7d (best time of day) ─────────
console.log('\n═══ E. HOURLY (advertiser TZ) — last 7d ═══');
const hours = await fb(`${ACCOUNT_ID}/insights`, {
  date_preset: 'last_7d',
  level: 'account',
  fields: 'spend,impressions,actions',
  breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
});
for (const h of (hours.data || []).sort((a, b) => a.hourly_stats_aggregated_by_advertiser_time_zone.localeCompare(b.hourly_stats_aggregated_by_advertiser_time_zone))) {
  const leads = (h.actions || []).find(a => a.action_type === 'lead')?.value || 0;
  const spend = Number(h.spend);
  const bar = '█'.repeat(Math.min(Math.round(spend), 20));
  console.log(`  ${h.hourly_stats_aggregated_by_advertiser_time_zone}  ${bar.padEnd(20)} $${spend.toFixed(2).padStart(7)} leads=${leads}`);
}

console.log('\n— End Meta creative audit —');
