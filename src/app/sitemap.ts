import type { MetadataRoute } from 'next';
import { getAllEssaySlugs, getAllSignSlugs, SIGNS } from '@/shared/seo';
import { ALL_CITY_SLUGS } from '@/shared/seo/cities';
import { ALL_PAIR_SLUGS } from '@/shared/seo/compatibility-pairs';
import { SITE_URL } from '@/shared/seo/constants';
import { lastModifiedFor } from '@/shared/seo/sitemap-mtime';

// ---------------------------------------------------------------------------
// Image sitemap helpers
//
// Next.js 16+ supports images?: string[] on sitemap entries and emits proper
// <image:image> markup with xmlns:image namespace automatically.
//
// Image sources:
//   /api/og/essay/[slug]  — 1200×630 OG image per essay (robots.txt: Allow /api/og/)
//   /opengraph-image      — branded 1200×630 hero for marketing pages
// ---------------------------------------------------------------------------

/** Returns the absolute OG image URL for an essay page. */
function essayOgImage(slug: string): string {
  return `${SITE_URL}/api/og/essay/${slug}`;
}

/** Branded hero OG image (homepage + pillar pages). */
const HERO_OG_IMAGE = `${SITE_URL}/opengraph-image`;

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
 *
 * Pass `images` to attach Google Image Sitemap entries (<image:image> blocks).
 * Next.js 16 emits xmlns:image namespace automatically when any entry has images.
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
 * Like emitLocalized() but resolves lastModified per locale. Used for content
 * whose EN and ES sources of truth diverge (essays MDX, signs descriptions).
 */
function emitLocalizedWithLocale(
  canonicalPath: string,
  partial: Omit<MetadataRoute.Sitemap[number], 'url' | 'alternates' | 'lastModified'>,
  lastModifiedByLocale: (locale: 'en' | 'es') => Date,
): MetadataRoute.Sitemap {
  const base = SITE_URL.replace(/\/$/, '');
  const enUrl = `${base}${canonicalPath}`;
  const esUrl = `${base}/es${canonicalPath}`;
  const alternates = buildAlternates(canonicalPath);
  return [
    { url: enUrl, ...partial, lastModified: lastModifiedByLocale('en'), alternates },
    { url: esUrl, ...partial, lastModified: lastModifiedByLocale('es'), alternates },
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
 *   2  index hubs: /essays, /signs
 *   6  app pages: /chart, /moon, /hours, /synastry, /tarot, /tree-of-life
 *   78 tarot card pages (/tarot/[cardId])
 *   120 essay pages (/essays/[planet]-in-[sign])
 *   12  sign pages (/signs/[sign])
 *   12  sidereal-dates pages (/sidereal-{sign}-dates)
 * ─────
 *   235 canonical paths × 2 locales = 470 total entries
 *
 * Note: /s/[id] share pages are noIndex and excluded from sitemap.
 * Note: /sidereal-{sign}-dates public URLs are rewritten internally by
 *       next.config.ts to /sidereal-dates/[sign] (App Router limitation:
 *       partial dynamic segments in folder names are not supported).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // ── Static / marketing pages ──────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    ...emitLocalized('/', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(marketing)/page.tsx'),
      changeFrequency: 'weekly',
      priority: 1.0,
      images: [HERO_OG_IMAGE],
    }),
    ...emitLocalized('/why-sidereal', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(marketing)/why-sidereal/page.tsx'),
      changeFrequency: 'monthly',
      priority: 0.9,
      images: [HERO_OG_IMAGE],
    }),
    ...emitLocalized('/pricing', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(marketing)/pricing/page.tsx'),
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
    // Legal pages — low priority, indexed for trust signals
    ...emitLocalized('/privacy', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(marketing)/privacy/page.tsx'),
      changeFrequency: 'yearly',
      priority: 0.3,
    }),
    ...emitLocalized('/terms', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(marketing)/terms/page.tsx'),
      changeFrequency: 'yearly',
      priority: 0.3,
    }),
    // Index hubs
    ...emitLocalized('/essays', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/essays/page.tsx'),
      changeFrequency: 'weekly',
      priority: 0.85,
    }),
    ...emitLocalized('/signs', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/signs/page.tsx'),
      changeFrequency: 'monthly',
      priority: 0.85,
    }),
  ];

  // ── App pages ─────────────────────────────────────────────────────────────
  const appPages: MetadataRoute.Sitemap = [
    ...emitLocalized('/chart', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/chart/page.tsx'),
      changeFrequency: 'weekly',
      priority: 0.9,
    }),
    ...emitLocalized('/moon', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/moon/page.tsx'),
      changeFrequency: 'daily',
      priority: 0.8,
    }),
    ...emitLocalized('/hours', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/hours/page.tsx'),
      changeFrequency: 'daily',
      priority: 0.8,
    }),
    ...emitLocalized('/synastry', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/synastry/page.tsx'),
      changeFrequency: 'weekly',
      priority: 0.8,
    }),
    ...emitLocalized('/tarot', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/tarot/page.tsx'),
      changeFrequency: 'weekly',
      priority: 0.8,
    }),
    ...emitLocalized('/tree-of-life', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/tree-of-life/page.tsx'),
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
  ];

  // ── Tarot card pages (78 total) ───────────────────────────────────────────
  const tarotPages: MetadataRoute.Sitemap = TAROT_CARD_IDS.flatMap((cardId) =>
    emitLocalized(`/tarot/${cardId}`, {
      lastModified: lastModifiedFor('tarot'),
      changeFrequency: 'monthly',
      priority: 0.6,
    }),
  );

  // ── Essay pages (120 total: 10 planets × 12 signs) ────────────────────────
  // Each essay has a unique OG image at /api/og/essay/[slug] (1200×630).
  // robots.txt explicitly allows /api/og/, so Google can crawl these images.
  // Per-locale mtime: EN reads content/essays/<slug>.mdx frontmatter,
  // ES reads content/essays/es/<slug>.mdx frontmatter.
  const essayPages: MetadataRoute.Sitemap = getAllEssaySlugs().flatMap((slug) =>
    emitLocalizedWithLocale(
      `/essays/${slug}`,
      {
        changeFrequency: 'monthly',
        priority: 0.7,
        images: [essayOgImage(slug)],
      },
      (locale) => lastModifiedFor('essay', slug, locale),
    ),
  );

  // ── Sign overview pages (12 total) ────────────────────────────────────────
  // Per-locale mtime: EN sources content/signs/descriptions.json,
  // ES sources content/signs/descriptions.es.json.
  const signPages: MetadataRoute.Sitemap = getAllSignSlugs().flatMap((sign) =>
    emitLocalizedWithLocale(
      `/signs/${sign}`,
      { changeFrequency: 'monthly', priority: 0.75 },
      (locale) => lastModifiedFor('sign', sign, locale),
    ),
  );

  // ── Sidereal-dates pages (12 total: one per sign) ─────────────────────────
  // Public URL: /sidereal-{sign}-dates (next.config.ts rewrites to /sidereal-dates/[sign]).
  // Image: reuse Sun essay OG image — features the sign glyph prominently at 1200×630.
  // Year-dependent content: lastModified is Jan 1 of the current year (one bump
  // per calendar year, not per deploy) per spec §8.
  const siderealDatesPages: MetadataRoute.Sitemap = SIGNS.flatMap((sign) =>
    emitLocalized(`/sidereal-${sign}-dates`, {
      lastModified: lastModifiedFor('sidereal-dates'),
      changeFrequency: 'weekly',
      priority: 0.8,
      images: [essayOgImage(`sun-in-${sign}`)],
    }),
  );

  // ── Compatibility index (EN + ES) ─────────────────────────────────────────
  // lastModifiedFor() is strict on its RouteType union; new route families fall
  // back to build-time `new Date()` (acceptable per spec §8 — Google accepts it).
  const compatibilityBuildTime = new Date();
  const compatibilityIndex: MetadataRoute.Sitemap = emitLocalized('/compatibility', {
    lastModified: compatibilityBuildTime,
    changeFrequency: 'monthly',
    priority: 0.7,
  });

  // ── Compatibility pairs (78 × 2 locales = 156) ────────────────────────────
  const compatibilityPairs: MetadataRoute.Sitemap = ALL_PAIR_SLUGS.flatMap((pair) =>
    emitLocalized(`/compatibility/${pair}`, {
      lastModified: compatibilityBuildTime,
      changeFrequency: 'monthly',
      priority: 0.5,
    }),
  );

  // ── Planetary-hours-cities index (EN + ES) ────────────────────────────────
  const planetaryHoursCitiesBuildTime = new Date();
  const planetaryHoursCitiesIndex: MetadataRoute.Sitemap = emitLocalized(
    '/planetary-hours-cities',
    {
      lastModified: planetaryHoursCitiesBuildTime,
      changeFrequency: 'daily',
      priority: 0.7,
    },
  );

  // ── Planetary-hours per-city (20 × 2 locales = 40) ────────────────────────
  const planetaryHoursCities: MetadataRoute.Sitemap = ALL_CITY_SLUGS.flatMap((city) =>
    emitLocalized(`/planetary-hours-cities/${city}`, {
      lastModified: planetaryHoursCitiesBuildTime,
      changeFrequency: 'daily',
      priority: 0.5,
    }),
  );

  return [
    ...staticPages,
    ...appPages,
    ...tarotPages,
    ...essayPages,
    ...signPages,
    ...siderealDatesPages,
    ...compatibilityIndex,
    ...compatibilityPairs,
    ...planetaryHoursCitiesIndex,
    ...planetaryHoursCities,
  ];
}
