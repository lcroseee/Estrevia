#!/usr/bin/env node
/**
 * Track 6 (CRO Phase 0): clean ES ad-set targeting (audit M-2, flagged 05-29):
 *   - remove SV from geo_locations.countries AND add it to excluded_geo_locations
 *     (EN precedent from _apply_hygiene_2026_05_23.mjs did both)
 *   - publisher_platforms -> ['facebook','instagram'] (audience_network OFF)
 *   - age 22-38 kept (intentional for LATAM per 05-29 audit)
 *
 * Dry-run by default. `node scripts/advertising/_relaunch_es_adset_cleanup_2026_07_10.mjs --apply`
 */
import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ES_ADSET_ID = '120243116822500527';
const VER = 'v23.0';
const APPLY = process.argv.includes('--apply');

if (!TOKEN) {
  console.error('META_ACCESS_TOKEN missing — abort');
  process.exit(1);
}

// fbGet/fbPost: copied verbatim from _relaunch_es_ads_repoint_2026_07_10.mjs
// (itself copied verbatim from scripts/advertising/_apply_hygiene_2026_05_23.mjs:35-66).
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

const adset = await fbGet(ES_ADSET_ID, { fields: 'id,name,status,targeting' });
const t = adset.targeting;
console.log('CURRENT targeting:', JSON.stringify(t, null, 2));

const newTargeting = JSON.parse(JSON.stringify(t));

const oldCountries = newTargeting.geo_locations.countries || [];
newTargeting.geo_locations.countries = oldCountries.filter((c) => c !== 'SV');

// excluded_geo_locations is TOP-LEVEL on targeting, not under geo_locations.
const oldExcGeo = newTargeting.excluded_geo_locations || {};
newTargeting.excluded_geo_locations = {
  ...oldExcGeo,
  countries: Array.from(new Set([...(oldExcGeo.countries || []), 'SV'])),
  location_types: oldExcGeo.location_types || ['home', 'recent'],
};

const oldPlat = newTargeting.publisher_platforms;
newTargeting.publisher_platforms =
  Array.isArray(oldPlat) && oldPlat.length
    ? oldPlat.filter((p) => p !== 'audience_network')
    : ['facebook', 'instagram'];
if (newTargeting.audience_network_positions) delete newTargeting.audience_network_positions;

console.log('\nNEW targeting:', JSON.stringify(newTargeting, null, 2));
await fbPost(ES_ADSET_ID, { targeting: newTargeting });

if (APPLY) {
  const check = await fbGet(ES_ADSET_ID, { fields: 'targeting' });
  console.log('\nVERIFY read-back:', JSON.stringify(check.targeting, null, 2));
}
console.log('\ndone.');
