// READ-ONLY probe — pin the exact "dark date" when account spend went to 0.
// Explicit date ranges (not relative presets) so the window reliably covers 2026-05-15..2026-05-28.
// Also pulls adset-level daily time series for EN Tier-1 + ES LATAM to find last >$0 day per ad set.

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
    console.log(`  WARN ${path} -> ${r.status} ${txt.slice(0, 300)}`);
    return { data: [] };
  }
  return r.json();
}

const SINCE = '2026-05-15';
const UNTIL = '2026-05-28';

console.log('=== ACCOUNT-LEVEL DAILY (explicit range 2026-05-15..2026-05-28) ===');
{
  const ins = await fb(`${ACT}/insights`, {
    time_range: { since: SINCE, until: UNTIL },
    level: 'account',
    fields: 'spend,impressions,reach,clicks,actions',
    time_increment: 1,
    limit: 200,
  });
  for (const r of (ins.data || []).sort((a, b) => a.date_start.localeCompare(b.date_start))) {
    const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || 0;
    console.log(`  ${r.date_start}  spend=$${Number(r.spend).toFixed(2).padStart(7)}  impr=${String(r.impressions).padStart(6)}  reach=${String(r.reach||0).padStart(6)}  leads=${String(leads).padStart(3)}`);
  }
}

console.log('\n=== ADSET-LEVEL DAILY (explicit range) ===');
{
  const ins = await fb(`${ACT}/insights`, {
    time_range: { since: SINCE, until: UNTIL },
    level: 'adset',
    fields: 'adset_id,adset_name,spend,impressions,reach,actions',
    time_increment: 1,
    limit: 500,
  });
  const byAdset = {};
  for (const r of (ins.data || [])) {
    const k = `${r.adset_name} [${r.adset_id}]`;
    byAdset[k] = byAdset[k] || [];
    byAdset[k].push(r);
  }
  for (const [k, rows] of Object.entries(byAdset)) {
    console.log(`\n-- ${k} --`);
    let lastSpendDay = null;
    for (const r of rows.sort((a, b) => a.date_start.localeCompare(b.date_start))) {
      const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || 0;
      if (Number(r.spend) > 0) lastSpendDay = r.date_start;
      console.log(`   ${r.date_start}  spend=$${Number(r.spend).toFixed(2).padStart(7)}  impr=${String(r.impressions).padStart(6)}  leads=${String(leads).padStart(3)}`);
    }
    console.log(`   >> LAST DAY WITH SPEND > $0: ${lastSpendDay || 'NONE in window'}`);
  }
}

console.log('\n=== AD-SET CURRENT STATUS + updated_time (when toggled) ===');
{
  const adsets = await fb(`${ACT}/adsets`, {
    fields: 'id,name,status,effective_status,daily_budget,updated_time,start_time,end_time,campaign{name,effective_status}',
    limit: 50,
  });
  for (const a of (adsets.data || [])) {
    if (a.effective_status === 'ARCHIVED') continue;
    console.log(`  ${(a.name || '').slice(0, 36).padEnd(36)} eff=${(a.effective_status||'').padEnd(18)} status=${(a.status||'').padEnd(8)} updated=${a.updated_time?.slice(0,19)} campaign=${a.campaign?.name?.slice(0,24)||''} (${a.campaign?.effective_status||''})`);
  }
}

console.log('\n=== CAMPAIGN-LEVEL STATUS ===');
{
  const camps = await fb(`${ACT}/campaigns`, {
    fields: 'id,name,status,effective_status,daily_budget,updated_time',
    limit: 50,
  });
  for (const c of (camps.data || [])) {
    if (c.effective_status === 'ARCHIVED') continue;
    console.log(`  ${(c.name || '').slice(0, 40).padEnd(40)} eff=${(c.effective_status||'').padEnd(18)} status=${(c.status||'').padEnd(8)} updated=${c.updated_time?.slice(0,19)}`);
  }
}

console.log('\n=== DONE ===');
