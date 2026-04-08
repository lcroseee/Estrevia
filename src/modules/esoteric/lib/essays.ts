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

const ESSAYS_DIR = path.join(process.cwd(), 'content', 'essays');

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
 */
export function getEssayBySlug(slug: string): Essay | null {
  // Try .mdx first, then .md
  const mdx = loadEssayFile(`${slug}.mdx`);
  if (mdx) return mdx;
  return loadEssayFile(`${slug}.md`);
}

/**
 * Returns metadata for all essays found in content/essays/.
 * Sorted alphabetically by slug.
 */
export function getAllEssays(): EssayMeta[] {
  let files: string[];
  try {
    files = fs.readdirSync(ESSAYS_DIR);
  } catch {
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
