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
   * Canonical path — absolute URL (https://estrevia.app/...).
   * Pass the full URL or just the path (will be prefixed with SITE_URL).
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
   * Active locale for og:locale and hreflang. Defaults to 'en'.
   * Pass the result of getLocale() from next-intl/server in server components.
   */
  locale?: 'en' | 'es';
}

/**
 * Truncates a string to maxLength, appending "…" if truncated.
 */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1) + '\u2026';
}

/**
 * Ensures a path is an absolute URL.
 * If the path already starts with 'http', it is returned as-is.
 * Otherwise, it is prefixed with SITE_URL.
 */
function toAbsoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const base = SITE_URL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
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
 *   return createMetadata({
 *     title: 'Sun in Aries — Sidereal',
 *     description: 'In sidereal astrology, Sun enters Aries on 14 April...',
 *     path: '/essays/sun-in-aries',
 *     type: 'article',
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

  const canonicalUrl = toAbsoluteUrl(path);
  const pageTitle = buildTitle(title);
  const pageDescription = truncate(description, MAX_DESCRIPTION_LENGTH);
  const imageUrl = ogImage ?? DEFAULT_OG_IMAGE;

  // Cookie-based locale: both hreflang entries point to the same canonical URL.
  // Google accepts this pattern for cookie/JS-based locale switching.
  // x-default points to the EN (default) version.
  const hreflangLanguages: Record<string, string> = {
    'en-US': canonicalUrl,
    'es': canonicalUrl,
    'x-default': canonicalUrl,
  };

  const ogLocale = locale === 'es' ? 'es' : 'en_US';
  const ogLocaleAlternate = locale === 'es' ? 'en_US' : 'es';

  const metadata: Metadata = {
    title: pageTitle,
    description: pageDescription,
    ...(keywords && keywords.length > 0 ? { keywords } : {}),
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangLanguages,
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
