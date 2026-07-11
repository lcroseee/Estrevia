import { SITE_URL } from './constants';

export interface EssayLocaleUrls {
  canonicalUrl: string;
  homeUrl: string;
  signUrl: string | null;
}

/**
 * Locale-aware absolute URLs for essay JSON-LD (Article.url + BreadcrumbList).
 * EN → root; ES → /es prefix. Fixes the cross-locale bug where ES essays
 * emitted EN URLs, contradicting their own canonical/hreflang.
 */
export function essayLocaleUrls(
  slug: string,
  locale: 'en' | 'es',
  signSlug?: string | null,
): EssayLocaleUrls {
  const base = SITE_URL.replace(/\/$/, '');
  const prefix = locale === 'es' ? '/es' : '';
  return {
    canonicalUrl: `${base}${prefix}/essays/${slug}`,
    homeUrl: `${base}${prefix}`,
    signUrl: signSlug ? `${base}${prefix}/signs/${signSlug}` : null,
  };
}
