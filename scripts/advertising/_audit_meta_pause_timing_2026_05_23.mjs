// When was ES — Lead — LATAM USD paused? Daily spend per ad set, last 7d.
import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACT = process.env.META_AD_ACCOUNT_ID || 'act_1435842067150024';
const VER = 'v23.0';

async function fb(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${VER}/${path}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const r = await fetch(url);
  return r.json();
}

const day = (n) => new Date(Date.now() - n * 86400 * 1000).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);

console.log('=== Daily ad-set spend (7d) — to detect pause timing ===\n');
const ins = await fb(`${ACT}/insights`, {
  time_range: { since: day(7), until: today },
  level: 'adset',
  fields: 'adset_name,spend,impressions,clicks,actions',
  time_increment: 1,
  limit: 100,
});

const byAdsetDay = {};
for (const r of (ins.data || [])) {
  const k = r.adset_name || 'unknown';
  byAdsetDay[k] = byAdsetDay[k] || {};
  byAdsetDay[k][r.date_start] = {
    spend: Number(r.spend),
    impr: Number(r.impressions),
    clicks: Number(r.clicks),
    leads: Number((r.actions || []).find(a => a.action_type === 'lead')?.value || 0),
  };
}

for (const [adset, days] of Object.entries(byAdsetDay)) {
  console.log(`-- ${adset} --`);
  for (const [d, m] of Object.entries(days).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`   ${d}  spend=$${m.spend.toFixed(2).padStart(7)}  impr=${String(m.impr).padStart(6)}  clicks=${String(m.clicks).padStart(4)}  leads=${m.leads}`);
  }
  console.log('');
}

console.log('=== Ad-set effective_status + status (current) ===');
const adsets = await fb(`${ACT}/adsets`, {
  fields: 'id,name,status,effective_status,daily_budget,updated_time,start_time,end_time',
  limit: 50,
});
for (const a of (adsets.data || [])) {
  if (a.effective_status === 'ARCHIVED') continue;
  console.log(`  ${(a.name || '').slice(0, 36).padEnd(36)} effective=${a.effective_status.padEnd(20)} status=${a.status.padEnd(10)} updated=${a.updated_time?.slice(0, 19)}`);
}
