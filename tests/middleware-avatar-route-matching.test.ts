import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Supplementary, import-free verification for C2 (avatar route auth
 * narrowing) — see tests/middleware-auth.test.ts "Part 3" for the primary,
 * behavioral version of this test, written the same way the repo's other
 * middleware tests are (importing `@/middleware` and driving it end to end).
 *
 * Why this file exists too: in this sandbox, `node_modules/next/package.json`
 * has no "exports" map (pre-existing, unrelated to this fix — reproduces
 * identically on `git stash` before any of these changes). Vitest's Vite-based
 * resolver refuses `next-intl/middleware`'s extension-less `from 'next/server'`
 * import as a result, so ANY test file that imports `@/middleware` (even
 * transitively) fails at import time with "Cannot find module
 * '.../node_modules/next/server'" — before a single test body runs. That
 * blocks tests/middleware-auth.test.ts's Part 3 from executing here.
 *
 * This file gets a real red→green cycle in this environment by reading the
 * *actual* `isProtectedRoute` pattern list out of src/middleware.ts's source
 * text (not a hand-duplicated copy — so it can't silently drift from the
 * real file) and replaying Clerk's `createRouteMatcher` matching algorithm
 * against it, exactly as `middleware-auth.test.ts`'s `covered()` helper
 * already does for `config.matcher`.
 */

const middlewareSource = fs.readFileSync(
  path.resolve(__dirname, '../src/middleware.ts'),
  'utf8',
);

/**
 * Pulls the string literals out of the `isProtectedRoute = createRouteMatcher([...])`
 * array, skipping comment-only lines. A naive "match every '...' in the block"
 * regex would also pick up the quoted `'(.*)'` inside the synastry comment
 * a few lines above the avatar entries — this only accepts lines that, once
 * trimmed, are nothing but a single quoted string (+ optional trailing comma).
 */
function extractProtectedPatterns(source: string): string[] {
  const arrayMatch = source.match(
    /const isProtectedRoute = createRouteMatcher\(\[([\s\S]*?)\n\]\);/,
  );
  if (!arrayMatch) {
    throw new Error('Could not find isProtectedRoute createRouteMatcher([...]) in middleware.ts');
  }
  const patterns: string[] = [];
  for (const rawLine of arrayMatch[1].split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('//')) continue;
    const literal = line.match(/^'([^']+)',?$/);
    if (literal) patterns.push(literal[1]);
  }
  return patterns;
}

/** Same conversion `middleware-auth.test.ts`'s `covered()` helper uses. */
function toRegExp(pattern: string): RegExp {
  const converted = pattern
    .replace(/:\w+\*/g, '.*')
    .replace(/:\w+\+/g, '.+')
    .replace(/:\w+\([^)]+\)/g, '[^/]+')
    .replace(/:\w+/g, '[^/]+');
  return new RegExp(`^${converted}$`);
}

function isProtected(pathname: string): boolean {
  const patterns = extractProtectedPatterns(middlewareSource);
  return patterns.some((p) => toRegExp(p).test(pathname));
}

describe('middleware isProtectedRoute source — avatar entries (C2)', () => {
  it('sanity: extraction actually finds patterns (guards against a silently-empty match)', () => {
    expect(extractProtectedPatterns(middlewareSource).length).toBeGreaterThan(5);
  });

  it('does NOT protect GET /api/v1/avatar/:id/image (anonymous shared-portrait reads)', () => {
    expect(isProtected('/api/v1/avatar/av_1/image')).toBe(false);
  });

  it.each([
    '/api/v1/avatar/generate',
    '/api/v1/avatar/portrait',
    '/api/v1/avatar/av_1/share',
  ])('still protects write endpoint %s', (p) => {
    expect(isProtected(p)).toBe(true);
  });
});
