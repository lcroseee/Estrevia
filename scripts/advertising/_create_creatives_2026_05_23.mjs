// Create 3 new EN ad creatives + ads via Meta Graph API — 2026-05-23
// Founder delegated full execution. End-to-end: upload PNG → adimage → adcreative → ad (PAUSED).
//
// Templates derived from existing top creative 1009704801403337 (passport, EN).
// Founder activates ads via Ads Manager after review.

import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const VER = 'v23.0';
const ACT = 'act_1435842067150024';
const AD_SET_ID = '120243116854610527';
const PAGE_ID = '1087394517790815';
const INSTAGRAM_USER_ID = '17841424342702333';

if (!TOKEN) { console.log('META_ACCESS_TOKEN missing'); process.exit(1); }

const ANGLES = [
  {
    slug: 'en_ref_off24',
    file: 'outputs/ad-refresh-2026-05-23/canva-exports/angle-A-western-off-24-v2.png',
    ad_name: 'ad_lead_en_off24_2026-05-23',
    creative_name: 'lead_en_off24_2026-05-23',
    message: "Western astrology hasn't updated since Ptolemy. Sidereal uses NASA's actual sky — your sign may shift by a full constellation. Get your TRUE chart in 60 seconds.",
    headline: 'See your real sign',
    description: 'Free sidereal chart · Lahiri ayanamsa · ±0.01°',
  },
  {
    slug: 'en_ref_nasa',
    file: 'outputs/ad-refresh-2026-05-23/canva-exports/angle-B-nasa-sky-v2.png',
    ad_name: 'ad_lead_en_nasa_2026-05-23',
    creative_name: 'lead_en_nasa_2026-05-23',
    message: "Swiss Ephemeris + Lahiri ayanamsa. ±0.01° accurate to the actual sky — same math NASA uses. Get your chart based on tonight's sky, not 2,200-year-old Greek tables.",
    headline: 'NASA-verified chart',
    description: 'Free · Sidereal astrology · 60 seconds',
  },
  {
    slug: 'en_ref_made',
    file: 'outputs/ad-refresh-2026-05-23/canva-exports/angle-C-built-this.png',
    ad_name: 'ad_lead_en_made_2026-05-23',
    creative_name: 'lead_en_made_2026-05-23',
    message: "Most astrology apps run on guesses + algorithm filler. I built Estrevia on Swiss Ephemeris — the same math NASA uses. No 'horoscope today' garbage, just your real sidereal chart.",
    headline: 'Built differently',
    description: 'From an indie founder · Sidereal · Free',
  },
];

console.log('===============================================================');
console.log('  CREATE 3 EN CREATIVES + ADS — 2026-05-23');
console.log(`  Run at: ${new Date().toISOString()}`);
console.log(`  Ad set: ${AD_SET_ID} (EN — Launch — Lead — Tier-1)`);
console.log('===============================================================\n');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fbPost(path, params = {}) {
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

async function uploadImage(filePath) {
  const buf = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const form = new FormData();
  form.append('access_token', TOKEN);
  form.append('filename', new Blob([buf], { type: 'image/png' }), filename);
  const r = await fetch(`https://graph.facebook.com/${VER}/${ACT}/adimages`, {
    method: 'POST',
    body: form,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`upload ${filename} -> ${r.status} ${text}`);
  const j = JSON.parse(text);
  const img = Object.values(j.images || {})[0];
  if (!img?.hash) throw new Error(`upload ${filename}: no hash in response ${text}`);
  return { hash: img.hash, url: img.url };
}

function buildLink(slug) {
  return `https://estrevia.app/?utm_source=meta&utm_medium=image&utm_campaign=estrevia_lead_en&utm_content=${slug}&utm_term=en`;
}

// ---------------------------------------------------------------------------
// Phase 1: upload images
// ---------------------------------------------------------------------------
console.log('=== PHASE 1: upload PNG → adimages ===');
for (const a of ANGLES) {
  process.stdout.write(`  ${path.basename(a.file)} ... `);
  try {
    const { hash, url } = await uploadImage(a.file);
    a.image_hash = hash;
    a.image_url = url;
    console.log(`hash=${hash}`);
  } catch (e) {
    console.log(`FAIL\n  ${e.message}`);
    process.exit(2);
  }
}
console.log();

// ---------------------------------------------------------------------------
// Phase 2: create ad creatives
// ---------------------------------------------------------------------------
console.log('=== PHASE 2: create ad creatives ===');
for (const a of ANGLES) {
  const link = buildLink(a.slug);
  const spec = {
    name: a.creative_name,
    object_story_spec: {
      page_id: PAGE_ID,
      instagram_user_id: INSTAGRAM_USER_ID,
      link_data: {
        link,
        message: a.message,
        name: a.headline,
        description: a.description,
        image_hash: a.image_hash,
        call_to_action: {
          type: 'LEARN_MORE',
          value: { link },
        },
      },
    },
  };
  process.stdout.write(`  ${a.creative_name} ... `);
  try {
    const r = await fbPost(`${ACT}/adcreatives`, spec);
    a.creative_id = r.id;
    console.log(`creative_id=${r.id}`);
  } catch (e) {
    console.log(`FAIL\n  ${e.message}`);
    process.exit(3);
  }
}
console.log();

// ---------------------------------------------------------------------------
// Phase 3: create ads (PAUSED for founder review)
// ---------------------------------------------------------------------------
console.log('=== PHASE 3: create ads (PAUSED) ===');
for (const a of ANGLES) {
  process.stdout.write(`  ${a.ad_name} ... `);
  try {
    const r = await fbPost(`${ACT}/ads`, {
      name: a.ad_name,
      adset_id: AD_SET_ID,
      creative: { creative_id: a.creative_id },
      status: 'PAUSED',
    });
    a.ad_id = r.id;
    console.log(`ad_id=${r.id}`);
  } catch (e) {
    console.log(`FAIL\n  ${e.message}`);
    process.exit(4);
  }
}
console.log();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('=== SUMMARY ===');
console.log('ad_name                              | ad_id                | creative_id          | utm_content    | image_hash');
console.log('-------------------------------------|----------------------|----------------------|----------------|------------------------');
for (const a of ANGLES) {
  console.log(
    `${a.ad_name.padEnd(36)} | ${a.ad_id.padEnd(20)} | ${a.creative_id.padEnd(20)} | ${a.slug.padEnd(14)} | ${a.image_hash}`,
  );
}
console.log('\nAll 3 ads created in PAUSED state under EN Tier-1 ad set.');
console.log('Founder: review in Ads Manager → activate via Ads Manager toggle.');
