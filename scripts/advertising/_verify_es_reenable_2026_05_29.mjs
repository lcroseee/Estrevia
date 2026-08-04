// READ-ONLY verifier for META-P1-ES-REENABLE.
// Reproduce 14d (2026-05-15..2026-05-28) adset-level CPM / CPL / reach-per-$ for EN Tier-1 vs ES LATAM.
// Also confirm current effective_status (paused?) and last_3d spend.

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
  if (!r.ok) {
    const txt = await r.text();
    console.log(`  WARN ${path} -> ${r.status} ${txt.slice(0, 400)}`);
    return { data: [] };
  }
  return r.json();
}

function metrics(r) {
  const spend = Number(r.spend || 0);
  const impr = Number(r.impressions || 0);
  const reach = Number(r.reach || 0);
  const leads = Number((r.actions || []).find(a => a.action_type === 'lead')?.value || 0);
  const cpm = impr ? (spend / impr) * 1000 : null;
  const cpl = leads ? spend / leads : null;
  const reachPerDollar = spend ? reach / spend : null;
  const freq = Number(r.frequency || 0);
  return { spend, impr, reach, leads, cpm, cpl, reachPerDollar, freq };
}

console.log('=== 14d ADSET AGGREGATE (2026-05-15..2026-05-28) ===');
{
  const ins = await fb(`${ACT}/insights`, {
    time_range: { since: '2026-05-15', until: '2026-05-28' },
    level: 'adset',
    fields: 'adset_id,adset_name,spend,impressions,reach,frequency,actions',
    limit: 500,
  });
  for (const r of (ins.data || [])) {
    const m = metrics(r);
    console.log(`\n-- ${r.adset_name} [${r.adset_id}] --`);
    console.log(`   spend=$${m.spend.toFixed(2)}  impr=${m.impr}  reach=${m.reach}  freq=${m.freq.toFixed(2)}  leads=${m.leads}`);
    console.log(`   CPM=$${m.cpm?.toFixed(2)}  CPL=$${m.cpl?.toFixed(2)}  reach/$=${m.reachPerDollar?.toFixed(1)}`);
  }
}

console.log('\n=== last_3d ADSET (2026-05-26..2026-05-28) ===');
{
  const ins = await fb(`${ACT}/insights`, {
    time_range: { since: '2026-05-26', until: '2026-05-28' },
    level: 'adset',
    fields: 'adset_id,adset_name,spend,impressions,reach',
    limit: 500,
  });
  if (!(ins.data || []).length) console.log('   (no rows — zero delivery in window)');
  for (const r of (ins.data || [])) {
    console.log(`   ${r.adset_name}: spend=$${Number(r.spend||0).toFixed(2)} reach=${r.reach||0}`);
  }
}

console.log('\n=== CURRENT ADSET STATUS ===');
{
  const adsets = await fb(`${ACT}/adsets`, {
    fields: 'id,name,status,effective_status,daily_budget,updated_time,campaign{name,effective_status}',
    limit: 50,
  });
  for (const a of (adsets.data || [])) {
    if (a.effective_status === 'ARCHIVED') continue;
    console.log(`   ${(a.name||'').slice(0,34).padEnd(34)} eff=${(a.effective_status||'').padEnd(16)} status=${(a.status||'').padEnd(8)} budget=${a.daily_budget||'-'} updated=${a.updated_time?.slice(0,19)} camp=${a.campaign?.effective_status||''}`);
  }
}

console.log('\n=== DONE ===');
