# SEO Phase 3 — Design Spec

| Field | Value |
| --- | --- |
| Date | 2026-05-03 |
| Status | Draft → pending founder review |
| Authors | Lead (Claude Opus 4.7) + brainstorming with founder |
| Predecessor | `2026-05-02-seo-phase2-design.md` (shipped) |
| Trigger | SEO audit (in-conversation 2026-05-03) → 88/100 baseline; this batch targets +3-4 points |
| Scope | 6 SEO fixes (T1–T6) — derived from audit P0/P1, after dropping P1-5 (E-E-A-T/about page) and reducing P1-2 (no SearchAction) |
| Branch model | Direct-to-main per CLAUDE.md `feedback_main_branch_workflow`; 6 sequential commits |
| Estimated effort | ~3-4h end-to-end |
| Verification | Post-deploy curl checks + Lighthouse PWA + Vercel preview validation for T6 |

## Decisions log (from brainstorming Q1–Q4)

| Q | Decision | Reasoning |
| --- | --- | --- |
| Q1 — batch scope | **A** — All 7 audit fixes as single Phase 3 batch | Coherent SEO improvement story; founder reads diffs, granular commits handle review |
| Q2 — E-E-A-T strategy | **D** — Skip P1-5 (Person author + /about page) | Privacy / domain-baggage tradeoff outweighs +1 point uplift; can revisit post-launch |
| Q3 — sitemap mtime strategy | **C** — Hybrid per-route-type | Semantically precise per content type; year-dependent sidereal-dates correctly distinguished from stable code/content |
| Q4 — WebSite schema | **C** — Generic `WebSite` only, no `SearchAction` | `/search` not in MVP roadmap; generic schema still helps Google site identity / Knowledge Graph |
| Implementation strategy | Approach 3 — Risk-graded sequence (6 separate commits) | Smallest blast radius first; revert any single commit independently; matches `seo-phase2/T*` commit-message convention |

---

## §0. Context: state at session start (verified 2026-05-03)

Phase 2 shipped 2026-05-03 (per memory `project_seo_phase2_shipped.md`). Sitemap = 466 URL (233 paths × 2 locales). Mobile Lighthouse Performance ≥85 achieved.

In-session SEO audit (88/100) identified 7 prioritized fixes. Phase 3 ships 6 of them; P1-5 dropped per Q2.

**Verified ground truth (audit revisions confirmed):**

| # | Claim | Verification | Action |
| --- | --- | --- | --- |
| 1 | `/chart` is public, NOT auth-protected | `src/middleware.ts:11-12` protects `/charts(.*)` (plural), not `/chart` | Manifest `start_url: "/chart"` is correct, no fix needed |
| 2 | JSON-LD localization issue is page-specific, not systemic | Essays use `essay.meta.title` (locale-aware), sidereal-dates uses `t()`, why-sidereal uses `t()` — only `signs/[sign]/page.tsx:152-158` has hardcoded EN | T3 narrowed to single file |
| 3 | `/why-sidereal` ISR is feasible | Essays use `revalidate=86400` + `getLocale()` together; locale comes from `[locale]` URL segment, not cookies; the existing comment in `why-sidereal/page.tsx:14-17` is incorrect | T2 confirmed safe |
| 4 | `/search` route does not exist, not in `docs/seo.md` roadmap | `find src/app -type d -name "search"` returns empty | T4 reduced to generic `WebSite` schema (no `SearchAction`) |
| 5 | `/essays` and `/signs` index pages exist as `page.tsx` files | `ls src/app/[locale]/(app)/essays/` and `signs/` show `page.tsx` siblings to `[slug]/`/`[sign]/` | T5: only need to add to sitemap, not create pages |
| 6 | Sitemap currently uses `lastModified: now` for all 466 URLs | `src/app/sitemap.ts:114, 118-187` confirms | T6 target — replace with per-route-type strategy |
| 7 | Manifest icons are SVG-only | `public/manifest.json:13-23` shows single SVG entry, both `purpose: "any"` and `purpose: "maskable"` | T1 target — add 4 PNG variants |

**Key insight from §0:** Two audit claims were corrected during review (`/chart` auth status; `/es` JSON-LD scope). Both retracted/narrowed before this spec was written. No further brief-vs-code contradictions remain.

---

## §1. Scope

### In scope (6 tickets)

- **T1** — Add PNG manifest icons (192/512 + maskable variants).
- **T2** — `/why-sidereal`: replace `force-dynamic` with `revalidate = 3600`.
- **T3** — Localize JSON-LD on `signs/[sign]/page.tsx` per locale.
- **T4** — Add `WebSite` schema (no `SearchAction`) on homepage.
- **T5** — Add `/essays` and `/signs` index URLs to sitemap.
- **T6** — Implement per-route-type `lastModified` strategy in sitemap.

### Out of scope (explicit non-goals)

- ❌ `/about` page or `Person` author schema (Q2 D — E-E-A-T effort deferred indefinitely).
- ❌ `SearchAction` schema or `/search` route (Q4 C — no MVP need).
- ❌ Lighthouse CI integration in pipeline.
- ❌ GSC dashboard automation.
- ❌ New essay content / refactor of 120 existing essays.
- ❌ Performance work beyond T2 (font CLS, image optimization, RUM tracking).
- ❌ Phase 4 programmatic SEO (city × planetary hours).
- ❌ Plan B for T6 (GitHub Action mtime manifest) — implemented only if Plan A fails on Vercel.

---

## §2. Approach — risk-graded sequence

6 separate commits in order of increasing blast radius. Each commit is independently revertable; no commit depends on a later one for correctness.

| Order | Ticket | Blast radius | Effort |
| --- | --- | --- | --- |
| 1 | **T1** PNG icons | Zero Google-facing impact (PWA-only) | 30 min |
| 2 | **T2** `/why-sidereal` ISR | Single page, measurable TTFB win | 30 min |
| 3 | **T3** signs JSON-LD localization | One page, additive locale fix | 30 min |
| 4 | **T4** `WebSite` schema | Homepage only, additive | 30 min |
| 5 | **T5** sitemap index pages | +4 URLs in sitemap | 15 min |
| 6 | **T6** sitemap per-route mtime | All 466 URLs touched | 1.5–2h |

**Rationale:** SEO has delayed feedback (GSC reflects changes in 3-14 days). Risk-graded sequence preserves the option to stop after any commit if signals look wrong. Granular commits also align with founder review pattern (CLAUDE.md: "Founder reads diffs").

**Commit message convention** (matches existing `seo-phase2/T*` style):

```
feat(seo-phase3/T1): add PNG manifest icons (192/512 + maskable)
perf(seo-phase3/T2): /why-sidereal force-dynamic → ISR revalidate=3600
fix(seo-phase3/T3): localize signs/[sign] JSON-LD per locale
feat(seo-phase3/T4): WebSite schema for site identity on homepage
feat(seo-phase3/T5): /essays and /signs index in sitemap (+4 URLs)
feat(seo-phase3/T6): per-route-type lastModified strategy in sitemap
```

---

## §3. T1 — PNG manifest icons

### Goal

Add PNG icon variants so Lighthouse PWA "Installable" check passes and Android install prompt shows the proper branded icon (current SVG-only manifest fails on Android <12 and is unreliable on iOS Safari).

### Files

| File | Action |
| --- | --- |
| `public/icons/icon-192.png` | NEW — 192×192, source: `estrevia-icon.svg` |
| `public/icons/icon-512.png` | NEW — 512×512, same source |
| `public/icons/icon-maskable-192.png` | NEW — 192×192 with 10% safe-zone padding |
| `public/icons/icon-maskable-512.png` | NEW — 512×512 with 10% safe-zone padding |
| `public/manifest.json` | EDIT — extend `icons` array |

### Manifest changes

```json
"icons": [
  { "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
  { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

### Implementation notes

- **Source asset choice:** use `estrevia-icon.svg` (vector, supports alpha). Do NOT use `estrevia-icon-1024.jpg` (JPG = no alpha → broken transparency on dark/light app launchers).
- **Maskable variant:** Android applies a circular/rounded mask. Content must fit in central 80% (10% padding each side). Generate via `sharp` script or one-off via [maskable.app](https://maskable.app/editor).
- **Optional approach:** add an npm script `npm run generate:icons` using `sharp` to regenerate from SVG on demand. Keeps PNGs reproducible; checked in for fast access. Not required for ship.

### Acceptance

- 4 PNG files committed under `public/icons/`.
- `manifest.json` icons array contains all 5 entries (1 SVG + 4 PNG).
- Local Lighthouse PWA audit reports "Installable" green.
- Manual install on Android Chrome shows proper icon.

---

## §4. T2 — `/why-sidereal`: `force-dynamic` → ISR

### Goal

Restore CDN caching for the most-important AEO pillar page. Current `force-dynamic` recomputes on every request (wasted compute, slow TTFB). The original justification ("must read cookies/headers per request") is incorrect — locale comes from `[locale]` URL segment, not cookies.

### Files

| File | Action |
| --- | --- |
| `src/app/[locale]/(marketing)/why-sidereal/page.tsx:14-18` | EDIT — replace dynamic export, fix comment |

### Diff

```diff
- // Locale-aware: must read cookies/headers per request, so we cannot use
- // `force-static`. We let next-intl render the correct language per visitor.
- // The page is still cacheable downstream via standard Next.js dynamic rendering.
- export const dynamic = 'force-dynamic';
+ // ISR: revalidate hourly. Locale resolved from [locale] URL segment,
+ // so two cached versions exist (en + es). Same pattern as essays/[slug]
+ // which use revalidate=86400 + getLocale() successfully.
+ export const revalidate = 3600;
```

### Implementation notes

- No other code changes. `getLocale()` and `getTranslations()` are ISR-compatible (proven by 120 essays + 12 sign pages + 78 tarot pages).
- `dateModified` in `articleSchema` (line 111) is computed via `today = new Date().toISOString()...` — with ISR this freezes at revalidation time, which is correct behavior (page genuinely doesn't change between revalidations).
- Build will pre-render both EN and ES variants statically; subsequent requests served from edge cache.

### Acceptance

- `force-dynamic` removed.
- `revalidate = 3600` present.
- Comment fixed to reflect correct reasoning.
- `npm run build` succeeds; both `/why-sidereal` and `/es/why-sidereal` render correctly.
- TTFB on cache hit <100ms (measured on Vercel preview deploy via `curl -w "%{time_starttransfer}\n" -s -o /dev/null https://<preview-url>/why-sidereal`).

---

## §5. T3 — Localize JSON-LD on `signs/[sign]`

### Goal

Localize `articleSchema` `headline` and `description` so Google rich results match the page language. Currently `/es/signs/aries` renders Spanish HTML but emits English JSON-LD — Google won't show rich snippets in ES SERPs.

### Files

| File | Action |
| --- | --- |
| `src/app/[locale]/(app)/signs/[sign]/page.tsx:152-158` | EDIT — replace hardcoded English with `t()` calls |
| `messages/en.json` | EDIT — add `signDetail.schema.{title,description}` keys |
| `messages/es.json` | EDIT — add same keys with Spanish copy (tú-form, español neutro LATAM) |

### Diff

`page.tsx`:

```diff
+ const tSchema = await getTranslations('signDetail.schema');
  const articleLd = articleSchema({
-   title: `Sidereal ${data.sign} — Traits, Dates & Meaning`,
-   description: `Sidereal ${data.sign} (${data.siderealDates}): ${data.element} ${data.modality} ruled by ${data.ruler}. Complete guide to all 10 planetary placements in sidereal ${data.sign}.`,
+   title: tSchema('title', { sign: data.sign }),
+   description: tSchema('description', {
+     sign: data.sign,
+     dates: data.siderealDates,
+     element: elementLabel,
+     modality: modalityLabel,
+     ruler: data.ruler,
+   }),
    url: pageUrl,
    datePublished: '2024-01-01',
    dateModified: today,
  });
```

`messages/en.json` (under `signDetail`):

```json
"schema": {
  "title": "Sidereal {sign} — Traits, Dates & Meaning",
  "description": "Sidereal {sign} ({dates}): {element} {modality} ruled by {ruler}. Complete guide to all 10 planetary placements in sidereal {sign}."
}
```

`messages/es.json` (under `signDetail`):

```json
"schema": {
  "title": "{sign} sideral — rasgos, fechas y significado",
  "description": "{sign} sideral ({dates}): {element} {modality} regido por {ruler}. Guía completa de las 10 posiciones planetarias en {sign} sideral."
}
```

### Implementation notes

- Reuse `elementLabel` / `modalityLabel` already computed at lines 148-149 (`t('elements.Fire')` etc.) — they're already locale-aware.
- Variable interpolation via next-intl `{var}` syntax matches existing pattern in `pageMeta.signsDetail.description` (messages/en.json).
- ES copy: ChatGPT/translator-rendered draft acceptable, but **founder review recommended** for tú-form correctness (per memory `feedback_spanish_style`).

### Acceptance

- View-source on `/es/signs/aries` shows JSON-LD `headline` containing Spanish ("Aries sideral...").
- View-source on `/signs/aries` (EN) shows JSON-LD `headline` in English (regression-free).
- Existing SEO unit tests pass (`src/shared/seo/__tests__/`).

---

## §6. T4 — `WebSite` schema for site identity

### Goal

Emit a generic `WebSite` schema on the homepage so Google has explicit canonical site identity (helps Knowledge Graph, sitelinks, future rich features). No `SearchAction` (no `/search` route in MVP per Q4).

### Files

| File | Action |
| --- | --- |
| `src/shared/seo/json-ld.ts` | EDIT — add `websiteSchema()` function |
| `src/shared/seo/index.ts` | EDIT — barrel export |
| `src/app/[locale]/(marketing)/page.tsx:82` | EDIT — inject schema next to existing `softwareAppSchema` |

### Schema definition

```ts
export function websiteSchema(): WithContext<WebSite> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: ['en-US', 'es'],
    description: SITE_DESCRIPTION,
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    // potentialAction (SearchAction) intentionally omitted —
    // /search route not in MVP. Add when /search exists.
  };
}
```

### Page injection

```diff
  <JsonLdScript schema={softwareAppSchema()} />
+ <JsonLdScript schema={websiteSchema()} />
  <JsonLdScript schema={howToJsonLd} />
  <JsonLdScript schema={faqJsonLd} />
```

### Implementation notes

- `WebSite` and `SoftwareApplication` together is a valid pattern (Estrevia is both a published website AND a PWA). Google handles both schemas concurrently.
- Inject only on homepage. Other pages don't need this schema (they're typed as `Article`/`Product`/etc.).

### Acceptance

- `websiteSchema()` exported from `@/shared/seo`.
- Homepage view-source contains JSON-LD with `"@type": "WebSite"`.
- [Google Rich Results Test](https://search.google.com/test/rich-results) on Vercel preview returns valid (no errors, may have informational warnings about absent `SearchAction`).

---

## §7. T5 — `/essays` and `/signs` index in sitemap

### Goal

Index pages serve as topical hubs for Google's PageRank distribution. Currently only leaf pages (`/essays/[slug]`, `/signs/[sign]`) are in sitemap. Adding the indexes gives Google explicit signals that these are category roots.

### Files

| File | Action |
| --- | --- |
| `src/app/sitemap.ts:117-134` (`staticPages` section) | EDIT — append 2 entries |

### Diff

```diff
  const staticPages: MetadataRoute.Sitemap = [
    ...emitLocalized('/', { ... }),
    ...emitLocalized('/why-sidereal', { ... }),
    ...emitLocalized('/pricing', { ... }),
    ...emitLocalized('/privacy', { ... }),
    ...emitLocalized('/terms', { ... }),
+   ...emitLocalized('/essays', {
+     lastModified: now /* T6 will replace with lastModifiedFor('static', ...) */,
+     changeFrequency: 'weekly',
+     priority: 0.85,
+   }),
+   ...emitLocalized('/signs', {
+     lastModified: now /* T6 will replace with lastModifiedFor('static', ...) */,
+     changeFrequency: 'monthly',
+     priority: 0.85,
+   }),
  ];
```

### Implementation notes

- Both pages already exist (`src/app/[locale]/(app)/essays/page.tsx`, `src/app/[locale]/(app)/signs/page.tsx`). No new routes needed.
- T5 lands first with `lastModified: now` placeholder; T6 then refactors all 466+4 URLs to use `lastModifiedFor()`. This keeps each commit self-contained and reduces merge conflicts during sequential ship.

### Acceptance

- Total sitemap URL count: 470 (was 466, +4).
- `curl http://localhost:3000/sitemap.xml | grep -c "estrevia.app/essays<"` returns 1 (counting only the index, not `/essays/[slug]/`).
- Same for `/signs`, `/es/essays`, `/es/signs`.
- Hreflang alternates correctly emitted for both new pairs.

---

## §8. T6 — Per-route-type `lastModified` strategy

### Goal

Replace `lastModified: now` (which lies to Google about freshness on every deploy) with semantically accurate per-route mtimes. Preserves crawl budget; improves indexation rate signals; correctly distinguishes year-dependent content (sidereal-dates) from stable content.

### Strategy table

| Route type | URL count | Source of truth | mtime computation |
| --- | --- | --- | --- |
| Static (homepage, pricing, why-sidereal, legal, /essays, /signs, /chart, /moon, /hours, /synastry, /tarot, /tree-of-life) | 24 | `page.tsx` | git mtime of file |
| Essays | 240 (120 EN + 120 ES) | MDX frontmatter `updatedAt` | MDX `updatedAt` → git mtime fallback → build time |
| Signs | 24 | `content/signs/descriptions.json` (EN), `descriptions.es.json` (ES) | git mtime per locale |
| Tarot | 156 | `content/tarot/cards.json` | git mtime |
| Sidereal-dates | 24 | year-dependent SSR computation | **Jan 1 of current year** (one update per year, not per deploy) |

### New file: `src/shared/seo/sitemap-mtime.ts`

```ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

type RouteType = 'static' | 'essay' | 'sign' | 'tarot' | 'sidereal-dates';

// Memoization — sitemap.ts generates 466 URLs but only ~30 unique source files.
const gitMtimeCache = new Map<string, Date>();

/**
 * Returns last commit ISO timestamp for a given file path.
 * Falls back to current build time on git error or shallow clone.
 *
 * SECURITY: uses execFileSync with arg array (NOT execSync with template literal).
 * This bypasses the shell entirely — no command injection surface even if a path
 * contains special characters. The `--` argument prevents git from parsing the
 * path as a flag.
 */
function getGitMtime(relativePath: string): Date {
  if (gitMtimeCache.has(relativePath)) return gitMtimeCache.get(relativePath)!;
  try {
    const stdout = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', relativePath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (!stdout) throw new Error('empty git log output');
    const date = new Date(stdout);
    if (isNaN(date.getTime())) throw new Error(`invalid date: ${stdout}`);
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
 */
function getEssayMtime(slug: string, locale: 'en' | 'es'): Date {
  const subdir = locale === 'es' ? 'es/' : '';
  const filePath = `content/essays/${subdir}${slug}.mdx`;
  try {
    const fullPath = path.join(process.cwd(), filePath);
    const raw = readFileSync(fullPath, 'utf8');
    const { data } = matter(raw);
    if (data?.updatedAt) {
      const parsed = new Date(data.updatedAt);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  } catch {
    // fall through to git mtime
  }
  return getGitMtime(filePath);
}

/**
 * Public router. Used by sitemap.ts per route type.
 */
export function lastModifiedFor(type: RouteType, ...args: string[]): Date {
  switch (type) {
    case 'static':
      return getGitMtime(args[0]); // page.tsx path
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
      // Year-dependent content: bump once per calendar year.
      return new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown route type: ${exhaustive}`);
    }
  }
}
```

### Sitemap.ts integration

Replace every `lastModified: now` with appropriate `lastModifiedFor()` call. Examples:

```ts
// Static pages
...emitLocalized('/', {
  lastModified: lastModifiedFor('static', 'src/app/[locale]/(marketing)/page.tsx'),
  ...
}),

// Essays — per-locale mtime requires extending emitLocalized helper
const essayPages = getAllEssaySlugs().flatMap((slug) =>
  emitLocalizedWithLocale(`/essays/${slug}`, {
    changeFrequency: 'monthly',
    priority: 0.7,
    images: [essayOgImage(slug)],
  }, (locale) => lastModifiedFor('essay', slug, locale)),
);

// Sidereal-dates (year-dependent)
...SIGNS.flatMap((sign) =>
  emitLocalized(`/sidereal-${sign}-dates`, {
    lastModified: lastModifiedFor('sidereal-dates'),
    ...
  }),
),
```

Note: `emitLocalized()` currently takes a single `partial` object. For per-locale mtimes (essays, signs), introduce a sibling helper `emitLocalizedWithLocale()` that accepts a function `(locale) => Date` for `lastModified`. Implementation detail decided during writing-plans phase.

### Performance

- 466 URLs but only ~30 unique source files.
- Memoization → ~30 `git log` invocations per build, not 466.
- Build time addition: ~1-3s on Vercel. Acceptable.

### Edge cases (decisions, not deferrals)

| Scenario | Decision |
| --- | --- |
| File doesn't exist | fallback to `new Date()` (build time), `console.warn` |
| MDX frontmatter `updatedAt` missing or invalid | fallback to git mtime of MDX file |
| MDX file renamed | use `git log` without `--follow` (simpler; file renames are rare for slug-stable URLs) |
| Locale-specific MDX absent (e.g., new ES essay not yet translated) | use git mtime of EN file (sitemap should not lie about ES freshness) |
| Vercel shallow clone returns only HEAD timestamp | verified via Plan A (see §8.5); if confirmed, escalate to Plan B |

### §8.5 ⚠️ Vercel build environment risk

**Risk:** if Vercel uses `git fetch --depth=1`, then `git log` returns only HEAD-commit timestamp for every file → all lastmod values equal. Negates T6's value.

**Mitigation Plan A (default — 0 LoC):**
- Ship T6 as designed.
- Verify on first Vercel preview deploy: `curl https://<preview>.vercel.app/sitemap.xml | grep lastmod | sort -u | wc -l`. Expected: ≥5 unique values. If = 1 → Plan B.

**Mitigation Plan B (only if Plan A fails — separate ticket):**
- GitHub Action (`.github/workflows/build-mtime-manifest.yml`) on push to `main` that runs `git log` for every tracked source file and writes `data/git-mtimes.json` (path → ISO timestamp). Commits manifest back.
- `sitemap-mtime.ts` reads `data/git-mtimes.json` first, falls back to `git log` for files not in manifest.
- ~30 lines YAML + ~10 lines fallback in helper. Defer until needed.

### Tests

New file: `src/shared/seo/__tests__/sitemap-mtime.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { lastModifiedFor } from '../sitemap-mtime';

describe('lastModifiedFor', () => {
  it('essay returns MDX frontmatter updatedAt when present', () => {
    const date = lastModifiedFor('essay', 'sun-in-aries', 'en');
    expect(date.toISOString()).toBe('2024-01-15T00:00:00.000Z');
  });

  it('sidereal-dates returns Jan 1 of current year', () => {
    const date = lastModifiedFor('sidereal-dates');
    const expected = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    expect(date.toISOString()).toBe(expected.toISOString());
  });

  it('static returns valid Date for known path', () => {
    const date = lastModifiedFor('static', 'src/app/sitemap.ts');
    expect(date).toBeInstanceOf(Date);
    expect(date.getTime()).toBeLessThan(Date.now() + 1000);
  });

  it('falls back to build time for non-existent path', () => {
    const before = Date.now();
    const date = lastModifiedFor('static', 'src/does/not/exist.ts');
    expect(date.getTime()).toBeGreaterThanOrEqual(before);
  });
});
```

Mock `child_process.execFileSync` for deterministic unit tests where appropriate (vi.mock pattern).

### Acceptance

- `src/shared/seo/sitemap-mtime.ts` implemented with all 5 route types.
- Unit tests pass.
- After local `npm run build`: `curl http://localhost:3000/sitemap.xml | grep lastmod | sort -u | wc -l` ≥ 5.
- Vercel preview deploy verified (Plan A check). If failed → ticket for Plan B opened, T6 documented as "shipped with stale lastmod for some routes pending Plan B".

---

## §9. Testing strategy (consolidated)

| Layer | T1 | T2 | T3 | T4 | T5 | T6 |
| --- | --- | --- | --- | --- | --- | --- |
| `npm test` green | ✓ | ✓ | ✓ | ✓ | ✓ | + new `sitemap-mtime.test.ts` |
| `npm run typecheck` clean | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `npm run lint` clean | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lighthouse PWA audit | **REQUIRED** ("Installable" green) | – | – | – | – | – |
| View-source verification | – | – | `/es/signs/aries` JSON-LD `headline` in Spanish | Homepage `WebSite` JSON-LD present | – | – |
| `/sitemap.xml` curl check | – | – | – | – | `/essays`, `/signs` × EN+ES present | `\| grep lastmod \| sort -u \| wc -l` ≥ 5 |
| Vercel preview deploy verify | – | TTFB <100ms on cache hit | – | Google Rich Results Test pass | – | **REQUIRED** (Plan A: lastmod heterogeneous) |
| Founder review of ES copy | – | – | **REQUIRED** (sign schema description tú-form) | – | – | – |

### Pre-flight verification (before T1)

```bash
# Baseline sitemap state
curl -s https://estrevia.app/sitemap.xml | grep -c '<loc>'   # 466
curl -s https://estrevia.app/sitemap.xml | grep lastmod | sort -u | wc -l   # 1 (all "now")
curl -s https://estrevia.app/manifest.json | jq '.icons | length'   # 2 (SVG, two purposes)
curl -sI https://estrevia.app/why-sidereal | grep -i cache-control   # current state pre-T2
curl -s https://estrevia.app/signs/aries | grep -A 5 '"@type": "Article"'   # EN baseline
curl -s https://estrevia.app/es/signs/aries | grep -A 5 '"@type": "Article"'   # confirms current bug
```

Save to `tmp/baselines/seo-phase3-baseline-2026-05-03.json`.

### Post-deploy verification (after each ticket)

After each commit lands on `main` and Vercel deploys to production:
- Re-run baseline curl checks; diff against baseline JSON.
- For T6: explicitly inspect lastmod heterogeneity.
- Document any unexpected deltas in commit notes / followup tickets.

---

## §10. Rollback plan

Each ticket is independently revertable via `git revert <sha>`. No data migrations, no DB changes, no service contracts.

| Revert | Worst-case impact |
| --- | --- |
| T1 | PWA icons revert to SVG-only (current baseline) |
| T2 | TTFB on `/why-sidereal` rises ~400ms (UX-neutral, SEO-neutral) |
| T3 | `/es/signs` JSON-LD reverts to English (existing minor SEO bug) |
| T4 | `WebSite` schema removed (sitelinks search box not affected — never had it) |
| T5 | -4 URLs from sitemap |
| T6 | `lastModified` reverts to `now` (current baseline) |

No revert affects user-facing functionality. No PII or auth surface touched.

---

## §11. Followups (post-ship — separate tickets)

1. **GSC sitemap submission** (founder action, one-time): submit `https://estrevia.app/sitemap.xml` in Google Search Console after T6 lands.
2. **Indexation monitoring** (4-week window): weekly check of GSC indexation rate. Target ≥80% of 470 URLs.
3. **T6 Plan B** (only if Plan A fails): GitHub Action mtime manifest. Open as `seo-phase3-T6-plan-b` ticket only if Vercel preview confirms shallow clone.
4. **Re-audit** (4 weeks post-ship): re-score against the SEO audit baseline. Target movement: 88 → 91-92.
5. **Lighthouse CI integration** (separate spec): out of scope for Phase 3 but logical next.

---

## §12. Open verification items (must be tested during implementation)

| Item | Verification | Action if fails |
| --- | --- | --- |
| Vercel `git log` returns full history (not shallow) | T6 Plan A check | Implement Plan B in followup ticket |
| ES translation tú-form correctness | Founder review of T3 messages/es.json | Adjust copy |
| `WebSite` schema does not conflict with `SoftwareApplication` on homepage | Google Rich Results Test on T4 deploy | Remove one (defer to founder decision) |
| Lighthouse PWA "Installable" check passes after T1 | Local Lighthouse run | Adjust manifest fields (`scope`, `start_url`) |

---

**End of spec.**
