/**
 * One-shot: seed `advertising_ad_set_state` for the production launch ad sets.
 *
 * Why this script exists: the v3b senior-buyer orchestrator at
 * `src/modules/advertising/decide/orchestrator.ts:262` returns
 * `{action: 'hold', reason: 'state_not_initialised'}` for any ad set that lacks
 * a row in `advertising_ad_set_state`, and the `triage-daily` cron only iterates
 * EXISTING rows — it never bootstraps new ad sets. Result: META_LAUNCH_ADSET_ID_EN
 * and META_LAUNCH_ADSET_ID_ES run on Meta but the agent perma-holds.
 *
 * Run this BEFORE flipping `seniorBuyerMode='on'`, after the launch ad sets are
 * confirmed in Vercel env. Idempotent via `ON CONFLICT (ad_set_id) DO NOTHING` —
 * safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/advertising/seed-ad-set-state.ts
 *
 * Required env (loaded via dotenv from `.env`):
 *   DATABASE_URL              — Neon Postgres pooled URL
 *   META_LAUNCH_ADSET_ID_EN   — EN ad-set id (from setup-meta-campaign or Vercel env)
 *   META_LAUNCH_ADSET_ID_ES   — ES ad-set id (from setup-meta-campaign or Vercel env)
 *   META_ACCESS_TOKEN         — Marketing API token (used to look up campaign_id)
 *   META_AD_ACCOUNT_ID        — `act_*` ad account scope (logged for clarity only)
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const META_API_VERSION = 'v22.0';

// SQL helpers ---------------------------------------------------------------
//
// We model the Neon client as a minimal `query(text, params)` interface so the
// script can be unit-tested with a stub. The real `neon(url)` client supports
// both tagged-template and `.query()` call styles; we use only `.query()` here
// for parity with the test injector.
export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface FetchLike {
  (input: string, init?: { method?: string }): Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }>;
}

interface SeedTarget {
  locale: 'en' | 'es';
  adSetId: string;
}

export interface SeedRunOpts {
  sql: SqlClient;
  fetchImpl: FetchLike;
  env: {
    META_ACCESS_TOKEN?: string;
    META_AD_ACCOUNT_ID?: string;
    META_LAUNCH_ADSET_ID_EN?: string;
    META_LAUNCH_ADSET_ID_ES?: string;
  };
  logger?: Pick<typeof console, 'log' | 'error' | 'table'>;
}

export interface SeedRunResult {
  inserted: number;
  alreadyPresent: number;
  failures: Array<{ adSetId: string; locale: 'en' | 'es'; error: string }>;
}

/**
 * Look up the parent `campaign_id` of a Meta ad set via Graph API.
 *
 * Inlined `fetch` (no existing helper in `src/modules/advertising/meta-graph-api/`
 * for this read; `MetaAdManagementClient` only knows ad-account-scoped endpoints).
 */
export async function lookupCampaignId(
  adSetId: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(adSetId)}?fields=campaign_id&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetchImpl(url, { method: 'GET' });
  if (!res.ok) {
    const body = await res.text().catch(() => '<unparseable>');
    throw new Error(`Meta Graph API ${res.status} for ad set ${adSetId}: ${body}`);
  }
  const json = (await res.json()) as { campaign_id?: string; id?: string };
  if (!json.campaign_id) {
    throw new Error(`Meta Graph API response for ${adSetId} missing campaign_id field`);
  }
  return json.campaign_id;
}

/**
 * Build the parameterized INSERT for one (locale, ad set, campaign) tuple.
 *
 * Sets `current_phase='B'` (NOT 'A', which is the schema default): Phase A is
 * "before any pixel data exists"; we deliberately skip it because these launch
 * ad sets are already live on Meta and accumulating impressions, so they belong
 * in Phase B = "data collection / Tier-1 hard rules" from day one. Choosing 'A'
 * would gate the agent on a bootstrap step that has no work to do.
 *
 * All other counter / timestamp columns rely on schema defaults (0 / now()).
 */
export function buildInsertSql(): { text: string; paramNames: readonly string[] } {
  const text = `
    INSERT INTO "advertising_ad_set_state"
      ("ad_set_id", "campaign_id", "locale", "current_phase", "data_maturity_mode", "optimization_event")
    VALUES
      ($1, $2, $3, 'B', 'COLD_START', 'landing_page_view')
    ON CONFLICT ("ad_set_id") DO NOTHING
  `;
  return { text, paramNames: ['ad_set_id', 'campaign_id', 'locale'] };
}

function collectTargets(env: SeedRunOpts['env']): SeedTarget[] {
  const targets: SeedTarget[] = [];
  if (env.META_LAUNCH_ADSET_ID_EN) targets.push({ locale: 'en', adSetId: env.META_LAUNCH_ADSET_ID_EN });
  if (env.META_LAUNCH_ADSET_ID_ES) targets.push({ locale: 'es', adSetId: env.META_LAUNCH_ADSET_ID_ES });
  return targets;
}

export async function runSeed(opts: SeedRunOpts): Promise<SeedRunResult> {
  const log = opts.logger ?? console;
  const targets = collectTargets(opts.env);

  if (targets.length === 0) {
    log.log('No ad set IDs found in env (META_LAUNCH_ADSET_ID_EN / META_LAUNCH_ADSET_ID_ES). Nothing to do.');
    return { inserted: 0, alreadyPresent: 0, failures: [] };
  }

  if (!opts.env.META_ACCESS_TOKEN) {
    throw new Error('META_ACCESS_TOKEN not set — required to look up campaign_id per ad set.');
  }

  const insert = buildInsertSql();
  let inserted = 0;
  let alreadyPresent = 0;
  const failures: SeedRunResult['failures'] = [];

  for (const target of targets) {
    log.log(`▶ ${target.locale.toUpperCase()} — ad set ${target.adSetId}`);
    try {
      log.log('  • looking up campaign_id via Meta Graph API…');
      const campaignId = await lookupCampaignId(
        target.adSetId,
        opts.env.META_ACCESS_TOKEN,
        opts.fetchImpl,
      );
      log.log(`    campaign_id=${campaignId}`);

      // Detect whether this row already existed by checking row count delta.
      const beforeRows = await opts.sql.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM "advertising_ad_set_state" WHERE "ad_set_id" = $1',
        [target.adSetId],
      );
      const wasPresent = Number(beforeRows[0]?.count ?? '0') > 0;

      await opts.sql.query(insert.text, [target.adSetId, campaignId, target.locale]);

      if (wasPresent) {
        alreadyPresent += 1;
        log.log('  ✅ already present — ON CONFLICT DO NOTHING');
      } else {
        inserted += 1;
        log.log('  ✅ inserted (current_phase=B, data_maturity_mode=COLD_START)');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ adSetId: target.adSetId, locale: target.locale, error: message });
      log.error(`  ❌ FAIL: ${message}`);
    }
  }

  return { inserted, alreadyPresent, failures };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('FAIL: DATABASE_URL not set');
    process.exit(1);
  }

  const env = {
    META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
    META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID,
    META_LAUNCH_ADSET_ID_EN: process.env.META_LAUNCH_ADSET_ID_EN,
    META_LAUNCH_ADSET_ID_ES: process.env.META_LAUNCH_ADSET_ID_ES,
  };

  if (!env.META_LAUNCH_ADSET_ID_EN && !env.META_LAUNCH_ADSET_ID_ES) {
    console.error('FAIL: neither META_LAUNCH_ADSET_ID_EN nor META_LAUNCH_ADSET_ID_ES is set — nothing to seed.');
    process.exit(1);
  }
  if (!env.META_ACCESS_TOKEN || !env.META_AD_ACCOUNT_ID) {
    console.error('FAIL: META_ACCESS_TOKEN and META_AD_ACCOUNT_ID required to look up campaign_id.');
    process.exit(1);
  }

  console.log('Seeding advertising_ad_set_state for launch ad sets…');
  console.log(`  ad_account=${env.META_AD_ACCOUNT_ID}`);
  console.log(`  EN ad set:  ${env.META_LAUNCH_ADSET_ID_EN ?? '(not set — skipping)'}`);
  console.log(`  ES ad set:  ${env.META_LAUNCH_ADSET_ID_ES ?? '(not set — skipping)'}`);
  console.log('');

  const neonSql = neon(databaseUrl);
  // Adapt neon's tagged-template-or-`.query()` client to our SqlClient interface.
  const sqlClient: SqlClient = {
    query: <T = Record<string, unknown>>(text: string, params?: unknown[]) =>
      neonSql.query(text, params) as Promise<T[]>,
  };

  let result: SeedRunResult;
  try {
    result = await runSeed({
      sql: sqlClient,
      fetchImpl: fetch as unknown as FetchLike,
      env,
    });
  } catch (err) {
    console.error(`FAIL during seed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log('');
  console.log('=== Seed summary ===');
  console.log(`  inserted:        ${result.inserted}`);
  console.log(`  already present: ${result.alreadyPresent}`);
  console.log(`  failures:        ${result.failures.length}`);
  if (result.failures.length > 0) {
    console.error('Failures:');
    console.table(result.failures);
    process.exit(1);
  }

  console.log('');
  console.log('Verifying — current contents of advertising_ad_set_state:');
  const rows = await sqlClient.query(
    'SELECT ad_set_id, campaign_id, locale, current_phase, data_maturity_mode FROM "advertising_ad_set_state" ORDER BY locale',
  );
  console.table(rows);

  console.log('');
  console.log('✅ Seed complete. Senior-buyer orchestrator can now produce decisions for these ad sets.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FAIL:', err);
    process.exit(1);
  });
}
