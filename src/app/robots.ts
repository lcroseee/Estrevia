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
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/s/'],
      },
      {
        // Allow public API surfaces explicitly — these override the /api/ disallow
        // above. OG images power Google rich previews & social sharing; /api/v1/docs
        // and /api/v1/sidereal/ are intentionally public + documented in OpenAPI 3.1
        // so that LLM crawlers can discover and cite the sidereal sun-sign endpoint.
        userAgent: '*',
        allow: ['/api/og/', '/api/v1/docs', '/api/v1/sidereal/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
