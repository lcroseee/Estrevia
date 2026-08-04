// Meta hygiene apply — 2026-05-23
// Applies P1 audit fixes from outputs/traffic-audit-2026-05-23 (REPORT.md §recommendations).
// Scope: EN — Launch — Lead — Tier-1 (no EU) ad set + 2 underperforming EN ads.
//
// Phase 1: ad-set targeting (age_max=44, exclude SV+NZ geo, exclude audience_network placement)
// Phase 2: ad-set hour schedule (pause 08:00 ET hour)
// Phase 3: pause underperforming EN ads (Swiss + Lahiri)
//
// DRY RUN by default. Pass --apply to mutate.

import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const VER = 'v23.0';
const APPLY = process.argv.includes('--apply');

if (!TOKEN) {
  console.log('META_ACCESS_TOKEN missing — abort');
  process.exit(1);
}

const EN_ADSET_ID = '120243116854610527';
const PAUSE_ADS = [
  { id: '120243976617750527', name: 'ad_lead_en_swiss_2026-05-17' },
  { id: '120243976618270527', name: 'ad_lead_en_lahiri_2026-05-17' },
];

console.log('===============================================================');
console.log(`  META HYGIENE APPLY — 2026-05-23  ${APPLY ? '[APPLY]' : '[DRY RUN]'}`);
console.log(`  Run at: ${new Date().toISOString()}`);
console.log(`  EN ad set: ${EN_ADSET_ID}`);
console.log('===============================================================\n');

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
    return { _dry: true };
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

// ============================================================
// 0. SNAPSHOT current EN ad set
// ============================================================
console.log('=== 0. SNAPSHOT — current EN ad set ===');
const cur = await fbGet(EN_ADSET_ID, {
  fields: 'id,name,status,daily_budget,targeting,adset_schedule,pacing_type,optimization_goal',
});
const t = cur.targeting || {};
console.log(`  name: ${cur.name}`);
console.log(`  status: ${cur.status}`);
console.log(`  daily_budget: ${cur.daily_budget} (cents)`);
console.log(`  optimization_goal: ${cur.optimization_goal}`);
console.log(`  pacing_type: ${JSON.stringify(cur.pacing_type)}`);
console.log(`  adset_schedule: ${JSON.stringify(cur.adset_schedule || [])}`);
console.log('\n  targeting (current):');
console.log(`    age_min=${t.age_min}  age_max=${t.age_max}`);
console.log(`    genders: ${JSON.stringify(t.genders)}`);
console.log(`    publisher_platforms: ${JSON.stringify(t.publisher_platforms)}`);
console.log(`    facebook_positions: ${JSON.stringify(t.facebook_positions)}`);
console.log(`    instagram_positions: ${JSON.stringify(t.instagram_positions)}`);
console.log(`    audience_network_positions: ${JSON.stringify(t.audience_network_positions)}`);
console.log(`    device_platforms: ${JSON.stringify(t.device_platforms)}`);
console.log(`    geo_locations.countries: ${JSON.stringify((t.geo_locations || {}).countries)}`);
console.log(`    geo_locations.excluded_countries: ${JSON.stringify((t.geo_locations || {}).excluded_countries)}`);
console.log(`    geo_locations.regions: ${JSON.stringify((t.geo_locations || {}).regions)}`);
console.log(`    custom_audiences: ${JSON.stringify(t.custom_audiences)}`);
console.log(`    excluded_custom_audiences: ${JSON.stringify(t.excluded_custom_audiences)}`);
console.log(`    flexible_spec: ${JSON.stringify(t.flexible_spec)}`);
console.log(`    targeting_relaxation_types: ${JSON.stringify(t.targeting_relaxation_types)}`);
console.log(`    targeting_optimization: ${JSON.stringify(t.targeting_optimization)}`);
console.log();

// ============================================================
// 1. BUILD updated targeting
// ============================================================
console.log('=== 1. DIFF — proposed changes ===');
const newTargeting = JSON.parse(JSON.stringify(t)); // deep clone

// 1.1 age_max → 44
const oldAgeMax = newTargeting.age_max;
newTargeting.age_max = 44;
console.log(`  age_max:  ${oldAgeMax} → 44   (45+ wasted $9.31/7d on 0 leads)`);

// 1.2 geo: drop NZ from countries (worst-developed market CPL $3.04) + add SV+NZ to excluded_geo_locations
newTargeting.geo_locations = newTargeting.geo_locations || {};
const oldCountries = newTargeting.geo_locations.countries || [];
const newCountries = oldCountries.filter((c) => c !== 'NZ');
newTargeting.geo_locations.countries = newCountries;
console.log(`  geo countries: ${JSON.stringify(oldCountries)} → ${JSON.stringify(newCountries)}`);

// excluded_geo_locations is a top-level field, NOT a sub-field of geo_locations
const oldExcGeo = newTargeting.excluded_geo_locations || {};
const oldExc = oldExcGeo.countries || [];
const newExc = Array.from(new Set([...oldExc, 'SV', 'NZ']));
newTargeting.excluded_geo_locations = {
  ...oldExcGeo,
  countries: newExc,
  location_types: oldExcGeo.location_types || ['home', 'recent'],
};
console.log(`  excluded_geo_locations.countries: ${JSON.stringify(oldExc)} → ${JSON.stringify(newExc)}`);

// 1.3 exclude audience_network placement
const oldPlat = newTargeting.publisher_platforms;
let newPlat;
if (Array.isArray(oldPlat) && oldPlat.length) {
  newPlat = oldPlat.filter((p) => p !== 'audience_network');
} else {
  // No explicit list → defaults include audience_network. Set explicit list.
  newPlat = ['facebook', 'instagram'];
}
newTargeting.publisher_platforms = newPlat;
console.log(`  publisher_platforms: ${JSON.stringify(oldPlat)} → ${JSON.stringify(newPlat)}`);

// If audience_network_positions explicitly present → drop it.
if (newTargeting.audience_network_positions) {
  console.log(`  audience_network_positions: ${JSON.stringify(newTargeting.audience_network_positions)} → []`);
  delete newTargeting.audience_network_positions;
}

// Preserve facebook_positions / instagram_positions if set — they only matter for facebook+instagram.
// If they were not set, Meta will auto-include all valid positions on facebook+instagram only (no audience_network).

console.log();

// ============================================================
// 2. PHASE 1 — apply targeting
// ============================================================
console.log('=== 2. PHASE 1 — POST targeting update ===');
try {
  const r1 = await fbPost(EN_ADSET_ID, { targeting: newTargeting });
  console.log(`  result: ${JSON.stringify(r1)}\n`);
} catch (e) {
  console.log(`  FAIL: ${e.message}\n`);
  process.exit(2);
}

// ============================================================
// 3. PHASE 2 — adset_schedule (pause 08:00 ET hour)
// ============================================================
console.log('=== 3. PHASE 2 — adset_schedule (skip 08:00 ET hour) ===');
console.log('  Goal: deliver all hours except 08:00 ET advertiser TZ.');
console.log('  Need to encode as positive intervals covering 00-08 and 09-24 every day of week.');

// 08:00 ET = adv TZ. Build schedule that EXCLUDES 480-540 minutes (08:00-09:00).
// Meta adset_schedule interval is positive (ads run when matching).
// Days: 0=Sunday..6=Saturday (per Meta docs, weekdays 1-5 are Mon-Fri).
// To pause only one hour, we provide two intervals per day: [0, 480] and [540, 1440].

const allDays = [0, 1, 2, 3, 4, 5, 6];
const adsetSchedule = [
  { start_minute: 0, end_minute: 480, days: allDays, timezone_type: 'ADVERTISER' },     // 00:00 – 08:00
  { start_minute: 540, end_minute: 1440, days: allDays, timezone_type: 'ADVERTISER' },  // 09:00 – 24:00
];

// Meta day-parting on daily budget: requires pacing_type=['day_parting'].
console.log(`  Build adset_schedule: ${JSON.stringify(adsetSchedule)}`);
console.log(`  Build pacing_type: ['day_parting']`);

try {
  const r2 = await fbPost(EN_ADSET_ID, {
    adset_schedule: adsetSchedule,
    pacing_type: ['day_parting'],
  });
  console.log(`  result: ${JSON.stringify(r2)}\n`);
} catch (e) {
  console.log(`  FAIL (non-fatal): ${e.message}`);
  console.log('  Day-parting may require lifetime budget mode. Skipping — apply manually via Ads Manager if needed.\n');
}

// ============================================================
// 4. PHASE 3 — pause underperforming EN ads
// ============================================================
console.log('=== 4. PHASE 3 — pause underperforming EN ads ===');
for (const ad of PAUSE_ADS) {
  console.log(`  pausing ${ad.name} (${ad.id})`);
  try {
    const r = await fbPost(ad.id, { status: 'PAUSED' });
    console.log(`    result: ${JSON.stringify(r)}`);
  } catch (e) {
    console.log(`    FAIL: ${e.message}`);
  }
}
console.log();

// ============================================================
// 5. VERIFY (read back)
// ============================================================
if (APPLY) {
  console.log('=== 5. VERIFY — read back current state ===');
  const back = await fbGet(EN_ADSET_ID, {
    fields: 'id,name,status,targeting,adset_schedule,pacing_type',
  });
  const bt = back.targeting || {};
  console.log(`  age_max: ${bt.age_max}`);
  console.log(`  geo excluded_countries: ${JSON.stringify((bt.geo_locations || {}).excluded_countries)}`);
  console.log(`  publisher_platforms: ${JSON.stringify(bt.publisher_platforms)}`);
  console.log(`  adset_schedule: ${JSON.stringify(back.adset_schedule || [])}`);
  console.log(`  pacing_type: ${JSON.stringify(back.pacing_type)}`);
  console.log();
  for (const ad of PAUSE_ADS) {
    const a = await fbGet(ad.id, { fields: 'id,name,status,effective_status' });
    console.log(`  ${a.name}: status=${a.status} effective=${a.effective_status}`);
  }
}

console.log(APPLY ? '\nDONE (applied).' : '\nDRY RUN complete — re-run with --apply to mutate.');
