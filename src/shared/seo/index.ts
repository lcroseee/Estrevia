/**
 * SEO infrastructure barrel export.
 *
 * All pages import SEO utilities from here — never create independent SEO utilities.
 *
 * Quick reference:
 *
 *   createMetadata()     — generates Next.js Metadata for any page
 *   JsonLdScript         — React component to inject JSON-LD <script> tag
 *   articleSchema()      — Article schema for essay pages
 *   faqSchema()          — FAQPage schema (AEO: AI extracts FAQ answers)
 *   howToSchema()        — HowTo schema for guide pages
 *   breadcrumbSchema()   — BreadcrumbList schema (inject on every page)
 *   organizationSchema() — Organization schema for homepage/pillar pages
 *   softwareAppSchema()  — SoftwareApplication schema for homepage
 *   getRelatedPages()    — returns 3-5 related pages for internal linking
 *   getAllEssaySlugs()   — all 120 essay slugs for sitemap/generateStaticParams
 *   getAllSignSlugs()    — all 12 sign slugs for sitemap/generateStaticParams
 */

export { createMetadata } from './metadata';
export type { CreateMetadataOptions } from './metadata';

export {
  JsonLdScript,
  organizationSchema,
  softwareAppSchema,
  articleSchema,
  faqSchema,
  howToSchema,
  breadcrumbSchema,
} from './json-ld';
export type {
  ArticleSchemaOptions,
  FaqItem,
  HowToSchemaOptions,
  BreadcrumbItem,
} from './json-ld';

export {
  getRelatedPages,
  getAllEssaySlugs,
  getAllSignSlugs,
  getAllEssaySlugsBySign,
  getAllEssaySlugsByPlanet,
  parseEssaySlug,
  PLANETS,
  SIGNS,
} from './internal-links';
export type { RelatedPage, PlanetSlug, SignSlug } from './internal-links';

export {
  SITE_NAME,
  SITE_URL,
  DEFAULT_OG_IMAGE,
  TWITTER_HANDLE,
  SITE_DESCRIPTION,
  TITLE_SUFFIX,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
} from './constants';
