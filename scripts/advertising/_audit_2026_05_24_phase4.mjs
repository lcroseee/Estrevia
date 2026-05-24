/**
 * Phase 4 — confirm:
 *  - Pixel events per type *per source* (Browser vs Server) — InitiateCheckout source?
 *  - Ads with issues / disapprovals
 *  - Dataset Quality (EMQ proxy)
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';

dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env.meta', override: true });

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const META_PIXEL_ID = process.env.META_PIXEL_ID;
const acct = META_AD_ACCOUNT_ID.startsWith('act_')
  ? META_AD_ACCOUNT_ID
  : `act_${META_AD_ACCOUNT_ID}`;
const API = 'https://graph.facebook.com/v22.0';

async function fb(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API}${path}${sep}access_token=${encodeURIComponent(
    META_ACCESS_TOKEN,
  )}`;
  const r = await fetch(url);
  const text = await r.text();
  if (!r.ok) {
    return { error: { status: r.status, body: text.slice(0, 500) } };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: { parse: text.slice(0, 500) } };
  }
}

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const since = iso(new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000));
const until = iso(today);

console.log('[phase4] pixel by event+device 14d');
const r1 = await fb(
  `/${META_PIXEL_ID}/stats?aggregation=event_dedup_quality&start_time=${since}T00:00:00Z&end_time=${until}T23:59:59Z`,
);
console.log('event_dedup_quality:', JSON.stringify(r1, null, 2).slice(0, 1500));

console.log('\n[phase4] pixel sources 14d');
const r2 = await fb(
  `/${META_PIXEL_ID}/stats?aggregation=event&start_time=${since}T00:00:00Z&end_time=${until}T23:59:59Z&event=InitiateCheckout`,
);
console.log('IC event filter:', JSON.stringify(r2, null, 2).slice(0, 1500));

console.log('\n[phase4] dataset/pixel "first_party_cookie" + auth-token');
const r3 = await fb(
  `/${META_PIXEL_ID}?fields=automatic_matching_fields,first_party_cookie_status,is_unavailable,last_fired_time,owner_ad_account,owner_business,enable_automatic_matching,can_proxy,is_consolidated_container`,
);
console.log(JSON.stringify(r3, null, 2));

console.log('\n[phase4] ads with issues_info');
const ads = await fb(
  `/${acct}/ads?fields=id,name,effective_status,issues_info,recommendations&limit=500&filtering=[]`,
);
const adsWithIssues = (ads.data || []).filter(
  (a) => (a.issues_info && a.issues_info.length) || a.recommendations,
);
console.log('ads with issues_info:', adsWithIssues.length);
for (const a of adsWithIssues) {
  console.log(`  ${a.name} (${a.id}) eff=${a.effective_status}`);
  console.log(`    issues=${JSON.stringify(a.issues_info)}`);
}

console.log('\n[phase4] adsets with issues_info');
const adsets = await fb(
  `/${acct}/adsets?fields=id,name,effective_status,issues_info,recommendations&limit=200&filtering=[]`,
);
const adsetsWithIssues = (adsets.data || []).filter(
  (a) => (a.issues_info && a.issues_info.length) || a.recommendations,
);
console.log('adsets with issues_info:', adsetsWithIssues.length);
for (const a of adsetsWithIssues) {
  console.log(`  ${a.name} (${a.id}) eff=${a.effective_status}`);
  console.log(`    issues=${JSON.stringify(a.issues_info)}`);
}

console.log('\n[phase4] account funding/account-status detail');
const acctInfo = await fb(
  `/${acct}?fields=account_status,disable_reason,balance,amount_spent,spend_cap,currency,funding_source,funding_source_details,offsite_pixels_tos_accepted,tos_accepted,business{id,name,verification_status}`,
);
console.log(JSON.stringify(acctInfo, null, 2));

console.log('\n[phase4] active ad-set delivery_insights');
const di = await fb(
  `/120243116854610527/delivery_estimate?targeting_spec={}&optimization_goal=OFFSITE_CONVERSIONS`,
);
console.log('delivery estimate (active EN):', JSON.stringify(di, null, 2).slice(0, 1000));

console.log('\n[phase4] done');
