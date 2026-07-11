import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/shared/seo/constants';

/**
 * robots.txt configuration for Estrevia.
 *
 * Rules:
 * - Allow all crawlers on public content
 * - Block /api/ routes (server-only endpoints, no public indexation value)
 * - Block /s/ share pages (noindex on those pages too — double protection)
 * - Explicitly allow:
 *     /api/og/             — OG images for rich previews (Google, social)
 *     /api/v1/docs         — OpenAPI 3.1 spec for LLM crawlers (Perplexity, GPTBot, etc.)
 *     /api/v1/sidereal/    — public, rate-limited sidereal endpoints (now documented)
 *
 * Note: /s/[id] share pages also carry noindex meta robots tags (set via
 * createMetadata({ noIndex: true }) in that page). robots.txt + noindex
 * together ensure no share page leaks into Google index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Single User-Agent group for all crawlers. robots.txt matching is
        // longest-match, so the specific /api/og/, /api/v1/docs and
        // /api/v1/sidereal/ Allows override the broad /api/ Disallow, while
        // everything else under /api/ (and every /s/ share page) stays blocked.
        // Previously these lived in a SECOND `User-Agent: *` group that a crawler
        // never reached (it obeys only the first matching group) — now merged.
        userAgent: '*',
        allow: ['/', '/api/og/', '/api/v1/docs', '/api/v1/sidereal/'],
        disallow: ['/api/', '/s/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
