// scripts/advertising/setup-meta-campaign.ts
import 'dotenv/config';
import { MetaAdManagementClient } from '@/modules/advertising/meta-graph-api/ad-client';
import type { MetaAdClient } from '@/modules/advertising/act/meta-marketing';

const EN_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'IE', 'NZ'];
const ES_COUNTRIES = [
  'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO',
  'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY',
];

interface SetupOpts {
  adClient: Pick<MetaAdClient, 'createCampaign' | 'createAdSet'>;
  campaignName?: string;
  dailyBudgetCentsEn: number;
  dailyBudgetCentsEs: number;
  ageMin?: number;
  ageMax?: number;
}

interface SetupResult {
  campaign_id: string;
  adset_id_en: string;
  adset_id_es: string;
}

export async function runSetup(opts: SetupOpts): Promise<SetupResult> {
  const { adClient } = opts;
  const ageMin = opts.ageMin ?? 18;
  const ageMax = opts.ageMax ?? 45;

  const { campaign_id } = await adClient.createCampaign({
    name: opts.campaignName ?? 'Estrevia Launch — Sidereal Astrology',
    objective: 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
  });

  const en = await adClient.createAdSet({
    campaignId: campaign_id,
    name: 'EN — Launch — Sidereal interest',
    locale: 'en',
    dailyBudgetCents: opts.dailyBudgetCentsEn,
    targeting: { countries: EN_COUNTRIES, ageMin, ageMax },
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'LINK_CLICKS',
    status: 'PAUSED',
  });

  const es = await adClient.createAdSet({
    campaignId: campaign_id,
    name: 'ES — Launch — Astrología sidérea',
    locale: 'es',
    dailyBudgetCents: opts.dailyBudgetCentsEs,
    targeting: { countries: ES_COUNTRIES, ageMin, ageMax },
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'LINK_CLICKS',
    status: 'PAUSED',
  });

  return { campaign_id, adset_id_en: en.adset_id, adset_id_es: es.adset_id };
}

async function main() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) throw new Error('Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID');
  const adClient = new MetaAdManagementClient({ accessToken, adAccountId });

  const result = await runSetup({
    adClient,
    dailyBudgetCentsEn: 500, // $5/day
    dailyBudgetCentsEs: 500, // $5/day
  });

  console.log('\n=== Setup complete ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('\n=== Run these commands to add IDs to Vercel production env ===\n');
  console.log(`vercel env add META_LAUNCH_CAMPAIGN_ID production  # value: ${result.campaign_id}`);
  console.log(`vercel env add META_LAUNCH_ADSET_ID_EN production  # value: ${result.adset_id_en}`);
  console.log(`vercel env add META_LAUNCH_ADSET_ID_ES production  # value: ${result.adset_id_es}`);
  console.log('\nThen redeploy: vercel --prod\n');
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
