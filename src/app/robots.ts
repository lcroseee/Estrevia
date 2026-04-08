import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/shared/seo/constants';

/**
 * robots.txt configuration for Estrevia.
 *
 * Rules:
 * - Allow all crawlers on public content
 * - Block /api/ routes (server-only endpoints, no public indexation value)
 * - Block /s/ share pages (noindex on those pages too — double protection)
 * - Explicitly allow /api/og/ so Google can crawl OG images for rich previews
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
        // Allow OG image crawling explicitly — Google needs these to display
        // rich previews in search results and social sharing previews.
        // This overrides the /api/ disallow above for the OG image endpoint.
        userAgent: '*',
        allow: '/api/og/',
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
