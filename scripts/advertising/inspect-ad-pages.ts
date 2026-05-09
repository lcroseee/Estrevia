/**
 * Read-only ops tool: list every ad in the account with the Facebook Page it
 * is published from (object_story_spec.page_id on its creative). Groups ads
 * by page so a wrong-page assignment surfaces immediately.
 *
 * Why this exists: ads created manually via Meta Ads Manager can silently
 * pick the wrong Page from the user's Business when the user has access to
 * multiple Pages — the ad serves under the wrong brand name in feeds.
 *
 * Each unique page_id is resolved via /v22.0/{page_id}?fields=name. If the
 * page name does NOT match `EXPECTED_PAGE_NAME_PATTERN` it is flagged with
 * `MISMATCH` next to every ad attached to it.
 *
 * Reads credentials from .env. Set EXPECTED_PAGE_NAME_PATTERN to override
 * the default substring match (case-insensitive).
 *
 * Usage: npx tsx scripts/advertising/inspect-ad-pages.ts
 */

import 'dotenv/config';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const EXPECTED_PAGE_NAME_PATTERN = (
  process.env.EXPECTED_PAGE_NAME_PATTERN ?? 'estrevia'
).toLowerCase();

if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
  console.error('Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID in .env');
  process.exit(1);
}

const API = 'https://graph.facebook.com/v22.0';

interface Ad {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  campaign_id: string;
  adset_id: string;
  creative?: { id: string };
}

interface CreativeStorySpec {
  page_id?: string;
  instagram_actor_id?: string;
}

interface Creative {
  id: string;
  object_story_spec?: CreativeStorySpec;
  effective_object_story_id?: string;
  status?: string;
}

interface AdSet {
  id: string;
  name: string;
  campaign_id: string;
}

interface Campaign {
  id: string;
  name: string;
}

interface PageInfo {
  id: string;
  name?: string;
  username?: string;
  link?: string;
  fan_count?: number;
  category?: string;
}

async function get<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API}${path}${sep}access_token=${encodeURIComponent(META_ACCESS_TOKEN!)}`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`${r.status} ${r.statusText} on ${path}: ${body.slice(0, 400)}`);
  }
  return r.json() as Promise<T>;
}

async function paginate<T>(initialPath: string): Promise<T[]> {
  const out: T[] = [];
  let path = initialPath;
  while (path) {
    const res = await get<{ data: T[]; paging?: { next?: string } }>(path);
    out.push(...res.data);
    const next = res.paging?.next;
    if (!next) break;
    // The next URL is absolute — strip our prefix and the existing
    // access_token so we can reuse get().
    const u = new URL(next);
    u.searchParams.delete('access_token');
    path = `${u.pathname.replace(/^\/v\d+\.\d+/, '')}${u.search}`;
  }
  return out;
}

async function main() {
  const rawId = META_AD_ACCOUNT_ID!;
  const acct = rawId.startsWith('act_') ? rawId : `act_${rawId}`;
  console.log(`=== Meta ad account: ${acct} ===`);
  console.log(`Expected Page name pattern (case-insensitive): "${EXPECTED_PAGE_NAME_PATTERN}"`);
  console.log('');

  // 1. Pull every ad in the account (both PAUSED and ACTIVE, all statuses).
  const ads = await paginate<Ad>(
    `/${acct}/ads?fields=id,name,status,effective_status,campaign_id,adset_id,creative{id}&limit=200`,
  );
  console.log(`Fetched ${ads.length} ads.`);

  if (ads.length === 0) {
    console.log('No ads in this account.');
    return;
  }

  // 2. Fetch parent campaign + ad set names so output is human-readable.
  const [campaigns, adsets] = await Promise.all([
    paginate<Campaign>(`/${acct}/campaigns?fields=id,name&limit=200`),
    paginate<AdSet>(`/${acct}/adsets?fields=id,name,campaign_id&limit=200`),
  ]);
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const adsetName = new Map(adsets.map((a) => [a.id, a.name]));

  // 3. For every unique creative_id on the ads, fetch its story spec.
  const uniqueCreativeIds = [...new Set(ads.map((a) => a.creative?.id).filter((x): x is string => !!x))];
  console.log(`Resolving ${uniqueCreativeIds.length} unique creatives…`);

  const creativeById = new Map<string, Creative>();
  // Batch in groups of 20 to avoid one giant fan-out (the Graph API also
  // imposes per-request limits when using ?ids=…).
  for (let i = 0; i < uniqueCreativeIds.length; i += 20) {
    const slice = uniqueCreativeIds.slice(i, i + 20);
    const idsParam = encodeURIComponent(slice.join(','));
    const res = await get<Record<string, Creative>>(
      `/?ids=${idsParam}&fields=id,object_story_spec,effective_object_story_id,status`,
    );
    for (const id of slice) {
      const c = res[id];
      if (c) creativeById.set(id, c);
    }
  }

  // 4. Resolve each unique page_id to a name.
  const pageIds = [...new Set(
    [...creativeById.values()]
      .map((c) => c.object_story_spec?.page_id)
      .filter((x): x is string => !!x),
  )];
  console.log(`Resolving ${pageIds.length} unique Pages…\n`);

  const pageById = new Map<string, PageInfo>();
  for (const pid of pageIds) {
    try {
      const p = await get<PageInfo>(`/${pid}?fields=id,name,username,link,fan_count,category`);
      pageById.set(pid, p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pageById.set(pid, { id: pid, name: `[unresolved: ${msg.slice(0, 80)}]` });
    }
  }

  // 5. Group ads by page_id and print.
  type Entry = { ad: Ad; creative: Creative | undefined; pageId: string | undefined };
  const byPage = new Map<string, Entry[]>();
  const noPage: Entry[] = [];

  for (const ad of ads) {
    const creative = ad.creative ? creativeById.get(ad.creative.id) : undefined;
    const pageId = creative?.object_story_spec?.page_id;
    const entry: Entry = { ad, creative, pageId };
    if (!pageId) {
      noPage.push(entry);
      continue;
    }
    const bucket = byPage.get(pageId) ?? [];
    bucket.push(entry);
    byPage.set(pageId, bucket);
  }

  // Sort pages: matched pattern first, then mismatched
  const sortedPageIds = [...byPage.keys()].sort((a, b) => {
    const aMatch = (pageById.get(a)?.name ?? '').toLowerCase().includes(EXPECTED_PAGE_NAME_PATTERN);
    const bMatch = (pageById.get(b)?.name ?? '').toLowerCase().includes(EXPECTED_PAGE_NAME_PATTERN);
    if (aMatch !== bMatch) return aMatch ? -1 : 1;
    return (pageById.get(a)?.name ?? '').localeCompare(pageById.get(b)?.name ?? '');
  });

  for (const pid of sortedPageIds) {
    const page = pageById.get(pid);
    const name = page?.name ?? '<unresolved>';
    const matches = name.toLowerCase().includes(EXPECTED_PAGE_NAME_PATTERN);
    const tag = matches ? '✅ EXPECTED' : '❌ MISMATCH';
    console.log('━'.repeat(72));
    console.log(`Page: "${name}"  ${tag}`);
    console.log(`  id=${pid}`);
    if (page?.username) console.log(`  username=@${page.username}`);
    if (page?.link)     console.log(`  link=${page.link}`);
    if (page?.category) console.log(`  category=${page.category}`);
    if (page?.fan_count !== undefined) console.log(`  fans=${page.fan_count.toLocaleString('en-US')}`);
    const entries = byPage.get(pid)!;
    console.log(`  ads attached: ${entries.length}`);
    for (const e of entries) {
      const camp = campaignName.get(e.ad.campaign_id) ?? e.ad.campaign_id;
      const aset = adsetName.get(e.ad.adset_id) ?? e.ad.adset_id;
      console.log(
        `   • ad ${e.ad.id}  status=${e.ad.effective_status}  "${e.ad.name}"`,
      );
      console.log(`       campaign="${camp}"  adset="${aset}"  creative=${e.ad.creative?.id ?? '?'}`);
    }
  }

  if (noPage.length > 0) {
    console.log('━'.repeat(72));
    console.log(`Ads with NO resolvable page_id (creative missing object_story_spec):`);
    for (const e of noPage) {
      console.log(`  • ad ${e.ad.id}  "${e.ad.name}"  creative=${e.ad.creative?.id ?? '?'}`);
    }
  }

  console.log('━'.repeat(72));

  // 6. Final summary line — easy to grep in CI/cron logs.
  const mismatchCount = sortedPageIds
    .filter((pid) => !((pageById.get(pid)?.name ?? '').toLowerCase().includes(EXPECTED_PAGE_NAME_PATTERN)))
    .reduce((acc, pid) => acc + (byPage.get(pid)?.length ?? 0), 0);
  if (mismatchCount > 0) {
    console.log(
      `\n⚠️  ${mismatchCount} ads attached to a Page whose name does NOT contain "${EXPECTED_PAGE_NAME_PATTERN}".`,
    );
    process.exit(2);
  }
  console.log(`\n✅ All ${ads.length} ads attached to expected Page(s).`);
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
