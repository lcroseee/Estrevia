import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * C3 — the EN Cosmic Portrait share URL must actually resolve.
 *
 * src/middleware.ts skips next-intl locale rewriting for any pathname
 * starting with '/s/' (see its "/s/ — share pages" comment). With
 * `localePrefix: 'as-needed'` and `defaultLocale: 'en'`, the EN share link
 * has NO locale prefix — it is exactly `/s/avatar/:id` (3 URL segments).
 * Because that path is skipped, it reaches Next.js's router UN-rewritten:
 * the file-based route that answers it must therefore itself be at
 * `src/app/s/avatar/[id]/page.tsx` (3 segments), not
 * `src/app/[locale]/s/avatar/[id]/page.tsx` (4 segments, only reachable
 * through a locale-prefixed rewrite this path never gets).
 *
 * This mirrors the two share pages that already work this way —
 * src/app/s/[id]/page.tsx and src/app/s/synastry/[id]/page.tsx — both
 * outside [locale], per src/app/s/layout.tsx's doc comment.
 */

const repoRoot = path.resolve(__dirname, '..');
const middlewareSource = fs.readFileSync(path.join(repoRoot, 'src/middleware.ts'), 'utf8');

describe('avatar share page — route actually resolves at /s/avatar/:id (C3)', () => {
  it('middleware still skips next-intl rewriting for /s/ paths (precondition this fix relies on)', () => {
    // Reproduces the exact runtime check at src/middleware.ts's `pathname.startsWith('/s/')`
    // branch without importing the module (see tests/middleware-avatar-route-matching.test.ts
    // for why: this sandbox's node_modules/next lacks an "exports" map, which breaks
    // next-intl/middleware's extension-less `from 'next/server'` import at load time).
    expect(middlewareSource).toContain("pathname.startsWith('/s/')");
    expect('/s/avatar/av_1'.startsWith('/s/')).toBe(true);
  });

  it('the page file lives at src/app/s/avatar/[id]/page.tsx — 3 URL segments, matching the un-rewritten path', () => {
    const p = path.join(repoRoot, 'src/app/s/avatar/[id]/page.tsx');
    expect(fs.existsSync(p)).toBe(true);
  });

  it('does NOT also exist under [locale] (the 4-segment route the un-rewritten path can never reach)', () => {
    const oldDir = path.join(repoRoot, 'src/app/[locale]/s/avatar');
    expect(fs.existsSync(oldDir)).toBe(false);
  });

  it('matches the established EN-only share-page pattern (/s/[id], /s/synastry/[id])', () => {
    expect(fs.existsSync(path.join(repoRoot, 'src/app/s/[id]/page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'src/app/s/synastry/[id]/page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'src/app/s/avatar/[id]/page.tsx'))).toBe(true);
  });
});
