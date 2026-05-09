/**
 * One-shot fix for ad 120243030785440527 ("ad_v6Xb-rdtuo3jta50dPq1Q") which
 * was manually created in Ads Manager with the wrong Facebook Page assignment
 * (page_id=593228517212828 — usaautomotoexport, a leftover from a prior
 * project) instead of the Estrevia Page (page_id=1087394517790815).
 *
 * `object_story_spec.page_id` is immutable on Meta creatives, so the fix is:
 *   1. PAUSE the wrong-page ad (immediate brand cleanup)
 *   2. POST a new creative with the same image_hash + copy + cta + utm_link,
 *      but with the correct page_id
 *   3. POST a new ad in the same ad set (120243025977660527) with the new
 *      creative, status=ACTIVE
 *
 * The original asset bytes are NOT re-uploaded — Meta keeps image_hash
 * `36395dbad0cce5d0113277c3a769957f` resolvable inside this ad account, so
 * we reference it directly. The ad set's learning history accrues at the
 * AD SET level, not the AD level, so swapping in a fresh ad in the same
 * set has near-zero effect on delivery.
 *
 * The paused ad (ad_es_lead_v1, 120243116868200527, also on the wrong
 * page) is intentionally NOT touched here — recreate it later when you
 * resume the Leads campaign.
 *
 * DRY_RUN=1 to preview without mutating.
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/advertising/fix-wrong-page-ad.ts   # preview
 *   npx tsx scripts/advertising/fix-wrong-page-ad.ts             # apply
 */

import 'dotenv/config';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const DRY_RUN = process.env.DRY_RUN === '1';

if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
  console.error('Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID in .env');
  process.exit(1);
}

const API = 'https://graph.facebook.com/v22.0';

// Hard-coded targets (verified 2026-05-08 via inspect-ad-pages.ts).
const ACCOUNT = META_AD_ACCOUNT_ID.startsWith('act_')
  ? META_AD_ACCOUNT_ID
  : `act_${META_AD_ACCOUNT_ID}`;

const WRONG_AD_ID = '120243030785440527';
const ADSET_ID = '120243025977660527'; // ES — Launch — Astrología sidérea
const CORRECT_PAGE_ID = '1087394517790815'; // Estrevia Page
const WRONG_PAGE_ID = '593228517212828'; // usaautomotoexport — for sanity check

// Snapshot of the original creative content (1685224642482535, page_id=wrong).
const IMAGE_HASH = '36395dbad0cce5d0113277c3a769957f';
const LINK = 'https://estrevia.app/?utm_source=meta&utm_medium=image&utm_campaign=estrevia_launch_es&utm_content=v6Xb-rdtuo3jta50dPq1Q&utm_term=es';
const MESSAGE = 'La astrología sidérea calcula las posiciones de los planetas según donde aparecen realmente en el cielo esta noche.';
const HEADLINE = 'La astrología sidérea calcula las posici';
const CTA_TYPE = 'LEARN_MORE';
const NEW_CREATIVE_NAME = 'creative_v6Xb-rdtuo3jta50dPq1Q-fixpage 2026-05-08';
const NEW_AD_NAME = 'ad_v6Xb-rdtuo3jta50dPq1Q-fixpage';

interface MetaIdResponse { id?: string; success?: boolean }
interface MetaErrorBody { error?: { message?: string; type?: string; code?: number; fbtrace_id?: string } }

async function getJson<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API}${path}${sep}access_token=${encodeURIComponent(META_ACCESS_TOKEN!)}`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`GET ${path} → ${r.status}: ${body.slice(0, 400)}`);
  }
  return r.json() as Promise<T>;
}

async function postJson<T>(path: string, body: Record<string, unknown>, label: string): Promise<T> {
  if (DRY_RUN) {
    console.log(`[DRY_RUN] would POST ${path}  body=${JSON.stringify(body)}  (${label})`);
    return { id: '<dry-run>' } as unknown as T;
  }
  const url = `${API}${path}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: META_ACCESS_TOKEN }),
  });
  const text = await r.text();
  if (!r.ok) {
    let err: MetaErrorBody | undefined;
    try { err = JSON.parse(text) as MetaErrorBody; } catch { /* not json */ }
    const msg = err?.error?.message ?? text.slice(0, 400);
    throw new Error(`POST ${path} → ${r.status}: ${msg}`);
  }
  let parsed: T;
  try { parsed = JSON.parse(text) as T; } catch { parsed = {} as T; }
  console.log(`OK  POST ${path}  → ${JSON.stringify(parsed)}  (${label})`);
  return parsed;
}

async function main() {
  console.log(`=== fix-wrong-page-ad ${DRY_RUN ? '(DRY RUN)' : ''} ===`);
  console.log(`Account: ${ACCOUNT}`);
  console.log(`Now (UTC): ${new Date().toISOString()}`);
  console.log('');

  // Step 0: sanity-check the assumption — the target ad's creative MUST still
  // be on the wrong page. If a human already fixed it manually, abort to avoid
  // creating a duplicate.
  console.log('Pre-flight: re-verify the target ad is still on the wrong Page…');
  const adInfo = await getJson<{ id: string; effective_status: string; creative?: { id: string }; adset_id: string }>(
    `/${WRONG_AD_ID}?fields=id,effective_status,creative{id},adset_id`,
  );
  if (adInfo.adset_id !== ADSET_ID) {
    throw new Error(`Sanity-check FAILED: ad ${WRONG_AD_ID} no longer in adset ${ADSET_ID} (now in ${adInfo.adset_id}). Aborting.`);
  }
  const creativeId = adInfo.creative?.id;
  if (!creativeId) throw new Error(`Sanity-check FAILED: ad ${WRONG_AD_ID} has no creative.`);
  const creativeInfo = await getJson<{ object_story_spec?: { page_id?: string } }>(
    `/${creativeId}?fields=object_story_spec`,
  );
  const currentPageId = creativeInfo.object_story_spec?.page_id;
  if (currentPageId !== WRONG_PAGE_ID) {
    throw new Error(
      `Sanity-check FAILED: creative ${creativeId} page_id is "${currentPageId}", expected "${WRONG_PAGE_ID}" (already fixed?). Aborting to avoid duplicate.`,
    );
  }
  console.log(`  ad ${WRONG_AD_ID}  effective_status=${adInfo.effective_status}  creative=${creativeId}  page_id=${currentPageId} (wrong, as expected)`);
  console.log('');

  // Step 1: pause the wrong ad immediately.
  await postJson<MetaIdResponse>(`/${WRONG_AD_ID}`, { status: 'PAUSED' }, `pause wrong ad ${WRONG_AD_ID}`);

  // Step 2: create a new AdCreative on the correct Page, reusing the same
  // image_hash + copy + cta + link.
  const newCreativeRes = await postJson<MetaIdResponse>(
    `/${ACCOUNT}/adcreatives`,
    {
      name: NEW_CREATIVE_NAME,
      object_story_spec: {
        page_id: CORRECT_PAGE_ID,
        link_data: {
          image_hash: IMAGE_HASH,
          message: MESSAGE,
          link: LINK,
          name: HEADLINE,
          call_to_action: { type: CTA_TYPE, value: { link: LINK } },
        },
      },
    },
    'create new creative on Estrevia Page',
  );
  const newCreativeId = newCreativeRes.id;
  if (!newCreativeId) throw new Error('Creative creation returned no id');

  // Step 3: create a new Ad in the same ad set, ACTIVE, with the new creative.
  const newAdRes = await postJson<MetaIdResponse>(
    `/${ACCOUNT}/ads`,
    {
      name: NEW_AD_NAME,
      adset_id: ADSET_ID,
      creative: { creative_id: newCreativeId },
      status: 'ACTIVE',
    },
    'create new ad in same ad set, ACTIVE',
  );
  const newAdId = newAdRes.id;

  console.log('');
  console.log('=== summary ===');
  console.log(`  paused old ad: ${WRONG_AD_ID}  (page=${WRONG_PAGE_ID} usaautomotoexport)`);
  console.log(`  new creative:  ${newCreativeId}  page=${CORRECT_PAGE_ID} (Estrevia)`);
  console.log(`  new ad:        ${newAdId}  in adset ${ADSET_ID}, ACTIVE`);
  if (DRY_RUN) console.log('\n[DRY_RUN] no mutations sent. Re-run without DRY_RUN=1 to apply.');
  else console.log('\nDONE. Run inspect-ad-pages.ts again to verify zero ads remain on the wrong Page in active campaigns.');
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
