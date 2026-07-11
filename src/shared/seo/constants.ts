export const SITE_NAME = 'Estrevia';

// Named human author for E-E-A-T (Article.author + Organization.founder + /about).
// Reverses the 2026-05-03 "authorship not needed" call — see seo-p2/T13.
// Ships DORMANT: this is a placeholder sentinel, not a real name. The whole T13
// mechanism (Person author, /about index, footer link, sitemap entry) gates on
// isFounderIdentityPublished() and stays inert while this is the placeholder, so
// nothing publishes the founder's identity until it is set to a real name here.
// Typed `string` (not the literal) so the gate is a real runtime check.
export const FOUNDER_NAME: string = '__FOUNDER_NAME__';

/** True once FOUNDER_NAME has been set to a real published name (T13 gate). */
export function isFounderIdentityPublished(): boolean {
  return FOUNDER_NAME !== '__FOUNDER_NAME__' && FOUNDER_NAME.trim().length > 0;
}

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit && !explicit.startsWith('http://localhost')) {
    return explicit.replace(/\/$/, '');
  }
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL?.trim() ?? process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  }
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  return 'https://estrevia.app';
}

export const SITE_URL = resolveSiteUrl();
export const DEFAULT_OG_IMAGE = `${SITE_URL}/opengraph-image`;
export const TWITTER_HANDLE = '@estrevia_app';

/**
 * Canonical off-site brand-entity profiles for Organization.sameAs.
 *
 * Finding #15 (SEO audit 2026-07-06): the "estrevia" brand SERP is being lost to
 * the "Estreva" estradiol drug. Google uses sameAs to disambiguate the entity and
 * build a Knowledge Panel. Seeded with the live X account.
 *
 * APPEND each profile's canonical URL here — and ONLY here — as it goes live
 * (Crunchbase, Product Hunt, LinkedIn, GitHub, Bluesky, Instagram, Wikidata).
 * Every entry MUST be an absolute https:// URL to a real, live profile with a
 * path/handle; the json-ld unit test rejects placeholders, bare origins, and dupes.
 */
export const SAME_AS_URLS: readonly string[] = [
  'https://x.com/estrevia_app',
] as const;
export const SITE_DESCRIPTION =
  'Sidereal astrology platform — natal charts, planetary hours, esoteric correspondences';

export const TITLE_SUFFIX = ` | ${SITE_NAME}`;
export const MAX_TITLE_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 155;

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
