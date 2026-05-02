import type { MetadataRoute } from 'next';
import { getAllEssaySlugs, getAllSignSlugs } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';

// 78 Thoth Tarot card IDs — all Major + Minor Arcana
const TAROT_CARD_IDS = [
  // Major Arcana (22)
  'the-fool', 'the-magus', 'the-priestess', 'the-empress', 'the-emperor',
  'the-hierophant', 'the-lovers', 'the-chariot', 'adjustment', 'the-hermit',
  'fortune', 'lust', 'the-hanged-man', 'death', 'art',
  'the-devil', 'the-tower', 'the-star', 'the-moon', 'the-sun',
  'the-aeon', 'the-universe',
  // Wands (14)
  'ace-of-wands', 'two-of-wands', 'three-of-wands', 'four-of-wands',
  'five-of-wands', 'six-of-wands', 'seven-of-wands', 'eight-of-wands',
  'nine-of-wands', 'ten-of-wands',
  'knight-of-wands', 'queen-of-wands', 'prince-of-wands', 'princess-of-wands',
  // Cups (14)
  'ace-of-cups', 'two-of-cups', 'three-of-cups', 'four-of-cups',
  'five-of-cups', 'six-of-cups', 'seven-of-cups', 'eight-of-cups',
  'nine-of-cups', 'ten-of-cups',
  'knight-of-cups', 'queen-of-cups', 'prince-of-cups', 'princess-of-cups',
  // Swords (14)
  'ace-of-swords', 'two-of-swords', 'three-of-swords', 'four-of-swords',
  'five-of-swords', 'six-of-swords', 'seven-of-swords', 'eight-of-swords',
  'nine-of-swords', 'ten-of-swords',
  'knight-of-swords', 'queen-of-swords', 'prince-of-swords', 'princess-of-swords',
  // Disks (14)
  'ace-of-disks', 'two-of-disks', 'three-of-disks', 'four-of-disks',
  'five-of-disks', 'six-of-disks', 'seven-of-disks', 'eight-of-disks',
  'nine-of-disks', 'ten-of-disks',
  'knight-of-disks', 'queen-of-disks', 'prince-of-disks', 'princess-of-disks',
] as const;

/**
 * Builds the hreflang alternates object for a given canonical path.
 * EN URL is at root; ES URL is under /es/.
 * x-default points to EN (primary).
 */
function buildAlternates(canonicalPath: string): { languages: Record<string, string> } {
  const base = SITE_URL.replace(/\/$/, '');
  const en = `${base}${canonicalPath}`;
  const es = `${base}/es${canonicalPath}`;
  return {
    languages: { 'en-US': en, 'es': es, 'x-default': en },
  };
}

/**
 * Emits two sitemap entries for a canonical path: one for EN (root), one for ES (/es/).
 * Both entries carry the full hreflang alternates map.
 */
function emitLocalized(
  canonicalPath: string,
  partial: Omit<MetadataRoute.Sitemap[number], 'url' | 'alternates'>,
): MetadataRoute.Sitemap {
  const base = SITE_URL.replace(/\/$/, '');
  const enUrl = `${base}${canonicalPath}`;
  const esUrl = `${base}/es${canonicalPath}`;
  const alternates = buildAlternates(canonicalPath);
  return [
    { url: enUrl, ...partial, alternates },
    { url: esUrl, ...partial, alternates },
  ];
}

/**
 * Dynamic sitemap for Estrevia.
 *
 * Each canonical path emits TWO entries: EN at root, ES under /es/.
 * Both share the same hreflang alternates map pointing to each other.
 *
 * Total URL count at launch:
 *   1  homepage
 *   1  /why-sidereal
 *   1  /pricing
 *   2  legal: /privacy, /terms
 *   6  app pages: /chart, /moon, /hours, /synastry, /tarot, /tree-of-life
 *   78 tarot card pages (/tarot/[cardId])
 *   120 essay pages (/essays/[planet]-in-[sign])
 *   12  sign pages (/signs/[sign])
 * ─────
 *   221 canonical paths × 2 locales = 442 total entries
 *
 * Note: /s/[id] share pages are noIndex and excluded from sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // ── Static / marketing pages ──────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    ...emitLocalized('/', { lastModified: now, changeFrequency: 'weekly', priority: 1.0 }),
    ...emitLocalized('/why-sidereal', { lastModified: now, changeFrequency: 'monthly', priority: 0.9 }),
    ...emitLocalized('/pricing', { lastModified: now, changeFrequency: 'monthly', priority: 0.7 }),
    // Legal pages — low priority, indexed for trust signals
    ...emitLocalized('/privacy', { lastModified: now, changeFrequency: 'yearly', priority: 0.3 }),
    ...emitLocalized('/terms', { lastModified: now, changeFrequency: 'yearly', priority: 0.3 }),
  ];

  // ── App pages ─────────────────────────────────────────────────────────────
  const appPages: MetadataRoute.Sitemap = [
    ...emitLocalized('/chart', { lastModified: now, changeFrequency: 'weekly', priority: 0.9 }),
    ...emitLocalized('/moon', { lastModified: now, changeFrequency: 'daily', priority: 0.8 }),
    ...emitLocalized('/hours', { lastModified: now, changeFrequency: 'daily', priority: 0.8 }),
    ...emitLocalized('/synastry', { lastModified: now, changeFrequency: 'weekly', priority: 0.8 }),
    ...emitLocalized('/tarot', { lastModified: now, changeFrequency: 'weekly', priority: 0.8 }),
    ...emitLocalized('/tree-of-life', { lastModified: now, changeFrequency: 'monthly', priority: 0.7 }),
  ];

  // ── Tarot card pages (78 total) ───────────────────────────────────────────
  const tarotPages: MetadataRoute.Sitemap = TAROT_CARD_IDS.flatMap((cardId) =>
    emitLocalized(`/tarot/${cardId}`, {
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    }),
  );

  // ── Essay pages (120 total: 10 planets × 12 signs) ────────────────────────
  const essayPages: MetadataRoute.Sitemap = getAllEssaySlugs().flatMap((slug) =>
    emitLocalized(`/essays/${slug}`, {
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
  );

  // ── Sign overview pages (12 total) ────────────────────────────────────────
  const signPages: MetadataRoute.Sitemap = getAllSignSlugs().flatMap((sign) =>
    emitLocalized(`/signs/${sign}`, {
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.75,
    }),
  );

  return [...staticPages, ...appPages, ...tarotPages, ...essayPages, ...signPages];
}
