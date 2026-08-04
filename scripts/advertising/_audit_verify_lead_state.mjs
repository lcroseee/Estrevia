import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const API = 'https://graph.facebook.com/v23.0';

const AD_SETS = [
  { name: 'EN — Lead — Tier-1', id: '120243116854610527' },
  { name: 'ES — Lead — LATAM USD', id: '120243116822500527' },
];

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

for (const adset of AD_SETS) {
  const url = `${API}/${adset.id}/ads?fields=name,status,effective_status,creative{object_story_spec}&access_token=${TOKEN}&limit=50`;
  const d = await fetchJson(url);
  console.log(`\n=== ${adset.name} (${adset.id}) ===`);
  for (const ad of d.data || []) {
    const spec = ad.creative?.object_story_spec?.link_data || {};
    const page = ad.creative?.object_story_spec?.page_id || '?';
    const cta = spec.call_to_action?.type || '?';
    const angle = (spec.message || '').slice(0, 50);
    const pageOk = page === '1087394517790815' ? 'OK' : `WRONG(${page})`;
    console.log(`  [${ad.effective_status.padEnd(15)}] ${ad.name.padEnd(45)} page=${pageOk.padEnd(20)} cta=${cta.padEnd(12)} ${angle}`);
  }
}
