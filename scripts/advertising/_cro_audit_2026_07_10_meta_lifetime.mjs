// READ-ONLY probe — CRO audit 2026-07-10, Meta sector part 3.
// Lifetime totals: account amount_spent, per-campaign + per-adset lifetime insights (date_preset=maximum).

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
    const t = await r.text();
    console.log(`  WARN ${path} -> ${r.status} ${t.slice(0, 300)}`);
    return { data: [] };
  }
  return r.json();
}

function act(row, type) {
  const a = (row.actions || []).find((x) => x.action_type === type);
  return a ? Number(a.value) : 0;
}

console.log('=== ACCOUNT amount_spent / spend_cap ===');
{
  const a = await fb(ACT, { fields: 'amount_spent,spend_cap,balance,currency' });
  console.log(JSON.stringify(a));
}

console.log('\n=== CAMPAIGN LIFETIME (date_preset=maximum) ===');
{
  const res = await fb(`${ACT}/insights`, {
    date_preset: 'maximum',
    level: 'campaign',
    fields: 'campaign_name,spend,impressions,reach,clicks,ctr,cpm,actions,date_start,date_stop',
    limit: 50,
  });
  for (const row of res.data || []) {
    const leads = act(row, 'lead');
    const spend = Number(row.spend || 0);
    console.log(
      `  ${row.campaign_name} | ${row.date_start}..${row.date_stop} | spend=$${spend.toFixed(2)} impr=${row.impressions} clicks=${row.clicks} ctr=${row.ctr} leads=${leads} cpl=${leads ? (spend / leads).toFixed(2) : '—'}`
    );
  }
}

console.log('\n=== ADSET LIFETIME (Estrevia lead adsets, date_preset=maximum) ===');
{
  const res = await fb(`${ACT}/insights`, {
    date_preset: 'maximum',
    level: 'adset',
    fields: 'adset_name,campaign_name,spend,impressions,clicks,ctr,cpm,actions',
    limit: 50,
  });
  for (const row of res.data || []) {
    const leads = act(row, 'lead');
    const spend = Number(row.spend || 0);
    console.log(
      `  [${row.campaign_name}] ${row.adset_name} | spend=$${spend.toFixed(2)} impr=${row.impressions} ctr=${row.ctr} cpm=${row.cpm} leads=${leads} cpl=${leads ? (spend / leads).toFixed(2) : '—'}`
    );
  }
}

console.log('\n=== DONE ===');
