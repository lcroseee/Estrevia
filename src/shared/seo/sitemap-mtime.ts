/**
 * Per-route-type lastModified resolver for sitemap.ts.
 *
 * Replaces `new Date()` (which lies to Google about freshness on every deploy)
 * with semantically accurate per-route mtimes. See docs/superpowers/specs/
 * 2026-05-03-seo-phase3-design.md §8 for the full strategy table.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

type RouteType = 'static' | 'essay' | 'sign' | 'tarot' | 'sidereal-dates';

// Sitemap.ts generates 470 URLs but only ~30 unique source files; memoize.
const gitMtimeCache = new Map<string, Date>();

/**
 * Returns the last commit ISO timestamp for `relativePath`, or build time on
 * failure (git error, shallow clone, missing file).
 *
 * Safety: invokes git via execFileSync with an argv array — the shell is never
 * involved, so a path containing special characters cannot inject commands.
 * The trailing `--` separator stops git from interpreting the path as a flag.
 */
function getGitMtime(relativePath: string): Date {
  const cached = gitMtimeCache.get(relativePath);
  if (cached) return cached;
  try {
    const stdout = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', relativePath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (!stdout) throw new Error('empty git log output');
    const date = new Date(stdout);
    if (Number.isNaN(date.getTime())) throw new Error(`invalid date: ${stdout}`);
    gitMtimeCache.set(relativePath, date);
    return date;
  } catch {
    const fallback = new Date();
    gitMtimeCache.set(relativePath, fallback);
    return fallback;
  }
}

/**
 * Returns mtime for an essay slug + locale. Reads MDX frontmatter `updatedAt`;
 * falls back to git mtime of the MDX file; falls back to build time.
 *
 * Locale layout:
 *   content/essays/<slug>.mdx       (en)
 *   content/essays/es/<slug>.mdx    (es)
 */
function getEssayMtime(slug: string, locale: 'en' | 'es'): Date {
  const subdir = locale === 'es' ? 'es/' : '';
  const filePath = `content/essays/${subdir}${slug}.mdx`;
  try {
    const fullPath = path.join(process.cwd(), filePath);
    const raw = readFileSync(fullPath, 'utf8');
    const { data } = matter(raw);
    if (data?.updatedAt) {
      const parsed = new Date(data.updatedAt as string);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  } catch {
    // fall through to git mtime
  }
  return getGitMtime(filePath);
}

/**
 * Public router. Used by sitemap.ts per route type.
 *
 * Variadic args carry the per-type payload:
 *   static          (pageTsxPath)
 *   essay           (slug, 'en' | 'es')
 *   sign            (signSlug, 'en' | 'es')
 *   tarot           (no args)
 *   sidereal-dates  (no args — year-dependent)
 */
export function lastModifiedFor(type: RouteType, ...args: string[]): Date {
  switch (type) {
    case 'static':
      return getGitMtime(args[0]);
    case 'essay':
      return getEssayMtime(args[0], args[1] as 'en' | 'es');
    case 'sign':
      return getGitMtime(
        args[1] === 'es'
          ? 'content/signs/descriptions.es.json'
          : 'content/signs/descriptions.json',
      );
    case 'tarot':
      return getGitMtime('content/tarot/cards.json');
    case 'sidereal-dates':
      // Year-dependent content: bump once per calendar year, not per deploy.
      return new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown route type: ${exhaustive as string}`);
    }
  }
}
