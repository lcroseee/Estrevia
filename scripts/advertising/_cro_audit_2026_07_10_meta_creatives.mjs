// READ-ONLY probe — CRO audit 2026-07-10, Meta sector part 2.
// (1) Full creative specs (title, body, link+UTM, image, CTA) for all ads in the two Lead ad sets
//     + the ES LPV ad set (traffic campaign) for destination-URL hygiene.
// (2) Targeting specs (DSA / UK-IE state, hygiene drift check vs 5/29).
// (3) Account DSA defaults + account_status/disable_reason.
// Graph API GETs only.

import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACT = process.env.META_AD_ACCOUNT_ID || 'act_1435842067150024';
const VER = 'v23.0';

const ADSETS = [
  ['EN — Lead — Tier-1', '120243116854610527'],
  ['ES — Lead — LATAM USD', '120243116822500527'],
  ['ES — Astrología sidérea (LPV)', '120243025977660527'],
  ['EN — Sidereal interest (LPV)', '120243025977120527'],
];

async function fb(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${VER}/${path}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const r = await fetch(url);
  if (!r.ok) {
    const t = await r.text();
    console.log(`  WARN ${path} -> ${r.status} ${t.slice(0, 400)}`);
    return { data: [] };
  }
  return r.json();
}

console.log('=== ACCOUNT STATUS + DSA DEFAULTS ===');
{
  const a = await fb(ACT, {
    fields: 'account_status,disable_reason,name,currency,timezone_name,default_dsa_payor,default_dsa_beneficiary',
  });
  console.log(JSON.stringify(a, null, 2));
}

for (const [label, adsetId] of ADSETS) {
  console.log(`\n\n########## ${label} [${adsetId}] ##########`);

  const s = await fb(adsetId, {
    fields: 'name,status,effective_status,daily_budget,targeting,dsa_payor,dsa_beneficiary,attribution_spec,promoted_object',
  });
  const t = s.targeting || {};
  console.log(`  dsa_payor=${s.dsa_payor || '(none)'}  dsa_beneficiary=${s.dsa_beneficiary || '(none)'}`);
  console.log(`  promoted_object=${JSON.stringify(s.promoted_object || {})}`);
  console.log(`  targeting: age ${t.age_min}-${t.age_max}  geo=${JSON.stringify(t.geo_locations?.countries)}  excluded=${JSON.stringify(t.excluded_geo_locations?.countries || [])}`);
  console.log(`  publisher_platforms=${JSON.stringify(t.publisher_platforms || 'ALL (not set)')}`);
  console.log(`  targeting_automation=${JSON.stringify(t.targeting_automation || {})}`);

  const ads = await fb(`${adsetId}/ads`, {
    fields:
      'id,name,status,effective_status,created_time,updated_time,creative{id,name,title,body,object_story_spec,asset_feed_spec,url_tags,image_url,thumbnail_url,instagram_permalink_url}',
    limit: 100,
  });
  for (const a of (ads.data || []).sort((x, y) => (x.created_time || '').localeCompare(y.created_time || ''))) {
    console.log(`\n  --- AD ${a.name} [${a.id}] ${a.effective_status} (cfg=${a.status}) created=${a.created_time?.slice(0, 19)} updated=${a.updated_time?.slice(0, 19)}`);
    const c = a.creative || {};
    console.log(`    creative.id=${c.id} name="${c.name || ''}"`);
    if (c.title) console.log(`    title: ${c.title}`);
    if (c.body) console.log(`    body: ${String(c.body).replace(/\n/g, ' \\n ')}`);
    if (c.url_tags) console.log(`    url_tags: ${c.url_tags}`);
    const oss = c.object_story_spec;
    if (oss?.link_data) {
      const ld = oss.link_data;
      console.log(`    link_data.link: ${ld.link}`);
      console.log(`    link_data.name(headline): ${ld.name || ''}`);
      console.log(`    link_data.message(primary): ${String(ld.message || '').replace(/\n/g, ' \\n ')}`);
      console.log(`    link_data.description: ${ld.description || ''}`);
      console.log(`    link_data.cta: ${JSON.stringify(ld.call_to_action || {})}`);
      if (ld.image_hash) console.log(`    link_data.image_hash: ${ld.image_hash}`);
    }
    if (oss?.video_data) {
      const vd = oss.video_data;
      console.log(`    video_data.title: ${vd.title || ''}`);
      console.log(`    video_data.message: ${String(vd.message || '').replace(/\n/g, ' \\n ')}`);
      console.log(`    video_data.cta: ${JSON.stringify(vd.call_to_action || {})}`);
    }
    if (c.asset_feed_spec) {
      const afs = c.asset_feed_spec;
      console.log(`    asset_feed_spec.titles: ${JSON.stringify((afs.titles || []).map((x) => x.text))}`);
      console.log(`    asset_feed_spec.bodies: ${JSON.stringify((afs.bodies || []).map((x) => x.text))}`);
      console.log(`    asset_feed_spec.descriptions: ${JSON.stringify((afs.descriptions || []).map((x) => x.text))}`);
      console.log(`    asset_feed_spec.link_urls: ${JSON.stringify((afs.link_urls || []).map((x) => x.website_url))}`);
      console.log(`    asset_feed_spec.ctas: ${JSON.stringify((afs.call_to_action_types || []))}`);
    }
    if (c.image_url) console.log(`    image_url: ${c.image_url}`);
  }
}

console.log('\n=== DONE ===');
