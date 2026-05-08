/**
 * One-shot script: resume the ES Traffic ad set (and its parent campaign) on
 * the Meta ad account. Designed to be invoked manually OR by a scheduled
 * CronCreate prompt at the founder-set launch time.
 *
 * Targets (resolved 2026-05-07 via list-campaigns.ts against act_1435842067150024):
 *
 *   Campaign id=120243025911300527
 *     name="Estrevia Launch — Sidereal Astrology"
 *     objective=OUTCOME_TRAFFIC
 *     status=PAUSED → ACTIVE
 *
 *   Ad Set id=120243025977660527
 *     name="ES — Launch — Astrología sidérea"
 *     goal=LANDING_PAGE_VIEWS  bill=IMPRESSIONS
 *     daily_budget=$6.00
 *     status=PAUSED → ACTIVE
 *
 * The ad set is the LPV-optimized cold-start ES bucket (Stage 1 of the launch
 * playbook in docs/marketing.md). Its 7-day baseline as of 2026-05-07: 534 LPV
 * across 20.4k impressions, $14.01 spend, freq=1.29. Zero leads — that gap is
 * what the just-shipped email-gate is meant to close (now wired to fire CAPI
 * Lead + browser fbq Lead with shared event_id, so this ad set should start
 * accumulating Lead conversions once chart-calc traffic hits the gated UI).
 *
 * Order of operations matters: the parent campaign must be ACTIVE before its
 * child ad set can effectively run. Meta accepts ACTIVE on a child whose
 * parent is PAUSED, but the ad set then carries effective_status=CAMPAIGN_PAUSED
 * and serves zero impressions. So we POST campaign first, then ad set.
 *
 * Env: requires META_ACCESS_TOKEN. The ad-account id is implicit in the
 * object ids (every Meta resource id is globally unique within Graph API).
 *
 * DRY_RUN=1 to preview without mutating.
 *
 * Usage:
 *   npx tsx scripts/advertising/launch-es-traffic.ts          # live
 *   DRY_RUN=1 npx tsx scripts/advertising/launch-es-traffic.ts # preview
 */

import 'dotenv/config';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
if (!META_ACCESS_TOKEN) {
  console.error('Missing META_ACCESS_TOKEN in .env');
  process.exit(1);
}

const API = 'https://graph.facebook.com/v22.0';
const DRY_RUN = process.env.DRY_RUN === '1';

const CAMPAIGN_ID = '120243025911300527';
const CAMPAIGN_NAME = 'Estrevia Launch — Sidereal Astrology';
const ADSET_ID = '120243025977660527';
const ADSET_NAME = 'ES — Launch — Astrología sidérea';

interface MetaIdResponse {
  id?: string;
  success?: boolean;
}

interface MetaErrorBody {
  error?: { message?: string; type?: string; code?: number; fbtrace_id?: string };
}

async function getJson<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API}${path}${sep}access_token=${encodeURIComponent(META_ACCESS_TOKEN!)}`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`GET ${path} → ${r.status} ${r.statusText}: ${body.slice(0, 400)}`);
  }
  return r.json() as Promise<T>;
}

async function postStatusActive(objectId: string, label: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`[DRY_RUN] would POST /${objectId}  body={status:"ACTIVE"}  (${label})`);
    return;
  }

  const url = `${API}/${objectId}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'ACTIVE',
      access_token: META_ACCESS_TOKEN,
    }),
  });

  const text = await r.text();
  if (!r.ok) {
    let parsedErr: MetaErrorBody | undefined;
    try { parsedErr = JSON.parse(text) as MetaErrorBody; } catch { /* not JSON */ }
    const msg = parsedErr?.error?.message ?? text.slice(0, 400);
    throw new Error(`POST /${objectId} → ${r.status} ${r.statusText}: ${msg}`);
  }
  let parsed: MetaIdResponse;
  try { parsed = JSON.parse(text) as MetaIdResponse; } catch { parsed = {}; }
  if (parsed.success === false) {
    throw new Error(`POST /${objectId} → success:false in body: ${text.slice(0, 400)}`);
  }
  console.log(`OK  POST /${objectId}  status=ACTIVE  (${label})`);
}

async function readEffectiveStatus(objectId: string, label: string): Promise<void> {
  const r = await getJson<{ effective_status?: string; status?: string }>(
    `/${objectId}?fields=status,effective_status`,
  );
  console.log(`     ${label}: status=${r.status ?? '?'}  effective_status=${r.effective_status ?? '?'}`);
}

async function main() {
  console.log(`=== launch-es-traffic ${DRY_RUN ? '(DRY RUN)' : ''} ===`);
  console.log(`Now (UTC): ${new Date().toISOString()}`);
  console.log('');

  // 0. Read current state for confirmation in the log.
  console.log('Pre-flight state:');
  await readEffectiveStatus(CAMPAIGN_ID, `Campaign "${CAMPAIGN_NAME}"`);
  await readEffectiveStatus(ADSET_ID, `Ad Set   "${ADSET_NAME}"`);
  console.log('');

  // 1. Resume the campaign first.
  await postStatusActive(CAMPAIGN_ID, `Campaign "${CAMPAIGN_NAME}"`);

  // 2. Then resume the ad set.
  await postStatusActive(ADSET_ID, `Ad Set "${ADSET_NAME}"`);

  // 3. Verify post-state.
  console.log('');
  console.log('Post-flight state:');
  await readEffectiveStatus(CAMPAIGN_ID, `Campaign "${CAMPAIGN_NAME}"`);
  await readEffectiveStatus(ADSET_ID, `Ad Set   "${ADSET_NAME}"`);
  console.log('');

  if (DRY_RUN) {
    console.log('[DRY_RUN] no mutations were sent. Re-run without DRY_RUN=1 to apply.');
  } else {
    console.log('DONE. ES Traffic ad set is now ACTIVE. Meta typically begins serving within 5-15 min.');
  }
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
