/**
 * Server-side essay loader.
 *
 * Reads MDX files from content/essays/, parses frontmatter with gray-matter,
 * and returns typed metadata + raw markdown content.
 *
 * All functions are synchronous and intended for Server Components / generateStaticParams.
 * Never import this on the client.
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EssayMeta {
  title: string;
  description: string;
  planet: string;
  sign: string;
  element: string;
  modality: string;
  keywords: string[];
  publishedAt: string;
  updatedAt: string;
  slug: string;
}

export interface Essay {
  meta: EssayMeta;
  /** Raw markdown body (without frontmatter) */
  content: string;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const ESSAYS_BASE_DIR = path.join(process.cwd(), 'content', 'essays');

function getEssaysDir(locale?: string): string {
  if (locale && locale !== 'en') {
    const localizedDir = path.join(ESSAYS_BASE_DIR, locale);
    // Fall back to base dir if localized directory doesn't exist
    try {
      fs.accessSync(localizedDir, fs.constants.R_OK);
      return localizedDir;
    } catch {
      return ESSAYS_BASE_DIR;
    }
  }
  return ESSAYS_BASE_DIR;
}

// Keep backward compat alias
const ESSAYS_DIR = ESSAYS_BASE_DIR;

function parseSlugFromFilename(filename: string): string {
  return filename.replace(/\.mdx?$/, '');
}

function loadEssayFile(filename: string): Essay | null {
  const fullPath = path.join(ESSAYS_DIR, filename);
  let raw: string;
  try {
    raw = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }

  const { data, content } = matter(raw);
  const slug = parseSlugFromFilename(filename);

  const meta: EssayMeta = {
    title: String(data['title'] ?? ''),
    description: String(data['description'] ?? ''),
    planet: String(data['planet'] ?? ''),
    sign: String(data['sign'] ?? ''),
    element: String(data['element'] ?? ''),
    modality: String(data['modality'] ?? ''),
    keywords: Array.isArray(data['keywords']) ? (data['keywords'] as string[]) : [],
    publishedAt: String(data['publishedAt'] ?? ''),
    updatedAt: String(data['updatedAt'] ?? ''),
    slug,
  };

  return { meta, content };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads a single essay by its slug (e.g. "sun-in-aries").
 * Returns null if the file does not exist.
 * @param locale — 'en' (default) or 'es'. Falls back to English if localized file missing.
 */
export function getEssayBySlug(slug: string, locale?: string): Essay | null {
  const dir = getEssaysDir(locale);

  // Try localized dir first
  for (const ext of ['.mdx', '.md']) {
    const fullPath = path.join(dir, `${slug}${ext}`);
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const { data, content } = matter(raw);
      return {
        meta: {
          title: String(data['title'] ?? ''),
          description: String(data['description'] ?? ''),
          planet: String(data['planet'] ?? ''),
          sign: String(data['sign'] ?? ''),
          element: String(data['element'] ?? ''),
          modality: String(data['modality'] ?? ''),
          keywords: Array.isArray(data['keywords']) ? (data['keywords'] as string[]) : [],
          publishedAt: String(data['publishedAt'] ?? ''),
          updatedAt: String(data['updatedAt'] ?? ''),
          slug,
        },
        content,
      };
    } catch {
      continue;
    }
  }

  // Fall back to English if localized file not found
  if (locale && locale !== 'en') {
    return getEssayBySlug(slug);
  }

  return null;
}

/**
 * Returns metadata for all essays found in content/essays/.
 * Sorted alphabetically by slug.
 * @param locale — 'en' (default) or 'es'. Falls back to English dir if localized dir missing.
 */
export function getAllEssays(locale?: string): EssayMeta[] {
  const dir = getEssaysDir(locale);
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    // Fall back to English
    if (locale && locale !== 'en') return getAllEssays();
    return [];
  }

  return files
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    .sort()
    .map((filename) => {
      const essay = loadEssayFile(filename);
      return essay ? essay.meta : null;
    })
    .filter((meta): meta is EssayMeta => meta !== null);
}
