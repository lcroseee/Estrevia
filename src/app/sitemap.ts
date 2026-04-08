import type { MetadataRoute } from 'next';
import { getAllEssaySlugs, getAllSignSlugs } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';

/**
 * Dynamic sitemap for Estrevia.
 *
 * Total URL count at launch:
 *   1  homepage
 *   1  /why-sidereal
 *   3  app pages: /chart, /moon, /hours
 *   120 essay pages (/essays/[planet]-in-[sign])
 *   12  sign pages (/signs/[sign])
 * ─────
 *   137 total
 *
 * Scaling plan:
 *   Phase 2: /moon-today (ISR daily), /moon-calendar
 *   Phase 3: /compatibility/[sign-a]-[sign-b] (+78)
 *   Phase 4: /planetary-hours/[city] (+500)
 *
 * Add new URL groups to the arrays below — no other changes needed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // ── Static / marketing pages ──────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/why-sidereal`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Legal pages — low priority, indexed for trust signals
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  // ── App pages ─────────────────────────────────────────────────────────────
  const appPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/chart`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/moon`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/hours`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  // ── Essay pages (120 total: 10 planets × 12 signs) ────────────────────────
  // Essays are evergreen content — monthly changeFrequency is appropriate.
  // lastModified uses the build date; a future enhancement would read
  // individual frontmatter `updatedAt` values from the MDX files.
  const essayPages: MetadataRoute.Sitemap = getAllEssaySlugs().map((slug) => ({
    url: `${SITE_URL}/essays/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  // ── Sign overview pages (12 total) ────────────────────────────────────────
  const signPages: MetadataRoute.Sitemap = getAllSignSlugs().map((sign) => ({
    url: `${SITE_URL}/signs/${sign}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.75,
  }));

  return [...staticPages, ...appPages, ...essayPages, ...signPages];
}
