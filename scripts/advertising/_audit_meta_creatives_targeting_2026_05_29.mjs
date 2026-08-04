// READ-ONLY probe — (1) ad created_time for all ads in Estrevia Lead campaign (find new Canva creatives),
// (2) targeting spec of EN Tier-1 + ES LATAM to verify 5/23 hygiene fixes (age_max=44, audience_network off, SV/NZ excluded).

import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACT = process.env.META_AD_ACCOUNT_ID || 'act_1435842067150024';
const VER = 'v23.0';
const EN_TIER1 = '120243116854610527';
const ES_LATAM = '120243116822500527';

async function fb(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${VER}/${path}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const r = await fetch(url);
  if (!r.ok) { const t = await r.text(); console.log(`  WARN ${path} -> ${r.status} ${t.slice(0,300)}`); return { data: [] }; }
  return r.json();
}

console.log('=== ADS in EN Tier-1 + ES LATAM (created_time, status) ===');
for (const [label, adsetId] of [['EN Tier-1', EN_TIER1], ['ES LATAM', ES_LATAM]]) {
  console.log(`\n-- ${label} [${adsetId}] --`);
  const ads = await fb(`${adsetId}/ads`, {
    fields: 'id,name,status,effective_status,created_time,creative{id,name,title,body}',
    limit: 100,
  });
  for (const a of (ads.data || []).sort((x,y)=> (x.created_time||'').localeCompare(y.created_time||''))) {
    console.log(`  ${(a.name||'').slice(0,40).padEnd(40)} created=${a.created_time?.slice(0,19)} eff=${a.effective_status}`);
    if (a.creative) console.log(`     creative.name="${(a.creative.name||'').slice(0,50)}" title="${(a.creative.title||'').slice(0,50)}"`);
  }
}

console.log('\n=== TARGETING SPEC — EN Tier-1 ===');
{
  const a = await fb(`${EN_TIER1}`, { fields: 'name,targeting,status,effective_status,daily_budget' });
  const t = a.targeting || {};
  console.log(`  name=${a.name}`);
  console.log(`  age_min=${t.age_min}  age_max=${t.age_max}`);
  console.log(`  geo countries=${JSON.stringify(t.geo_locations?.countries || [])}`);
  console.log(`  excluded_geo countries=${JSON.stringify(t.excluded_geo_locations?.countries || [])}`);
  console.log(`  excluded_geo regions=${JSON.stringify((t.excluded_geo_locations?.regions||[]).map(r=>r.name))}`);
  console.log(`  publisher_platforms=${JSON.stringify(t.publisher_platforms || 'ALL (not set)')}`);
  console.log(`  facebook_positions=${JSON.stringify(t.facebook_positions || 'default')}`);
  console.log(`  instagram_positions=${JSON.stringify(t.instagram_positions || 'default')}`);
  console.log(`  audience_network_positions=${JSON.stringify(t.audience_network_positions || 'default(on)')}`);
  console.log(`  targeting_automation/advantage_audience=${JSON.stringify(t.targeting_automation || {})}`);
  console.log(`  RAW: ${JSON.stringify(t).slice(0,1200)}`);
}

console.log('\n=== TARGETING SPEC — ES LATAM ===');
{
  const a = await fb(`${ES_LATAM}`, { fields: 'name,targeting,status,effective_status,daily_budget' });
  const t = a.targeting || {};
  console.log(`  name=${a.name}`);
  console.log(`  age_min=${t.age_min}  age_max=${t.age_max}`);
  console.log(`  geo countries=${JSON.stringify(t.geo_locations?.countries || [])}`);
  console.log(`  excluded_geo countries=${JSON.stringify(t.excluded_geo_locations?.countries || [])}`);
  console.log(`  publisher_platforms=${JSON.stringify(t.publisher_platforms || 'ALL (not set)')}`);
  console.log(`  audience_network_positions=${JSON.stringify(t.audience_network_positions || 'default(on)')}`);
  console.log(`  RAW: ${JSON.stringify(t).slice(0,1200)}`);
}

console.log('\n=== DONE ===');
