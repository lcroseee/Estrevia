/**
 * JSON-LD schema generators for Estrevia pages.
 *
 * Usage in a Next.js Server Component page:
 *
 *   import { JsonLdScript, articleSchema } from '@/shared/seo/json-ld';
 *
 *   export default function EssayPage() {
 *     const schema = articleSchema({ ... });
 *     return (
 *       <>
 *         <JsonLdScript schema={schema} />
 *         ...page content...
 *       </>
 *     );
 *   }
 */

import React from 'react';
import type {
  WithContext,
  Organization,
  SoftwareApplication,
  Article,
  FAQPage,
  HowTo,
  BreadcrumbList,
  Product,
} from 'schema-dts';
import { SITE_NAME, SITE_URL } from './constants';

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

/**
 * Returns an Organization schema for Estrevia.
 * Inject this on the homepage and pillar pages.
 */
export function organizationSchema(): WithContext<Organization> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/logo.png`,
      width: '512',
      height: '512',
    },
    sameAs: ['https://twitter.com/estrevia_app'],
  };
}

// ---------------------------------------------------------------------------
// SoftwareApplication
// ---------------------------------------------------------------------------

/**
 * Returns a SoftwareApplication schema for the Estrevia PWA.
 * Inject this on the homepage.
 */
export function softwareAppSchema(): WithContext<SoftwareApplication> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    description:
      'Sidereal astrology platform — natal charts, planetary hours, esoteric correspondences',
  };
}

// ---------------------------------------------------------------------------
// Article
// ---------------------------------------------------------------------------

export interface ArticleSchemaOptions {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified: string;
  authorName?: string;
  imageUrl?: string;
}

/**
 * Returns an Article schema for essay pages.
 * Inject this on every /essays/[slug] page.
 */
export function articleSchema(options: ArticleSchemaOptions): WithContext<Article> {
  const {
    title,
    description,
    url,
    datePublished,
    dateModified,
    authorName = SITE_NAME,
    imageUrl,
  } = options;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url,
    datePublished,
    dateModified,
    author: {
      '@type': 'Organization',
      name: authorName,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo.png`,
      },
    },
    ...(imageUrl
      ? {
          image: {
            '@type': 'ImageObject',
            url: imageUrl,
            width: '1200',
            height: '630',
          },
        }
      : {}),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  };
}

// ---------------------------------------------------------------------------
// FAQPage
// ---------------------------------------------------------------------------

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Returns a FAQPage schema.
 * Inject this on any page with a structured FAQ section.
 * Critical for AEO — AI assistants extract FAQ answers directly.
 */
export function faqSchema(questions: FaqItem[]): WithContext<FAQPage> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// HowTo
// ---------------------------------------------------------------------------

export interface HowToSchemaOptions {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
  imageUrl?: string;
  /** ISO 8601 duration, e.g. "PT5M" */
  totalTime?: string;
}

/**
 * Returns a HowTo schema.
 * Use on guide pages (e.g., "How to read your sidereal chart").
 */
export function howToSchema(options: HowToSchemaOptions): WithContext<HowTo> {
  const { name, description, steps, imageUrl, totalTime } = options;

  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    ...(totalTime ? { totalTime } : {}),
    ...(imageUrl
      ? {
          image: {
            '@type': 'ImageObject',
            url: imageUrl,
          },
        }
      : {}),
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

// ---------------------------------------------------------------------------
// BreadcrumbList
// ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/**
 * Returns a BreadcrumbList schema.
 * Inject this on every page — helps Google show breadcrumbs in SERPs.
 *
 * @example
 * breadcrumbSchema([
 *   { name: 'Home', url: 'https://estrevia.app' },
 *   { name: 'Essays', url: 'https://estrevia.app/essays' },
 *   { name: 'Sun in Aries', url: 'https://estrevia.app/essays/sun-in-aries' },
 * ])
 */
export function breadcrumbSchema(items: BreadcrumbItem[]): WithContext<BreadcrumbList> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export interface ProductOffer {
  /** Price as a string, e.g. "0" for free, "4.99" for monthly paid, "34.99" for annual. */
  price: string;
  priceCurrency: string;
  /** "InStock" | "PreOrder" | "SoldOut" etc. */
  availability?: string;
  /** Canonical URL of the pricing page. */
  url: string;
  /** ISO 8601 price validity start date. */
  priceValidUntil?: string;
}

export interface ProductSchemaOptions {
  name: string;
  description: string;
  /** Brand / publisher name. Defaults to SITE_NAME. */
  brand?: string;
  offers: ProductOffer[];
  /** Product image URL — 1200×630 recommended. */
  imageUrl?: string;
}

/**
 * Returns a Product schema with Offer(s).
 * Use on the pricing page to enable Rich Results eligibility and AEO for
 * "how much does Estrevia cost" type queries.
 *
 * @example
 * productSchema({
 *   name: 'Estrevia Premium',
 *   description: 'Unlimited saved charts, detailed aspects, future transits.',
 *   offers: [
 *     { price: '0',    priceCurrency: 'USD', url: `${SITE_URL}/pricing` },
 *     { price: '4.99',  priceCurrency: 'USD', url: `${SITE_URL}/pricing` },
 *     { price: '34.99', priceCurrency: 'USD', url: `${SITE_URL}/pricing` },
 *   ],
 * })
 */
export function productSchema(options: ProductSchemaOptions): WithContext<Product> {
  const { name, description, brand = SITE_NAME, offers, imageUrl } = options;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    brand: {
      '@type': 'Brand',
      name: brand,
    },
    ...(imageUrl
      ? {
          image: {
            '@type': 'ImageObject',
            url: imageUrl,
          },
        }
      : {}),
    // schema-dts types `availability` as a narrow ItemAvailability enum rather than string.
    // We cast the offers array to satisfy the type while keeping our interface simple.
    // The value is a valid schema.org URL — this is correct at runtime.
    offers: offers.map((offer) => ({
      '@type': 'Offer' as const,
      price: offer.price,
      priceCurrency: offer.priceCurrency,
      // ItemAvailability values are schema.org URLs — cast required due to schema-dts narrow types
      availability: (offer.availability ?? 'https://schema.org/InStock') as 'https://schema.org/InStock',
      url: offer.url,
      ...(offer.priceValidUntil ? { priceValidUntil: offer.priceValidUntil } : {}),
    })),
  };
}

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

/**
 * Server Component that injects a JSON-LD <script> tag.
 *
 * Security note: dangerouslySetInnerHTML is intentional here.
 * All data is generated by our own schema functions — never from user input.
 * JSON.stringify produces valid JSON that cannot execute as script.
 * This is the standard pattern used by Next.js itself for JSON-LD injection.
 *
 * @example
 * <JsonLdScript schema={articleSchema({ ... })} />
 */
export function JsonLdScript({
  schema,
}: {
  // Schema objects from schema-dts are plain serializable objects.
  // Using unknown here would require unsafe type assertions at every call site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: Record<string, any>;
}): React.ReactElement {
  // React.createElement is used instead of JSX because this is a .ts file.
  // Safe: content is produced by our schema generators only, never user input.
  // JSON.stringify output cannot contain executable script.
  return React.createElement('script', {
    type: 'application/ld+json',
    dangerouslySetInnerHTML: { __html: JSON.stringify(schema) },
  });
}

