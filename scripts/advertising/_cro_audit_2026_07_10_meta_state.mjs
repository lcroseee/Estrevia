// READ-ONLY probe — CRO audit 2026-07-10, Meta sector.
// (1) Account daily spend 2026-05-20..2026-07-10 (is the account still dark?)
// (2) Campaign / ad-set / ad statuses + updated_time
// (3) Account health: account_status, disable_reason, issues_info (disapprovals, DSA blockers)
// (4) Per-ad-set + per-ad insights for the window (in case ANY spend happened)
// All Graph API GETs only.

import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACT = process.env.META_AD_ACCOUNT_ID || 'act_1435842067150024';
const VER = 'v23.0';

const SINCE = '2026-05-20';
const UNTIL = '2026-07-10';

async function fb(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${VER}/${path}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const r = await fetch(url);
  if (!r.ok) {
    const t = await r.text();
    console.log(`  WARN ${path} -> ${r.status} ${t.slice(0, 400)}`);
    return { data: [] };
  }
  return r.json();
}

function act(row, type) {
  const a = (row.actions || []).find((x) => x.action_type === type);
  return a ? Number(a.value) : 0;
}

console.log(`=== ACCOUNT HEALTH — ${ACT} ===`);
{
  const a = await fb(ACT, {
    fields:
      'account_status,disable_reason,name,currency,amount_spent,balance,spend_cap,adtrust_dsl,timezone_name',
  });
  console.log(JSON.stringify(a, null, 2));
}

console.log(`\n=== ACCOUNT DAILY SPEND ${SINCE}..${UNTIL} (time_increment=1) ===`);
{
  const res = await fb(`${ACT}/insights`, {
    time_range: { since: SINCE, until: UNTIL },
    time_increment: 1,
    level: 'account',
    fields: 'spend,impressions,reach,clicks,actions,date_start',
    limit: 200,
  });
  let total = 0;
  let lastSpendDay = null;
  for (const row of res.data || []) {
    const spend = Number(row.spend || 0);
    total += spend;
    if (spend > 0) lastSpendDay = row.date_start;
    const leads = act(row, 'lead');
    // only print non-zero days + first/last few to keep output readable
    if (spend > 0 || Number(row.impressions || 0) > 0 || leads > 0) {
      console.log(
        `  ${row.date_start}  spend=$${spend.toFixed(2)}  impr=${row.impressions}  reach=${row.reach}  clicks=${row.clicks}  leads=${leads}`
      );
    }
  }
  console.log(`  -- rows returned: ${(res.data || []).length}`);
  console.log(`  -- TOTAL spend ${SINCE}..${UNTIL}: $${total.toFixed(2)}`);
  console.log(`  -- last day with spend > 0: ${lastSpendDay || 'NONE in window'}`);
}

console.log(`\n=== CAMPAIGNS (all, any status) ===`);
{
  const res = await fb(`${ACT}/campaigns`, {
    fields:
      'id,name,status,effective_status,objective,daily_budget,lifetime_budget,updated_time,created_time,issues_info',
    limit: 100,
  });
  for (const c of res.data || []) {
    console.log(
      `  [${c.id}] ${c.name} | ${c.effective_status} (cfg=${c.status}) | obj=${c.objective} | updated=${c.updated_time}`
    );
    if (c.issues_info) console.log(`     issues: ${JSON.stringify(c.issues_info)}`);
  }
}

console.log(`\n=== AD SETS (all, any status) ===`);
{
  const res = await fb(`${ACT}/adsets`, {
    fields:
      'id,name,status,effective_status,daily_budget,optimization_goal,billing_event,updated_time,campaign_id,issues_info,learning_stage_info',
    limit: 100,
  });
  for (const s of res.data || []) {
    console.log(
      `  [${s.id}] ${s.name} | ${s.effective_status} (cfg=${s.status}) | budget=${s.daily_budget} | opt=${s.optimization_goal} | updated=${s.updated_time}`
    );
    if (s.learning_stage_info)
      console.log(`     learning: ${JSON.stringify(s.learning_stage_info)}`);
    if (s.issues_info) console.log(`     issues: ${JSON.stringify(s.issues_info)}`);
  }
}

console.log(`\n=== ADS (all, any status) — status + issues ===`);
{
  const res = await fb(`${ACT}/ads`, {
    fields:
      'id,name,status,effective_status,updated_time,created_time,adset_id,issues_info,ad_review_feedback',
    limit: 200,
  });
  for (const a of res.data || []) {
    console.log(
      `  [${a.id}] ${(a.name || '').slice(0, 44).padEnd(44)} | ${a.effective_status} (cfg=${a.status}) | updated=${a.updated_time}`
    );
    if (a.issues_info) console.log(`     issues: ${JSON.stringify(a.issues_info)}`);
    if (a.ad_review_feedback)
      console.log(`     review_feedback: ${JSON.stringify(a.ad_review_feedback)}`);
  }
}

console.log(`\n=== PER-AD-SET INSIGHTS ${SINCE}..${UNTIL} (any spend?) ===`);
{
  const res = await fb(`${ACT}/insights`, {
    time_range: { since: SINCE, until: UNTIL },
    level: 'adset',
    fields: 'adset_id,adset_name,spend,impressions,reach,clicks,ctr,cpm,frequency,actions',
    limit: 100,
  });
  if (!(res.data || []).length) console.log('  (no rows — zero delivery in window)');
  for (const row of res.data || []) {
    const leads = act(row, 'lead');
    const spend = Number(row.spend || 0);
    console.log(
      `  ${row.adset_name} | spend=$${spend.toFixed(2)} impr=${row.impressions} ctr=${row.ctr} cpm=${row.cpm} leads=${leads} cpl=${leads ? (spend / leads).toFixed(2) : '—'}`
    );
  }
}

console.log(`\n=== PER-AD INSIGHTS ${SINCE}..${UNTIL} ===`);
{
  const res = await fb(`${ACT}/insights`, {
    time_range: { since: SINCE, until: UNTIL },
    level: 'ad',
    fields: 'ad_id,ad_name,spend,impressions,clicks,ctr,actions',
    limit: 200,
  });
  if (!(res.data || []).length) console.log('  (no rows — zero delivery in window)');
  for (const row of res.data || []) {
    const leads = act(row, 'lead');
    const spend = Number(row.spend || 0);
    console.log(
      `  ${row.ad_name} | spend=$${spend.toFixed(2)} impr=${row.impressions} ctr=${row.ctr} leads=${leads} cpl=${leads ? (spend / leads).toFixed(2) : '—'}`
    );
  }
}

console.log('\n=== DONE ===');
