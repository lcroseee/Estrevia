// Meta insights — last 14d by ad set + by audience signals
import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACT_ID = process.env.META_AD_ACCOUNT_ID || 'act_1435842067150024';

if (!TOKEN) {
  console.log('❌ META_ACCESS_TOKEN missing — skip Meta pull');
  process.exit(0);
}

const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString().slice(0, 10);
const until = new Date().toISOString().slice(0, 10);

async function meta(path, params = {}) {
  const q = new URLSearchParams({ access_token: TOKEN, ...params });
  const r = await fetch(`https://graph.facebook.com/v23.0/${path}?${q}`);
  const j = await r.json();
  if (j.error) console.log(`  ⚠️  ${path} → ${j.error.message}`);
  return j;
}

console.log('═══ A. ACCOUNT-LEVEL INSIGHTS — last 14d ═══');
const acctInsights = await meta(`${ACT_ID}/insights`, {
  time_range: JSON.stringify({ since, until }),
  fields: 'spend,impressions,clicks,reach,frequency,actions,cost_per_action_type,cpm,cpc,ctr',
  level: 'account',
});
for (const r of (acctInsights.data || [])) {
  console.log(`  spend=$${r.spend} impressions=${r.impressions} clicks=${r.clicks} reach=${r.reach}`);
  console.log(`  CPM=$${r.cpm} CPC=$${r.cpc} CTR=${r.ctr}% freq=${r.frequency}`);
  console.log(`  Actions:`);
  for (const a of (r.actions || [])) {
    console.log(`    ${a.action_type.padEnd(40)} ${a.value}`);
  }
  console.log(`  Cost/action:`);
  for (const a of (r.cost_per_action_type || [])) {
    console.log(`    ${a.action_type.padEnd(40)} $${a.value}`);
  }
}

console.log('\n═══ B. AD-SET BREAKDOWN — last 14d ═══');
const adsetInsights = await meta(`${ACT_ID}/insights`, {
  time_range: JSON.stringify({ since, until }),
  fields: 'adset_id,adset_name,campaign_name,spend,impressions,clicks,reach,frequency,actions,cost_per_action_type,ctr,cpm',
  level: 'adset',
  limit: 50,
});
for (const r of (adsetInsights.data || [])) {
  const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || '0';
  const cplA = (r.cost_per_action_type || []).find(a => a.action_type === 'lead')?.value;
  console.log(`  ${r.adset_name?.slice(0, 35).padEnd(35)} spend=$${r.spend} impr=${r.impressions} clicks=${r.clicks} CTR=${r.ctr}% CPM=$${r.cpm}`);
  console.log(`    leads=${leads}  CPL=${cplA ? `$${cplA}` : 'N/A'}  freq=${r.frequency}  campaign="${r.campaign_name}"`);
}

console.log('\n═══ C. CAMPAIGN STATUS ═══');
const campaigns = await meta(`${ACT_ID}/campaigns`, {
  fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,objective,buying_type',
  limit: 50,
});
for (const c of (campaigns.data || [])) {
  const budget = c.daily_budget ? `$${c.daily_budget / 100}/day` : c.lifetime_budget ? `$${c.lifetime_budget / 100}/life` : 'no budget';
  console.log(`  ${(c.name || '').slice(0, 40).padEnd(40)} status=${c.effective_status} objective=${c.objective} ${budget}`);
}

console.log('\n═══ D. AD-SET STATUS + RUN DAYS ═══');
const adsets = await meta(`${ACT_ID}/adsets`, {
  fields: 'id,name,status,effective_status,daily_budget,optimization_goal,billing_event,destination_type,created_time,start_time,campaign{name}',
  limit: 50,
});
for (const a of (adsets.data || [])) {
  const created = new Date(a.created_time);
  const daysOld = ((Date.now() - created.getTime()) / 86400000).toFixed(1);
  const budget = a.daily_budget ? `$${a.daily_budget / 100}/day` : 'no daily';
  console.log(`  ${(a.name || '').slice(0, 30).padEnd(30)} ${a.effective_status.padEnd(20)} ${budget.padEnd(12)} opt=${a.optimization_goal} dest=${a.destination_type} age=${daysOld}d`);
}

console.log('\n═══ E. BREAKDOWN BY COUNTRY (last 7d) ═══');
const country = await meta(`${ACT_ID}/insights`, {
  time_range: JSON.stringify({ since: new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10), until }),
  fields: 'spend,impressions,clicks,actions,cpm,ctr',
  breakdowns: 'country',
  level: 'account',
  limit: 30,
});
const rows = (country.data || []).sort((a, b) => parseFloat(b.spend || 0) - parseFloat(a.spend || 0));
for (const r of rows.slice(0, 12)) {
  const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || '0';
  console.log(`  ${r.country}  spend=$${r.spend} impr=${r.impressions} CTR=${r.ctr}% CPM=$${r.cpm} leads=${leads}`);
}

console.log('\n═══ F. BREAKDOWN BY AGE+GENDER (last 7d) ═══');
const ageGender = await meta(`${ACT_ID}/insights`, {
  time_range: JSON.stringify({ since: new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10), until }),
  fields: 'spend,impressions,clicks,actions,ctr',
  breakdowns: 'age,gender',
  level: 'account',
  limit: 30,
});
for (const r of (ageGender.data || []).slice(0, 12)) {
  const leads = (r.actions || []).find(a => a.action_type === 'lead')?.value || '0';
  console.log(`  age=${r.age} gender=${r.gender}  spend=$${r.spend} CTR=${r.ctr}% leads=${leads}`);
}

console.log('\n— End Meta audit —');
