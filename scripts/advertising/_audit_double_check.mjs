/**
 * Double-check Lead campaign config: pulls full Meta state + cross-checks
 * for holes. Read-only — does NOT modify anything.
 */
import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCT  = process.env.META_AD_ACCOUNT_ID;
const PAGE  = '1087394517790815'; // Estrevia
const PIXEL = '1945750759636135'; // Pixel 2 (live)
const PRICE_M = process.env.STRIPE_PRICE_ID_PRO_MONTHLY;
const PRICE_A = process.env.STRIPE_PRICE_ID_PRO_ANNUAL;
const API   = 'https://graph.facebook.com/v23.0';

const LEAD_CAMPAIGN = '120243116761600527';
const LPV_CAMPAIGN  = '120243025911300527';
const EN_ADSET      = '120243116854610527';
const ES_ADSET      = '120243116822500527';

function fail(msg) { return `  ✗ ${msg}`; }
function ok(msg)   { return `  ✓ ${msg}`; }
function warn(msg) { return `  ⚠ ${msg}`; }

async function g(url) {
  const r = await fetch(url);
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { _raw: t, _status: r.status }; }
}

const issues = { sev1: [], sev2: [], sev3: [] };

// ─── Account + ad account state ──────────────────────────────────────────
console.log('═════ Account ═════');
const acct = await g(`${API}/${ACCT}?fields=name,account_status,disable_reason,balance,currency,spend_cap,timezone_name,amount_spent&access_token=${TOKEN}`);
console.log(ok(`name=${acct.name} status=${acct.account_status} tz=${acct.timezone_name} currency=${acct.currency}`));
console.log(ok(`spend_cap=${acct.spend_cap || 'none'}  amount_spent=${acct.amount_spent}`));
if (acct.disable_reason && acct.disable_reason !== 0) {
  issues.sev1.push(`ad account disable_reason=${acct.disable_reason}`);
}
if (acct.account_status !== 1) {
  issues.sev1.push(`ad account status=${acct.account_status} (1=ACTIVE expected)`);
}

// ─── Campaigns ───────────────────────────────────────────────────────────
console.log('\n═════ Campaigns ═════');
const camps = await g(`${API}/${ACCT}/campaigns?fields=name,objective,status,effective_status,issues_info,buying_type,special_ad_categories&limit=20&access_token=${TOKEN}`);
const lead = camps.data?.find(c => c.id === LEAD_CAMPAIGN);
const lpv  = camps.data?.find(c => c.id === LPV_CAMPAIGN);

if (!lead) issues.sev1.push('Lead campaign not found');
else {
  console.log(`Lead campaign: ${lead.name}`);
  console.log(lead.objective === 'OUTCOME_LEADS' ? ok('objective=OUTCOME_LEADS') : fail(`objective=${lead.objective} (expected OUTCOME_LEADS)`));
  console.log(lead.effective_status === 'ACTIVE' ? ok('effective_status=ACTIVE') : fail(`effective_status=${lead.effective_status}`));
  if (lead.objective !== 'OUTCOME_LEADS') issues.sev1.push(`Lead campaign objective=${lead.objective}`);
  if (lead.effective_status !== 'ACTIVE') issues.sev1.push(`Lead campaign not ACTIVE`);
  if ((lead.special_ad_categories || []).length > 0) {
    issues.sev2.push(`Lead campaign has special_ad_categories=${lead.special_ad_categories.join(',')} — may restrict targeting`);
  } else {
    console.log(ok('no special_ad_categories'));
  }
  if (lead.issues_info?.length) issues.sev1.push(`Lead campaign issues_info: ${JSON.stringify(lead.issues_info)}`);
}

if (!lpv) issues.sev2.push('LPV campaign not found (already deleted?)');
else {
  console.log(`\nLPV campaign: ${lpv.name}`);
  console.log(lpv.effective_status === 'PAUSED' ? ok('PAUSED (no spend)') : fail(`effective_status=${lpv.effective_status} (expected PAUSED)`));
  if (lpv.effective_status !== 'PAUSED') issues.sev1.push(`LPV campaign still ${lpv.effective_status}`);
}

// Also check no other ACTIVE campaigns are bleeding budget
const otherActive = camps.data?.filter(c => c.effective_status === 'ACTIVE' && c.id !== LEAD_CAMPAIGN) || [];
if (otherActive.length > 0) {
  issues.sev2.push(`Other ACTIVE campaigns: ${otherActive.map(c => c.name).join(', ')}`);
  console.log(warn(`other ACTIVE campaigns: ${otherActive.map(c => c.name).join(', ')}`));
} else {
  console.log(ok('no other ACTIVE campaigns'));
}

// ─── Ad sets ─────────────────────────────────────────────────────────────
console.log('\n═════ Ad sets ═════');
const adsets = await g(`${API}/${LEAD_CAMPAIGN}/adsets?fields=name,id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,attribution_spec,targeting{geo_locations,age_min,age_max,publisher_platforms,facebook_positions,instagram_positions,excluded_geo_locations},promoted_object,issues_info,frequency_control_specs&access_token=${TOKEN}`);
let totalDailyBudget = 0;
for (const as of adsets.data || []) {
  console.log(`\n${as.name} (${as.id})`);
  console.log(as.effective_status === 'ACTIVE' ? ok('ACTIVE') : fail(`effective_status=${as.effective_status}`));
  if (as.effective_status !== 'ACTIVE') issues.sev1.push(`Ad set ${as.name} not ACTIVE`);
  const dailyUsd = Number(as.daily_budget) / 100;
  totalDailyBudget += dailyUsd;
  console.log(ok(`daily_budget=$${dailyUsd}`));
  console.log(as.optimization_goal === 'OFFSITE_CONVERSIONS' ? ok('optimization=OFFSITE_CONVERSIONS') : fail(`optimization=${as.optimization_goal}`));
  if (as.optimization_goal !== 'OFFSITE_CONVERSIONS') issues.sev1.push(`Ad set ${as.name} optimization=${as.optimization_goal}`);
  const po = as.promoted_object || {};
  if (po.pixel_id === PIXEL && po.custom_event_type === 'LEAD') {
    console.log(ok(`promoted_object: pixel ${PIXEL} → LEAD`));
  } else {
    console.log(fail(`promoted_object: ${JSON.stringify(po)}`));
    issues.sev1.push(`Ad set ${as.name} promoted_object misconfigured: ${JSON.stringify(po)}`);
  }
  const attr = (as.attribution_spec || [])[0];
  if (attr?.event_type === 'CLICK_THROUGH' && attr.window_days === 7) {
    console.log(ok('attribution: CLICK_THROUGH 7d'));
  } else {
    console.log(warn(`attribution: ${JSON.stringify(as.attribution_spec)}`));
    issues.sev2.push(`Ad set ${as.name} unusual attribution: ${JSON.stringify(as.attribution_spec)}`);
  }
  const geo = as.targeting?.geo_locations || {};
  const countries = (geo.countries || []).join(',');
  console.log(ok(`geo: ${countries}`));
  if (countries.includes('AR')) {
    issues.sev1.push(`Ad set ${as.name} targets AR — Stripe-USD known broken for Argentina`);
  }
  if (as.name.includes('ES') && !countries.includes('MX')) {
    issues.sev2.push(`ES ad set missing MX — biggest LATAM market`);
  }
  const ageGap = as.targeting?.age_max - as.targeting?.age_min;
  console.log(ok(`age: ${as.targeting?.age_min}-${as.targeting?.age_max}`));
  if (as.issues_info?.length) issues.sev1.push(`Ad set ${as.name} issues_info: ${JSON.stringify(as.issues_info)}`);
  // Placements: undefined = all placements
  const placements = as.targeting?.publisher_platforms || ['all'];
  console.log(ok(`placements: ${placements.join(',')}`));
}
console.log(`\nTotal daily budget: $${totalDailyBudget}/day`);
const cap = Number(process.env.ADVERTISING_DAILY_SPEND_CAP_USD || 80);
if (totalDailyBudget > cap) issues.sev2.push(`Daily budget $${totalDailyBudget} exceeds cap $${cap}`);
else console.log(ok(`under spend cap ($${cap}/day)`));

// ─── Ads ──────────────────────────────────────────────────────────────────
console.log('\n═════ Ads ═════');
const allAds = [];
for (const adsetId of [EN_ADSET, ES_ADSET]) {
  const d = await g(`${API}/${adsetId}/ads?fields=name,id,status,effective_status,issues_info,creative{id,object_story_spec}&limit=50&access_token=${TOKEN}`);
  for (const ad of d.data || []) allAds.push({ ...ad, adsetId });
}

// Group + cross-check
const utmContents = new Set();
const imageHashes = new Set();
for (const ad of allAds) {
  const spec = ad.creative?.object_story_spec?.link_data || {};
  const page = ad.creative?.object_story_spec?.page_id || '?';
  const link = spec.link || '';
  const utmContent = new URL(link).searchParams.get('utm_content') || '?';
  const utmTerm = new URL(link).searchParams.get('utm_term') || '?';
  const utmCampaign = new URL(link).searchParams.get('utm_campaign') || '?';
  const ih = spec.image_hash || '';
  const cta = spec.call_to_action?.type || '?';
  const adsetTag = ad.adsetId === EN_ADSET ? 'EN' : 'ES';

  let line = `[${adsetTag}/${ad.effective_status}] ${ad.name}`;
  const fails = [];
  if (page !== PAGE) fails.push(`page=${page}≠Estrevia`);
  if (ih.length !== 32) fails.push(`hash.len=${ih.length}≠32`);
  if (utmContents.has(utmContent)) fails.push(`utm_content DUP ${utmContent}`);
  utmContents.add(utmContent);
  if (adsetTag === 'EN' && utmTerm !== 'en') fails.push(`utm_term=${utmTerm} in EN`);
  if (adsetTag === 'ES' && utmTerm !== 'es') fails.push(`utm_term=${utmTerm} in ES`);
  if (!utmCampaign.startsWith('estrevia_')) fails.push(`utm_campaign=${utmCampaign}`);
  if (ad.issues_info?.length) fails.push(`issues_info=${JSON.stringify(ad.issues_info)}`);
  if (ad.effective_status === 'DISAPPROVED' || ad.effective_status === 'WITH_ISSUES') {
    fails.push(`ad disapproved`);
    issues.sev1.push(`Ad ${ad.name} DISAPPROVED: ${JSON.stringify(ad.issues_info)}`);
  }
  imageHashes.add(ih);

  if (fails.length === 0) console.log(ok(line) + `  cta=${cta} utm=${utmContent}`);
  else console.log(fail(line) + ` ← ${fails.join(', ')}`);
  for (const f of fails) issues.sev1.push(`${ad.name}: ${f}`);
}
console.log(`\nUnique image_hashes: ${imageHashes.size}/${allAds.length}  (image diversity)`);
console.log(`Unique utm_contents: ${utmContents.size}/${allAds.length}  (must be ${allAds.length} for per-ad attribution)`);

// ─── Pixel state ─────────────────────────────────────────────────────────
console.log('\n═════ Pixel ═════');
const pixels = await g(`${API}/${ACCT}/adspixels?fields=name,id,last_fired_time&access_token=${TOKEN}`);
const livePixel = pixels.data?.find(p => p.id === PIXEL);
if (livePixel) {
  console.log(ok(`Pixel 2 ${PIXEL} present, last_fired ${livePixel.last_fired_time}`));
  const lastFired = new Date(livePixel.last_fired_time).getTime();
  const ageMin = (Date.now() - lastFired) / 60000;
  if (ageMin > 120) issues.sev2.push(`Pixel last_fired ${Math.round(ageMin)} min ago — events may be silent`);
} else {
  issues.sev1.push(`Pixel ${PIXEL} not in account!`);
}
const otherPixels = pixels.data?.filter(p => p.id !== PIXEL) || [];
for (const op of otherPixels) {
  if (op.last_fired_time) {
    issues.sev2.push(`Other pixel ${op.name} (${op.id}) fired recently — may pollute attribution`);
  }
}

// ─── env coherence ───────────────────────────────────────────────────────
console.log('\n═════ Env coherence ═════');
if (process.env.META_PIXEL_ID === PIXEL) console.log(ok('META_PIXEL_ID == Pixel 2'));
else { console.log(fail(`META_PIXEL_ID=${process.env.META_PIXEL_ID} ≠ Pixel 2`)); issues.sev1.push(`Local META_PIXEL_ID mismatch`); }

if (process.env.META_AD_ACCOUNT_ID === ACCT) console.log(ok('META_AD_ACCOUNT_ID matches'));
if (process.env.META_CAPI_TOKEN) console.log(ok('META_CAPI_TOKEN set'));
else { console.log(fail('META_CAPI_TOKEN missing')); issues.sev1.push('META_CAPI_TOKEN not in env'); }

if (PRICE_M) console.log(ok(`STRIPE_PRICE_ID_PRO_MONTHLY=${PRICE_M.slice(0,12)}…`));
else { console.log(fail('STRIPE_PRICE_ID_PRO_MONTHLY missing')); issues.sev1.push('No Stripe monthly price'); }
if (PRICE_A) console.log(ok(`STRIPE_PRICE_ID_PRO_ANNUAL=${PRICE_A.slice(0,12)}…`));
else { console.log(fail('STRIPE_PRICE_ID_PRO_ANNUAL missing')); issues.sev1.push('No Stripe annual price'); }
if (process.env.STRIPE_WEBHOOK_SECRET) console.log(ok('STRIPE_WEBHOOK_SECRET set'));
else issues.sev1.push('STRIPE_WEBHOOK_SECRET missing — premium activation broken');
if (process.env.CLERK_WEBHOOK_SECRET) console.log(ok('CLERK_WEBHOOK_SECRET set'));
else issues.sev1.push('CLERK_WEBHOOK_SECRET missing — user_registered CAPI broken');
if (process.env.RESEND_API_KEY) console.log(ok('RESEND_API_KEY set'));

// ─── Summary ─────────────────────────────────────────────────────────────
console.log('\n═════ SUMMARY ═════');
console.log(`Sev1 (blocking): ${issues.sev1.length}`);
for (const i of issues.sev1) console.log(`  ✗ ${i}`);
console.log(`Sev2 (warning):  ${issues.sev2.length}`);
for (const i of issues.sev2) console.log(`  ⚠ ${i}`);
console.log(`Sev3 (note):     ${issues.sev3.length}`);
for (const i of issues.sev3) console.log(`  • ${i}`);

process.exit(issues.sev1.length > 0 ? 1 : 0);
