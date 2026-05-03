// scripts/advertising/setup-meta-campaign.ts
import 'dotenv/config';
import { MetaAdManagementClient } from '@/modules/advertising/meta-graph-api/ad-client';
import type { MetaAdClient } from '@/modules/advertising/act/meta-marketing';

// Targeting per docs/marketing.md "Параллельная Spanish-кампания (с дня 1)":
// EN Tier 1 — 4 high-CPM English markets ($14/day = 70% of $20)
// ES LATAM   — 4 high-volume LATAM markets ($6/day = 30%)
//
// AR excluded despite docs listing it: Stripe is USD-only and Argentina's
// "Impuesto PAÍS" + Ganancias/Bienes Personales percepciones make foreign-
// currency subscriptions effectively ~1.85× more expensive at checkout, plus
// many local cards block USD merchant charges entirely. Adding AR back
// requires either Stripe ARS support or a Mercado Pago integration.
const EN_COUNTRIES = ['US', 'GB', 'CA', 'AU'];
const ES_COUNTRIES = ['MX', 'CO', 'CL', 'PE'];

interface SetupOpts {
  adClient: Pick<MetaAdClient, 'createCampaign' | 'createAdSet'>;
  campaignName?: string;
  dailyBudgetCentsEn: number;
  dailyBudgetCentsEs: number;
  ageMin?: number;
  ageMax?: number;
  /** Reuse an existing campaign instead of creating a new one (recovery mode). */
  reuseCampaignId?: string;
}

interface SetupResult {
  campaign_id: string;
  adset_id_en: string;
  adset_id_es: string;
}

export async function runSetup(opts: SetupOpts): Promise<SetupResult> {
  const { adClient } = opts;
  // Age 22-38 per docs/marketing.md — astrology-niche sweet spot.
  // No gender filter: Meta's 2026 algorithm finds the 70-80% female audience
  // organically; explicit female-only cuts reach without proportional CPM gain.
  const ageMin = opts.ageMin ?? 22;
  const ageMax = opts.ageMax ?? 38;

  // Allow reusing an existing PAUSED campaign (e.g. from a partial prior run)
  // instead of creating a new one. Skip campaign creation if reuseCampaignId set.
  const campaign_id = opts.reuseCampaignId
    ? opts.reuseCampaignId
    : (await adClient.createCampaign({
        name: opts.campaignName ?? 'Estrevia Launch — Sidereal Astrology',
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
      })).campaign_id;

  // optimization_goal=LANDING_PAGE_VIEWS + billing=IMPRESSIONS:
  // LPV filters out drive-by clicks → cleaner pixel learning signal on cold start.
  // LINK_CLICKS optimization counts every click (incl. profile/comments) and
  // pollutes pixel during the critical first-50-events window.
  //
  // frequencyControlSpecs={ IMPRESSIONS, 7, 10 }: per-user impression cap
  // enforced by Meta auction (≤10 imps per user per rolling 7-day window
  // ≈ 1.4 imp/user/day). Comfortable for astrology niche; lets Meta
  // accumulate learning signal without burning users on cold start. Tier-1's
  // aggregate frequency >= 4.0 pause stays as a safety net on top of this.
  const FREQUENCY_CAP = [
    { event: 'IMPRESSIONS' as const, interval_days: 7, max_frequency: 10 },
  ];

  const en = await adClient.createAdSet({
    campaignId: campaign_id,
    name: 'EN — Launch — Sidereal interest',
    locale: 'en',
    dailyBudgetCents: opts.dailyBudgetCentsEn,
    targeting: { countries: EN_COUNTRIES, ageMin, ageMax },
    optimizationGoal: 'LANDING_PAGE_VIEWS',
    billingEvent: 'IMPRESSIONS',
    status: 'PAUSED',
    frequencyControlSpecs: FREQUENCY_CAP,
  });

  const es = await adClient.createAdSet({
    campaignId: campaign_id,
    name: 'ES — Launch — Astrología sidérea',
    locale: 'es',
    dailyBudgetCents: opts.dailyBudgetCentsEs,
    targeting: { countries: ES_COUNTRIES, ageMin, ageMax },
    optimizationGoal: 'LANDING_PAGE_VIEWS',
    billingEvent: 'IMPRESSIONS',
    status: 'PAUSED',
    frequencyControlSpecs: FREQUENCY_CAP,
  });

  return { campaign_id, adset_id_en: en.adset_id, adset_id_es: es.adset_id };
}

async function main() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) throw new Error('Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID');
  const adClient = new MetaAdManagementClient({ accessToken, adAccountId });

  // META_REUSE_CAMPAIGN_ID: recovery hatch when a prior partial run created a
  // campaign but failed at the adset step. Set this to skip campaign creation
  // and only create the missing adsets.
  const reuseCampaignId = process.env.META_REUSE_CAMPAIGN_ID || undefined;

  const result = await runSetup({
    adClient,
    dailyBudgetCentsEn: 1400, // $14/day — 70% per docs/marketing.md
    dailyBudgetCentsEs: 600,  // $6/day  — 30% per docs/marketing.md
    reuseCampaignId,
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
