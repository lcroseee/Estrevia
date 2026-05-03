// scripts/advertising/migrate-frequency-caps.ts
/**
 * One-shot migration: retrofit `frequency_control_specs` on the 2 production ad
 * sets that were created BEFORE Track 2's `createAdSet` patch shipped.
 *
 * Idempotent — Meta accepts the same `frequency_control_specs` payload without
 * triggering a learning reset (this isn't a budget / creative / audience edit).
 * Safe to re-run; safe to dry-run first.
 *
 * Usage:
 *   npx tsx scripts/advertising/migrate-frequency-caps.ts
 *   DRY_RUN=true npx tsx scripts/advertising/migrate-frequency-caps.ts
 *
 * Required env (loaded via dotenv from `.env`):
 *   META_ACCESS_TOKEN         — Marketing API access token (long-lived system user)
 *   META_AD_ACCOUNT_ID        — `act_XXXX` ad account id
 *   META_LAUNCH_ADSET_ID_EN   — EN ad-set id from setup-meta-campaign
 *   META_LAUNCH_ADSET_ID_ES   — ES ad-set id from setup-meta-campaign
 *
 * Optional env:
 *   DRY_RUN=true              — print plan, exit without API calls
 */

import 'dotenv/config';
import { MetaAdManagementClient } from '@/modules/advertising/meta-graph-api/ad-client';

// MVP cap: 10 impressions per user per rolling 7-day window (~1.4 imp/user/day).
// Comfortable for the astrology niche; lets Meta accumulate learning signal
// without burning the same users on cold start. Tier-1's aggregate
// frequency >= 4.0 pause stays as a safety net on top of this.
const FREQUENCY_CAP = [
  { event: 'IMPRESSIONS' as const, interval_days: 7, max_frequency: 10 },
];

async function main(): Promise<void> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const adsetEn = process.env.META_LAUNCH_ADSET_ID_EN;
  const adsetEs = process.env.META_LAUNCH_ADSET_ID_ES;
  const dryRun = process.env.DRY_RUN === 'true';

  if (!accessToken || !adAccountId) {
    throw new Error('Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID');
  }
  if (!adsetEn || !adsetEs) {
    throw new Error('Missing META_LAUNCH_ADSET_ID_EN or META_LAUNCH_ADSET_ID_ES');
  }

  console.log('Migrating frequency_control_specs on:');
  console.log(`  EN ad set: ${adsetEn}`);
  console.log(`  ES ad set: ${adsetEs}`);
  console.log(`  Cap: ${JSON.stringify(FREQUENCY_CAP)}`);
  console.log(`  Dry-run: ${dryRun}`);
  console.log('');

  if (dryRun) {
    console.log('Dry-run — no API calls made. Exiting.');
    return;
  }

  const client = new MetaAdManagementClient({ accessToken, adAccountId });

  for (const [label, adsetId] of [
    ['EN', adsetEn],
    ['ES', adsetEs],
  ] as const) {
    try {
      const result = await client.updateAdSet(adsetId, { frequencyControlSpecs: FREQUENCY_CAP });
      console.log(`  ✓ ${label} (${adsetId}): ${result.success ? 'OK' : 'FAIL'}`);
    } catch (err) {
      console.error(`  ✗ ${label} (${adsetId}): ${err instanceof Error ? err.message : String(err)}`);
      // Bubble — fail loud. Half-migrated state (EN capped, ES not) is worse
      // than fully unmigrated; the operator should diagnose and re-run.
      throw err;
    }
  }

  console.log('');
  console.log('Migration complete. Verify in Meta Ads Manager UI:');
  console.log('  Ad Set → Edit → Optimization & Delivery → Frequency Cap = 10 impressions / 7 days.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
