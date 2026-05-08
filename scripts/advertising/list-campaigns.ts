/**
 * Read-only ops tool: list all campaigns + ad sets in the Meta ad account
 * with last-7-days insights (spend, impressions, clicks, CTR, CPM, frequency,
 * landing-page views, leads, purchases). Used to inspect current state before
 * deciding to scale, pause, duplicate, or relaunch a campaign.
 *
 * 7d_click attribution only (matches the agent's perceive-layer convention in
 * src/modules/advertising/perceive/meta-insights.ts).
 *
 * Reads credentials from .env (use `vercel env pull` to refresh prod copy).
 *
 * Usage: npx tsx scripts/advertising/list-campaigns.ts
 */

import 'dotenv/config';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
  console.error('Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID in .env');
  process.exit(1);
}

const API = 'https://graph.facebook.com/v22.0';

interface Campaign {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

interface AdSet {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  optimization_goal: string;
  billing_event?: string;
  daily_budget?: string;
  campaign_id: string;
  start_time?: string;
}

interface InsightAction {
  action_type: string;
  value: string;
}

interface Insight {
  adset_id?: string;
  campaign_id?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  frequency?: string;
  reach?: string;
  actions?: InsightAction[];
  date_start?: string;
  date_stop?: string;
}

async function get<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API}${path}${sep}access_token=${encodeURIComponent(META_ACCESS_TOKEN!)}`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${body.slice(0, 400)}`);
  }
  return r.json() as Promise<T>;
}

function fmtUSD(s: string | number | undefined): string {
  if (s === undefined || s === '') return '$0.00';
  const n = typeof s === 'number' ? s : Number(s);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : `$${s}`;
}

function fmtNum(s: string | undefined): string {
  if (!s) return '0';
  const n = Number(s);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : s;
}

function fmtPct(s: string | undefined): string {
  if (!s) return '0.00%';
  const n = Number(s);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : s;
}

function sumActions(actions: InsightAction[] | undefined, ...types: string[]): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (types.includes(a.action_type)) total += Number(a.value) || 0;
  }
  return total;
}

function daysBetween(start?: string): number | null {
  if (!start) return null;
  const t = Date.parse(start);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

async function main() {
  const rawId = META_AD_ACCOUNT_ID!;
  const acct = rawId.startsWith('act_') ? rawId : `act_${rawId}`;
  console.log(`=== Meta ad account: ${acct} ===`);

  // last 7 calendar days, inclusive
  const today = new Date();
  const since = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const until = today.toISOString().slice(0, 10);
  console.log(`Insights window: ${since} → ${until} (7d_click attribution)\n`);

  // 1. Campaigns
  const campaignsRes = await get<{ data: Campaign[] }>(
    `/${acct}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget&limit=50`,
  );

  if (campaignsRes.data.length === 0) {
    console.log('No campaigns found in this ad account.');
    return;
  }

  // 2. Ad sets
  const adsetsRes = await get<{ data: AdSet[] }>(
    `/${acct}/adsets?fields=id,name,status,effective_status,optimization_goal,billing_event,daily_budget,campaign_id,start_time&limit=200`,
  );

  // 3. Insights at adset level for the last 7 days
  const insightFields = [
    'adset_id',
    'campaign_id',
    'spend',
    'impressions',
    'clicks',
    'ctr',
    'cpm',
    'cpc',
    'frequency',
    'reach',
    'actions',
  ].join(',');

  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const attr = encodeURIComponent(JSON.stringify(['7d_click']));
  const insightsRes = await get<{ data: Insight[] }>(
    `/${acct}/insights?level=adset&time_range=${timeRange}&fields=${insightFields}&action_attribution_windows=${attr}&limit=500`,
  );

  const insightsByAdset = new Map<string, Insight>();
  for (const i of insightsRes.data) {
    if (i.adset_id) insightsByAdset.set(i.adset_id, i);
  }

  // 4. Print, sorted by status (ACTIVE first), then name
  const sortedCampaigns = [...campaignsRes.data].sort((a, b) => {
    const aActive = a.effective_status === 'ACTIVE' ? 0 : 1;
    const bActive = b.effective_status === 'ACTIVE' ? 0 : 1;
    return aActive - bActive || a.name.localeCompare(b.name);
  });

  for (const c of sortedCampaigns) {
    console.log('━'.repeat(72));
    console.log(`Campaign: ${c.name}`);
    console.log(
      `  id=${c.id}  status=${c.effective_status}  objective=${c.objective}`,
    );
    if (c.daily_budget) {
      console.log(`  CBO daily_budget=${fmtUSD(Number(c.daily_budget) / 100)}`);
    } else {
      console.log(`  ABO mode (per-ad-set budgets)`);
    }

    const adsets = adsetsRes.data.filter((a) => a.campaign_id === c.id);
    if (adsets.length === 0) {
      console.log('  (no ad sets)');
      continue;
    }

    for (const a of adsets) {
      const ins = insightsByAdset.get(a.id);
      const leads = sumActions(
        ins?.actions,
        'lead',
        'offsite_conversion.fb_pixel_lead',
        'onsite_conversion.lead_grouped',
      );
      const purchases = sumActions(
        ins?.actions,
        'purchase',
        'offsite_conversion.fb_pixel_purchase',
      );
      const lpv = sumActions(
        ins?.actions,
        'landing_page_view',
      );
      const linkClicks = sumActions(ins?.actions, 'link_click');
      const budgetCents = a.daily_budget ? Number(a.daily_budget) : 0;
      const days = daysBetween(a.start_time);

      console.log('');
      console.log(`  ── Ad Set: ${a.name}`);
      console.log(
        `     id=${a.id}  status=${a.effective_status}  goal=${a.optimization_goal}  bill=${a.billing_event ?? '?'}`,
      );
      console.log(
        `     daily=${fmtUSD(budgetCents / 100)}  start=${a.start_time?.slice(0, 10) ?? '?'}  days_running=${days ?? '?'}`,
      );
      if (!ins) {
        console.log(`     [no insights for ${since}..${until}]`);
        continue;
      }
      console.log(
        `     7d: spend=${fmtUSD(ins.spend)}  impr=${fmtNum(ins.impressions)}  reach=${fmtNum(ins.reach)}  clicks=${fmtNum(ins.clicks)}  link_clicks=${linkClicks}`,
      );
      console.log(
        `         CTR=${fmtPct(ins.ctr)}  CPM=${fmtUSD(ins.cpm)}  CPC=${fmtUSD(ins.cpc)}  freq=${ins.frequency ?? '0'}`,
      );
      console.log(
        `         landing_page_views=${lpv}  leads=${leads}  purchases=${purchases}`,
      );
      if (leads > 0 && ins.spend) {
        const cpl = Number(ins.spend) / leads;
        console.log(`         cost_per_lead=$${cpl.toFixed(2)}`);
      }
      if (purchases > 0 && ins.spend) {
        const cpa = Number(ins.spend) / purchases;
        console.log(`         cost_per_purchase=$${cpa.toFixed(2)}`);
      }
    }
  }
  console.log('━'.repeat(72));
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
