#!/usr/bin/env node
/**
 * Track 6 (CRO Phase 0): repoint ES lead ads from https://estrevia.app/? to
 * https://estrevia.app/es/? (audit M-4: all 6 ES ads land on the EN root).
 *
 * Creatives are immutable → per ad: clone object_story_spec.link_data with the
 * /es/ link (same image_hash/copy/cta/utm_content), POST a new creative on the
 * CORRECT Page, POST a new PAUSED ad, then PAUSE the old ad.
 * ad_es_lead_v1 (120243116868200527, wrong Page 593228517212828, legacy utm
 * namespace) is retired: paused, not cloned (audit M-6).
 *
 * Dry-run by default. `node scripts/advertising/_relaunch_es_ads_repoint_2026_07_10.mjs --apply`
 */
import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACT = process.env.META_AD_ACCOUNT_ID; // act_...
const ES_ADSET_ID = '120243116822500527';
const PAGE_ID = '1087394517790815';
const INSTAGRAM_USER_ID = '17841424342702333';
const WRONG_PAGE_AD_ID = '120243116868200527';
const VER = 'v23.0';
const APPLY = process.argv.includes('--apply');

if (!TOKEN || !ACT) {
  console.error('META_ACCESS_TOKEN / META_AD_ACCOUNT_ID missing — abort');
  process.exit(1);
}

async function fbGet(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${VER}/${path}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const r = await fetch(url);
  const body = await r.text();
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

async function fbPost(path, params = {}) {
  if (!APPLY) {
    console.log(`  [DRY] POST ${path} payload:`);
    for (const [k, v] of Object.entries(params)) {
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      console.log(`        ${k} = ${s.length > 200 ? s.slice(0, 200) + '…' : s}`);
    }
    return { _dry: true, id: 'DRY' };
  }
  const url = new URL(`https://graph.facebook.com/${VER}/${path}`);
  const body = new URLSearchParams();
  body.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) {
    body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const r = await fetch(url, { method: 'POST', body });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status} ${text}`);
  return JSON.parse(text);
}

const ads = await fbGet(`${ES_ADSET_ID}/ads`, {
  fields: 'id,name,status,effective_status,creative{id,name,object_story_spec}',
  limit: 100,
});
console.log(`ES ad set ${ES_ADSET_ID}: ${ads.data.length} ads${APPLY ? '' : ' (DRY-RUN)'}\n`);

for (const ad of ads.data) {
  const spec = ad.creative?.object_story_spec;
  const link = spec?.link_data?.link ?? null;
  console.log(`${ad.name} (${ad.id}) status=${ad.status}\n  link=${link}`);

  if (ad.id === WRONG_PAGE_AD_ID) {
    await fbPost(ad.id, { status: 'PAUSED' });
    console.log('  RETIRED (wrong Page — recreate under the relaunch spec if wanted)');
    continue;
  }
  if (!spec?.link_data || !link) {
    console.log('  SKIP: no link_data');
    continue;
  }
  if (!link.startsWith('https://estrevia.app/?')) {
    console.log('  SKIP: link is not the bare EN root (already repointed?)');
    continue;
  }

  const newLink = link.replace('https://estrevia.app/?', 'https://estrevia.app/es/?');
  const newLinkData = JSON.parse(JSON.stringify(spec.link_data));
  newLinkData.link = newLink;
  if (newLinkData.call_to_action?.value?.link) {
    newLinkData.call_to_action.value.link = newLink; // both URL copies must match (audit note)
  }

  const creative = await fbPost(`${ACT}/adcreatives`, {
    name: `${ad.name}_es-landing_2026-07`,
    object_story_spec: {
      page_id: PAGE_ID,
      instagram_user_id: INSTAGRAM_USER_ID,
      link_data: newLinkData,
    },
  });
  const newAd = await fbPost(`${ACT}/ads`, {
    name: `${ad.name}_v2`,
    adset_id: ES_ADSET_ID,
    creative: { creative_id: creative.id },
    status: 'PAUSED',
  });
  await fbPost(ad.id, { status: 'PAUSED' });
  console.log(`  -> new creative ${creative.id}, new PAUSED ad ${newAd.id}, old ad paused; new link=${newLink}`);
}
console.log('\ndone. Founder: review new PAUSED ads in Ads Manager before activating.');
