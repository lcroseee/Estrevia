import type { Metadata } from 'next';
import {
  SITE_NAME,
  SITE_URL,
  DEFAULT_OG_IMAGE,
  TWITTER_HANDLE,
  TITLE_SUFFIX,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from './constants';

export interface CreateMetadataOptions {
  /**
   * Page title. Must be ≤60 chars including " | Estrevia" suffix.
   * Primary keyword should appear near the beginning.
   */
  title: string;
  /**
   * Meta description. Unique per page, ≤155 chars.
   * Should include a CTA or value proposition.
   */
  description: string;
  /**
   * Canonical path — absolute URL (https://estrevia.app/...) or relative path.
   * Do NOT include the /es prefix — the function adds it based on `locale`.
   * If the path already starts with /es it is stripped and re-added correctly.
   */
  path: string;
  /** OG image URL (1200×630). Falls back to DEFAULT_OG_IMAGE. */
  ogImage?: string;
  /** Set true for share pages (/s/[id]) and other non-indexable pages. */
  noIndex?: boolean;
  /** OpenGraph type. Defaults to 'website'. Use 'article' for essays. */
  type?: 'website' | 'article';
  /** ISO 8601 date. Required for Article schema datePublished. */
  publishedTime?: string;
  /** ISO 8601 date. Required for Article schema dateModified. */
  modifiedTime?: string;
  /** Meta keywords. Low SEO weight but helps topic signals. */
  keywords?: string[];
  /**
   * Active locale for canonical URL, og:locale and hreflang. Defaults to 'en'.
   * Pass the result of getLocale() from next-intl/server in server components.
   */
  locale?: 'en' | 'es';
}

/**
 * Truncates a string to maxLength, appending "…" if truncated.
 */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1) + '…';
}

/**
 * Builds a locale-specific absolute URL for a given path.
 *
 * Rules:
 *  - Strips any existing /es prefix from `path` to keep the contract idempotent.
 *  - EN → SITE_URL + path (no prefix)
 *  - ES → SITE_URL + /es + path
 *  - Root path "/" is preserved with its trailing slash; all other paths have
 *    trailing slash stripped.
 */
function buildLocaleUrl(path: string, locale: 'en' | 'es'): string {
  const base = SITE_URL.replace(/\/$/, '');

  // Accept absolute URLs that are already fully qualified — return as-is.
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Strip any incoming /es prefix so the function is idempotent.
  const cleanPath = path.replace(/^\/es(?=\/|$)/, '') || '/';
  const normalized = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  const localePrefix = locale === 'es' ? '/es' : '';

  // Root path: keep trailing slash for canonical consistency.
  if (normalized === '/') {
    return `${base}${localePrefix}/`;
  }

  // All other paths: strip trailing slash.
  return `${base}${localePrefix}${normalized}`.replace(/\/$/, '');
}

/**
 * Builds a full page title with " | Estrevia" suffix.
 * The combined title is truncated to MAX_TITLE_LENGTH if needed.
 */
function buildTitle(title: string): string {
  const full = `${title}${TITLE_SUFFIX}`;
  return truncate(full, MAX_TITLE_LENGTH);
}

/**
 * Creates a Next.js Metadata object for a page.
 * Import and call this in `generateMetadata()` on every page.
 *
 * @example
 * export async function generateMetadata(): Promise<Metadata> {
 *   const locale = await getLocale();
 *   return createMetadata({
 *     title: 'Sun in Aries — Sidereal',
 *     description: 'In sidereal astrology, Sun enters Aries on 14 April...',
 *     path: '/essays/sun-in-aries',
 *     type: 'article',
 *     locale: locale as 'en' | 'es',
 *   });
 * }
 */
export function createMetadata(options: CreateMetadataOptions): Metadata {
  const {
    title,
    description,
    path,
    ogImage,
    noIndex = false,
    type = 'website',
    publishedTime,
    modifiedTime,
    keywords,
    locale = 'en',
  } = options;

  const canonicalUrl = buildLocaleUrl(path, locale);
  const enUrl = buildLocaleUrl(path, 'en');
  const esUrl = buildLocaleUrl(path, 'es');

  const pageTitle = buildTitle(title);
  const pageDescription = truncate(description, MAX_DESCRIPTION_LENGTH);
  const imageUrl = ogImage ?? DEFAULT_OG_IMAGE;

  // Locale-specific hreflang map: each locale gets its own URL.
  // x-default points to the EN (default) version.
  const hreflangLanguages: Record<string, string> = {
    'en-US': enUrl,
    'es': esUrl,
    'x-default': enUrl,
  };

  // og:locale targets the largest LATAM Spanish market (Mexico) per the
  // español-neutro LATAM editorial decision in CLAUDE.md and the
  // feedback_spanish_style memory. Facebook accepts es_MX in its supported
  // locales list and signals regional intent to share-card consumers.
  const ogLocale = locale === 'es' ? 'es_MX' : 'en_US';
  const ogLocaleAlternate = locale === 'es' ? 'en_US' : 'es_MX';

  // Per-locale Atom feed link surfaced in <head> via metadata.alternates.types.
  // EN feed lives at root /feed.xml; ES feed at /es/feed.xml. Injecting here
  // (rather than at layout level) ensures every page advertises the correct
  // feed even when individual pages override `alternates` with their own
  // canonical/languages — Next.js shallow-merges alternates by subfield.
  const baseUrl = SITE_URL.replace(/\/$/, '');
  const feedUrl = locale === 'es' ? `${baseUrl}/es/feed.xml` : `${baseUrl}/feed.xml`;

  const metadata: Metadata = {
    title: pageTitle,
    description: pageDescription,
    ...(keywords && keywords.length > 0 ? { keywords } : {}),
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangLanguages,
      types: {
        'application/atom+xml': feedUrl,
      },
    },
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: canonicalUrl,
      siteName: SITE_NAME,
      type: type === 'article' ? 'article' : 'website',
      locale: ogLocale,
      alternateLocale: [ogLocaleAlternate],
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: pageTitle,
        },
      ],
      ...(type === 'article' && publishedTime
        ? { publishedTime }
        : {}),
      ...(type === 'article' && modifiedTime
        ? { modifiedTime }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: pageDescription,
      site: TWITTER_HANDLE,
      images: [imageUrl],
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };

  return metadata;
}
