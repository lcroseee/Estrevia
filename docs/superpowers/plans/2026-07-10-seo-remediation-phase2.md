# SEO Remediation — Phase 2 (Consolidate & Deepen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the surfaces Google now trusts (after Phase 1 unblocks crawl-quality): enrich the top compatibility pairs, lift CTR on ranking pages, mesh ES internal links, localize leaking tokens, make dates/schema honest, kill soft-404s, ship a founder-authored `/about` + Person author, and cut the anonymous-page perf tax.

**Architecture:** Ten task groups (T7–T14 + a batch of cleanups). Each fix extracts a small pure helper (the repo's SEO test style — no async-server-component render harness) and covers SSR/behavioural guarantees with a curl/Lighthouse gate. Content-heavy items (enriched compat prose, `/about` bio, ES essay descriptions, tarot prose) ship the **mechanism + a placeholder-detecting test** and leave proprietary prose to the founder per the content-license rule. All work lands on `main` (direct-to-main). **Sequenced after Phase 1 has indexed.**

**Tech Stack:** Next.js 16 (App Router/RSC), React 19, TypeScript 6 strict, next-intl (en/es), Vitest, Tailwind 4.

## Global Constraints

- **Test runner:** `npx vitest run <path>` (single) / `npm test` (all). `npm run typecheck`, `npm run lint`. Zero-fail policy on changed paths.
- **SEO single source of truth:** metadata via `createMetadata()`; JSON-LD via `src/shared/seo/json-ld.ts`. New SEO utilities go in `src/shared/seo/`; token/display-i18n helpers go in `src/shared/lib/`; feature-render helpers stay in their module. Never in an unrelated feature folder.
- **Content license:** `content/` essay + tarot **prose** is proprietary — do NOT author it. Plan the mechanism (template, schema, data shape, un-noindex, sitemap wiring) and hand prose to the founder with a precise content spec + a placeholder-detecting test that keeps `main` free of stubs.
- **i18n:** español neutro LATAM (`tú`); **sign names untranslated, planet names translated.** Astrology-not-advice disclaimer required on content pages.
- **PII:** untouched. **Email render:** `COMPANY_POSTAL_ADDRESS` must stay set in Vercel prod (any commercial email throws without it).
- **SITE_URL** = `https://estrevia.app` in the test env (import from `constants.ts`, don't hardcode).
- **Commit style:** `fix(seo-p2/T<n>):` / `feat(seo-p2/T<n>):` / `perf(seo-p2/T<n>):`.
- **Depends on Phase 1** being merged (T2 already noindexed compat + dropped 156 sitemap URLs; T4 touched the essay page; T6b changed hreflang keys).

## Decisions log (sub-decisions taken under founder's "act on your recommendation" directive)

1. **T7 — readiness-gate, not a flag flip.** An `ENRICHED_PAIRS` allowlist (12 slugs) declares intent; `isPairReady()` gates the actual `index:true` + sitemap re-emission on **both** locales passing validation (≥300 words, ≥3 sections, ≥3 FAQ, no placeholder). Ships **dormant** — CI green, sitemap byte-identical to post-Phase-1 (514) — and each pair auto-flips the instant the founder authors its content file. The 12: aries-leo, aries-libra, aquarius-libra, cancer-pisces, cancer-scorpio, capricorn-taurus, gemini-libra, gemini-sagittarius, leo-sagittarius, leo-scorpio, pisces-scorpio, scorpio-taurus (a one-line editable const).
2. **T8 — improve shared templates.** Word-boundary truncation (all pages); real sidereal date ranges via a pure formatter; concrete-value city descriptions (lifts all 20, subsumes the named 5); query-answering `/es/signs` title.
3. **T9 — `relatedEssaySlugs` pure helper** (6–8 siblings) rendered in a reusable `RelatedPlacements` component **outside** the paywall (unconditionally crawlable); hub/city entry links = the 12-slug Sun cluster. Coexists with the existing `getRelatedPages` (untouched).
4. **T10 — pure display maps in `src/shared/lib/astro-i18n.ts`** (element/modality/planet), single-sourced against `messages` via a drift guard. Found + fixed a 3rd compat leak and the city planet column the roadmap missed.
5. **T11 — realify dates from git** (not "drop updatedAt"): a codemod sets publishedAt=first-commit / updatedAt=last-commit so both sitemap lastmod AND Article dates are honest; emit `Article.image`; extend `sitemap-mtime` RouteType for compat + cities.
6. **T12 — `dynamicParams=false`** on essay + tarot routes (mirrors compat/city) → real 404s.
7. **T13 — founder-authored `/about` + Person author sitewide.** ⚠️ **Reverses the 2026-05-03 "авторство не нужно" call — founder re-review gate** (published name + Organization→Person author). Adds `FOUNDER_NAME`, `personSchema`, `organizationSchema.founder`; factual methodology copy seeded, personal bio left to founder behind a placeholder test.
8. **T14 — three lowest-risk perf fixes** sharing one consent predicate: drop the banner's 800ms delay (keep SSR-hidden, no flash) + fast fade; gate Meta Pixel on consent (remove the no-consent noscript PageView); `preload:false` on Crimson Pro (no variant drops).
9. **BATCH — sitemap `/support` + `/tarot/spread`; fix the `node="[object Object]"` leak on all 14 MDX prose components (extract `proseComponents.tsx`); merge robots.txt's two UA groups.**

## Verification status (workflow hit a session usage limit mid-run)

- **Adversarially verified** (draft → independent codebase re-check): **T13**.
- **Grounded draft, formal verify pending** (authored by a grounding agent that read the real files + cited line numbers; second-pass verify died on the usage limit): **T7, T9, T10, T14, BATCH**.
- **Authored in-session against live code** (main loop, grounded reads): **T8, T11, T12**.
- A verify pass over the "pending" set can be run by resuming workflow `wf_605b7c99-eb0` after the usage-limit reset (completed drafts replay from cache; only the missing verifies re-run).

## File Structure (authoritative per-task **Files** blocks below)

New helpers land in `src/shared/seo/` (compatibility-content, planetary-hour-rulers, essay-urls already from P1), `src/shared/lib/astro-i18n.ts`, `src/shared/components/RelatedPlacements.tsx`, `src/modules/esoteric/components/proseComponents.tsx`, `scripts/seo/`. Routes: `src/app/[locale]/(marketing)/about/`. Content sources: `content/compatibility/enriched/`. Each task's Files block lists exact paths + line anchors.

---

## Tasks


---

### P2-T7: Compatibility enrichment mechanism (top-12 pairs) · Phase 2

Roadmap §4 T7 + Decision 1. Phase-1 T2 already set `robots:{index:false,follow:true}` on all 156 compatibility-pair pages and dropped them from the sitemap. This task builds the mechanism to enrich the 12 highest-intent pairs to 300+ words and RE-INDEX only those (the other 144 stay noindexed), driven by a founder-authored typed content source.

**Design (see `recommendation` for the full rationale):** an `ENRICHED_PAIRS` allowlist of 12 canonical slugs in `src/shared/seo/compatibility-pairs.ts`; per-pair founder-authored content at `content/compatibility/enriched/<pair>.json` (`{updatedAt, en, es}`, each locale `{h1, metaTitle, metaDescription, intro, sections[], faq[]}`); a **readiness gate** — a pair re-indexes + re-enters the sitemap ONLY when both locales pass validation (≥300 words, ≥3 sections, ≥3 FAQ, no placeholder). The mechanism ships **dormant** with placeholder stubs so CI stays green and each pair auto-flips the moment the founder authors it. No prose is written here — that is T7e (founder), with a placeholder-detecting test as the guard.

**Precondition:** Phase-1 T2 has landed (compat pairs noindexed; `compatibilityPairs` block + `ALL_PAIR_SLUGS` import removed from `sitemap.ts`; the 3 T2 tests present in `sitemap.test.ts`). All edits below assume that post-T2 baseline.

**Files:**
- Modify: `src/shared/seo/compatibility-pairs.ts` — add `ENRICHED_PAIRS`, `isEnrichedPair`, pure validators + types (no fs).
- Create: `src/shared/seo/compatibility-content.ts` — fs loader + `isPairReady` / `readyEnrichedPairs` / `getReadyEnrichedPairContent`.
- Create: `content/compatibility/enriched/<pair>.json` ×12 — placeholder scaffolds (founder fills prose in T7e).
- Modify: `src/shared/seo/__tests__/compatibility-pairs.test.ts` — allowlist + validator tests.
- Create: `src/shared/seo/__tests__/compatibility-content.test.ts` — content-file + readiness + index-flip + sitemap tests (the placeholder-detecting gate).
- Modify: `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx` — enriched long-form render + FAQPage + conditional index/noindex.
- Modify: `src/app/sitemap.ts` — re-add ready enriched pairs (×2 locales).
- Modify: `src/shared/seo/__tests__/sitemap.test.ts` — make the two T2 count assertions readiness-aware.

**Interfaces:**
- `src/shared/seo/compatibility-pairs.ts` produces: `ENRICHED_PAIRS: readonly string[]`; `isEnrichedPair(slug: string): boolean`; `MIN_ENRICHED_WORDS = 300`; `ENRICHMENT_PLACEHOLDER = '__PLACEHOLDER__'`; `interface EnrichedSection { heading: string; body: string }`; `interface EnrichedFaqItem { question: string; answer: string }`; `interface EnrichedPairLocaleContent { h1: string; metaTitle: string; metaDescription: string; intro: string; sections: EnrichedSection[]; faq: EnrichedFaqItem[] }`; `interface EnrichedPairContent { updatedAt: string; en: EnrichedPairLocaleContent; es: EnrichedPairLocaleContent }`; `countWords(text: string): number`; `isPurePlaceholderStub(lc: EnrichedPairLocaleContent): boolean`; `isEnrichedLocaleValid(lc: EnrichedPairLocaleContent | null | undefined): boolean`.
- `src/shared/seo/compatibility-content.ts` produces: `getEnrichedPairContent(pair: string): EnrichedPairContent | null`; `isPairReady(pair: string): boolean`; `getReadyEnrichedPairContent(pair: string): EnrichedPairContent | null`; `readyEnrichedPairs(): string[]`.
- Consumes: `faqSchema`, `articleSchema`, `breadcrumbSchema`, `createMetadata` (`@/shared/seo`); `Link` (`@/i18n/navigation`); `parsePairSlug` (`@/shared/seo/compatibility-pairs`).

---

#### T7a — Allowlist + pure validators (`compatibility-pairs.ts`)

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/seo/__tests__/compatibility-pairs.test.ts`:
```ts
import {
  ENRICHED_PAIRS,
  isEnrichedPair,
  isEnrichedLocaleValid,
  isPurePlaceholderStub,
  countWords,
  ENRICHMENT_PLACEHOLDER,
  type EnrichedPairLocaleContent,
} from '../compatibility-pairs';

describe('ENRICHED_PAIRS allowlist (Phase 2 T7)', () => {
  it('is exactly 12 unique canonical DISTINCT-sign slugs, all in ALL_PAIR_SLUGS', () => {
    expect(ENRICHED_PAIRS).toHaveLength(12);
    expect(new Set(ENRICHED_PAIRS).size).toBe(12);
    for (const s of ENRICHED_PAIRS) {
      expect(ALL_PAIR_SLUGS).toContain(s);
      const [a, b] = s.split('-');
      expect(a! < b!).toBe(true); // canonical AND distinct signs (excludes self-pairs)
    }
  });

  it('isEnrichedPair matches the allowlist only', () => {
    expect(isEnrichedPair('aries-leo')).toBe(true);
    expect(isEnrichedPair('aries-aries')).toBe(false);
    expect(isEnrichedPair('leo-aries')).toBe(false); // non-canonical
  });
});

function validLc(): EnrichedPairLocaleContent {
  return {
    h1: 'Aries and Leo Compatibility: Sidereal Fire Trine',
    metaTitle: 'Aries and Leo Compatibility (Sidereal)',
    metaDescription: 'How Aries and Leo match in sidereal astrology — element, aspect, love.',
    intro: Array(60).fill('word').join(' '),
    sections: [
      { heading: 'Relationship dynamics', body: Array(120).fill('word').join(' ') },
      { heading: 'Love, friendship and work', body: Array(120).fill('word').join(' ') },
      { heading: 'The sidereal angle', body: Array(60).fill('word').join(' ') },
    ],
    faq: [
      { question: 'Are Aries and Leo compatible?', answer: 'Yes, they share fire.' },
      { question: 'Do they clash?', answer: 'Rarely, both lead.' },
      { question: 'Best for love or work?', answer: 'Both, with respect.' },
    ],
  };
}

describe('isEnrichedLocaleValid (the index gate)', () => {
  it('accepts >=300 words, placeholder-free, >=3 sections + >=3 faq', () => {
    expect(isEnrichedLocaleValid(validLc())).toBe(true);
  });
  it('rejects a surviving placeholder sentinel', () => {
    const lc = validLc();
    lc.sections[0]!.body = ENRICHMENT_PLACEHOLDER;
    expect(isEnrichedLocaleValid(lc)).toBe(false);
  });
  it('rejects under 300 words', () => {
    const lc = validLc();
    lc.intro = 'short';
    lc.sections = lc.sections.map((s) => ({ ...s, body: 'short' }));
    lc.faq = lc.faq.map((f) => ({ ...f, answer: 'x' }));
    expect(isEnrichedLocaleValid(lc)).toBe(false);
  });
  it('rejects fewer than 3 sections or 3 faq', () => {
    const a = validLc(); a.sections = a.sections.slice(0, 2);
    expect(isEnrichedLocaleValid(a)).toBe(false);
    const b = validLc(); b.faq = b.faq.slice(0, 2);
    expect(isEnrichedLocaleValid(b)).toBe(false);
  });
  it('rejects null / undefined', () => {
    expect(isEnrichedLocaleValid(null)).toBe(false);
    expect(isEnrichedLocaleValid(undefined)).toBe(false);
  });
});

describe('isPurePlaceholderStub', () => {
  it('is true when every string equals the sentinel', () => {
    const lc = validLc();
    lc.h1 = lc.metaTitle = lc.metaDescription = lc.intro = ENRICHMENT_PLACEHOLDER;
    lc.sections = lc.sections.map(() => ({ heading: ENRICHMENT_PLACEHOLDER, body: ENRICHMENT_PLACEHOLDER }));
    lc.faq = lc.faq.map(() => ({ question: ENRICHMENT_PLACEHOLDER, answer: ENRICHMENT_PLACEHOLDER }));
    expect(isPurePlaceholderStub(lc)).toBe(true);
  });
  it('is false for authored content', () => {
    expect(isPurePlaceholderStub(validLc())).toBe(false);
  });
});

describe('countWords', () => {
  it('counts whitespace-separated tokens, tolerant of padding', () => {
    expect(countWords('  hola  mundo sideral ')).toBe(3);
    expect(countWords('')).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/seo/__tests__/compatibility-pairs.test.ts`
Expected: FAIL — `ENRICHED_PAIRS`/`isEnrichedPair`/`isEnrichedLocaleValid`/`isPurePlaceholderStub`/`countWords` not exported.

- [ ] **Step 3: Implement — append to `src/shared/seo/compatibility-pairs.ts`** (after the existing `isValidPairSlug`, line 60):
```ts

// ---------------------------------------------------------------------------
// Phase 2 (T7) — enrichment allowlist + content validators.
//
// The 12 highest-intent pairs are enriched to 300+ unique words and RE-INDEXED;
// the other 144 stay noindex (Phase 1 T2). A pair only actually flips to
// index:true + re-enters the sitemap once BOTH locales of
// content/compatibility/enriched/<pair>.json pass validation — see
// compatibility-content.ts (isPairReady). Until then the pair renders the thin
// template + noindex, so this whole mechanism ships dormant (green CI) and each
// pair auto-flips when the founder authors its file.
// ---------------------------------------------------------------------------

/** Canonical (alphabetized), DISTINCT-sign slugs — all present in ALL_PAIR_SLUGS. */
export const ENRICHED_PAIRS: readonly string[] = [
  'aries-leo',
  'aries-libra',
  'aquarius-libra',
  'cancer-pisces',
  'cancer-scorpio',
  'capricorn-taurus',
  'gemini-libra',
  'gemini-sagittarius',
  'leo-sagittarius',
  'leo-scorpio',
  'pisces-scorpio',
  'scorpio-taurus',
];

const ENRICHED_PAIR_SET = new Set<string>(ENRICHED_PAIRS);

export function isEnrichedPair(slug: string): boolean {
  return ENRICHED_PAIR_SET.has(slug);
}

/** Sentinel that marks a not-yet-authored field in a scaffolded content file. */
export const ENRICHMENT_PLACEHOLDER = '__PLACEHOLDER__';
/** A locale is index-worthy only above this word count. */
export const MIN_ENRICHED_WORDS = 300;

export interface EnrichedSection {
  heading: string;
  body: string;
}

export interface EnrichedFaqItem {
  question: string;
  answer: string;
}

export interface EnrichedPairLocaleContent {
  h1: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  sections: EnrichedSection[];
  faq: EnrichedFaqItem[];
}

export interface EnrichedPairContent {
  updatedAt: string;
  en: EnrichedPairLocaleContent;
  es: EnrichedPairLocaleContent;
}

/** Count whitespace-separated tokens (empty string → 0). */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Every user-visible string in a locale block, flattened. */
function collectLocaleStrings(lc: EnrichedPairLocaleContent): string[] {
  return [
    lc.h1,
    lc.metaTitle,
    lc.metaDescription,
    lc.intro,
    ...lc.sections.flatMap((s) => [s.heading, s.body]),
    ...lc.faq.flatMap((f) => [f.question, f.answer]),
  ];
}

/** True when EVERY string is exactly the sentinel — a clean, un-authored stub. */
export function isPurePlaceholderStub(lc: EnrichedPairLocaleContent): boolean {
  const strings = collectLocaleStrings(lc);
  return strings.length > 0 && strings.every((s) => s === ENRICHMENT_PLACEHOLDER);
}

/** The indexing gate: authored, placeholder-free, structurally complete, 300+ words. */
export function isEnrichedLocaleValid(
  lc: EnrichedPairLocaleContent | null | undefined,
): boolean {
  if (!lc || !Array.isArray(lc.sections) || !Array.isArray(lc.faq)) return false;
  if (collectLocaleStrings(lc).some((s) => s.includes(ENRICHMENT_PLACEHOLDER))) return false;
  if (lc.sections.length < 3 || lc.faq.length < 3) return false;
  const prose = [lc.intro, ...lc.sections.map((s) => s.body), ...lc.faq.map((f) => f.answer)].join(' ');
  return countWords(prose) >= MIN_ENRICHED_WORDS;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/seo/__tests__/compatibility-pairs.test.ts`
Expected: PASS (existing 8 + new tests).

- [ ] **Step 5: Commit**
```bash
git add src/shared/seo/compatibility-pairs.ts src/shared/seo/__tests__/compatibility-pairs.test.ts
git commit -m "feat(seo-p2/T7a): ENRICHED_PAIRS allowlist + enrichment content validators"
```

---

#### T7b — Content loader + readiness + scaffold files (`compatibility-content.ts`)

- [ ] **Step 1: Create the 12 placeholder scaffold files**

Run (deterministic — writes an identical, fully-specified placeholder stub to each of the 12 files so the loader path is real and T7e is fill-in-the-blanks):
```bash
mkdir -p content/compatibility/enriched
STUB='{
  "updatedAt": "__PLACEHOLDER__",
  "en": {
    "h1": "__PLACEHOLDER__",
    "metaTitle": "__PLACEHOLDER__",
    "metaDescription": "__PLACEHOLDER__",
    "intro": "__PLACEHOLDER__",
    "sections": [
      { "heading": "__PLACEHOLDER__", "body": "__PLACEHOLDER__" },
      { "heading": "__PLACEHOLDER__", "body": "__PLACEHOLDER__" },
      { "heading": "__PLACEHOLDER__", "body": "__PLACEHOLDER__" }
    ],
    "faq": [
      { "question": "__PLACEHOLDER__", "answer": "__PLACEHOLDER__" },
      { "question": "__PLACEHOLDER__", "answer": "__PLACEHOLDER__" },
      { "question": "__PLACEHOLDER__", "answer": "__PLACEHOLDER__" }
    ]
  },
  "es": {
    "h1": "__PLACEHOLDER__",
    "metaTitle": "__PLACEHOLDER__",
    "metaDescription": "__PLACEHOLDER__",
    "intro": "__PLACEHOLDER__",
    "sections": [
      { "heading": "__PLACEHOLDER__", "body": "__PLACEHOLDER__" },
      { "heading": "__PLACEHOLDER__", "body": "__PLACEHOLDER__" },
      { "heading": "__PLACEHOLDER__", "body": "__PLACEHOLDER__" }
    ],
    "faq": [
      { "question": "__PLACEHOLDER__", "answer": "__PLACEHOLDER__" },
      { "question": "__PLACEHOLDER__", "answer": "__PLACEHOLDER__" },
      { "question": "__PLACEHOLDER__", "answer": "__PLACEHOLDER__" }
    ]
  }
}'
for p in aries-leo aries-libra aquarius-libra cancer-pisces cancer-scorpio capricorn-taurus gemini-libra gemini-sagittarius leo-sagittarius leo-scorpio pisces-scorpio scorpio-taurus; do
  printf '%s\n' "$STUB" > "content/compatibility/enriched/$p.json"
done
ls content/compatibility/enriched | wc -l
```
Expected: `12`. (These are structural scaffolds, not prose — CLAUDE.md-compliant. `content/` gets no AGPL header.)

- [ ] **Step 2: Write the failing test** — create `src/shared/seo/__tests__/compatibility-content.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sitemap from '@/app/sitemap';
import {
  ENRICHED_PAIRS,
  isEnrichedLocaleValid,
  isPurePlaceholderStub,
  type EnrichedPairContent,
} from '../compatibility-pairs';
import {
  getEnrichedPairContent,
  isPairReady,
  readyEnrichedPairs,
} from '../compatibility-content';
import { generateMetadata as compatPairMetadata } from '../../../app/[locale]/(marketing)/compatibility/[pair]/page';

const ENRICHED_DIR = path.join(process.cwd(), 'content', 'compatibility', 'enriched');

describe('enriched compatibility content (T7)', () => {
  it('every ENRICHED_PAIRS slug has a scaffolded file with both locales', () => {
    for (const pair of ENRICHED_PAIRS) {
      const file = path.join(ENRICHED_DIR, `${pair}.json`);
      expect(fs.existsSync(file), `missing ${pair}.json`).toBe(true);
      const c = getEnrichedPairContent(pair) as EnrichedPairContent | null;
      expect(c, `unparseable ${pair}.json`).not.toBeNull();
      for (const loc of ['en', 'es'] as const) {
        expect(Array.isArray(c![loc].sections)).toBe(true);
        expect(Array.isArray(c![loc].faq)).toBe(true);
      }
    }
  });

  // The placeholder-detecting guard: forbids the dangerous middle state.
  it('no half-authored files: each locale is a pure placeholder stub OR fully valid (>=300 words)', () => {
    for (const pair of ENRICHED_PAIRS) {
      const c = getEnrichedPairContent(pair);
      if (!c) continue;
      for (const loc of ['en', 'es'] as const) {
        const lc = c[loc];
        expect(
          isPurePlaceholderStub(lc) || isEnrichedLocaleValid(lc),
          `${pair}.${loc} is partially authored (<300 words or leftover placeholder)`,
        ).toBe(true);
      }
    }
  });

  it('a pair is ready ONLY when both locales are fully authored', () => {
    for (const pair of ENRICHED_PAIRS) {
      const c = getEnrichedPairContent(pair);
      const bothValid = !!c && isEnrichedLocaleValid(c.en) && isEnrichedLocaleValid(c.es);
      expect(isPairReady(pair)).toBe(bothValid);
    }
  });

  it('page renders index:true for ready pairs, noindex for the rest', async () => {
    for (const pair of ENRICHED_PAIRS) {
      const md = await compatPairMetadata({ params: Promise.resolve({ locale: 'en' as const, pair }) });
      expect(md.robots).toEqual(
        isPairReady(pair) ? { index: true, follow: true } : { index: false, follow: true },
      );
    }
  });

  it('sitemap re-adds exactly 2 URLs per ready pair (0 while all stubs)', () => {
    const urls = sitemap().map((e) => e.url);
    const ready = readyEnrichedPairs();
    for (const pair of ready) {
      expect(urls.filter((u) => new RegExp(`/compatibility/${pair}$`).test(u))).toHaveLength(2);
    }
    const pairUrls = urls.filter((u) => /\/compatibility\/[a-z]+-[a-z]+$/.test(u));
    expect(pairUrls).toHaveLength(ready.length * 2);
  });

  // Living checklist — becomes a hard assertion as the founder authors prose (T7e).
  it.todo('all 12 ENRICHED_PAIRS fully authored (0/12 at plan time) — replace with expect(readyEnrichedPairs()).toHaveLength(12)');
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/shared/seo/__tests__/compatibility-content.test.ts`
Expected: FAIL — cannot resolve `../compatibility-content` (loader + `generateMetadata` enriched branch not yet present).

- [ ] **Step 4: Implement the loader** — create `src/shared/seo/compatibility-content.ts`:
```ts
/**
 * Server-only loader + readiness gate for enriched compatibility pairs (T7).
 *
 * fs lives here (not in the pure compatibility-pairs.ts) — same split as
 * sitemap-mtime.ts. A pair is "ready" (re-indexed + re-added to the sitemap)
 * only when BOTH locales pass isEnrichedLocaleValid(): 300+ words, 3+ sections,
 * 3+ FAQ, zero placeholder sentinel. Never import on the client.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ENRICHED_PAIRS,
  isEnrichedPair,
  isEnrichedLocaleValid,
  type EnrichedPairContent,
} from './compatibility-pairs';

const ENRICHED_DIR = path.join(process.cwd(), 'content', 'compatibility', 'enriched');

/** Parsed content for a pair, or null if the file is absent/invalid JSON. */
export function getEnrichedPairContent(pair: string): EnrichedPairContent | null {
  const file = path.join(ENRICHED_DIR, `${pair}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as EnrichedPairContent;
  } catch {
    return null;
  }
}

/** True iff `pair` is on the allowlist AND both locales are fully authored. */
export function isPairReady(pair: string): boolean {
  if (!isEnrichedPair(pair)) return false;
  const c = getEnrichedPairContent(pair);
  if (!c) return false;
  return isEnrichedLocaleValid(c.en) && isEnrichedLocaleValid(c.es);
}

/** Content for a ready pair (index-worthy), else null. Single call site helper. */
export function getReadyEnrichedPairContent(pair: string): EnrichedPairContent | null {
  return isPairReady(pair) ? getEnrichedPairContent(pair) : null;
}

/** The allowlisted pairs that currently pass validation (drives the sitemap). */
export function readyEnrichedPairs(): string[] {
  return ENRICHED_PAIRS.filter(isPairReady);
}
```

- [ ] **Step 5: Run to verify the loader/readiness/sitemap tests pass** (the `index:true` metadata test still fails until T7c wires the page — expected):

Run: `npx vitest run src/shared/seo/__tests__/compatibility-content.test.ts`
Expected: the 3 file/readiness/sitemap tests PASS; the "page renders index:true/noindex" test may still PASS if T2's unconditional noindex is present for every pair (all currently noindex → matches `{index:false,follow:true}` since 0 ready). If it FAILS, it is because T7c is not applied yet — proceed to T7c and re-run.

- [ ] **Step 6: Commit**
```bash
git add src/shared/seo/compatibility-content.ts \
        src/shared/seo/__tests__/compatibility-content.test.ts \
        content/compatibility/enriched
git commit -m "feat(seo-p2/T7b): enriched-pair content loader + readiness gate + 12 scaffolds"
```

---

#### T7c — Enriched render + conditional index (`compatibility/[pair]/page.tsx`)

Replace the whole `generateMetadata` and branch the default export: ready pairs render enriched long-form (keyword `<h1>`, intro, sections, FAQ, sign links, FAQPage JSON-LD) and emit `index:true`; everything else keeps the thin template + T2 noindex.

- [ ] **Step 1: Update imports** — replace lines 4-5:
```ts
import { createMetadata, articleSchema, breadcrumbSchema, faqSchema, JsonLdScript, SITE_URL } from '@/shared/seo';
import { ALL_PAIR_SLUGS, parsePairSlug } from '@/shared/seo/compatibility-pairs';
import { getReadyEnrichedPairContent } from '@/shared/seo/compatibility-content';
import { Link } from '@/i18n/navigation';
```
(adds `faqSchema`, the content loader, and `Link`.)

- [ ] **Step 2: Replace `generateMetadata` (`:95-116`)** with the conditional version:
```ts
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, pair } = await params;
  const parsed = parsePairSlug(pair);
  if (!parsed) return {};
  const [s1, s2] = parsed;
  const rows = locale === 'es' ? esSigns : enSigns;
  const r1 = findSign(rows as SignRow[], s1);
  const r2 = findSign(rows as SignRow[], s2);
  if (!r1 || !r2) return {};

  const content = getReadyEnrichedPairContent(pair);
  const lc = content?.[locale];

  const title = lc?.metaTitle ?? (locale === 'es'
    ? `${r1.sign} × ${r2.sign} — compatibilidad sideral`
    : `${r1.sign} × ${r2.sign} — sidereal compatibility`);
  const description = lc?.metaDescription ?? (locale === 'es'
    ? `Análisis sideral de la compatibilidad ${r1.sign} y ${r2.sign}: elemento, modalidad, regente y tipo de aspecto.`
    : `Sidereal analysis of ${r1.sign} and ${r2.sign} compatibility: element, modality, ruler, and aspect type.`);

  const metadata = createMetadata({ title, description, path: `/compatibility/${pair}`, locale });

  // Enriched (ready) pairs re-index; thin/un-authored pairs stay noindex (T2),
  // follow so outbound sign-essay links keep passing equity.
  return content ? metadata : { ...metadata, robots: { index: false, follow: true } };
}
```
(Supersedes the Phase-1 T2 unconditional `{ ...metadata, robots: { index: false, follow: true } }`.)

- [ ] **Step 3: Add the enriched branch to the default export.** After the `const url = …;` line (`:135`), insert the enriched render (returns early for ready pairs; thin template below is untouched):
```tsx
  const content = getReadyEnrichedPairContent(pair);
  if (content) {
    const lc = content[locale];
    const dateModified = content.updatedAt && !content.updatedAt.includes('__PLACEHOLDER__')
      ? content.updatedAt
      : '2026-07-10';
    const disclaimer = locale === 'es'
      ? 'Estrevia es para la reflexión y el entretenimiento; no es consejo médico, psicológico, financiero ni de pareja.'
      : 'Estrevia is for reflection and entertainment; it is not medical, psychological, financial, or relationship advice.';
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <JsonLdScript
          schema={articleSchema({
            title: lc.h1,
            description: lc.metaDescription,
            datePublished: '2026-07-10',
            dateModified,
            authorName: 'Estrevia',
            url,
          })}
        />
        <JsonLdScript
          schema={breadcrumbSchema([
            { name: locale === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}${localePath}` },
            { name: locale === 'es' ? 'Compatibilidad sideral' : 'Sidereal compatibility', url: `${SITE_URL}${localePath}/compatibility` },
            { name: lc.h1, url },
          ])}
        />
        <JsonLdScript schema={faqSchema(lc.faq)} />
        <header className="mb-8 text-center">
          <p className="text-5xl">{r1.symbol} {r2.symbol}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white/90">{lc.h1}</h1>
        </header>
        <p className="text-base text-white/80 leading-relaxed">{lc.intro}</p>
        {lc.sections.map((section, i) => (
          <section key={i} className="mt-8">
            <h2 className="text-xl font-semibold text-white/90">{section.heading}</h2>
            <p className="mt-2 text-sm text-white/75 leading-relaxed whitespace-pre-line">{section.body}</p>
          </section>
        ))}
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white/90">{locale === 'es' ? 'Preguntas frecuentes' : 'FAQ'}</h2>
          <dl className="mt-3 space-y-4">
            {lc.faq.map((item, i) => (
              <div key={i}>
                <dt className="text-sm font-medium text-white/90">{item.question}</dt>
                <dd className="mt-1 text-sm text-white/70">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
        <nav className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label={locale === 'es' ? 'Signos relacionados' : 'Related signs'}>
          <Link href={`/signs/${s1}`} className="text-amber-300/90 underline underline-offset-4 hover:text-amber-200">{r1.sign}</Link>
          <Link href={`/signs/${s2}`} className="text-amber-300/90 underline underline-offset-4 hover:text-amber-200">{r2.sign}</Link>
        </nav>
        <p className="mt-10 text-xs text-white/40">{disclaimer}</p>
      </main>
    );
  }
```
(The thin template — `elementText`/`modalityText`/`aspectText` + the existing `<main>` at `:141-183` — is unchanged and serves every non-ready pair.)

- [ ] **Step 4: Typecheck + full targeted suite**

Run: `npm run typecheck && npx vitest run src/shared/seo/__tests__/compatibility-content.test.ts src/shared/seo/__tests__/compatibility-pairs.test.ts`
Expected: typecheck PASS; all tests PASS. With all stubs, `getReadyEnrichedPairContent` returns null everywhere → the enriched branch is never taken and every pair still emits `{index:false,follow:true}` (the T7 metadata test's noindex branch). `Link`/`faqSchema` unused-import lint is avoided because both are referenced in the enriched branch.

- [ ] **Step 5: Commit**
```bash
git add "src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx"
git commit -m "feat(seo-p2/T7c): enriched compatibility render + FAQPage + conditional index"
```

---

#### T7d — Sitemap re-adds ready enriched pairs (`sitemap.ts`)

- [ ] **Step 1: Make the two Phase-1 T2 count assertions readiness-aware.** In `src/shared/seo/__tests__/sitemap.test.ts`, add the import at the top:
```ts
import { readyEnrichedPairs } from '@/shared/seo/compatibility-content';
```
Replace the T2 test `it('emits zero /compatibility/<pair> URLs', …)` (introduced by Phase-1 T2, plan lines 421-427):
```ts
  it('emits zero /compatibility/<pair> URLs', () => {
    const urls = sitemap().map((e) => e.url);
    const pairUrls = urls.filter((u) => /\/compatibility\/[^/]+$/.test(u));
    expect(pairUrls).toHaveLength(0);
  });
```
with:
```ts
  it('emits /compatibility/<pair> URLs only for ready enriched pairs (T7)', () => {
    const urls = sitemap().map((e) => e.url);
    const pairUrls = urls.filter((u) => /\/compatibility\/[^/]+$/.test(u));
    expect(pairUrls).toHaveLength(readyEnrichedPairs().length * 2);
  });
```
Replace the T2 test `it('total entry count drops to 514', …)` (plan lines 434-437):
```ts
  it('total entry count drops to 514', () => {
    expect(sitemap()).toHaveLength(514);
  });
```
with:
```ts
  it('total entry count is 514 + 2 per ready enriched pair (T7)', () => {
    expect(sitemap()).toHaveLength(514 + readyEnrichedPairs().length * 2);
  });
```
(The T2 "keeps the /compatibility hub (EN + ES)" test — matching `/\/compatibility$/` — is unaffected.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/shared/seo/__tests__/sitemap.test.ts -t "T7"`
Expected: FAIL — `readyEnrichedPairs` import resolves, but `sitemap.ts` does not yet emit enriched pairs, so with 0 ready the length math holds… If both assert `* 0`, they PASS trivially now; the real regression they guard against is a founder authoring a pair with no sitemap wiring. Force-verify wiring in Step 4 instead. (If you want a hard red first, temporarily point one assertion at `514 + 2` and confirm FAIL, then revert — optional.)

- [ ] **Step 3: Wire enriched pairs into the sitemap.** In `src/app/sitemap.ts`, add the import next to the other `@/shared/seo/*` imports (`:2-6`):
```ts
import { readyEnrichedPairs } from '@/shared/seo/compatibility-content';
```
Immediately after the `compatibilityIndex` block (`:269-273`, kept by T2), add:
```ts

  // ── Compatibility enriched pairs (Phase 2 T7) ─────────────────────────────
  // Only pairs whose EN + ES content passes validation (300+ words, no
  // placeholder) are re-indexed and re-added here. The other 144 stay out
  // (noindex, Phase 1 T2). Dormant until content/compatibility/enriched/* is
  // authored — readyEnrichedPairs() returns [] while files are stubs.
  const compatibilityEnrichedPairs: MetadataRoute.Sitemap = readyEnrichedPairs().flatMap((pair) =>
    emitLocalized(`/compatibility/${pair}`, {
      lastModified: compatibilityBuildTime,
      changeFrequency: 'monthly',
      priority: 0.6,
    }),
  );
```
Add `...compatibilityEnrichedPairs,` to the return array, directly after `...compatibilityIndex,` (`:311`):
```ts
    ...compatibilityIndex,
    ...compatibilityEnrichedPairs,
```

- [ ] **Step 4: Verify the wiring end-to-end with a throwaway ready fixture** (proves index-flip + sitemap re-add without committing prose):
```bash
node -e '
const fs=require("fs"),p="content/compatibility/enriched/aries-leo.json";
const bak=fs.readFileSync(p,"utf8");
const w=n=>Array(n).fill("word").join(" ");
const lc={h1:"Aries and Leo Compatibility",metaTitle:"Aries and Leo",metaDescription:"d",intro:w(80),sections:[{heading:"A",body:w(120)},{heading:"B",body:w(120)},{heading:"C",body:w(60)}],faq:[{question:"q1?",answer:"a"},{question:"q2?",answer:"a"},{question:"q3?",answer:"a"}]};
fs.writeFileSync(p,JSON.stringify({updatedAt:"2026-07-15",en:lc,es:lc}));
' && npx vitest run src/shared/seo/__tests__/compatibility-content.test.ts src/shared/seo/__tests__/sitemap.test.ts
# restore the stub
git checkout -- content/compatibility/enriched/aries-leo.json
```
Expected: with the temporary fixture, `readyEnrichedPairs()` = `['aries-leo']`, the sitemap tests pass at `514 + 2` / `2` pair URLs, and the metadata test asserts `{index:true,follow:true}` for `aries-leo`. After `git checkout`, everything returns to 0 ready.

- [ ] **Step 5: Full suite + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green (lint: ignore pre-existing `.claude/worktrees/` noise per memory `feedback_lint_worktrees_pollution`; the changed `src/` files must be clean).

- [ ] **Step 6: Commit**
```bash
git add src/app/sitemap.ts src/shared/seo/__tests__/sitemap.test.ts
git commit -m "feat(seo-p2/T7d): re-add ready enriched compatibility pairs to sitemap"
```

---

#### T7e — Content spec (founder-authored) + curl-verify gate

**No app code.** Deliver the spec to the founder; each authored file auto-flips its pair to index + sitemap (T7a-d already validate + gate it).

- [ ] **Step 1: Author each `content/compatibility/enriched/<pair>.json`** (12 files). Replace every `__PLACEHOLDER__` per locale. Rules:
  - **`updatedAt`** (top level): ISO date, e.g. `"2026-07-15"`.
  - **`h1`**: keyword headline replacing the bare "Aries × Leo" — e.g. EN `"Aries and Leo Compatibility: A Sidereal Fire Trine"`, ES `"Compatibilidad Aries y Leo: el trígono de fuego sideral"`.
  - **`metaTitle`** ≤ 60 chars (`| Estrevia` is appended by the template; `createMetadata` truncates past 60).
  - **`metaDescription`** ≤ 155 chars (truncated past 155).
  - **`intro`**: 1 lead paragraph.
  - **`sections`**: ≥ 3, covering (1) relationship dynamics, (2) love / friendship / work, (3) the sidereal angle (why the pairing shifts vs tropical, Lahiri).
  - **`faq`**: ≥ 3 real Q&A (feeds FAQPage rich results).
  - **Word floor:** `intro` + all `sections[].body` + all `faq[].answer` combined must be **≥ 300 words per locale** (validator hard gate).
  - **i18n:** ES = español neutro LATAM, **tú** form; **sign names stay untranslated** (Aries, Leo, …); **planet names translated** (Mars→Marte, Sun→Sol). No prose duplication across pairs — same-element pairs must not be char-identical (the exact defect the audit flagged).
  - A pair goes live only when **both** EN and ES are complete; a locale left as an untouched pure stub is fine (stays dormant), but a **partially** authored locale (< 300 words or a leftover `__PLACEHOLDER__`) will fail `no half-authored files`.

- [ ] **Step 2: Green-gate after authoring**

Run: `npx vitest run src/shared/seo/__tests__/compatibility-content.test.ts src/shared/seo/__tests__/sitemap.test.ts`
Expected: `readyEnrichedPairs().length` = number of finished pairs; the `it.todo` flips to a real `expect(readyEnrichedPairs()).toHaveLength(12)` once all 12 land.

- [ ] **Step 3: Curl-verify SSR (the empty-shell/robots class unit tests cannot see)** — after deploy, per a finished pair (e.g. `aries-leo`) and a still-thin pair (e.g. `taurus-virgo`):
```bash
# Enriched pair: index (NO noindex), keyword <h1>, FAQPage present, 300+ words, sign links
curl -s https://estrevia.app/compatibility/aries-leo    | grep -i 'name="robots"'          # expect: none / not "noindex"
curl -s https://estrevia.app/compatibility/aries-leo    | grep -c '"@type":"FAQPage"'       # expect: 1
curl -s https://estrevia.app/es/compatibility/aries-leo | grep -o '<h1[^>]*>[^<]*</h1>'      # expect: ES keyword headline
curl -s https://estrevia.app/compatibility/aries-leo    | grep -o 'href="[^"]*/signs/[a-z]*"' | sort -u   # expect: /signs/aries + /signs/leo
# Still-thin pair stays noindex
curl -s https://estrevia.app/compatibility/taurus-virgo | grep -i 'name="robots"'           # expect: content="noindex"
# Sitemap now carries the enriched pair (×2 locales), not the thin ones
curl -s https://estrevia.app/sitemap.xml | grep -c '/compatibility/aries-leo'                # expect: 2
curl -s https://estrevia.app/sitemap.xml | grep -c '/compatibility/taurus-virgo'             # expect: 0
```

- [ ] **Step 4: Founder ops** — request GSC (re)indexing for the enriched pair URLs + resubmit `sitemap.xml` (full URL, per memory `reference_gsc_setup`); re-measure at +2wk/+4wk against §2 baselines (the ~40 impression-earning pairs).

**Commit for authored content (per-batch, founder):**
```bash
git add content/compatibility/enriched
git commit -m "feat(seo-p2/T7e): author enriched prose for <N> compatibility pairs"
```

---

**Self-review:** No `__PLACEHOLDER__` left in code (only in `content/` scaffolds, by design, detected by the guard test). Types `EnrichedPairContent`/`EnrichedPairLocaleContent`/`EnrichedSection`/`EnrichedFaqItem` and functions `isEnrichedLocaleValid`/`isPurePlaceholderStub`/`countWords`/`getReadyEnrichedPairContent`/`readyEnrichedPairs`/`isPairReady` are identical between producer (compatibility-pairs.ts / compatibility-content.ts) and every consumer (page.tsx, sitemap.ts, both tests). Reuses existing `createMetadata`/`articleSchema`/`breadcrumbSchema`/`faqSchema` and the next-intl `Link` — no re-implementation. Ships dormant → zero index/sitemap change at merge (still 514, 0 pair URLs) → auto-flips per authored pair. Corrects the roadmap's "remove noindex + re-add 24 URLs" to a validation-gated flip so unwritten prose can never ship as indexed.

---

### P2-T8: CTR / description pass (truncation, sidereal-dates ranges, city descriptions, /es/signs)

**Goal:** Lift CTR on pages that already rank by making titles/descriptions answer the query. Four independent, bisect-friendly parts: (a) word-boundary title truncation in `metadata.ts` (fixes the mid-word `…` + stripped `| Estrevia` on all 24 sidereal-dates pages); (b) real date ranges in sidereal-dates descriptions ("Leo sideral: 10 ago – 15 sep"); (c) concrete-value ("Madrid-pattern") city descriptions — improving the shared template lifts all 20 cities, subsuming the named los-angeles/ciudad-de-mexico/toronto/lima/santiago; (d) `/es/signs` title rewrite.

**Files:**
- Modify: `src/shared/seo/metadata.ts` (`truncate` `:51–54`)
- Test: `src/shared/seo/__tests__/metadata.test.ts` (truncation assertions)
- Create: `src/app/[locale]/(app)/sidereal-dates/[sign]/siderealRange.ts` + its `__tests__`
- Modify: `src/app/[locale]/(app)/sidereal-dates/[sign]/page.tsx` (append range to description)
- Modify: `src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx` (`generateMetadata` description `:29–32`)
- Modify: `messages/es.json` (`pageMeta.signs.title`)

**Interfaces:**
- Produces: `formatSiderealDateRange(start: Date, end: Date, signDisplay: string, locale: 'en' | 'es'): string`.
- Consumes: `getSunInSignRange(sign, year)` (already used by this route) for the start/end Dates.

#### Part A — word-boundary truncation

- [ ] **Step 1: Write the failing test**

In `src/shared/seo/__tests__/metadata.test.ts` add:
```ts
import { createMetadata } from '../metadata';
describe('title truncation is word-boundary aware (T8a)', () => {
  it('does not cut mid-word and trims trailing punctuation', () => {
    const long = 'Sidereal Capricorn Dates 2026 — When The Sun Enters Sea Goat Constellation';
    const m = createMetadata({ title: long, description: 'D', path: '/x', locale: 'en' });
    const title = m.title as string;
    expect(title.endsWith('…')).toBe(true);
    // the char before the ellipsis must be a letter/digit (no space/dash/comma)
    expect(title.slice(-2, -1)).toMatch(/[A-Za-z0-9]/);
    // no partial word: the truncated body is a prefix ending at a whole word
    expect(long.startsWith(title.replace('…', '').trim())).toBe(true);
  });
});
```
Run: `npx vitest run src/shared/seo/__tests__/metadata.test.ts -t "word-boundary"` → FAIL (current `slice(maxLength-1)` cuts mid-word).

- [ ] **Step 2: Fix `truncate`**

Replace `metadata.ts:51–54`:
```ts
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const hard = value.slice(0, maxLength - 1);
  const lastSpace = hard.lastIndexOf(' ');
  // Back off to the last word boundary only if it isn't too aggressive
  // (>60% of the budget kept), so we never emit a 1-word truncation.
  const body = lastSpace > (maxLength - 1) * 0.6 ? hard.slice(0, lastSpace) : hard;
  return body.replace(/[\s.,;:—–-]+$/, '') + '…';
}
```
Run: `npx vitest run src/shared/seo/__tests__/metadata.test.ts` → PASS (existing + new). Commit:
```bash
git add src/shared/seo/metadata.ts src/shared/seo/__tests__/metadata.test.ts
git commit -m "fix(seo-p2/T8a): word-boundary title truncation (no mid-word ellipsis)"
```

#### Part B — sidereal-dates real date ranges

- [ ] **Step 3: Write the failing test**

Create `src/app/[locale]/(app)/sidereal-dates/[sign]/__tests__/siderealRange.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatSiderealDateRange } from '../siderealRange';

const start = new Date(Date.UTC(2026, 7, 10)); // Aug 10
const end = new Date(Date.UTC(2026, 8, 15));   // Sep 15

describe('formatSiderealDateRange', () => {
  it('ES: sign untranslated, months localized, en dash', () => {
    const s = formatSiderealDateRange(start, end, 'Leo', 'es');
    expect(s).toContain('Leo');
    expect(s).toMatch(/ago/i);
    expect(s).toContain('–');
  });
  it('EN: reads naturally', () => {
    const s = formatSiderealDateRange(start, end, 'Leo', 'en');
    expect(s).toContain('Leo');
    expect(s).toMatch(/Aug/);
  });
});
```
Run it → FAIL (module missing).

- [ ] **Step 4: Implement the pure formatter**

Create `src/app/[locale]/(app)/sidereal-dates/[sign]/siderealRange.ts`:
```ts
/**
 * Localized "Sun in sidereal <Sign>: <start> – <end>" phrase for the meta
 * description. Sign name stays untranslated (project rule); month names localized.
 */
export function formatSiderealDateRange(
  start: Date,
  end: Date,
  signDisplay: string,
  locale: 'en' | 'es',
): string {
  const intlLocale = locale === 'es' ? 'es-419' : 'en-US';
  const fmt = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const range = `${fmt.format(start)} – ${fmt.format(end)}`;
  return locale === 'es'
    ? `Sol sideral en ${signDisplay}: ${range}.`
    : `Sun in sidereal ${signDisplay}: ${range}.`;
}
```

- [ ] **Step 5: Append the range to the description**

In `sidereal-dates/[sign]/page.tsx` `generateMetadata`, after computing `currentYear` (`:63`), compute the range and append it:
```ts
  const { start, end } = getSunInSignRange(signParam as SiderealSign, currentYear);
  const signDisplay = signParam.charAt(0).toUpperCase() + signParam.slice(1);
  const range = formatSiderealDateRange(start, end, signDisplay, (localeParam ?? locale) as 'en' | 'es');
```
and change the `description` field of the `createMetadata` call (`:67`) to:
```ts
    description: `${t('description')} ${range}`,
```
(Add `formatSiderealDateRange` + `getSunInSignRange`/`SiderealSign` imports if not present — `getSunInSignRange` and `SiderealSign` are already imported at `:32`. Confirm the `getSunInSignRange` return destructures to `{ start, end }`; if it returns a different field name, adapt — read the existing `SunSignWidget` usage.) Run `npm run typecheck` + the test → PASS. Commit:
```bash
git add "src/app/[locale]/(app)/sidereal-dates/[sign]/siderealRange.ts" \
        "src/app/[locale]/(app)/sidereal-dates/[sign]/__tests__/siderealRange.test.ts" \
        "src/app/[locale]/(app)/sidereal-dates/[sign]/page.tsx"
git commit -m "feat(seo-p2/T8b): real sidereal date ranges in sidereal-dates descriptions"
```

#### Part C — concrete-value city descriptions (all 20)

- [ ] **Step 6: Rewrite the shared city description template**

In `planetary-hours-cities/[city]/page.tsx` `generateMetadata`, replace the `description` block (`:29–32`) with the concrete-value ("Madrid-pattern") copy — sunrise-to-sunrise + the ruling planets (planet names translated per project rule):
```ts
  const description =
    locale === 'es'
      ? `Horas planetarias de hoy en ${entry.name}: tabla de amanecer a amanecer con el regente de cada hora (Sol, Luna, Marte…), calculada con efemérides Suizas (sideral, Lahiri).`
      : `Today's planetary hours in ${entry.name}: a sunrise-to-sunrise table with each hour's ruling planet (Sun, Moon, Mars…), computed with the Swiss Ephemeris (sidereal, Lahiri).`;
```
(No unit test — pure copy; `createMetadata` truncates to ≤155. This lifts every city, covering the audit's named 5.) Commit:
```bash
git add "src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx"
git commit -m "feat(seo-p2/T8c): concrete-value city planetary-hours descriptions (all 20)"
```

#### Part D — /es/signs title

- [ ] **Step 7: Rewrite the ES signs-hub title/description**

Locate `pageMeta.signs` in `messages/es.json` (`grep -n '"signs"' messages/es.json`, the entry under `pageMeta`). Replace its `title`/`description` with query-answering copy:
```json
    "signs": {
      "title": "Signos siderales: tu signo verdadero (Lahiri)",
      "description": "Los 12 signos en astrología sideral con el ayanamsa Lahiri: fechas reales, elemento, regente y cómo difieren del zodiaco tropical."
    },
```
Validate JSON + full suite: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8'))" && npm test`. Commit:
```bash
git add messages/es.json
git commit -m "feat(seo-p2/T8d): query-answering /es/signs title + description"
```


---

### P2-T9: ES internal linking — related-placements mesh + hub/city entry links

Attacks the "4 / 120 ES essays with >=1 impression" orphan problem (audit finding #4, roadmap §4 T9) two ways: (a) a **per-essay related-placements block** of 6-8 sibling links (same planet across signs / same sign across planets) that turns the 120 essays into a dense internal-link mesh, and (b) **entry links** into that mesh from two already-ranking surfaces — the `/es/` home (pos 8.4) and the 20 planetary-hours city pages — so PageRank flows from trusted pages into the cluster. All linking uses localized `<Link>` anchors with planet-names-translated / sign-names-untranslated anchor text (project i18n rule). The mesh helper is a pure, unit-tested function; the SSR "anchors present + locale-prefixed" guarantee is covered by a curl-verify gate (the repo has no async-server-component render harness).

**Runs after Phase 1 is merged.** Phase-1 T4/T6a also touch `essays/[slug]/page.tsx`; every edit below is additive and anchors on stable landmarks (`</EssayPageClient>`, the `next-intl/server` import line), not on Phase-1 line numbers.

**Files:**
- Modify: `src/shared/seo/internal-links.ts` — append pure `relatedEssaySlugs` (do not touch existing exports).
- Modify test: append a `relatedEssaySlugs` describe block to `src/shared/seo/__tests__/internal-links.test.ts`.
- New: `src/shared/components/RelatedPlacements.tsx` — reusable server component (link list).
- Modify: `src/shared/seo/index.ts` (export `relatedEssaySlugs`), `src/app/[locale]/(app)/essays/[slug]/page.tsx` (render mesh outside paywall), `src/app/[locale]/(marketing)/page.tsx` (Sun-cluster entry links), `src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx` (Sun-cluster entry links), `messages/en.json`, `messages/es.json` (2 new keys each).

---

#### Task 9.1: Pure `relatedEssaySlugs(slug)` helper (the mesh) · TDD

**Interfaces:**
- Produces: `relatedEssaySlugs(slug: string): string[]` — 6-8 valid sibling essay slugs, never the input, no dupes; `[]` for non-essay slugs.

- [ ] **Step 1: Write the failing test.** In `src/shared/seo/__tests__/internal-links.test.ts`, first add `relatedEssaySlugs` to the existing import (`:2-9`):
```ts
import {
  parseEssaySlug,
  getAllEssaySlugs,
  getAllSignSlugs,
  getAllEssaySlugsBySign,
  getAllEssaySlugsByPlanet,
  getRelatedPages,
  relatedEssaySlugs,
} from '../internal-links';
```
Then append this describe block at the end of the file:
```ts
describe('relatedEssaySlugs (Phase 2 T9)', () => {
  it('returns 6-8 slugs for a planet-in-sign essay', () => {
    const out = relatedEssaySlugs('sun-in-aries');
    expect(out.length).toBeGreaterThanOrEqual(6);
    expect(out.length).toBeLessThanOrEqual(8);
  });

  it('every essay gets 6-8 links (mesh coverage — no orphans)', () => {
    getAllEssaySlugs().forEach((slug) => {
      const n = relatedEssaySlugs(slug).length;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(8);
    });
  });

  it('never includes the input slug and never duplicates', () => {
    getAllEssaySlugs().forEach((slug) => {
      const out = relatedEssaySlugs(slug);
      expect(out).not.toContain(slug);
      expect(new Set(out).size).toBe(out.length);
    });
  });

  it('every returned slug is a real, parseable essay slug', () => {
    const all = new Set(getAllEssaySlugs());
    getAllEssaySlugs().forEach((slug) => {
      relatedEssaySlugs(slug).forEach((rel) => {
        expect(all.has(rel)).toBe(true);
        expect(parseEssaySlug(rel)).not.toBeNull();
      });
    });
  });

  it('mixes same-sign and same-planet siblings', () => {
    const out = relatedEssaySlugs('sun-in-aries');
    expect(out).toContain('moon-in-aries'); // same sign, other planet
    expect(out).toContain('sun-in-taurus'); // same planet, next sign
    expect(out).toContain('sun-in-libra');  // same planet, opposite sign
  });

  it('returns [] for non-essay slugs', () => {
    expect(relatedEssaySlugs('aries')).toEqual([]);
    expect(relatedEssaySlugs('unknown')).toEqual([]);
    expect(relatedEssaySlugs('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run src/shared/seo/__tests__/internal-links.test.ts` → FAIL: `relatedEssaySlugs is not a function` (import unresolved).

- [ ] **Step 3: Implement the helper.** In `src/shared/seo/internal-links.ts`, insert before the final `export { PLANETS, SIGNS };` (`:292`):
```ts
// ---------------------------------------------------------------------------
// Related placements mesh (Phase 2 T9)
// ---------------------------------------------------------------------------

// "Same sign, other planets" companions in priority order (Sun/Moon lead —
// highest search intent), then the personal/social planets.
const COMPANION_PLANETS: readonly PlanetSlug[] = ['sun', 'moon', 'mars', 'venus', 'saturn'];

/**
 * Returns 6-8 sibling essay slugs for a planet-in-sign essay: the same sign
 * across other planets + the same planet across neighbouring/opposite signs.
 *
 * This is the internal-linking mesh that spreads crawl equity across all 120
 * essays (fixes the "4/120 ES essays with impressions" orphan problem — audit
 * finding #4). Every returned slug is a valid essay slug and never equals the
 * input. Returns [] for non-essay slugs.
 *
 * @example relatedEssaySlugs('sun-in-aries')
 * // ['moon-in-aries','mars-in-aries','venus-in-aries','saturn-in-aries',
 * //  'sun-in-taurus','sun-in-pisces','sun-in-libra']  (7 links)
 */
export function relatedEssaySlugs(slug: string): string[] {
  const parsed = parseEssaySlug(slug);
  if (!parsed) return [];
  const { planet, sign } = parsed;

  const idx = SIGNS.indexOf(sign);
  const nextSign = SIGNS[(idx + 1) % SIGNS.length];
  const prevSign = SIGNS[(idx + SIGNS.length - 1) % SIGNS.length];
  const oppositeSign = SIGNS[(idx + 6) % SIGNS.length];

  // Same sign, other planets (current planet filtered out).
  const sameSign = COMPANION_PLANETS
    .filter((p) => p !== planet)
    .map((p) => `${p}-in-${sign}`);

  // Same planet, neighbouring + opposite signs.
  const samePlanet = [nextSign, prevSign, oppositeSign].map((s) => `${planet}-in-${s}`);

  const seen = new Set<string>([slug]);
  const out: string[] = [];
  for (const candidate of [...sameSign, ...samePlanet]) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
    if (out.length === 8) break;
  }
  return out;
}
```
(Count proof: `sameSign` is 4 when planet is in COMPANION_PLANETS else 5; `samePlanet` is always 3 distinct signs — next/prev/opposite never coincide for any of the 12 signs; the two groups never overlap. Total = 7 or 8, capped at 8, always >=6. noUncheckedIndexedAccess is off, so `SIGNS[...]` types as SignSlug.)

- [ ] **Step 4: Run to verify it passes.** `npx vitest run src/shared/seo/__tests__/internal-links.test.ts` → PASS (existing suite + 6 new tests).

- [ ] **Step 5: Export from the SEO barrel.** In `src/shared/seo/index.ts`, in the `from './internal-links'` block (`:48-57`) add `relatedEssaySlugs,` right after `parseEssaySlug,` (`:54`):
```ts
  parseEssaySlug,
  relatedEssaySlugs,
  PLANETS,
```

- [ ] **Step 6: Typecheck + tests.** `npm run typecheck && npx vitest run src/shared/seo/__tests__/internal-links.test.ts` → both PASS.

- [ ] **Step 7: Commit.**
```bash
git add src/shared/seo/internal-links.ts src/shared/seo/__tests__/internal-links.test.ts src/shared/seo/index.ts
git commit -m "feat(seo-p2/T9a): relatedEssaySlugs mesh helper (6-8 sibling slugs per essay)"
```

---

#### Task 9.2: `RelatedPlacements` component + render on essay pages (outside paywall)

**Interfaces:**
- Produces: `RelatedPlacements({ slugs, heading }: { slugs: string[]; heading: string }): Promise<JSX.Element | null>`.
- Consumes: `parseEssaySlug` (`@/shared/seo`), `Link` (`@/i18n/navigation`), `getTranslations` (`next-intl/server`), i18n `essayDetail.related.anchorPlanetInSign` + `essayDetail.planets`.

- [ ] **Step 1: Add the two i18n heading keys.** In `messages/en.json`, replace the tail of `essayDetail.related` (`:570-572`):
```json
      "anchorWhySidereal": "sidereal vs tropical astrology",
      "anchorChartCta": "calculate your sidereal natal chart"
    },
```
with:
```json
      "anchorWhySidereal": "sidereal vs tropical astrology",
      "anchorChartCta": "calculate your sidereal natal chart",
      "placementsHeading": "More sidereal placements"
    },
```
In `messages/es.json`, replace the same block (`:570-572`):
```json
      "anchorWhySidereal": "astrología sideral vs tropical",
      "anchorChartCta": "calcular tu carta natal sideral"
    },
```
with:
```json
      "anchorWhySidereal": "astrología sideral vs tropical",
      "anchorChartCta": "calcular tu carta natal sideral",
      "placementsHeading": "Más posiciones siderales"
    },
```

- [ ] **Step 2: Create the component.** `src/shared/components/RelatedPlacements.tsx`:
```tsx
/**
 * RelatedPlacements — server-rendered internal-link block (Phase 2 T9).
 *
 * Renders a set of planet-in-sign essay slugs as localized <Link> anchors.
 * Reused on three surfaces: the essay page (the 6-8 sibling mesh, rendered
 * OUTSIDE the paywall so anchors are always in SSR HTML + visible), the /es/
 * landing page, and planetary-hours city pages (Sun-cluster entry links). All
 * seed crawl equity into the essay cluster (audit finding #4).
 *
 * Anchor text follows the project i18n rule: planet names translated, sign
 * names untranslated.
 */

import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { parseEssaySlug } from '@/shared/seo';

// Sign display names stay untranslated (project rule).
const SIGN_DISPLAY: Record<string, string> = {
  aries: 'Aries', taurus: 'Taurus', gemini: 'Gemini', cancer: 'Cancer',
  leo: 'Leo', virgo: 'Virgo', libra: 'Libra', scorpio: 'Scorpio',
  sagittarius: 'Sagittarius', capricorn: 'Capricorn', aquarius: 'Aquarius', pisces: 'Pisces',
};

// Slug -> essayDetail.planets message key (planet names ARE translated).
const PLANET_KEY: Record<string, string> = {
  sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto',
};

interface RelatedPlacementsProps {
  /** planet-in-sign essay slugs to link to. */
  slugs: string[];
  /** Pre-localized heading string (caller resolves it). */
  heading: string;
}

export async function RelatedPlacements({ slugs, heading }: RelatedPlacementsProps) {
  if (slugs.length === 0) return null;

  const tRelated = await getTranslations('essayDetail.related');
  const tPlanet = await getTranslations('essayDetail.planets');

  return (
    <nav aria-labelledby="related-placements-heading" className="max-w-2xl mx-auto px-4 pb-16">
      <h2
        id="related-placements-heading"
        className="text-xs font-semibold text-white/90 mb-4 font-[var(--font-geist-sans)] tracking-wide uppercase"
      >
        {heading}
      </h2>
      <ul className="flex flex-wrap gap-2" role="list">
        {slugs.map((slug) => {
          const parsed = parseEssaySlug(slug);
          if (!parsed) return null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const planet = tPlanet(PLANET_KEY[parsed.planet] as any);
          const sign = SIGN_DISPLAY[parsed.sign];
          const anchorText = tRelated('anchorPlanetInSign', { planet, sign });
          return (
            <li key={slug}>
              <Link
                href={`/essays/${slug}`}
                className="inline-block px-3 py-1.5 rounded-md text-xs bg-white/5 text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors font-[var(--font-geist-sans)]"
              >
                {anchorText}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```
(Uses `id="related-placements-heading"` — deliberately different from InternalLinks' `id="related-heading"` at `:75-77` to avoid a duplicate-id clash on the essay page.)

- [ ] **Step 3: Render it on the essay route, OUTSIDE the paywall.** In `src/app/[locale]/(app)/essays/[slug]/page.tsx`:

(a) Add `getTranslations` to the next-intl import (`:10`):
```ts
import { getLocale, getTranslations } from 'next-intl/server';
```
(b) Add `relatedEssaySlugs,` to the `@/shared/seo` import block (`:11-19`), after `parseEssaySlug,`:
```ts
  parseEssaySlug,
  relatedEssaySlugs,
} from '@/shared/seo';
```
(c) Add the component import after the `EssayPageClient` import (`:23`):
```ts
import { RelatedPlacements } from '@/shared/components/RelatedPlacements';
```
(d) Resolve the heading — replace the opening of the return (`:115-117`):
```tsx
  return (
    <>
      {/* JSON-LD structured data */}
```
with:
```tsx
  const tRelated = await getTranslations('essayDetail.related');

  return (
    <>
      {/* JSON-LD structured data */}
```
(e) Insert the block after the paywall wrapper — replace (`:122-127`):
```tsx
      {/* Essay content — wrapped with paywall for free users */}
      <EssayPageClient>
        <EssayPage meta={meta} content={content} />
      </EssayPageClient>
    </>
  );
```
with:
```tsx
      {/* Essay content — wrapped with paywall for free users */}
      <EssayPageClient>
        <EssayPage meta={meta} content={content} />
      </EssayPageClient>

      {/* Related placements mesh — rendered OUTSIDE the paywall so the 6-8
          sibling anchors are always present in SSR HTML (crawlable) and visible
          to anon/free users below the paywall CTA (T9, audit finding #4). */}
      <RelatedPlacements slugs={relatedEssaySlugs(slug)} heading={tRelated('placementsHeading')} />
    </>
  );
```

- [ ] **Step 4: Typecheck + JSON validity + suite.**
```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('messages OK')"
npm run typecheck && npx vitest run src/shared/seo/__tests__/internal-links.test.ts
```
Expected: `messages OK`; typecheck PASS; tests PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/shared/components/RelatedPlacements.tsx "src/app/[locale]/(app)/essays/[slug]/page.tsx" messages/en.json messages/es.json
git commit -m "feat(seo-p2/T9b): RelatedPlacements block on essay pages (6-8 sibling links, outside paywall)"
```

---

#### Task 9.3: Sun-cluster entry links on the `/` + `/es/` landing page

**Interfaces:** consumes `getAllEssaySlugsByPlanet('sun')` (`@/shared/seo`, returns the 12 `sun-in-<sign>` slugs) + `RelatedPlacements`.

- [ ] **Step 1: Add the landing heading key.** In `messages/en.json`, replace the last landing key (`:829-830`):
```json
    "finalCta": "Calculate My Sidereal Chart"
  },
```
with:
```json
    "finalCta": "Calculate My Sidereal Chart",
    "exploreEssaysHeading": "Explore the sidereal essays"
  },
```
In `messages/es.json`, replace (`:829-830`):
```json
    "finalCta": "Calcular mi carta sideral"
  },
```
with:
```json
    "finalCta": "Calcular mi carta sideral",
    "exploreEssaysHeading": "Explora los ensayos siderales"
  },
```

- [ ] **Step 2: Wire the component in.** In `src/app/[locale]/(marketing)/page.tsx`:

(a) Add `getAllEssaySlugsByPlanet` to the `@/shared/seo` import (`:6`):
```ts
import { createMetadata, JsonLdScript, softwareAppSchema, websiteSchema, howToSchema, faqSchema, getAllEssaySlugsByPlanet } from '@/shared/seo';
```
(b) Add the component import after the `LandingViewTracker` import (`:10`):
```ts
import { RelatedPlacements } from '@/shared/components/RelatedPlacements';
```
(c) Insert an essays section immediately before the final-CTA strip — replace (`:371-374`):
```tsx
        {/* ── Final CTA strip ───────────────────────────────────────────────── */}
        <div
          className="px-4 sm:px-6 py-12 border-t border-white/6 text-center"
          data-section="final-cta"
```
with:
```tsx
        {/* ── Explore the essays (entry links into the essay mesh — T9) ──────── */}
        <section
          className="relative px-4 sm:px-6 py-16"
          data-section="essays"
          data-animate="fade-up-0"
        >
          <div
            className="absolute top-0 inset-x-0 h-px"
            style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)' }}
            aria-hidden="true"
          />
          <RelatedPlacements
            slugs={getAllEssaySlugsByPlanet('sun')}
            heading={t('exploreEssaysHeading')}
          />
        </section>

        {/* ── Final CTA strip ───────────────────────────────────────────────── */}
        <div
          className="px-4 sm:px-6 py-12 border-t border-white/6 text-center"
          data-section="final-cta"
```

- [ ] **Step 3: Typecheck + JSON validity + full suite.**
```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('messages OK')"
npm run typecheck && npm test
```
Expected: `messages OK`; typecheck PASS; full suite PASS.

- [ ] **Step 4: Commit.**
```bash
git add "src/app/[locale]/(marketing)/page.tsx" messages/en.json messages/es.json
git commit -m "feat(seo-p2/T9c): Sun-cluster essay links on landing page (mesh entry point)"
```

---

#### Task 9.4: Sun-cluster entry links on planetary-hours city pages

**Interfaces:** same `getAllEssaySlugsByPlanet('sun')` + `RelatedPlacements`; heading is an inline EN/ES ternary (this file has no next-intl `t` — match that style).

- [ ] **Step 1: Wire the component in.** In `src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx`:

(a) Add `getAllEssaySlugsByPlanet` to the `@/shared/seo` import (`:4`):
```ts
import { createMetadata, articleSchema, breadcrumbSchema, JsonLdScript, SITE_URL, getAllEssaySlugsByPlanet } from '@/shared/seo';
```
(b) Add the component import after the astro-engine import (`:6`):
```ts
import { RelatedPlacements } from '@/shared/components/RelatedPlacements';
```
(c) Insert the block just before `</main>` — replace the tail (`:190-195`):
```tsx
      <p className="mt-6 text-xs text-white/30">
        {locale === 'es'
          ? 'Calculado con Swiss Ephemeris (algoritmo Moshier) — precisión ±0.01°. Actualizado cada 24 horas.'
          : 'Computed with Swiss Ephemeris (Moshier algorithm) at ±0.01° accuracy. Refreshes every 24 hours.'}
      </p>
    </main>
```
with:
```tsx
      <p className="mt-6 text-xs text-white/30">
        {locale === 'es'
          ? 'Calculado con Swiss Ephemeris (algoritmo Moshier) — precisión ±0.01°. Actualizado cada 24 horas.'
          : 'Computed with Swiss Ephemeris (Moshier algorithm) at ±0.01° accuracy. Refreshes every 24 hours.'}
      </p>

      {/* Essay-mesh entry links from this ranking ES surface (T9). */}
      <div className="mt-10 border-t border-white/6 pt-6">
        <RelatedPlacements
          slugs={getAllEssaySlugsByPlanet('sun')}
          heading={locale === 'es' ? 'Explora posiciones siderales' : 'Explore sidereal placements'}
        />
      </div>
    </main>
```

- [ ] **Step 2: Typecheck + suite.** `npm run typecheck && npm test` → both PASS.

- [ ] **Step 3: Commit.**
```bash
git add "src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx"
git commit -m "feat(seo-p2/T9d): Sun-cluster essay links on planetary-hours city pages"
```

---

#### Task 9.5: Verification gate (curl-verify SSR anchors are crawlable + locale-prefixed)

Unit tests cover only the pure helper; this gate catches the SSR/anchor guarantees they cannot see (per the roadmap testing strategy).

- [ ] **Step 1: Full suite + typecheck + lint.** `npm test && npm run typecheck && npm run lint` → green (per memory `feedback_lint_worktrees_pollution`, filter lint output to `src/` paths — the changed files must be clean).

- [ ] **Step 2: Build + start, then curl-verify.** `npm run build && npm run start` (or `npm run dev`), then in another shell:
```bash
# ES essay: 6-8 sibling anchors, locale-prefixed to /es/, present in raw HTML
curl -s http://localhost:3000/es/essays/sun-in-aries | grep -o 'href="/es/essays/[a-z-]\+"' | sort -u
# expect >=6 unique /es/essays/... siblings incl moon-in-aries, mars-in-aries, sun-in-taurus, sun-in-libra
# ES essay: the placements heading is present (outside any <script>)
curl -s http://localhost:3000/es/essays/sun-in-aries | grep -c 'Más posiciones siderales'   # expect >=1
# ES home: Sun cluster (12 links)
curl -s http://localhost:3000/es | grep -o 'href="/es/essays/sun-in-[a-z]\+"' | sort -u | wc -l   # expect 12
# ES city (santiago = ranking ES surface): Sun cluster (12 links)
curl -s http://localhost:3000/es/planetary-hours-cities/santiago | grep -o 'href="/es/essays/sun-in-[a-z]\+"' | sort -u | wc -l   # expect 12
# EN essay: siblings root-prefixed (no /es/), confirming locale-correct hrefs
curl -s http://localhost:3000/essays/sun-in-aries | grep -o 'href="/essays/[a-z-]\+"' | sort -u | head
```
Expected: ES essay shows >=6 distinct `/es/essays/...` sibling hrefs and the ES heading; `/es` and `/es/planetary-hours-cities/santiago` each show 12 `/es/essays/sun-in-...` anchors; the EN essay's siblings are `/essays/...` (no `/es/`).

- [ ] **Step 3: Push** (confirm with founder — direct-to-main; this rides the Phase-1 deploy per roadmap §7). Phase-2 T9 requires **no** DB migration, env var, or founder ops step.

**Measurement (roadmap §2, per-wave +2wk/+4wk):** "ES essays with >=1 impression" 4/120 -> up; watch the GSC internal-links / page-indexing report for the essay cluster gaining discovered/crawled status. No new page types are added, so the §1 crawl-quality gate is respected.

---

### P2-T10: ES token localization (planet/element/modality display maps)

Fixes roadmap §4 T10 / finding #14: ES `/es/compatibility/*` and `/es/planetary-hours-cities/*` tables leak English enum tokens. Grounding found **three** compat leak sites (roadmap named two) plus the planetary-hours planet column, and confirmed the roadmap is **wrong** about the ruler column — ES sign data already holds `Marte/Venus/Luna` (translated), so no fix is needed there. The real planet-name leak is the hours table.

**Reuse / single source of truth:** the ES strings already exist in `messages/es.json` `signDetail.{elements,modalities,planets}` (consumed by `signs/[sign]/page.tsx:63-64,148-149`). The new pure maps are guarded by a test asserting they equal that namespace, so they cannot drift. The existing `src/shared/lib/planet-i18n.ts` `PLANET_ES_NAMES` is the narrow 4-planet **email-only** map (consumers: `src/emails/LeadChartEmail.tsx:60`, `LeadCuriosityHookEmail.tsx:146-149`, `shared/lib/email.ts:533,698`) — left untouched to avoid the email-render blast radius; the new module cross-references it in a header comment.

**Placement:** `src/shared/lib/astro-i18n.ts` (beside `planet-i18n.ts`). These are token→display i18n helpers for page bodies, not metadata/JSON-LD generators, and `src/shared/lib` is a shared lib (not a feature folder), so the "SEO utils → `src/shared/seo/`" rule is respected.

**Files**
- New: `src/shared/lib/astro-i18n.ts`, `src/shared/lib/__tests__/astro-i18n.test.ts`, `scripts/seo/audit-es-essay-sign-phrase.mjs`
- Modify: `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx`, `src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx`, `src/app/[locale]/(app)/essays/[slug]/page.tsx`

**Interfaces (produced by `astro-i18n.ts`)**
- `type ElementToken = \`${Element}\`` / `ModalityToken` / `PlanetToken` (from `@/shared/types/astrology`)
- `localizeElement(element: string, locale: string): string`
- `localizeModality(modality: string, locale: string): string`
- `localizePlanet(planet: string, locale: string): string`
- `SIGN_ES_VARIANTS: Record<string,string>` · `spanishSignVariant(signSlug: string): string` · `esEssaySignPhrase(slug: string): string | null`

---

#### Task 1 (T10a): pure display-map helper + tests

- [ ] **Step 1: Write the failing test.** Create `src/shared/lib/__tests__/astro-i18n.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  localizeElement,
  localizeModality,
  localizePlanet,
  spanishSignVariant,
  esEssaySignPhrase,
} from '../astro-i18n';

const esMessages = JSON.parse(
  readFileSync(join(process.cwd(), 'messages/es.json'), 'utf-8'),
) as {
  signDetail: {
    elements: Record<string, string>;
    modalities: Record<string, string>;
    planets: Record<string, string>;
  };
};

describe('localizeElement / localizeModality / localizePlanet', () => {
  it('EN is identity', () => {
    expect(localizeElement('Fire', 'en')).toBe('Fire');
    expect(localizeModality('Fixed', 'en')).toBe('Fixed');
    expect(localizePlanet('Moon', 'en')).toBe('Moon');
  });

  it('ES translates every element/modality token', () => {
    expect(localizeElement('Fire', 'es')).toBe('Fuego');
    expect(localizeElement('Earth', 'es')).toBe('Tierra');
    expect(localizeElement('Air', 'es')).toBe('Aire');
    expect(localizeElement('Water', 'es')).toBe('Agua');
    expect(localizeModality('Cardinal', 'es')).toBe('Cardinal');
    expect(localizeModality('Fixed', 'es')).toBe('Fijo');
    expect(localizeModality('Mutable', 'es')).toBe('Mutable');
  });

  it('ES translates planet enum values (incl. non-classical)', () => {
    expect(localizePlanet('Moon', 'es')).toBe('Luna');
    expect(localizePlanet('Saturn', 'es')).toBe('Saturno');
    expect(localizePlanet('Jupiter', 'es')).toBe('Júpiter');
    expect(localizePlanet('Pluto', 'es')).toBe('Plutón');
    expect(localizePlanet('NorthNode', 'es')).toBe('Nodo Norte');
    expect(localizePlanet('Chiron', 'es')).toBe('Quirón');
  });

  it('falls back to the input for unknown tokens', () => {
    expect(localizeElement('Plasma', 'es')).toBe('Plasma');
    expect(localizePlanet('Marte', 'es')).toBe('Marte'); // already-ES ruler passthrough
  });
});

describe('ES maps stay in sync with messages/es.json signDetail (single source of truth)', () => {
  it('elements match signDetail.elements', () => {
    for (const [token, expected] of Object.entries(esMessages.signDetail.elements)) {
      expect(localizeElement(token, 'es')).toBe(expected);
    }
  });
  it('modalities match signDetail.modalities', () => {
    for (const [token, expected] of Object.entries(esMessages.signDetail.modalities)) {
      expect(localizeModality(token, 'es')).toBe(expected);
    }
  });
  it('planets match signDetail.planets (lowercase-keyed)', () => {
    for (const [lowerKey, expected] of Object.entries(esMessages.signDetail.planets)) {
      const pascal = lowerKey.charAt(0).toUpperCase() + lowerKey.slice(1);
      expect(localizePlanet(pascal, 'es')).toBe(expected);
    }
  });
});

describe('spanishSignVariant / esEssaySignPhrase', () => {
  it('maps sign slugs to Spanish colloquial variants', () => {
    expect(spanishSignVariant('scorpio')).toBe('Escorpio');
    expect(spanishSignVariant('gemini')).toBe('Géminis');
    expect(spanishSignVariant('capricorn')).toBe('Capricornio');
    expect(spanishSignVariant('aries')).toBe('Aries');
    expect(spanishSignVariant('unknown')).toBe('unknown');
  });
  it('builds the ES planet-in-sign search phrase', () => {
    expect(esEssaySignPhrase('venus-in-scorpio')).toBe('venus en escorpio');
    expect(esEssaySignPhrase('moon-in-cancer')).toBe('luna en cáncer');
    expect(esEssaySignPhrase('saturn-in-capricorn')).toBe('saturno en capricornio');
  });
  it('returns null for non planet-in-sign slugs', () => {
    expect(esEssaySignPhrase('some-random-slug')).toBeNull();
    expect(esEssaySignPhrase('aries')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify it fails.** `npx vitest run src/shared/lib/__tests__/astro-i18n.test.ts` → FAIL: `Failed to resolve import "../astro-i18n"`.

- [ ] **Step 3: Implement.** Create `src/shared/lib/astro-i18n.ts`:
```ts
import { Element, Modality, Planet } from '@/shared/types/astrology';
import { parseEssaySlug } from '@/shared/seo/internal-links';

/**
 * Astrology token → localized display string (pure, no next-intl).
 *
 * The astro engine + sign data speak canonical English enum tokens
 * (Planet='Moon', Element='Fire', Modality='Cardinal'). These maps render them
 * in the active locale for UI surfaces — the ES compatibility + planetary-hours
 * tables (SEO §T10 / finding #14).
 *
 * Project rules: PLANET names ARE translated (Luna/Saturno); SIGN names are NOT
 * (Aries/Leo…) and never pass through localizePlanet/localizeElement. The ES
 * strings are single-sourced from messages/es.json `signDetail.{elements,
 * modalities,planets}` — astro-i18n.test.ts asserts these maps equal that
 * namespace so they cannot drift.
 *
 * NOTE: distinct from src/shared/lib/planet-i18n.ts `PLANET_ES_NAMES`, which is
 * the narrow 4-planet map used only by the lead-nurture email templates and is
 * intentionally left independent (email-render blast radius). Unify later if the
 * email path is refactored.
 */

export type ElementToken = `${Element}`; // 'Fire' | 'Earth' | 'Air' | 'Water'
export type ModalityToken = `${Modality}`; // 'Cardinal' | 'Fixed' | 'Mutable'
export type PlanetToken = `${Planet}`; // 'Sun' | 'Moon' | … | 'Midheaven'

// Exhaustive Record<> — adding a Planet/Element/Modality enum member becomes a
// compile error here until its ES string is supplied.
const ELEMENT_ES: Record<ElementToken, string> = {
  Fire: 'Fuego',
  Earth: 'Tierra',
  Air: 'Aire',
  Water: 'Agua',
};

const MODALITY_ES: Record<ModalityToken, string> = {
  Cardinal: 'Cardinal',
  Fixed: 'Fijo',
  Mutable: 'Mutable',
};

const PLANET_ES: Record<PlanetToken, string> = {
  Sun: 'Sol',
  Moon: 'Luna',
  Mercury: 'Mercurio',
  Venus: 'Venus',
  Mars: 'Marte',
  Jupiter: 'Júpiter',
  Saturn: 'Saturno',
  Uranus: 'Urano',
  Neptune: 'Neptuno',
  Pluto: 'Plutón',
  NorthNode: 'Nodo Norte',
  Chiron: 'Quirón',
  Ascendant: 'Ascendente',
  Midheaven: 'Medio Cielo',
};

export function localizeElement(element: string, locale: string): string {
  if (locale !== 'es') return element;
  return (ELEMENT_ES as Record<string, string>)[element] ?? element;
}

export function localizeModality(modality: string, locale: string): string {
  if (locale !== 'es') return modality;
  return (MODALITY_ES as Record<string, string>)[modality] ?? modality;
}

export function localizePlanet(planet: string, locale: string): string {
  if (locale !== 'es') return planet;
  return (PLANET_ES as Record<string, string>)[planet] ?? planet;
}

/**
 * Spanish colloquial sign-name variants (español neutro).
 *
 * Sign names stay UNTRANSLATED in page bodies (Aries/Leo…). This map exists
 * ONLY for ES search-relevance in essay metadata — Spanish speakers search
 * "venus en escorpio", not "venus in scorpio". Never render these in the body.
 */
export const SIGN_ES_VARIANTS: Record<string, string> = {
  aries: 'Aries',
  taurus: 'Tauro',
  gemini: 'Géminis',
  cancer: 'Cáncer',
  leo: 'Leo',
  virgo: 'Virgo',
  libra: 'Libra',
  scorpio: 'Escorpio',
  sagittarius: 'Sagitario',
  capricorn: 'Capricornio',
  aquarius: 'Acuario',
  pisces: 'Piscis',
};

export function spanishSignVariant(signSlug: string): string {
  return SIGN_ES_VARIANTS[signSlug] ?? signSlug;
}

/**
 * ES search phrase for a planet-in-sign essay, lowercased for keyword use:
 * esEssaySignPhrase('venus-in-scorpio') === 'venus en escorpio'.
 * Returns null for non-planet-in-sign slugs.
 */
export function esEssaySignPhrase(slug: string): string | null {
  const parsed = parseEssaySlug(slug);
  if (!parsed) return null;
  const planetPascal =
    parsed.planet.charAt(0).toUpperCase() + parsed.planet.slice(1);
  const planetEs = localizePlanet(planetPascal, 'es').toLowerCase();
  const signEs = spanishSignVariant(parsed.sign).toLowerCase();
  return `${planetEs} en ${signEs}`;
}
```

- [ ] **Step 4: Run — verify it passes.** `npx vitest run src/shared/lib/__tests__/astro-i18n.test.ts` → PASS (all describe blocks). Then `npm run typecheck` → PASS (the exhaustive `Record<`${Planet}`,string>` covers all 14 enum values; `parseEssaySlug` is a leaf pure fn, no import cycle).

- [ ] **Step 5: Commit.**
```bash
git add src/shared/lib/astro-i18n.ts src/shared/lib/__tests__/astro-i18n.test.ts
git commit -m "feat(seo-p2/T10a): pure ES astro-i18n display maps (element/modality/planet + sign variants)"
```

---

#### Task 2 (T10b): wire the three compat leak sites + the hours planet column

No new unit test — these are RSC pages with no render harness; token correctness is proven by Task 1's helper tests, and the SSR guarantee is covered by the curl gate in Task 4 (per spec §7's testing strategy).

- [ ] **Step 1: Compat page — add the import** in `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx` after line 5 (`import { ALL_PAIR_SLUGS, parsePairSlug } …`):
```ts
import { localizeElement, localizeModality } from '@/shared/lib/astro-i18n';
```

- [ ] **Step 2: Fix leak #3 inside `elementCompatibility`** (`:52-56`). Old:
```ts
  if (same) {
    return locale === 'es'
      ? `Doble intensidad ${e1.toLowerCase()} — afinidad fuerte, sin contraste.`
      : `Double ${e1.toLowerCase()} intensity — strong affinity, no contrast.`;
  }
```
New:
```ts
  if (same) {
    const el = localizeElement(e1, locale).toLowerCase();
    return locale === 'es'
      ? `Doble intensidad ${el} — afinidad fuerte, sin contraste.`
      : `Double ${el} intensity — strong affinity, no contrast.`;
  }
```
(EN unchanged: `localizeElement('Fire','en')` → `'Fire'` → `'fire'`.)

- [ ] **Step 3: Fix leak #1 (element `<strong>`)** at `:167`. Old:
```tsx
          <dd className="mt-1 text-sm text-white/80"><strong className="text-white">{r1.element} + {r2.element}</strong> — {elementText}</dd>
```
New:
```tsx
          <dd className="mt-1 text-sm text-white/80"><strong className="text-white">{localizeElement(r1.element, locale)} + {localizeElement(r2.element, locale)}</strong> — {elementText}</dd>
```

- [ ] **Step 4: Fix leak #2 (modality `<strong>`)** at `:171`. Old:
```tsx
          <dd className="mt-1 text-sm text-white/80"><strong className="text-white">{r1.modality} + {r2.modality}</strong> — {modalityText}</dd>
```
New:
```tsx
          <dd className="mt-1 text-sm text-white/80"><strong className="text-white">{localizeModality(r1.modality, locale)} + {localizeModality(r2.modality, locale)}</strong> — {modalityText}</dd>
```
Leave the ruler line (`:175`) unchanged — ES data already holds `Marte/Venus/Luna`.

- [ ] **Step 5: Hours city page — add the import** in `src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx` after line 6 (`import { calculatePlanetaryHours } …`):
```ts
import { localizePlanet } from '@/shared/lib/astro-i18n';
```

- [ ] **Step 6: Fix the planet column** at `:147`. Old:
```tsx
                <td className="py-2 pr-4 capitalize">{String(hour.planet)}</td>
```
New:
```tsx
                <td className="py-2 pr-4 capitalize">{localizePlanet(String(hour.planet), locale)}</td>
```
(`capitalize` kept — harmless on already-capital "Luna/Saturno"; EN output identical. The `result.currentHour?.planet === hour.planet` comparison at `:126` compares raw enum values and is unaffected.)

- [ ] **Step 7: Typecheck.** `npm run typecheck` → PASS (`r1.element`/`r1.modality` are `string`; `hour.planet` is `Planet`, assignable to the `string` params).

- [ ] **Step 8: Commit.**
```bash
git add "src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx" \
        "src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx"
git commit -m "fix(seo-p2/T10b): localize element/modality/planet tokens in ES compat + hours tables"
```

---

#### Task 3 (T10c): ES essay keyword enrichment + founder content spec + audit script

The Spanish sign-variant half of T10. Body sign names stay untranslated (project rule), so the variant is applied only to **metadata**: the code wires `esEssaySignPhrase` into ES essay keywords (safe, testable, no prose touched); the higher-value **description prose** is founder-owned content, specced below with an ops audit script.

- [ ] **Step 1: Wire the phrase into ES essay keywords.** In `src/app/[locale]/(app)/essays/[slug]/page.tsx`, add to the `@/shared/lib` imports:
```ts
import { esEssaySignPhrase } from '@/shared/lib/astro-i18n';
```
Then in `generateMetadata`, immediately before `return createMetadata({` (currently `:58`), insert:
```ts
  const esPhrase = locale === 'es' ? esEssaySignPhrase(slug) : null;
  const baseKeywords = essay.meta.keywords;
  const keywords =
    esPhrase && !baseKeywords.includes(esPhrase)
      ? [...baseKeywords, esPhrase]
      : baseKeywords;
```
and change the metadata field `keywords: essay.meta.keywords,` (`:66`) to:
```ts
    keywords,
```
(`EssayMeta.keywords` is always `string[]` — essays.ts:81. `createMetadata` only emits `<meta name="keywords">` when the array is non-empty — metadata.ts:161. Coordinate line numbers with Phase-1 T4/T6a, which also edit this file and may shift them.)

- [ ] **Step 2: Typecheck + the helper suite.** `npm run typecheck && npx vitest run src/shared/lib/__tests__/astro-i18n.test.ts` → PASS (the wiring's correctness is exercised by the `esEssaySignPhrase` tests from Task 1; the emitted `<meta>` is asserted by curl in Task 4).

- [ ] **Step 3: Add the ops audit script.** Create `scripts/seo/audit-es-essay-sign-phrase.mjs` (ops, not CI — keeps the zero-fail gate green until content lands):
```js
#!/usr/bin/env node
/**
 * Ops audit (NOT a vitest test): lists ES planet-in-sign essays whose
 * frontmatter `description` does not yet contain the Spanish search phrase
 * "<planet> en <sign>". The code path (essay keywords) already carries the
 * phrase automatically; this targets the higher-value description surface,
 * which is proprietary content the founder authors.
 *
 * Maps mirror src/shared/lib/astro-i18n.ts (a .mjs cannot import the TS module).
 * Run: node scripts/seo/audit-es-essay-sign-phrase.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

const ES_DIR = join(process.cwd(), 'content', 'essays', 'es');
const PLANET_ES = { sun: 'sol', moon: 'luna', mercury: 'mercurio', venus: 'venus', mars: 'marte', jupiter: 'júpiter', saturn: 'saturno', uranus: 'urano', neptune: 'neptuno', pluto: 'plutón' };
const SIGN_ES = { aries: 'aries', taurus: 'tauro', gemini: 'géminis', cancer: 'cáncer', leo: 'leo', virgo: 'virgo', libra: 'libra', scorpio: 'escorpio', sagittarius: 'sagitario', capricorn: 'capricornio', aquarius: 'acuario', pisces: 'piscis' };

const files = readdirSync(ES_DIR).filter((f) => f.endsWith('.mdx'));
const missing = [];
for (const file of files) {
  const m = file.slice(0, -4).match(/^([a-z]+)-in-([a-z]+)$/);
  if (!m) continue;
  const planet = PLANET_ES[m[1]];
  const sign = SIGN_ES[m[2]];
  if (!planet || !sign) continue;
  const phrase = `${planet} en ${sign}`;
  const { data } = matter(readFileSync(join(ES_DIR, file), 'utf8'));
  const desc = String(data.description ?? '').toLowerCase();
  if (!desc.includes(phrase)) missing.push({ file, phrase });
}
console.log(`ES essays missing the search phrase in description: ${missing.length}/${files.length}`);
for (const { file, phrase } of missing) console.log(`  ${file} → add "${phrase}"`);
```
(`gray-matter` is already a dependency — used by `src/modules/esoteric/lib/essays.ts:13`.)

- [ ] **Step 4: Commit.**
```bash
git add "src/app/[locale]/(app)/essays/[slug]/page.tsx" scripts/seo/audit-es-essay-sign-phrase.mjs
git commit -m "feat(seo-p2/T10c): ES essay keyword sign-variant + description audit script"
```

**Founder content spec (proprietary prose — do NOT author here):** For each `content/essays/es/<planet>-in-<sign>.mdx`, weave the Spanish variant `<planet ES> en <sign ES>` naturally into the frontmatter `description` (e.g. `venus-in-scorpio.mdx` → include "venus en escorpio"; `moon-in-cancer.mdx` → "luna en cáncer"). Keep `description` ≤155 chars (`createMetadata` truncates). Sign names in the body stay untranslated (Aries/Leo…). Run `node scripts/seo/audit-es-essay-sign-phrase.mjs` to see the remaining list; re-run until it reports `0/120`.

---

#### Task 4: verification gate + curl integration (SSR guarantee)

- [ ] **Step 1: Full suite + types + lint.** `npm test && npm run typecheck && npm run lint` → green (grep lint output for `src/` paths only per memory `feedback_lint_worktrees_pollution`).

- [ ] **Step 2: Local SSR curl-verify** (the empty-shell class of bug unit tests cannot see). `npm run build && npm run start`, then:
```bash
# ES compat aries-leo (aries=Fire/Cardinal, leo=Fire/Fixed): expect Fuego + Fijo, NO English tokens
curl -s http://localhost:3000/es/compatibility/aries-leo | grep -oE 'Fuego|Fijo|Cardinal|fuego'
curl -s http://localhost:3000/es/compatibility/aries-leo | grep -oE '>Fire|Fixed<' && echo 'LEAK!' || echo 'ok: no EN element/modality leak'
# ES hours table (santiago): planet column in Spanish
curl -s http://localhost:3000/es/planetary-hours-cities/santiago | grep -oE 'Luna|Saturno|Sol|Marte|Mercurio|Júpiter|Venus' | sort -u
# EN unchanged
curl -s http://localhost:3000/compatibility/aries-leo | grep -oE '>Fire|Fixed<'
# ES essay keywords meta carries the phrase
curl -s http://localhost:3000/es/essays/venus-in-scorpio | grep -o '<meta name="keywords"[^>]*venus en escorpio[^>]*>'
```
Expected: `Fuego`/`Fijo`/`fuego` present and no `>Fire`/`Fixed<` on the ES compat page; Spanish planet names on the ES hours page; EN compat still shows `Fire`/`Fixed`; the ES essay `<meta name="keywords">` contains `venus en escorpio`.

- [ ] **Step 3: Push** (direct-to-main; confirm with founder per the §7 deploy-isolation gate, shared with Phase-1). Then founder authors ES descriptions per the Task 3 spec and re-runs the audit script.

**Coverage:** T10 core (element/modality/planet display maps on ES compat + hours) ✓ (Tasks 1-2, incl. the roadmap-missed 3rd compat leak and the ruler-not-a-leak correction); T10 sign-variant-in-ES-metadata ✓ (Task 3 keywords wiring + founder content spec + audit). PII untouched; proprietary prose untouched.

---

### P2-T11: Real content dates + `Article.image` + sitemap `lastmod` RouteType

**Goal:** Three freshness/richness fixes. (a) Replace the fake `2024-01-15` `publishedAt`/`updatedAt` in all 240 essay MDX files with **real git dates** (so both the sitemap `<lastmod>` and the Article `datePublished`/`dateModified` are honest — a codemod, not hand-editing 240 files). (b) Emit `Article.image` (the per-essay OG image already exists at `/api/og/essay/<slug>` → 200). (c) Extend `sitemap-mtime.ts` `RouteType` so compatibility + planetary-hours-cities `lastmod` is a real git mtime instead of `new Date()` at build.

**Recommendation (authority):** *realify* both dates from git rather than the roadmap's "drop `updatedAt` so git-mtime wins" — dropping `updatedAt` leaves `publishedAt` still fake and makes `articleSchema.dateModified` undefined. Setting `publishedAt` = first-commit date and `updatedAt` = last-commit date makes the sitemap AND the Article schema honest, with no undefined schema fields.

**Files:**
- Create: `scripts/seo/realify-essay-dates.mjs` (one-time codemod)
- Test: `src/shared/seo/__tests__/essay-dates.test.ts` (guard: no essay frontmatter uses `2024-01-15`)
- Modify: `content/essays/*.mdx` + `content/essays/es/*.mdx` (240 files, via the codemod)
- Modify: `src/app/[locale]/(app)/essays/[slug]/page.tsx` (pass `imageUrl` to `articleSchema`)
- Modify: `src/shared/seo/sitemap-mtime.ts` (`RouteType` + 2 cases)
- Modify: `src/app/sitemap.ts` (use the new route types for compat + cities `lastModified`)

**Interfaces:**
- Consumes: `articleSchema({ …, imageUrl })` (already supported — `json-ld.ts:121` option, emitted at `:161–169`); `gray-matter` (already a dep, used by `sitemap-mtime.ts`).
- Produces: `lastModifiedFor('compatibility')` and `lastModifiedFor('planetary-hours-cities')`.

#### Part A — realify essay dates

- [ ] **Step 1: Write the failing guard test**

Create `src/shared/seo/__tests__/essay-dates.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

function essayFiles(): string[] {
  const root = join(process.cwd(), 'content/essays');
  const en = readdirSync(root).filter((f) => f.endsWith('.mdx')).map((f) => join(root, f));
  const es = readdirSync(join(root, 'es')).filter((f) => f.endsWith('.mdx')).map((f) => join(root, 'es', f));
  return [...en, ...es];
}

describe('essay frontmatter dates are real (T11a)', () => {
  it('no essay uses the 2024-01-15 placeholder', () => {
    const offenders = essayFiles().filter((f) => {
      const { data } = matter(readFileSync(f, 'utf8'));
      return data.publishedAt === '2024-01-15' || data.updatedAt === '2024-01-15';
    });
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/seo/__tests__/essay-dates.test.ts`
Expected: FAIL — 240 offenders (all essays carry `2024-01-15`).

- [ ] **Step 3: Write the codemod**

Create `scripts/seo/realify-essay-dates.mjs`:
```js
#!/usr/bin/env node
// One-time: replace fake 2024-01-15 essay dates with real git dates.
// publishedAt = first-commit author date; updatedAt = last-commit date.
// Files never committed yet (git returns empty) keep today's date.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import matter from 'gray-matter';

const root = join(process.cwd(), 'content/essays');
const files = [
  ...readdirSync(root).filter((f) => f.endsWith('.mdx')).map((f) => join(root, f)),
  ...readdirSync(join(root, 'es')).filter((f) => f.endsWith('.mdx')).map((f) => join(root, 'es', f)),
];

function gitDate(file, order) {
  try {
    const args = order === 'first'
      ? ['log', '--diff-filter=A', '--follow', '--format=%aI', '--', file]
      : ['log', '-1', '--format=%cI', '--', file];
    const out = execFileSync('git', args, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    const iso = order === 'first' ? out[out.length - 1] : out[0];
    return iso ? iso.slice(0, 10) : null; // YYYY-MM-DD
  } catch {
    return null;
  }
}

let changed = 0;
for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const parsed = matter(raw);
  const today = new Date().toISOString().slice(0, 10);
  const published = gitDate(file, 'first') ?? today;
  const updated = gitDate(file, 'last') ?? published;
  if (parsed.data.publishedAt === published && parsed.data.updatedAt === updated) continue;
  parsed.data.publishedAt = published;
  parsed.data.updatedAt = updated;
  writeFileSync(file, matter.stringify(parsed.content, parsed.data));
  changed += 1;
}
console.log(`realified ${changed}/${files.length} essay files`);
```

- [ ] **Step 4: Run the codemod**

Run: `node scripts/seo/realify-essay-dates.mjs`
Expected: `realified 240/240 essay files` (fewer if some already real). Spot-check one: `git diff content/essays/sun-in-aries.mdx` shows `publishedAt`/`updatedAt` now real ISO dates.

- [ ] **Step 5: Run the guard test to verify it passes**

Run: `npx vitest run src/shared/seo/__tests__/essay-dates.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/seo/realify-essay-dates.mjs src/shared/seo/__tests__/essay-dates.test.ts content/essays
git commit -m "fix(seo-p2/T11a): realify 240 essay dates from git (drop fake 2024-01-15)"
```

#### Part B — Article.image

- [ ] **Step 7: Add the failing assertion**

In `src/shared/seo/__tests__/json-ld.test.ts`, in the `articleSchema` describe block, add:
```ts
  it('emits Article.image when imageUrl is provided', () => {
    const schema = articleSchema({
      title: 'T', description: 'D', url: 'https://estrevia.app/essays/x',
      datePublished: '2026-01-01', dateModified: '2026-01-01',
      imageUrl: 'https://estrevia.app/api/og/essay/x',
    }) as unknown as AnySchema;
    expect(schema.image.url).toBe('https://estrevia.app/api/og/essay/x');
    expect(schema.image['@type']).toBe('ImageObject');
  });
```
Run: `npx vitest run src/shared/seo/__tests__/json-ld.test.ts -t "Article.image"` — this should already PASS (articleSchema supports imageUrl). If it passes, the schema generator is ready; the gap is the *caller*.

- [ ] **Step 8: Pass the OG image from the essay page**

In `src/app/[locale]/(app)/essays/[slug]/page.tsx`, the `articleSchema({...})` call (`:92–98`) omits `imageUrl`. Add it (reuse the same URL the metadata already uses at `:67`):
```ts
  const articleLd = articleSchema({
    title: meta.title,
    description: meta.description,
    url: canonicalUrl,
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt,
    imageUrl: `${SITE_URL}/api/og/essay/${slug}`,
  });
```
(Ensure `SITE_URL` is still imported — Phase-1 T4 may have dropped it; re-add `import { SITE_URL } from '@/shared/seo/constants';` if lint flags it as missing.)

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npx vitest run src/shared/seo/__tests__/json-ld.test.ts`
Expected: PASS. Commit:
```bash
git add "src/app/[locale]/(app)/essays/[slug]/page.tsx" src/shared/seo/__tests__/json-ld.test.ts
git commit -m "feat(seo-p2/T11b): emit Article.image (per-essay OG) in essay JSON-LD"
```

#### Part C — real sitemap lastmod for compat + cities

- [ ] **Step 10: Write the failing test**

In `src/shared/seo/__tests__/sitemap-mtime.test.ts`, add:
```ts
import { lastModifiedFor } from '../sitemap-mtime';

describe('compat + cities lastmod is a real git mtime (T11c)', () => {
  it('resolves a Date for compatibility', () => {
    expect(lastModifiedFor('compatibility')).toBeInstanceOf(Date);
  });
  it('resolves a Date for planetary-hours-cities', () => {
    expect(lastModifiedFor('planetary-hours-cities')).toBeInstanceOf(Date);
  });
});
```
Run: `npx vitest run src/shared/seo/__tests__/sitemap-mtime.test.ts` — FAIL: `Unknown route type` thrown for the new types.

- [ ] **Step 11: Extend the RouteType union + add cases**

In `src/shared/seo/sitemap-mtime.ts`, extend the union (`:13`) and add cases before the `default`:
```ts
type RouteType =
  | 'static' | 'essay' | 'sign' | 'tarot' | 'sidereal-dates'
  | 'compatibility' | 'planetary-hours-cities';
```
```ts
    case 'compatibility':
      // Pair inventory lives in compatibility-pairs.ts — its git mtime is the
      // honest "last changed" signal for every /compatibility/* URL.
      return getGitMtime('src/shared/seo/compatibility-pairs.ts');
    case 'planetary-hours-cities':
      return getGitMtime('src/shared/seo/cities.ts');
```

- [ ] **Step 12: Wire the sitemap to use them**

In `src/app/sitemap.ts`, replace the two build-time `new Date()` sources:
- `compatibilityBuildTime` (`:268`) → drop the const; set the compat-index `lastModified: lastModifiedFor('compatibility')` (`:270`).
- `planetaryHoursCitiesBuildTime` (`:285`) → drop the const; set both the cities-index (`:289`) and per-city (`:298`) `lastModified: lastModifiedFor('planetary-hours-cities')`.
(Compat *pairs* were already removed in Phase-1 T2, so only the compat index remains.)

- [ ] **Step 13: Verify + commit**

Run: `npm run typecheck && npx vitest run src/shared/seo/__tests__/sitemap-mtime.test.ts src/shared/seo/__tests__/sitemap.test.ts`
Expected: PASS.
```bash
git add src/shared/seo/sitemap-mtime.ts src/app/sitemap.ts src/shared/seo/__tests__/sitemap-mtime.test.ts
git commit -m "fix(seo-p2/T11c): real git-mtime lastmod for compatibility + cities sitemap entries"
```


---

### P2-T12: Soft-404 guard for unknown essay + tarot slugs

**Goal:** Unknown `/essays/<slug>` and `/tarot/<cardId>` URLs currently return HTTP 200 + a noindex "not found" shell (soft-404); make them real 404s by disabling dynamic params so only enumerated slugs render. The compat + city routes already do this (`compatibility/[pair]/page.tsx:22` `export const dynamicParams = false;`) — mirror them.

**Files:**
- Modify: `src/app/[locale]/(app)/essays/[slug]/page.tsx` (has `generateStaticParams` at :33 but no `dynamicParams`)
- Modify: `src/app/[locale]/(app)/tarot/[cardId]/page.tsx` (has `generateStaticParams` at :53 but no `dynamicParams`)
- Test: `src/shared/seo/__tests__/soft-404.test.ts` (assert both routes export `dynamicParams === false`)

**Interfaces:**
- Consumes: nothing new. `generateStaticParams` in both files already enumerates every valid slug (`getAllEssaySlugs()` / all 78 card ids), so `dynamicParams = false` makes any other slug a build/runtime 404.

- [ ] **Step 1: Write the failing test**

Create `src/shared/seo/__tests__/soft-404.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { dynamicParams as essayDynamicParams } from '../../../app/[locale]/(app)/essays/[slug]/page';
import { dynamicParams as tarotDynamicParams } from '../../../app/[locale]/(app)/tarot/[cardId]/page';

describe('soft-404 guard (T12)', () => {
  it('essay route rejects unknown slugs (dynamicParams=false)', () => {
    expect(essayDynamicParams).toBe(false);
  });
  it('tarot card route rejects unknown slugs (dynamicParams=false)', () => {
    expect(tarotDynamicParams).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/seo/__tests__/soft-404.test.ts`
Expected: FAIL — `dynamicParams` is `undefined` (Next.js default is `true`), not `false`, in both imports.

- [ ] **Step 3: Add the guard to the essay route**

In `src/app/[locale]/(app)/essays/[slug]/page.tsx`, directly under the existing `export const revalidate = 86400;` (`:31`), add:
```ts
// Only the 120 enumerated slugs render; any other slug is a real 404 (not a
// soft-404 200+noindex shell). generateStaticParams below is the allowlist.
export const dynamicParams = false;
```

- [ ] **Step 4: Add the guard to the tarot card route**

In `src/app/[locale]/(app)/tarot/[cardId]/page.tsx`, directly under the existing `export const revalidate = 86400;` (`:46`), add:
```ts
// Only the 78 enumerated card ids render; unknown ids 404 instead of soft-404.
export const dynamicParams = false;
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/shared/seo/__tests__/soft-404.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify types + a live 404 (integration)**

Run: `npm run typecheck` (PASS). Then, against a running dev/build server:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/essays/not-a-real-slug   # expect 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tarot/not-a-real-card     # expect 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/essays/sun-in-aries       # expect 200
```
Expected: 404, 404, 200. (Note: the existing in-component `notFound()` calls remain as defence-in-depth; with `dynamicParams=false` they simply stop being reachable for unknown slugs.)

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/(app)/essays/[slug]/page.tsx" \
        "src/app/[locale]/(app)/tarot/[cardId]/page.tsx" \
        src/shared/seo/__tests__/soft-404.test.ts
git commit -m "fix(seo-p2/T12): dynamicParams=false on essay+tarot routes (kill soft-404s)"
```


---

### P2-T13: `/about` + `/es/about` founder page + Person author upgrade

> ⚠️ **FOUNDER RE-REVIEW GATE (blocks merge of this task).** T13 **reverses the 2026-05-03 decision _"авторство не нужно"_** (see `2026-05-03-seo-aeo-basics-design.md` §Dropped; roadmap §6 Decision 3 + §8 checklist item "T13 re-review"). Rationale for the reversal: the brand SERP is being lost to the **"Estreva" estradiol drug** (audit finding #17), so a named-human author + an entity-home page is now a real E-E-A-T cost, not vanity. This task adds a **named founder (Kirill Kovalenko)** to the public site and to **every Article's `author`** sitewide. **Do not merge until the founder confirms** (a) publishing his name publicly and (b) the Organization→Person author switch. If the founder declines, drop T13b's author switch and keep only the `/about` page + Person node scoped to `/about`.

**Goal:** Ship `/about` + `/es/about` (marketing route) — founder named, methodology (Swiss Ephemeris/Moshier, Lahiri ayanamsa, CI-verified ±0.01°), contact; add a footer link; register the founder as the Organization entity anchor; upgrade `articleSchema` `author` from anonymous Organization → named `Person` sitewide, with the essay page passing the founder name. Content rule: the founder's name/role/methodology are **public facts** (`public/llms.txt`) and are seeded as factual i18n copy; the **personal narrative** (`lead`/`founderBio`/`bioSchema`) is seeded with a one-line truthful placeholder and left to the founder to expand via the content spec (T13f). A placeholder-detecting + EN/ES parity test guards it.

**New files:**
- `src/app/[locale]/(marketing)/about/page.tsx` — the `/about` + `/es/about` route (marketing layout already injects `organizationSchema`).
- `src/app/[locale]/(marketing)/__tests__/about-i18n.test.ts` — EN/ES key-parity + no-placeholder guard for the `about` namespace. (The `__tests__` dir already exists — `LandingViewTracker.test.tsx` lives there.)

**Modified files:**
- `src/shared/seo/constants.ts` — add `FOUNDER_NAME`.
- `src/shared/seo/json-ld.ts` — new `personSchema`; `organizationSchema.founder`; `articleSchema` author Organization→Person + `authorUrl`.
- `src/shared/seo/index.ts` — barrel: export `personSchema` + `PersonSchemaOptions` + `FOUNDER_NAME`.
- `src/shared/seo/__tests__/json-ld.test.ts` — personSchema tests; org-founder test; author @type Person.
- `messages/en.json`, `messages/es.json` — `pageMeta.about`, `about` namespace, `marketing.footerAbout`.
- `src/app/[locale]/(marketing)/layout.tsx` — footer `/about` link.
- `src/app/sitemap.ts` — emit `/about`.
- `src/shared/seo/__tests__/sitemap.test.ts` — `/about ×2` assertion.
- `src/app/[locale]/(app)/essays/[slug]/page.tsx` — pass `authorName: FOUNDER_NAME`.

**Interfaces:**
- `FOUNDER_NAME: string` (`'Kirill Kovalenko'`).
- `personSchema(options: PersonSchemaOptions): WithContext<Person>`, where `interface PersonSchemaOptions { name: string; url?: string; jobTitle?: string; description?: string; sameAs?: string[]; knowsAbout?: string[]; worksForName?: string; worksForUrl?: string }`.
- `articleSchema` gains `authorUrl?: string`; `author` becomes `{ '@type': 'Person'; name; url }` (defaults `FOUNDER_NAME` / `${SITE_URL}/about`).

---

#### T13a — `FOUNDER_NAME` + `personSchema` generator + barrel + unit test

Adds the founder constant and a generic `Person` schema generator (the required Person-schema unit test), exported through the SEO barrel.

**Files:** modify `src/shared/seo/constants.ts`, `src/shared/seo/json-ld.ts`, `src/shared/seo/index.ts`; test `src/shared/seo/__tests__/json-ld.test.ts`.

- [ ] **Step 1: Write the failing test.** In `src/shared/seo/__tests__/json-ld.test.ts`, extend the import at `:2-11` to add `personSchema`, and add a `constants` import after it (`:11`):
```ts
import {
  organizationSchema,
  softwareAppSchema,
  articleSchema,
  faqSchema,
  howToSchema,
  breadcrumbSchema,
  websiteSchema,
  definedTermSchema,
  personSchema,
} from '../json-ld';
import { FOUNDER_NAME } from '../constants';
```
Append a new `describe` block at the end of the file (after `definedTermSchema` `:339`):
```ts
describe('personSchema', () => {
  it('returns a WithContext Person with @type + name', () => {
    const schema = personSchema({ name: FOUNDER_NAME }) as unknown as AnySchema;
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Person');
    expect(schema.name).toBe(FOUNDER_NAME);
  });

  it('includes optional url, jobTitle, sameAs, knowsAbout when provided', () => {
    const schema = personSchema({
      name: FOUNDER_NAME,
      url: 'https://estrevia.app/about',
      jobTitle: 'Founder',
      sameAs: ['https://x.com/estrevia_app'],
      knowsAbout: ['Sidereal astrology', 'Lahiri ayanamsa'],
    }) as unknown as AnySchema;
    expect(schema.url).toBe('https://estrevia.app/about');
    expect(schema.jobTitle).toBe('Founder');
    expect(schema.sameAs).toContain('https://x.com/estrevia_app');
    expect(schema.knowsAbout).toContain('Lahiri ayanamsa');
  });

  it('nests worksFor as an Organization when a name is given', () => {
    const schema = personSchema({
      name: FOUNDER_NAME,
      worksForName: 'Estrevia',
      worksForUrl: 'https://estrevia.app',
    }) as unknown as AnySchema;
    expect(schema.worksFor['@type']).toBe('Organization');
    expect(schema.worksFor.name).toBe('Estrevia');
    expect(schema.worksFor.url).toBe('https://estrevia.app');
  });

  it('omits worksFor when no organization name given', () => {
    const schema = personSchema({ name: FOUNDER_NAME }) as unknown as AnySchema;
    expect('worksFor' in schema).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — verify it fails.** `npx vitest run src/shared/seo/__tests__/json-ld.test.ts -t "personSchema"` → FAIL: `Failed to resolve import "../json-ld"` symbol `personSchema` / `FOUNDER_NAME` (not exported).

- [ ] **Step 3: Add `FOUNDER_NAME`.** In `src/shared/seo/constants.ts`, after `:1`:
```ts
export const SITE_NAME = 'Estrevia';
```
→
```ts
export const SITE_NAME = 'Estrevia';
// Named human author for E-E-A-T (Article.author + Organization.founder + /about).
// Reverses the 2026-05-03 "authorship not needed" call — see seo-p2/T13.
export const FOUNDER_NAME = 'Kirill Kovalenko';
```

- [ ] **Step 4: Implement `personSchema`.** In `src/shared/seo/json-ld.ts`, add `Person` to the `schema-dts` type import (`:20-31`) — insert `Person,` after `Organization,` (`:22`) — and add `FOUNDER_NAME` to the constants import (`:32`):
```ts
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, FOUNDER_NAME } from './constants';
```
Insert a new section immediately after `organizationSchema` closes (`:56`, before the `SoftwareApplication` divider `:58`):
```ts
// ---------------------------------------------------------------------------
// Person (named founder / author — E-E-A-T entity)
// ---------------------------------------------------------------------------

export interface PersonSchemaOptions {
  name: string;
  url?: string;
  jobTitle?: string;
  description?: string;
  sameAs?: string[];
  knowsAbout?: string[];
  worksForName?: string;
  worksForUrl?: string;
}

/**
 * Returns a Person schema for the site's named human author/founder.
 * Injected on /about (the entity home) and referenced as Article.author.
 * E-E-A-T signal replacing the anonymous-Organization author used pre-2026-07.
 */
export function personSchema(options: PersonSchemaOptions): WithContext<Person> {
  const { name, url, jobTitle, description, sameAs, knowsAbout, worksForName, worksForUrl } =
    options;
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    ...(url ? { url } : {}),
    ...(jobTitle ? { jobTitle } : {}),
    ...(description ? { description } : {}),
    ...(sameAs && sameAs.length > 0 ? { sameAs } : {}),
    ...(knowsAbout && knowsAbout.length > 0 ? { knowsAbout } : {}),
    ...(worksForName
      ? {
          worksFor: {
            '@type': 'Organization',
            name: worksForName,
            ...(worksForUrl ? { url: worksForUrl } : {}),
          },
        }
      : {}),
  };
}
```
(Spread-conditional build mirrors the repo's `definedTermSchema`/`articleSchema` pattern so the `schema-dts` `Person` union type-checks cleanly. `WithContext<T>` is already imported at `:21`; `schema-dts` exports `Person` at `schema.d.ts:8415`, resolving the same way as the existing `Organization` union.)

- [ ] **Step 5: Export from the barrel.** In `src/shared/seo/index.ts`, add `personSchema,` to the `json-ld` value re-export block (after `organizationSchema,` `:28`) and `PersonSchemaOptions,` to the `json-ld` type re-export block (after `ArticleSchemaOptions,` `:39`). In the `./constants` re-export block, add `FOUNDER_NAME,` after `SITE_NAME,` (`:61`).

- [ ] **Step 6: Run + typecheck.** `npm run typecheck && npx vitest run src/shared/seo/__tests__/json-ld.test.ts -t "personSchema"` → typecheck PASS; 4 tests PASS.

- [ ] **Step 7: Commit.**
```bash
git add src/shared/seo/constants.ts src/shared/seo/json-ld.ts src/shared/seo/index.ts \
        src/shared/seo/__tests__/json-ld.test.ts
git commit -m "feat(seo-p2/T13a): personSchema generator + FOUNDER_NAME constant"
```

---

#### T13b — Article author Organization→Person + Organization founder anchor

Upgrades every `articleSchema` author to a named `Person` (default `FOUNDER_NAME`, `url` → `/about`) and links `organizationSchema.founder` → the founder Person (the "entity anchor"). Sitewide behaviour change on all Article callers (essays + why-sidereal). `FOUNDER_NAME` is already imported into this test file by T13a Step 1.

**Files:** modify `src/shared/seo/json-ld.ts`; test `src/shared/seo/__tests__/json-ld.test.ts`.

- [ ] **Step 1: Update the tests to the new expectation.** In `src/shared/seo/__tests__/json-ld.test.ts`, replace the author test at `:90-94`:
```ts
  it('includes author with @type Organization', () => {
    const schema = articleSchema(options) as unknown as AnySchema;
    expect(schema.author['@type']).toBe('Organization');
    expect(typeof schema.author.name).toBe('string');
  });
```
→
```ts
  it('includes author as a named Person defaulting to the founder (E-E-A-T)', () => {
    const schema = articleSchema(options) as unknown as AnySchema;
    expect(schema.author['@type']).toBe('Person');
    expect(schema.author.name).toBe(FOUNDER_NAME);
    expect(schema.author.url).toContain('/about');
  });
```
(The `:122-128` "uses custom authorName when provided" test still passes — `name` is a passthrough; it only asserts `author.name`.) Add an Organization-founder test inside the `organizationSchema` describe (after the logo test's closing `});` at `:39`, before the describe's closing `});` at `:40` — do **not** modify the logo test, that is Phase-1 T3):
```ts
  it('names the founder as a Person (Organization entity anchor)', () => {
    const schema = organizationSchema() as unknown as AnySchema;
    expect(schema.founder['@type']).toBe('Person');
    expect(schema.founder.name).toBe(FOUNDER_NAME);
    expect(schema.founder.url).toContain('/about');
  });
```

- [ ] **Step 2: Run — verify they fail.** `npx vitest run src/shared/seo/__tests__/json-ld.test.ts -t "Person|founder|entity anchor"` → the two new assertions FAIL (author `@type` is still `Organization`; `schema.founder` is `undefined`). (The T13a `personSchema` tests also match this filter and pass — that is expected.)

- [ ] **Step 3: Add `organizationSchema.founder`.** In `src/shared/seo/json-ld.ts`, replace the single `sameAs` line at `:54`:
```ts
    sameAs: ['https://x.com/estrevia_app'],
```
→
```ts
    founder: {
      '@type': 'Person',
      name: FOUNDER_NAME,
      url: `${SITE_URL}/about`,
    },
    sameAs: ['https://x.com/estrevia_app'],
```
(Anchoring on the `sameAs` line keeps this edit independent of Phase-1 T3's logo change.)

- [ ] **Step 4: Add `authorUrl` to the options interface.** In `ArticleSchemaOptions` (`:115-123`), after `authorName?: string;` (`:121`):
```ts
  authorName?: string;
```
→
```ts
  authorName?: string;
  authorUrl?: string;
```

- [ ] **Step 5: Switch the default + author block.** In `articleSchema`, replace the destructure at `:130-138`:
```ts
  const {
    title,
    description,
    url,
    datePublished,
    dateModified,
    authorName = SITE_NAME,
    imageUrl,
  } = options;
```
→
```ts
  const {
    title,
    description,
    url,
    datePublished,
    dateModified,
    authorName = FOUNDER_NAME,
    authorUrl = `${SITE_URL}/about`,
    imageUrl,
  } = options;
```
Replace the author block at `:148-151`:
```ts
    author: {
      '@type': 'Organization',
      name: authorName,
    },
```
→
```ts
    author: {
      '@type': 'Person',
      name: authorName,
      url: authorUrl,
    },
```
(Leave `publisher` `:152-160` as Organization — publisher stays the org; only `author` becomes the Person. `SITE_NAME` is still imported/used by `publisher` `:154`, `organizationSchema` `:46`, `softwareAppSchema`, `websiteSchema`, and `productSchema`, so no unused-import removal.)

- [ ] **Step 6: Run + typecheck.** `npm run typecheck && npx vitest run src/shared/seo/__tests__/json-ld.test.ts` → PASS (whole file, incl. the unchanged `:96-100` publisher test). Also run the two other articleSchema consumers to confirm no collateral break: `npx vitest run src/shared/seo/__tests__/essays-seo.test.ts src/shared/seo/__tests__/atom.test.ts` → PASS (neither asserts `articleSchema.author`: `essays-seo.test.ts` only checks headline/datePublished/publisher; `atom.test.ts:78` checks the Atom **feed** author, a separate generator).

- [ ] **Step 7: Commit.**
```bash
git add src/shared/seo/json-ld.ts src/shared/seo/__tests__/json-ld.test.ts
git commit -m "feat(seo-p2/T13b): Article author Organization->Person + Organization.founder anchor"
```

---

#### T13c — i18n keys (`pageMeta.about`, `about` namespace, `marketing.footerAbout`) + placeholder/parity guard

Adds all `/about` copy under i18n keys (EN + ES) and a green guard test that fails on any leftover placeholder or EN/ES key drift. Methodology/label copy is factual (mirrors `public/llms.txt`); the personal-narrative keys are seeded with a truthful one-liner for the founder to expand in T13f.

**Files:** modify `messages/en.json`, `messages/es.json`; new test `src/app/[locale]/(marketing)/__tests__/about-i18n.test.ts`.

- [ ] **Step 1: Write the failing guard test.** Create `src/app/[locale]/(marketing)/__tests__/about-i18n.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function load(locale: 'en' | 'es'): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), `messages/${locale}.json`), 'utf-8'));
}

const REQUIRED_ABOUT_KEYS = [
  'breadcrumbAria', 'breadcrumbHome', 'breadcrumbCurrent',
  'eyebrow', 'h1', 'lead',
  'founderHeading', 'founderBio',
  'methodologyHeading', 'methodologyP1', 'methodologyP2',
  'accuracyLabel', 'accuracyValue',
  'contactHeading', 'contactBody', 'contactEmailLabel',
  'ctaHeading', 'ctaBody', 'ctaButton',
  'roleTitle', 'bioSchema',
] as const;

const PLACEHOLDER = /\b(TODO|TBD|XXX|FIXME|PLACEHOLDER|Lorem ipsum)\b/i;

describe('about i18n scaffold (T13)', () => {
  for (const locale of ['en', 'es'] as const) {
    const msgs = load(locale);
    const about = (msgs.about ?? {}) as Record<string, string>;
    const meta = ((msgs.pageMeta as Record<string, unknown>)?.about ?? {}) as Record<string, string>;

    it(`[${locale}] has every required about.* key, non-empty`, () => {
      for (const k of REQUIRED_ABOUT_KEYS) {
        expect(typeof about[k], `about.${k}`).toBe('string');
        expect(about[k].trim().length, `about.${k}`).toBeGreaterThan(0);
      }
    });

    it(`[${locale}] has pageMeta.about title + description`, () => {
      expect(typeof meta.title).toBe('string');
      expect(typeof meta.description).toBe('string');
      expect(meta.title.length).toBeLessThanOrEqual(60);
      expect(meta.description.length).toBeLessThanOrEqual(155);
    });

    it(`[${locale}] has marketing.footerAbout`, () => {
      const marketing = msgs.marketing as Record<string, string>;
      expect(typeof marketing.footerAbout).toBe('string');
      expect(marketing.footerAbout.trim().length).toBeGreaterThan(0);
    });

    it(`[${locale}] contains no placeholder sentinels in about.*`, () => {
      for (const k of REQUIRED_ABOUT_KEYS) {
        expect(PLACEHOLDER.test(about[k]), `about.${k} = "${about[k]}"`).toBe(false);
      }
    });
  }

  it('EN and ES about namespaces have identical key sets', () => {
    const en = Object.keys((load('en').about ?? {}) as object).sort();
    const es = Object.keys((load('es').about ?? {}) as object).sort();
    expect(es).toEqual(en);
  });
});
```

- [ ] **Step 2: Run — verify it fails.** `npx vitest run "src/app/[locale]/(marketing)/__tests__/about-i18n.test.ts"` → FAIL: the required-key / `pageMeta.about` / `marketing.footerAbout` tests fail (`about` / `pageMeta.about` / `marketing.footerAbout` absent).

- [ ] **Step 3: Add `pageMeta.about` (EN).** In `messages/en.json`, replace the `whySidereal` pageMeta block at `:402-405`:
```json
    "whySidereal": {
      "title": "Why Sidereal Astrology Differs from Tropical",
      "description": "Sidereal astrology tracks real constellations using the Lahiri ayanamsa. Most sun signs shift one sign earlier vs tropical. Calculate your true chart."
    },
```
→
```json
    "whySidereal": {
      "title": "Why Sidereal Astrology Differs from Tropical",
      "description": "Sidereal astrology tracks real constellations using the Lahiri ayanamsa. Most sun signs shift one sign earlier vs tropical. Calculate your true chart."
    },
    "about": {
      "title": "About the Founder & Sidereal Methodology",
      "description": "How Estrevia calculates sidereal charts — Swiss Ephemeris (Moshier), Lahiri ayanamsa, CI-verified to ±0.01° — and who builds it."
    },
```

- [ ] **Step 4: Add `marketing.footerAbout` + the `about` namespace (EN).** In `messages/en.json`, replace the marketing-close + landing-open at `:758-760`:
```json
    "footerLicenseNotice": "Licensed under AGPL-3.0"
  },
  "landing": {
```
→
```json
    "footerLicenseNotice": "Licensed under AGPL-3.0",
    "footerAbout": "About"
  },
  "about": {
    "breadcrumbAria": "Breadcrumb",
    "breadcrumbHome": "Home",
    "breadcrumbCurrent": "About",
    "eyebrow": "About",
    "h1": "About Estrevia",
    "lead": "Estrevia is an independent sidereal astrology platform built and maintained by Kirill Kovalenko.",
    "founderHeading": "The founder",
    "founderBio": "Kirill Kovalenko founded Estrevia to make astronomically-accurate sidereal astrology, and its esoteric correspondences, available in English and Spanish.",
    "methodologyHeading": "How the charts are calculated",
    "methodologyP1": "Every chart is computed with the Swiss Ephemeris (Moshier algorithm), accurate to ±0.01°, using the Lahiri ayanamsa — the official sidereal reference defined by the Indian Calendar Reform Committee in 1955.",
    "methodologyP2": "Positions are verified continuously in CI against 36+ reference charts at a ±0.01° tolerance, so the sidereal signs, houses, and aspects Estrevia reports match the real sky.",
    "accuracyLabel": "Verified accuracy",
    "accuracyValue": "±0.01° · CI-tested against 36+ reference charts",
    "contactHeading": "Contact",
    "contactBody": "Questions, corrections, or press enquiries are welcome — reach the founder directly.",
    "contactEmailLabel": "Email",
    "ctaHeading": "Calculate your sidereal chart",
    "ctaBody": "See your true sidereal Sun, Moon, and rising in seconds — free.",
    "ctaButton": "Open the calculator",
    "roleTitle": "Founder & Sidereal Astrologer",
    "bioSchema": "Founder of Estrevia, an independent sidereal astrology platform using the Lahiri ayanamsa and the Swiss Ephemeris."
  },
  "landing": {
```

- [ ] **Step 5: Add `pageMeta.about` (ES).** In `messages/es.json`, the `whySidereal` pageMeta block at `:402-405` is **already translated to Spanish** in the repo — anchor on it verbatim and append the new `about` block after it (do not alter the whySidereal values). Replace:
```json
    "whySidereal": {
      "title": "Por qué la sideral difiere de la tropical",
      "description": "La astrología sideral sigue las constelaciones reales con el ayanamsa Lahiri. Casi todos los signos solares retroceden uno. Calcula tu carta verdadera."
    },
```
→
```json
    "whySidereal": {
      "title": "Por qué la sideral difiere de la tropical",
      "description": "La astrología sideral sigue las constelaciones reales con el ayanamsa Lahiri. Casi todos los signos solares retroceden uno. Calcula tu carta verdadera."
    },
    "about": {
      "title": "Sobre el fundador y la metodología sideral",
      "description": "Cómo Estrevia calcula las cartas siderales — Swiss Ephemeris (Moshier), ayanamsa Lahiri, verificado con CI a ±0.01° — y quién lo construye."
    },
```

- [ ] **Step 6: Add `marketing.footerAbout` + the `about` namespace (ES).** In `messages/es.json`, replace the marketing-close + landing-open at `:758-760`:
```json
    "footerLicenseNotice": "Licenciado bajo AGPL-3.0"
  },
  "landing": {
```
→
```json
    "footerLicenseNotice": "Licenciado bajo AGPL-3.0",
    "footerAbout": "Acerca de"
  },
  "about": {
    "breadcrumbAria": "Ruta de navegación",
    "breadcrumbHome": "Inicio",
    "breadcrumbCurrent": "Acerca de",
    "eyebrow": "Acerca de",
    "h1": "Acerca de Estrevia",
    "lead": "Estrevia es una plataforma independiente de astrología sideral creada y mantenida por Kirill Kovalenko.",
    "founderHeading": "El fundador",
    "founderBio": "Kirill Kovalenko fundó Estrevia para acercar la astrología sideral astronómicamente precisa, y sus correspondencias esotéricas, al público en inglés y español.",
    "methodologyHeading": "Cómo se calculan las cartas",
    "methodologyP1": "Cada carta se calcula con el Swiss Ephemeris (algoritmo Moshier), con una precisión de ±0.01°, usando el ayanamsa Lahiri: la referencia sideral oficial definida por el Comité de Reforma del Calendario Indio en 1955.",
    "methodologyP2": "Las posiciones se verifican de forma continua en CI contra más de 36 cartas de referencia con una tolerancia de ±0.01°, para que los signos siderales, las casas y los aspectos que muestra Estrevia coincidan con el cielo real.",
    "accuracyLabel": "Precisión verificada",
    "accuracyValue": "±0.01° · probado en CI contra más de 36 cartas de referencia",
    "contactHeading": "Contacto",
    "contactBody": "Preguntas, correcciones o consultas de prensa son bienvenidas: escribe directamente al fundador.",
    "contactEmailLabel": "Correo",
    "ctaHeading": "Calcula tu carta sideral",
    "ctaBody": "Descubre tu verdadero Sol, Luna y ascendente siderales en segundos, gratis.",
    "ctaButton": "Abrir la calculadora",
    "roleTitle": "Fundador y astrólogo sideral",
    "bioSchema": "Fundador de Estrevia, una plataforma independiente de astrología sideral que usa el ayanamsa Lahiri y el Swiss Ephemeris."
  },
  "landing": {
```
(español neutro LATAM, `tú`; planet/sign names not present here so the untranslated-signs rule is not touched.)

- [ ] **Step 7: Validate JSON + run guard.** `node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('json OK')" && npx vitest run "src/app/[locale]/(marketing)/__tests__/about-i18n.test.ts"` → `json OK`; all guard tests PASS.

- [ ] **Step 8: Commit.**
```bash
git add messages/en.json messages/es.json \
        "src/app/[locale]/(marketing)/__tests__/about-i18n.test.ts"
git commit -m "feat(seo-p2/T13c): about i18n scaffold (pageMeta.about + about namespace) + parity/placeholder guard"
```

---

#### T13d — `/about` + `/es/about` page scaffold + Person/Breadcrumb JSON-LD

Creates the route. Marketing layout already injects `organizationSchema` (now carrying `founder`), so the page adds the standalone `Person` node (entity home) + breadcrumb. No unit render test — the SSR guarantee is covered by the curl gate in T13f (repo has no async-server-component harness).

**Files:** create `src/app/[locale]/(marketing)/about/page.tsx`.

- [ ] **Step 1: Create the route.**
```tsx
import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createMetadata,
  JsonLdScript,
  personSchema,
  breadcrumbSchema,
  SITE_NAME,
  SITE_URL,
  FOUNDER_NAME,
} from '@/shared/seo';
import { Disclaimer } from '@/shared/components/Disclaimer';

// ISR hourly, mirroring /why-sidereal. Locale resolved from the [locale] segment.
export const revalidate = 3600;

// English concept labels for the Person entity graph (schema values, not UI copy).
const KNOWS_ABOUT = [
  'Sidereal astrology',
  'Lahiri ayanamsa',
  'Vedic astrology',
  'Swiss Ephemeris',
  'Planetary hours',
];

const SUPPORT_EMAIL = 'support@estrevia.app';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tMeta = await getTranslations('pageMeta.about');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/about',
    locale: locale as 'en' | 'es',
    keywords: [
      'estrevia founder',
      'sidereal astrology methodology',
      'lahiri ayanamsa accuracy',
      'swiss ephemeris',
      'kirill kovalenko',
    ],
  });
}

export default async function AboutPage() {
  const t = await getTranslations('about');
  const locale = await getLocale();
  const base = SITE_URL.replace(/\/$/, '');
  const prefix = locale === 'es' ? '/es' : '';
  const pageUrl = `${base}${prefix}/about`;

  const personLd = personSchema({
    name: FOUNDER_NAME,
    url: `${base}/about`, // single canonical entity URL for the founder
    jobTitle: t('roleTitle'),
    description: t('bioSchema'),
    sameAs: ['https://x.com/estrevia_app'],
    knowsAbout: KNOWS_ABOUT,
    worksForName: SITE_NAME,
    worksForUrl: SITE_URL,
  });

  const breadcrumbLd = breadcrumbSchema([
    { name: t('breadcrumbHome'), url: `${base}${prefix}` },
    { name: t('breadcrumbCurrent'), url: pageUrl },
  ]);

  return (
    <>
      <JsonLdScript schema={personLd} />
      <JsonLdScript schema={breadcrumbLd} />

      <div className="max-w-3xl mx-auto px-4 py-10 md:py-16">
        {/* Breadcrumb */}
        <nav aria-label={t('breadcrumbAria')} className="mb-8 text-sm text-white/40">
          <ol className="flex items-center gap-2">
            <li><Link href="/" className="hover:text-white/70 transition-colors">{t('breadcrumbHome')}</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-white/60" aria-current="page">{t('breadcrumbCurrent')}</li>
          </ol>
        </nav>

        {/* Hero */}
        <header className="mb-12">
          <p className="text-[10px] tracking-[0.22em] uppercase text-white/40 mb-4">{t('eyebrow')}</p>
          <h1
            className="text-3xl md:text-5xl font-light leading-[1.1] mb-5"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}
          >
            {t('h1')}
          </h1>
          <p className="text-lg text-white/72 leading-relaxed" style={{ fontFamily: 'var(--font-geist-sans)' }}>
            {t('lead')}
          </p>
        </header>

        {/* Founder */}
        <section aria-labelledby="founder-heading" className="mb-12">
          <h2 id="founder-heading" className="text-2xl font-light mb-4"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}>
            {t('founderHeading')}
          </h2>
          <p className="text-white/70 leading-relaxed" style={{ fontFamily: 'var(--font-geist-sans)' }}>
            {t('founderBio')}
          </p>
        </section>

        {/* Methodology */}
        <section aria-labelledby="method-heading" className="mb-12">
          <h2 id="method-heading" className="text-2xl font-light mb-4"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}>
            {t('methodologyHeading')}
          </h2>
          <div className="text-white/70 leading-relaxed space-y-4" style={{ fontFamily: 'var(--font-geist-sans)' }}>
            <p>{t('methodologyP1')}</p>
            <p>{t('methodologyP2')}</p>
          </div>
          <dl className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <dt className="text-[11px] uppercase tracking-widest text-amber-300/70 mb-1">{t('accuracyLabel')}</dt>
            <dd className="text-sm text-white/80" style={{ fontFamily: 'var(--font-geist-mono)' }}>{t('accuracyValue')}</dd>
          </dl>
        </section>

        {/* Contact */}
        <section aria-labelledby="contact-heading" className="mb-12">
          <h2 id="contact-heading" className="text-2xl font-light mb-4"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}>
            {t('contactHeading')}
          </h2>
          <p className="text-white/70 leading-relaxed mb-3" style={{ fontFamily: 'var(--font-geist-sans)' }}>
            {t('contactBody')}
          </p>
          <p className="text-sm text-white/60">
            <span className="text-white/40">{t('contactEmailLabel')}: </span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-400 hover:text-amber-300 underline underline-offset-4">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>

        {/* CTA */}
        <section aria-labelledby="cta-heading" className="mb-12 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h2 id="cta-heading" className="text-xl font-light mb-3"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}>
            {t('ctaHeading')}
          </h2>
          <p className="text-white/58 text-sm mb-5 leading-relaxed">{t('ctaBody')}</p>
          <Link
            href="/chart"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)', color: '#0A0A0F', boxShadow: '0 4px 16px rgba(255,215,0,0.2)' }}
          >
            <span aria-hidden="true">☉</span>
            {t('ctaButton')}
          </Link>
        </section>

        <Disclaimer />
      </div>
    </>
  );
}
```
(Pattern, imports, and styling mirror `why-sidereal/page.tsx` — same `getLocale`/`getTranslations` from `next-intl/server`, `Disclaimer` from `@/shared/components/Disclaimer`, `Link` from `@/i18n/navigation`, `createMetadata({ title, description, path, locale, keywords })` shape, and `revalidate=3600`. No `generateStaticParams` — matches `why-sidereal` which is per-`[locale]` with `revalidate=3600`.)

- [ ] **Step 2: Typecheck.** `npm run typecheck` → PASS (barrel now exports `personSchema`, `FOUNDER_NAME`, `SITE_NAME`, `SITE_URL`; `pageMeta.about` + `about` keys exist from T13c).

- [ ] **Step 3: Commit.**
```bash
git add "src/app/[locale]/(marketing)/about/page.tsx"
git commit -m "feat(seo-p2/T13d): /about + /es/about founder + methodology page (Person JSON-LD)"
```

---

#### T13e — footer link + sitemap wiring

Surfaces `/about` in the site footer (internal PageRank + trust) and emits it in the sitemap for both locales.

**Files:** modify `src/app/[locale]/(marketing)/layout.tsx`, `src/app/sitemap.ts`; test `src/shared/seo/__tests__/sitemap.test.ts`.

- [ ] **Step 1: Write the failing sitemap test.** Append to `src/shared/seo/__tests__/sitemap.test.ts` (`sitemap` default is already imported at `:2`):
```ts
describe('about page in sitemap (T13)', () => {
  it('emits /about for EN and ES', () => {
    const urls = sitemap().map((e) => e.url);
    const aboutUrls = urls.filter((u) => /\/about$/.test(u));
    expect(aboutUrls).toHaveLength(2);
  });
});
```
> **Reconciliation note:** the existing suite only asserts `entries.length >= 442` (`:24-26`), so `/about` (+2) is safe. **If** Phase-1 T2 has already landed its exact-count `expect(sitemap()).toHaveLength(514)` assertion, bump that literal by **+2** → `516` in the same commit (it is invalidated by this task's two new entries). NB: the `sitemap.ts` header comment (`:117-135`) already understates the canonical-path count (it predates the compatibility + planetary-hours families) — it is cosmetic and out of scope; do not gate on it.

- [ ] **Step 2: Run — verify it fails.** `npx vitest run src/shared/seo/__tests__/sitemap.test.ts -t "about page in sitemap"` → FAIL: `aboutUrls` length is `0`.

- [ ] **Step 3: Emit `/about` in the sitemap.** In `src/app/sitemap.ts`, after the `/pricing` block (`:151-155`) inside `staticPages`, insert:
```ts
    ...emitLocalized('/about', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(marketing)/about/page.tsx'),
      changeFrequency: 'monthly',
      priority: 0.5,
    }),
```
(`emitLocalized` yields both EN + ES, keeping the `en.length === es.length` parity assertion at `:11` green. The `about/page.tsx` file exists by now — created in T13d — so `lastModifiedFor('static', …)` resolves an mtime.)

- [ ] **Step 4: Run — verify it passes.** `npx vitest run src/shared/seo/__tests__/sitemap.test.ts` → PASS.

- [ ] **Step 5: Add the footer link.** In `src/app/[locale]/(marketing)/layout.tsx`, in the footer `nav` (`:110-144`), insert an About link between the `/pricing` link (`:117-119`) and the `/terms` link (`:120-122`):
```tsx
              <Link href="/pricing" className={`text-xs text-white/65 hover:text-white/90 transition-colors py-2 sm:py-0 ${focusRing}`}>
                {tNav('pricing')}
              </Link>
              <Link href="/about" className={`text-xs text-white/65 hover:text-white/90 transition-colors py-2 sm:py-0 ${focusRing}`}>
                {tMarketing('footerAbout')}
              </Link>
              <Link href="/terms" className={`text-xs text-white/65 hover:text-white/90 transition-colors py-2 sm:py-0 ${focusRing}`}>
                {tMarketing('footerTerms')}
              </Link>
```
(`tMarketing` is already in scope at `:10`; `footerAbout` added in T13c.)

- [ ] **Step 6: Typecheck.** `npm run typecheck` → PASS.

- [ ] **Step 7: Commit.**
```bash
git add "src/app/[locale]/(marketing)/layout.tsx" src/app/sitemap.ts \
        src/shared/seo/__tests__/sitemap.test.ts
git commit -m "feat(seo-p2/T13e): footer /about link + sitemap entry (EN + ES)"
```

---

#### T13f — essay page passes founder author + full verify + curl gate + founder content spec

Makes essays explicitly founder-authored at the highest-traffic call site (roadmap wording), then runs the full gate + the SSR curl checks (unit tests can't see the rendered `<head>`).

**Files:** modify `src/app/[locale]/(app)/essays/[slug]/page.tsx`.

- [ ] **Step 1: Pass the founder author on essays.** In `src/app/[locale]/(app)/essays/[slug]/page.tsx`, add `FOUNDER_NAME` to the `@/shared/seo` import (`:11-19`) — insert after `parseEssaySlug,` (`:18`):
```ts
  parseEssaySlug,
  FOUNDER_NAME,
} from '@/shared/seo';
```
Then in the `articleSchema` call (`:92-98`), add the explicit author (documents authorship even though the generator already defaults to it):
```ts
  const articleLd = articleSchema({
    title: meta.title,
    description: meta.description,
    url: canonicalUrl,
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt,
    // Explicit named author — essays are founder-authored (E-E-A-T; seo-p2/T13).
    authorName: FOUNDER_NAME,
  });
```

- [ ] **Step 2: Full suite + typecheck + lint.** `npm test && npm run typecheck && npm run lint` → all green. (Lint: per memory `feedback_lint_worktrees_pollution`, ignore `.claude/worktrees/` noise; the changed `src/` files must be clean.)

- [ ] **Step 3: SSR curl gate (catches empty-shell + head-schema issues unit tests can't see).** `npm run build && npm run start`, then in another shell:
```bash
# /about + /es/about render an <h1> and are indexable (no noindex)
curl -s http://localhost:3000/about    | grep -c "<h1"
curl -s http://localhost:3000/es/about | grep -c "<h1"
curl -s http://localhost:3000/about    | grep -i 'name="robots"' || echo "no robots noindex (expected)"
# Person JSON-LD present with the founder name, in the SSR HTML
curl -s http://localhost:3000/about    | grep -o '"@type":"Person"'
curl -s http://localhost:3000/about    | grep -o 'Kirill Kovalenko' | head -1
# Organization now carries a founder anchor (from the marketing layout)
curl -s http://localhost:3000/about    | grep -o '"founder"'
# An essay's Article author is now a Person, not Organization
curl -s http://localhost:3000/essays/sun-in-aries | grep -o '"author":{"@type":"Person"'
# /about is canonical per locale
curl -s http://localhost:3000/es/about | grep -o '<link rel="canonical"[^>]*>'
# Footer exposes an /about anchor on a marketing page
curl -s http://localhost:3000/pricing  | grep -o 'href="[^"]*/about"' | head -1
```
Expected: `<h1` count `1` for both; no `noindex` on `/about`; `"@type":"Person"` + `Kirill Kovalenko` + `"founder"` all present on `/about`; `"author":{"@type":"Person"` present on the essay; ES canonical contains `/es/about`; a footer `href` ending `/about`.

- [ ] **Step 4: Commit.**
```bash
git add "src/app/[locale]/(app)/essays/[slug]/page.tsx"
git commit -m "feat(seo-p2/T13f): essays pass founder Person author to articleSchema"
```

- [ ] **Step 5 (founder-owned): re-review + expand the bio.** Confirm the ⚠️ re-review gate (publish name + Org→Person author). Then replace the seeded one-liners with the real bio using this **content spec** (keep i18n keys; keep both locales in sync; español neutro LATAM `tú`; do NOT change methodology facts):
  - `about.lead` — 1 sentence, who Estrevia is for + the sidereal promise (hook).
  - `about.founderBio` — 2–4 sentences: founder background, why sidereal + esoteric, credentials/experience that earn E-E-A-T trust vs the "Estreva" drug SERP. **Real, first-person-neutral prose.**
  - `about.bioSchema` — ≤ ~200 chars, factual one-line summary for the `Person.description` schema field (no marketing fluff).
  - Optional: add real `sameAs` profiles (LinkedIn/GitHub/Crunchbase) — extend the page's `KNOWS_ABOUT`/`sameAs` and, off-site, the T19 brand-anchor list.
  - After editing, re-run `npx vitest run "src/app/[locale]/(marketing)/__tests__/about-i18n.test.ts"` (parity + placeholder guard must stay green) and re-run the Step-3 curl checks.

**T13 exit:** `npm test`/`typecheck`/`lint` green; curl gate passes; founder re-review recorded in the PR/commit description (per roadmap §8). Deploy rides the Phase-1 §7 deploy-isolation gate — do not deploy T13 independently of that reconciliation.

---

### P2-T14: Perf — cookie-banner LCP + Meta Pixel consent-gate + Crimson Pro preload

Three independent, low-risk perf fixes that (a) stop the cookie-consent banner being the `/es/` LCP element (7.6 s), (b) gate the 248 KiB Meta Pixel behind cookie consent (perf **and** consent-hygiene), and (c) remove the ~6 preloaded Crimson Pro woff2 variants (155 KiB) from the essay critical path (essay LCP 10.0 s). **Excludes the Clerk route-group move** (deferred to its own spec, roadmap §5). Each fix extracts a pure, unit-testable predicate where one exists; the SSR-only / real-browser guarantees are covered by a mandatory curl + Lighthouse gate at the end.

**Grounded facts driving the design:**
- Banner (`src/shared/components/CookieConsent.tsx`) is `'use client'`, mounted in root `src/app/layout.tsx:85`; `setTimeout(()=>setVisible(true),800)` at `:25`; entrance animation at `:72`; `role="dialog"` at `:58`. Visibility is localStorage-gated (`getCookieConsent()`), so it **cannot** be SSR-rendered visible without flashing for already-consented visitors.
- Meta Pixel base `<Script id="meta-pixel-base" strategy="afterInteractive">` lives in `src/app/[locale]/layout.tsx:57–84` (inline snippet `:60–69`), rendered **unconditionally** when `NEXT_PUBLIC_META_PIXEL_ID` is set — no consent check. All fbq call sites already guard `typeof fbq === 'function'` (MetaPixelLeadEmitter.tsx:38, MetaPixelSubscribeEmitter.tsx:41, EmailGateModal.tsx:172, BirthDataForm.tsx:136, HeroCalculator.tsx:283), so gating cannot throw.
- `src/app/layout.tsx:22–28` declares Crimson Pro with `weight:["300","400","600"]`, `style:["normal","italic"]`, `display:"swap"` and **no `preload` option** → preloaded by default. Italic is genuinely used (`src/app/not-found.tsx:93`), so we keep all variants and only turn off `preload`.
- CSP (`next.config.ts:45`) already allows `'unsafe-inline'` + `https://connect.facebook.net` on `script-src` — no CSP change needed for a client-gated inline `<Script>`.

**Global note for this task:** commit scope is `perf(seo-p2/T14x):` (CLAUDE.md lists `perf(...)` as a valid repo scope). Tests run with `npx vitest run <path>`.

**Files**

New:
- `src/shared/lib/consent.ts` — pure predicates `hasAnalyticsConsent` + `shouldShowConsentBanner` (shared by the banner and the Pixel gate).
- `src/shared/lib/__tests__/consent.test.ts`
- `src/shared/components/MetaPixelGate.tsx` — `'use client'` consent-gated Pixel loader (T14b).
- `src/shared/components/__tests__/MetaPixelGate.test.tsx`
- `src/shared/components/__tests__/CookieConsent.test.tsx`

Modified:
- `src/shared/components/CookieConsent.tsx` — drop 800 ms delay + slow animation, use predicate (T14a).
- `src/app/[locale]/layout.tsx` — replace inline Pixel with `<MetaPixelGate>` (T14b).
- `src/app/[locale]/__tests__/layout.test.tsx` — update to the gated behavior (T14b).
- `src/app/layout.tsx` — `preload: false` on Crimson Pro (T14c).

---

#### T14-pre: Shared pure consent predicates

**Interfaces:** `hasAnalyticsConsent(consent: CookieConsentValue): boolean` (`=== 'accepted'`); `shouldShowConsentBanner(consent: CookieConsentValue): boolean` (`=== null`). Type-only import of `CookieConsentValue` from `PostHogProvider` (erased at compile → `consent.ts` stays React-free and pure).

- [ ] **Step 1: Write the failing test** — create `src/shared/lib/__tests__/consent.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hasAnalyticsConsent, shouldShowConsentBanner } from '../consent';

describe('hasAnalyticsConsent', () => {
  it('is true only when accepted', () => {
    expect(hasAnalyticsConsent('accepted')).toBe(true);
    expect(hasAnalyticsConsent('declined')).toBe(false);
    expect(hasAnalyticsConsent(null)).toBe(false);
  });
});

describe('shouldShowConsentBanner', () => {
  it('is true only when no decision has been made', () => {
    expect(shouldShowConsentBanner(null)).toBe(true);
    expect(shouldShowConsentBanner('accepted')).toBe(false);
    expect(shouldShowConsentBanner('declined')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL:** `npx vitest run src/shared/lib/__tests__/consent.test.ts` → `Failed to resolve import "../consent"`.

- [ ] **Step 3: Implement** — create `src/shared/lib/consent.ts`:
```ts
import type { CookieConsentValue } from '@/shared/components/PostHogProvider';

/**
 * Pure consent-gate predicates. Shared by the cookie banner (which shows only
 * when no decision exists) and the Meta Pixel gate (which loads only after
 * analytics consent). Kept React-free so it unit-tests without a render.
 */
export function hasAnalyticsConsent(consent: CookieConsentValue): boolean {
  return consent === 'accepted';
}

export function shouldShowConsentBanner(consent: CookieConsentValue): boolean {
  return consent === null;
}
```

- [ ] **Step 4: Run it — expect PASS:** `npx vitest run src/shared/lib/__tests__/consent.test.ts` → PASS (2 describe blocks).

- [ ] **Step 5: Commit**
```bash
git add src/shared/lib/consent.ts src/shared/lib/__tests__/consent.test.ts
git commit -m "perf(seo-p2/T14): pure consent-gate predicates (banner + pixel share)"
```

---

#### T14a: Cookie-banner LCP — drop the 800 ms delay + slow entrance

Removes the artificial 800 ms reveal timer and the 500 ms slide-in transform so the banner stops being a large late-painting element. Starts hidden in SSR (no flash for returning visitors); reveals synchronously in the mount effect via the pure predicate.

**File:** modify `src/shared/components/CookieConsent.tsx`; test `src/shared/components/__tests__/CookieConsent.test.tsx`.

- [ ] **Step 1: Write the failing jsdom test** — create `src/shared/components/__tests__/CookieConsent.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Avoid PostHog/analytics side effects during the render.
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: { COOKIE_CONSENT_ACCEPTED: 'accepted', COOKIE_CONSENT_DECLINED: 'declined' },
}));

import { CookieConsent } from '../CookieConsent';
import { COOKIE_CONSENT_KEY } from '../PostHogProvider';

beforeEach(() => {
  window.localStorage.clear();
});

describe('CookieConsent', () => {
  it('reveals the banner on the first effect flush — no 800ms delay', () => {
    render(<CookieConsent />);
    // testing-library wraps render in act(): effects + the synchronous
    // setVisible(true) have already flushed. With the old 800ms setTimeout the
    // dialog would still be absent here (only a timer was scheduled).
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('stays hidden when a decision is already stored', () => {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    render(<CookieConsent />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL:** `npx vitest run src/shared/components/__tests__/CookieConsent.test.tsx` → first case fails: `Unable to find role="dialog"` (old code only schedules the 800 ms timer, so the banner is not present on the first flush).

- [ ] **Step 3: Add the predicate import.** In `src/shared/components/CookieConsent.tsx`, after line 14 (`import type { CookieConsentValue } from './PostHogProvider';`) add:
```ts
import { shouldShowConsentBanner } from '@/shared/lib/consent';
```

- [ ] **Step 4: Replace the delayed reveal effect.** Change `:20–28` from:
```ts
  useEffect(() => {
    const consent = getCookieConsent();
    if (consent === null) {
      // No decision yet — show banner after a short delay so it doesn't
      // flash during initial paint.
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);
```
to:
```ts
  useEffect(() => {
    // Reveal immediately once we know no decision exists — no artificial delay.
    // The old 800ms timer (+500ms slide below) made this banner paint late,
    // which is why Lighthouse clocked it as the /es/ LCP element (7.6s).
    // Starting hidden in SSR still prevents a flash for returning consenters.
    if (shouldShowConsentBanner(getCookieConsent())) {
      setVisible(true);
    }
  }, []);
```

- [ ] **Step 5: Swap the slow transform entrance for a fast fade.** Change `:72` from:
```tsx
        'animate-in slide-in-from-bottom-4 duration-500',
```
to:
```tsx
        'animate-in fade-in duration-200',
```
(Opacity-only fade — no delayed transform paint. `animate-in`/`fade-in` are already provided by tailwindcss-animate, the same plugin the removed classes used.)

- [ ] **Step 6: Run it — expect PASS:** `npx vitest run src/shared/components/__tests__/CookieConsent.test.tsx` → PASS (2). Then `npm run typecheck` → clean.

- [ ] **Step 7: Commit**
```bash
git add src/shared/components/CookieConsent.tsx \
        src/shared/components/__tests__/CookieConsent.test.tsx
git commit -m "perf(seo-p2/T14a): reveal cookie banner immediately (drop 800ms + slide) — fix /es/ LCP"
```

---

#### T14b: Meta Pixel consent-gate

Move the inline Pixel base snippet out of the server layout into a `'use client'` `MetaPixelGate` that loads `fbevents.js` **only after analytics consent**, and subscribes to the existing `estrevia:consent` event to load on later acceptance (mirrors `PostHogProvider`). The `<noscript>` PageView img is dropped — it fired without any consent for a no-JS cohort that cannot use the JS consent banner (all fbq conversion events need JS regardless), so removing it satisfies the consent-hygiene goal with nil attribution impact.

**Files:** create `src/shared/components/MetaPixelGate.tsx` + test; modify `src/app/[locale]/layout.tsx` + its test.

**Interface:** `MetaPixelGate({ pixelId }: { pixelId: string }): JSX.Element | null` — renders `<Script id="meta-pixel-base">` iff `hasAnalyticsConsent(getCookieConsent())` or after an accepted `estrevia:consent` event; otherwise `null`.

- [ ] **Step 1: Write the failing gate test** — create `src/shared/components/__tests__/MetaPixelGate.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import type React from 'react';

// next/script with afterInteractive emits no synchronous body under RTL; stub it
// to a plain <script> so we can assert the inline snippet content.
vi.mock('next/script', () => ({
  default: ({ children, id }: { children?: React.ReactNode; id?: string }) => (
    <script id={id} data-testid="meta-pixel-script">{children}</script>
  ),
}));

import { MetaPixelGate } from '../MetaPixelGate';
import { COOKIE_CONSENT_KEY } from '../PostHogProvider';

beforeEach(() => {
  window.localStorage.clear();
});

describe('MetaPixelGate', () => {
  it('does not load the Pixel without consent', () => {
    const { queryByTestId } = render(<MetaPixelGate pixelId="PIX_TEST" />);
    expect(queryByTestId('meta-pixel-script')).toBeNull();
  });

  it('does not load the Pixel when consent is declined', () => {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    const { queryByTestId } = render(<MetaPixelGate pixelId="PIX_TEST" />);
    expect(queryByTestId('meta-pixel-script')).toBeNull();
  });

  it('loads the Pixel when consent is already accepted', async () => {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    const { findByTestId } = render(<MetaPixelGate pixelId="PIX_TEST" />);
    const script = await findByTestId('meta-pixel-script');
    expect(script.textContent).toContain("fbq('init', 'PIX_TEST')");
    expect(script.textContent).toContain("fbq('track', 'PageView')");
  });

  it('loads the Pixel after a later estrevia:consent acceptance', async () => {
    const { queryByTestId, findByTestId } = render(<MetaPixelGate pixelId="PIX_TEST" />);
    expect(queryByTestId('meta-pixel-script')).toBeNull();
    act(() => {
      window.dispatchEvent(
        new CustomEvent('estrevia:consent', { detail: { consent: 'accepted' } }),
      );
    });
    const script = await findByTestId('meta-pixel-script');
    expect(script.textContent).toContain("fbq('init', 'PIX_TEST')");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL:** `npx vitest run src/shared/components/__tests__/MetaPixelGate.test.tsx` → `Failed to resolve import "../MetaPixelGate"`.

- [ ] **Step 3: Implement the gate** — create `src/shared/components/MetaPixelGate.tsx` (inline snippet copied verbatim from `[locale]/layout.tsx:60–69`):
```tsx
'use client';

/**
 * MetaPixelGate — consent-gated Meta Pixel base loader.
 *
 * Loads connect.facebook.net/en_US/fbevents.js (~248 KiB) ONLY after the user
 * has accepted analytics cookies, mirroring PostHogProvider. Previously the
 * Pixel loaded sitewide with no consent check (perf + consent-hygiene bug).
 * Every fbq() call site already guards `typeof fbq === 'function'`, so events
 * fired before consent simply no-op.
 */

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getCookieConsent } from '@/shared/components/PostHogProvider';
import type { CookieConsentValue } from '@/shared/components/PostHogProvider';
import { hasAnalyticsConsent } from '@/shared/lib/consent';

export function MetaPixelGate({ pixelId }: { pixelId: string }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (hasAnalyticsConsent(getCookieConsent())) {
      setEnabled(true);
      return;
    }
    function onConsent(event: Event) {
      const { detail } = event as CustomEvent<{ consent: CookieConsentValue }>;
      if (detail?.consent === 'accepted') setEnabled(true);
    }
    window.addEventListener('estrevia:consent', onConsent);
    return () => window.removeEventListener('estrevia:consent', onConsent);
  }, []);

  if (!enabled) return null;

  return (
    <Script id="meta-pixel-base" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');`}
    </Script>
  );
}
```

- [ ] **Step 4: Run it — expect PASS:** `npx vitest run src/shared/components/__tests__/MetaPixelGate.test.tsx` → PASS (4).

- [ ] **Step 5: Wire the gate into the locale layout + drop the inline block.** In `src/app/[locale]/layout.tsx`:

(a) Remove the now-unused Script import — delete `:4`:
```ts
import Script from 'next/script';
```
and add (next to the other `@/shared/components` imports, after `:6` `import { UtmCapture } from '@/shared/components/UtmCapture';`):
```ts
import { MetaPixelGate } from '@/shared/components/MetaPixelGate';
```

(b) Replace the entire return block `:55–88` from:
```tsx
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {pixelId ? (
        <>
          <Script id="meta-pixel-base" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');`}
          </Script>
          <noscript>
            {/* next/image requires JS — pointless inside <noscript>. The
                Meta-recommended Pixel fallback is a 1x1 tracking <img>. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      ) : null}
      <UtmCapture />
      {children}
    </NextIntlClientProvider>
  );
```
to:
```tsx
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {/* Meta Pixel is loaded client-side, gated on analytics consent — see
          MetaPixelGate. When NEXT_PUBLIC_META_PIXEL_ID is unset (dev/staging)
          it is omitted entirely. */}
      {pixelId ? <MetaPixelGate pixelId={pixelId} /> : null}
      <UtmCapture />
      {children}
    </NextIntlClientProvider>
  );
```

(c) Update the file header doc comment `:22–25` (Responsibility 4). Change:
```ts
 *  4. Inject the Meta Pixel base snippet (PageView + fbq init) once per
 *     locale-routed page when NEXT_PUBLIC_META_PIXEL_ID is configured —
 *     companion to the server-side CAPI client. If the env var is unset
 *     (dev / staging without Meta Ads), the Pixel quietly no-ops.
```
to:
```ts
 *  4. Mount MetaPixelGate — the Meta Pixel base snippet (PageView + fbq init),
 *     loaded client-side ONLY after analytics consent — when
 *     NEXT_PUBLIC_META_PIXEL_ID is configured. Companion to the server-side
 *     CAPI client. If the env var is unset (dev / staging), it is omitted.
```

- [ ] **Step 6: Update the layout test to the gated behavior.** In `src/app/[locale]/__tests__/layout.test.tsx`:

(a) Remove the `next/script` mock (`:28–44`) — the layout no longer imports `next/script`. Add a `MetaPixelGate` stub mock after the `next/navigation` mock (`:26`):
```tsx
vi.mock('@/shared/components/MetaPixelGate', () => ({
  MetaPixelGate: ({ pixelId }: { pixelId: string }) => (
    <div data-testid="pixel-gate" data-pixel={pixelId} />
  ),
}));
```

(b) Replace the two `it(...)` bodies (`:63–84`). Pixel content is covered by `MetaPixelGate.test.tsx`; here we only assert the gate is wired env-conditionally:
```tsx
  it('mounts MetaPixelGate when NEXT_PUBLIC_META_PIXEL_ID is set', async () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = 'PIX_TEST';
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).toContain('data-testid="pixel-gate"');
    expect(html).toContain('data-pixel="PIX_TEST"');
  });

  it('does NOT mount the Pixel when NEXT_PUBLIC_META_PIXEL_ID is unset', async () => {
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).not.toContain('pixel-gate');
    expect(html).not.toContain('connect.facebook.net');
  });
```
Update the `describe` label `:48` `'LocaleLayout — Meta Pixel injection'` → `'LocaleLayout — Meta Pixel gate wiring'`, and delete the now-stale next/script SSR-note comment `:28–31`.

- [ ] **Step 7: Run both test files — expect PASS:** `npx vitest run src/app/[locale]/__tests__/layout.test.tsx src/shared/components/__tests__/MetaPixelGate.test.tsx` → PASS. Then `npm run typecheck` → clean (Script import removed from layout).

- [ ] **Step 8: Commit**
```bash
git add src/shared/components/MetaPixelGate.tsx \
        src/shared/components/__tests__/MetaPixelGate.test.tsx \
        "src/app/[locale]/layout.tsx" \
        "src/app/[locale]/__tests__/layout.test.tsx"
git commit -m "perf(seo-p2/T14b): gate Meta Pixel behind analytics consent (perf + consent-hygiene)"
```

---

#### T14c: Crimson Pro `preload: false`

Removes every Crimson Pro `<link rel="preload" as="font">` from the critical path (the "155 KiB preloaded" cost) without dropping any weight/style — `display:"swap"` keeps them all, loaded lazily when a `.font-esoteric` / `var(--font-crimson-pro)` element renders. Zero visual change. (Roadmap's "4 variants" is imprecise: the config declares up to 6 = 3 weights × 2 styles; `preload:false` removes all of them regardless.) No unit test — next/font preload internals aren't unit-testable here; covered by the curl gate below.

**File:** modify `src/app/layout.tsx`.

- [ ] **Step 1: Turn off preload.** Change `:21–28` from:
```ts
// Crimson Pro — esoteric headings, body text in essays
const crimsonPro = Crimson_Pro({
  variable: "--font-crimson-pro",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  style: ["normal", "italic"],
  display: "swap",
});
```
to:
```ts
// Crimson Pro — esoteric headings, body text in essays.
// preload:false keeps it off the critical preload path (it loads lazily via
// display:swap when first used). Geist (body / LCP text) stays preloaded.
// Fixes the essay/`/es/` LCP font cost (~155 KiB of preloaded woff2 variants).
const crimsonPro = Crimson_Pro({
  variable: "--font-crimson-pro",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
```

- [ ] **Step 2: Type + lint check** (no test asserts font preload): `npm run typecheck && npm run lint`
Expected: clean for `src/app/layout.tsx` (ignore pre-existing `.claude/worktrees/` lint noise per memory `feedback_lint_worktrees_pollution` — grep the output for `src/` paths only).

- [ ] **Step 3: Commit**
```bash
git add src/app/layout.tsx
git commit -m "perf(seo-p2/T14c): Crimson Pro preload:false — 155 KiB off the essay critical path"
```

---

#### T14-verify: Integration gate (curl SSR + Lighthouse)

Behavioral fixes — unit tests cover the pure logic; this gate confirms the real HTML/field behavior. Run against a production build.

- [ ] **Step 1: Full suite green:** `npm test && npm run typecheck` → all green.

- [ ] **Step 2: Build + start** (Pixel env set locally so the gate has something to gate):
```bash
NEXT_PUBLIC_META_PIXEL_ID=PIX_LOCAL npm run build && NEXT_PUBLIC_META_PIXEL_ID=PIX_LOCAL npm run start
```

- [ ] **Step 3: Pixel is consent-gated (deterministic).** With no consent cookie, the Pixel snippet must be absent from initial SSR HTML:
```bash
curl -s http://localhost:3000/es | grep -c 'connect.facebook.net'   # expect 0
curl -s http://localhost:3000/en | grep -c 'connect.facebook.net'   # expect 0
```
Expected `0` on both (before this task it was `1` — the inline snippet shipped in every SSR page). Manual browser check: accept cookies → `fbevents.js` request appears in Network; decline → it never loads.

- [ ] **Step 4: Crimson Pro no longer preloaded (relative check — next/font names are hashed).** Count `as="font"` preload links; the Crimson variants must be gone (Geist remains):
```bash
curl -s http://localhost:3000/en/essays/sun-in-aries \
  | grep -o '<link[^>]*rel="preload"[^>]*as="font"[^>]*>' | wc -l
```
Expected: the count drops by the number of Crimson variants vs. a pre-change build (Crimson removed; Geist/Geist_Mono preloads remain). For an exact diff, stash the same grep output from a pre-change build and compare.

- [ ] **Step 5: Cookie banner is no longer the LCP element (Lighthouse mobile).** Run against the two audited pages:
```bash
npx lighthouse http://localhost:3000/es --only-categories=performance \
  --form-factor=mobile --screenEmulation.mobile --quiet --chrome-flags="--headless" \
  --output=json --output-path=/tmp/lh-es.json
node -e "const r=require('/tmp/lh-es.json');console.log('LCP',r.audits['largest-contentful-paint'].displayValue);console.log('LCP element',JSON.stringify(r.audits['largest-contentful-paint-element']?.details?.items?.[0]?.node?.selector))"

npx lighthouse http://localhost:3000/en/essays/sun-in-aries --only-categories=performance \
  --form-factor=mobile --screenEmulation.mobile --quiet --chrome-flags="--headless" \
  --output=json --output-path=/tmp/lh-essay.json
node -e "const r=require('/tmp/lh-essay.json');console.log('LCP',r.audits['largest-contentful-paint'].displayValue)"
```
Expected: `/es` LCP element is the hero/H1 (NOT the cookie-consent dialog); `/es` LCP well under the 7.6 s baseline; essay LCP under the 10.0 s baseline. (Local numbers are not prod field data — real confirmation is CrUX/PageSpeed post-deploy; see Step 6.)

- [ ] **Step 6: Post-deploy field check (after Phase-1's deploy ships).** Re-run PageSpeed/CrUX on `estrevia.app/es/` + an essay at +2 wk / +4 wk (via the `seo-google` skill / PageSpeed Insights v5) and confirm LCP trends down and the LCP element is no longer the banner. In Meta Events Manager: verify Pixel PageView/Lead/Subscribe still fire for consented users (dedupe with CAPI unchanged); decliners send zero browser events (expected).

**Founder-facing note:** gating the Pixel on consent means users who decline or haven't decided fire **no browser Pixel events** — attribution for that cohort falls back to server-side CAPI only. This is the intended, compliant behavior and the roadmap's stated goal; it is a deliberate trade vs. the prior consent-free sitewide Pixel.


---

### P2-BATCH: Batch cleanups — robots.txt group merge, sitemap /support + /tarot/spread, essay MDX `node` prop leak

Three small, independent Phase-2 cleanups, each with its own failing-test-first cycle and its own commit. All three are grounded against verified repo state (react-markdown@10.1.0; current sitemap=670 entries; robots emits two `User-Agent: *` groups). Part B depends on Phase-1 T2 having already dropped the 156 compat-pair URLs (sitemap → 514); if run before Phase-1 lands, the presence/balance assertions still pass and the absolute-count reconciliation in Step B4 is a no-op.

**Commit scopes:** `fix(seo-p2/batch): …` / `feat(seo-p2/batch): …`.

**Files**
- Modify: `src/app/robots.ts` (merge groups)
- New: `src/shared/seo/__tests__/robots.test.ts`
- Modify: `src/app/sitemap.ts` (+2 static entries)
- Modify: `src/shared/seo/__tests__/sitemap.test.ts` (presence + count)
- New: `src/modules/esoteric/components/proseComponents.tsx` (extracted map, `node` stripped)
- Modify: `src/modules/esoteric/components/EssayPage.tsx` (delete inline map, import it)
- New: `src/modules/esoteric/components/__tests__/proseComponents.test.tsx`
- Modify: `eslint.config.mjs` (`ignoreRestSiblings` so the `{node, …props}` omit is lint-clean)

---

#### Part A — Merge the two `User-Agent: *` groups in `robots.ts`

`src/app/robots.ts:22-36` returns **two** rule objects both keyed `userAgent: '*'`. Per the robots.txt grouping rule a crawler obeys only the first matching group, so the second group's `/api/og/`, `/api/v1/docs`, `/api/v1/sidereal/` allowances are unreachable. Merge into one group; longest-match keeps the specific `/api/…` Allows overriding the broad `/api/` Disallow.

- [ ] **A1 — Write the failing test.** Create `src/shared/seo/__tests__/robots.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import robots from '@/app/robots';
import { SITE_URL } from '../constants';

describe('robots.txt', () => {
  it('exposes exactly one User-Agent group (merged)', () => {
    const { rules } = robots();
    const groups = Array.isArray(rules) ? rules : [rules];
    expect(groups).toHaveLength(1);
    expect(groups[0].userAgent).toBe('*');
  });

  it('keeps every allow/disallow after the merge (nothing dropped)', () => {
    const { rules } = robots();
    const group = Array.isArray(rules) ? rules[0] : rules;
    const allow = ([] as string[]).concat(group.allow ?? []);
    const disallow = ([] as string[]).concat(group.disallow ?? []);
    expect(allow).toEqual(
      expect.arrayContaining(['/', '/api/og/', '/api/v1/docs', '/api/v1/sidereal/']),
    );
    expect(disallow).toEqual(expect.arrayContaining(['/api/', '/s/']));
  });

  it('still advertises the sitemap', () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
```

- [ ] **A2 — Run it; verify RED.** `npx vitest run src/shared/seo/__tests__/robots.test.ts`
Expected: FAIL — `rules` is a 2-element array (`toHaveLength(1)` fails), and `rules[0].allow` is only `'/'` (the `arrayContaining` for `/api/og/` fails).

- [ ] **A3 — Merge the groups.** In `src/app/robots.ts`, replace the `rules` array (`:22-36`):
```ts
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/s/'],
      },
      {
        // Allow public API surfaces explicitly — these override the /api/ disallow
        // above. OG images power Google rich previews & social sharing; /api/v1/docs
        // and /api/v1/sidereal/ are intentionally public + documented in OpenAPI 3.1
        // so that LLM crawlers can discover and cite the sidereal sun-sign endpoint.
        userAgent: '*',
        allow: ['/api/og/', '/api/v1/docs', '/api/v1/sidereal/'],
      },
    ],
```
with a single merged group:
```ts
    rules: [
      {
        // Single User-Agent group for all crawlers. robots.txt matching is
        // longest-match, so the specific /api/og/, /api/v1/docs and
        // /api/v1/sidereal/ Allows override the broad /api/ Disallow, while
        // everything else under /api/ (and every /s/ share page) stays blocked.
        // Previously these lived in a SECOND `User-Agent: *` group that a crawler
        // never reached (it obeys only the first matching group) — now merged.
        userAgent: '*',
        allow: ['/', '/api/og/', '/api/v1/docs', '/api/v1/sidereal/'],
        disallow: ['/api/', '/s/'],
      },
    ],
```

- [ ] **A4 — Run it; verify GREEN.** `npx vitest run src/shared/seo/__tests__/robots.test.ts` → PASS (3 tests).

- [ ] **A5 — Commit.**
```bash
git add src/app/robots.ts src/shared/seo/__tests__/robots.test.ts
git commit -m "fix(seo-p2/batch): merge duplicate robots.txt User-Agent groups"
```

---

#### Part B — Add `/support` + `/tarot/spread` to the sitemap

Both pages exist and are index-eligible (each calls `createMetadata()` with no `noIndex`): `src/app/[locale]/(marketing)/support/page.tsx` and `src/app/[locale]/(app)/tarot/spread/page.tsx`. Neither is in the sitemap today (verified: sitemap() returns 0 matches for either). `/tarot/spread` already ranks pos 2 in GSC — surfacing it is pure upside. Use the existing `emitLocalized` + `lastModifiedFor('static', <page.tsx path>)` pattern so each emits EN + ES with correct hreflang and git-mtime freshness.

- [ ] **B1 — Write the failing test.** Append to `src/shared/seo/__tests__/sitemap.test.ts`. First add the constants import at the top of the file, next to the existing `import sitemap from '@/app/sitemap';`:
```ts
import { SITE_URL } from '../constants';
```
Then append this block:
```ts
describe('support + tarot spread in sitemap (seo-p2 batch)', () => {
  it('includes /support for EN and ES', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}/support`);
    expect(urls).toContain(`${SITE_URL}/es/support`);
  });

  it('includes /tarot/spread for EN and ES', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}/tarot/spread`);
    expect(urls).toContain(`${SITE_URL}/es/tarot/spread`);
  });

  it('keeps EN and ES entry counts balanced', () => {
    const entries = sitemap();
    const en = entries.filter((e) => !/\/es(\/|$)/.test(e.url));
    const es = entries.filter((e) => /\/es(\/|$)/.test(e.url));
    expect(en.length).toBe(es.length);
  });
});
```

- [ ] **B2 — Run it; verify RED.** `npx vitest run src/shared/seo/__tests__/sitemap.test.ts -t "support + tarot spread"`
Expected: FAIL — neither URL is emitted yet (both `toContain` fail).

- [ ] **B3 — Add the two entries in `src/app/sitemap.ts`.**

(a) `/tarot/spread` — insert into `appPages` right after the `/tarot` entry. Change (`:202-207`):
```ts
    ...emitLocalized('/tarot', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/tarot/page.tsx'),
      changeFrequency: 'weekly',
      priority: 0.8,
    }),
    ...emitLocalized('/tree-of-life', {
```
to:
```ts
    ...emitLocalized('/tarot', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/tarot/page.tsx'),
      changeFrequency: 'weekly',
      priority: 0.8,
    }),
    ...emitLocalized('/tarot/spread', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/tarot/spread/page.tsx'),
      changeFrequency: 'weekly',
      priority: 0.7,
    }),
    ...emitLocalized('/tree-of-life', {
```

(b) `/support` — insert into `staticPages`, after the `/signs` entry, before the block's closing `];`. Change (`:173-178`):
```ts
    ...emitLocalized('/signs', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/signs/page.tsx'),
      changeFrequency: 'monthly',
      priority: 0.85,
    }),
  ];
```
to:
```ts
    ...emitLocalized('/signs', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(app)/signs/page.tsx'),
      changeFrequency: 'monthly',
      priority: 0.85,
    }),
    // Support / contact page — indexable (createMetadata, no noIndex).
    ...emitLocalized('/support', {
      lastModified: lastModifiedFor('static', 'src/app/[locale]/(marketing)/support/page.tsx'),
      changeFrequency: 'monthly',
      priority: 0.4,
    }),
  ];
```

- [ ] **B4 — Reconcile the absolute-count assertion.** The base sitemap is 670; after Phase-1 T2 drops the 156 compat pairs it is 514, and Phase-1's plan adds a hard `expect(sitemap()).toHaveLength(514)` to this file. This task adds 4 entries (`/support` + `/tarot/spread`, each ×2 locales). If that hard assertion is present, bump it:
```
-    expect(sitemap()).toHaveLength(514);
+    expect(sitemap()).toHaveLength(518);
```
If only the pre-existing loose bound `expect(entries.length).toBeGreaterThanOrEqual(442)` is present (Phase-1 not yet merged), leave it — it still holds, and the presence/balance tests above cover the addition.

- [ ] **B5 — Run it; verify GREEN.** `npx vitest run src/shared/seo/__tests__/sitemap.test.ts` → PASS (all existing + 3 new). `en.length === es.length` stays true (each new path emits one EN + one ES).

- [ ] **B6 — Commit.**
```bash
git add src/app/sitemap.ts src/shared/seo/__tests__/sitemap.test.ts
git commit -m "feat(seo-p2/batch): add /support + /tarot/spread to sitemap"
```

---

#### Part C — Fix the `node="[object Object]"` React prop leak on essay MDX

react-markdown@10.1.0 passes a `node` (hast Element) prop to **every** custom component in `PROSE_COMPONENTS` (`EssayPage.tsx:56-154`). Each component spreads `{...props}` onto its DOM element, so `node` — untyped by `React.ComponentProps<'p'>` but present at runtime — is written to the DOM as `node="[object Object]"`. **Verified empirically:** current `<p>` renders `<p node="[object Object]" class="…">…</p>`; the destructure yields clean `<p class="…">…</p>`. The leak is on all 14 components (p, h2, h3, ul, li, strong, em, blockquote, table, thead, th, td, code, hr), not just `<p>`. The map is a private inline const and importing `EssayPage.tsx` into vitest drags in `next-intl/server` + client children, so extract the map to a dependency-light module to make it unit-testable.

- [ ] **C1 — Extract the map UNCHANGED (still leaky) to make it importable.** Create `src/modules/esoteric/components/proseComponents.tsx` by moving the `const PROSE_COMPONENTS = { … } as const;` block (`EssayPage.tsx:56-154`) verbatim, `export`ed. (No `import React` needed — `React.ComponentProps` resolves via the `@types/react` UMD global, exactly as in `EssayPage.tsx` which has no React import either. No `'use client'` — these are plain presentational components rendered inside the RSC tree, as they are today.) File content, verbatim, still leaking:
```tsx
/**
 * Prose component map for react-markdown essay rendering (extracted from
 * EssayPage so it can be unit-tested in isolation).
 */
export const PROSE_COMPONENTS = {
  h2: ({ children, ...props }: React.ComponentProps<'h2'>) => (
    <h2
      {...props}
      className="mt-10 mb-4 text-xl font-semibold text-white/90 font-[var(--font-geist-sans)] tracking-tight border-b border-white/6 pb-2"
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.ComponentProps<'h3'>) => (
    <h3
      {...props}
      className="mt-7 mb-3 text-base font-medium text-white/80 font-[var(--font-geist-sans)]"
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }: React.ComponentProps<'p'>) => (
    <p
      {...props}
      className="mb-5 text-base text-white/70 leading-[1.8] font-[var(--font-crimson-pro),_'Crimson_Pro',_Georgia,_serif]"
    >
      {children}
    </p>
  ),
  ul: ({ children, ...props }: React.ComponentProps<'ul'>) => (
    <ul {...props} className="mb-5 space-y-2 pl-5">
      {children}
    </ul>
  ),
  li: ({ children, ...props }: React.ComponentProps<'li'>) => (
    <li
      {...props}
      className="text-base text-white/65 leading-[1.75] font-[var(--font-crimson-pro),_'Crimson_Pro',_Georgia,_serif] list-disc marker:text-white/25"
    >
      {children}
    </li>
  ),
  strong: ({ children, ...props }: React.ComponentProps<'strong'>) => (
    <strong {...props} className="font-semibold text-white/85">
      {children}
    </strong>
  ),
  em: ({ children, ...props }: React.ComponentProps<'em'>) => (
    <em {...props} className="italic text-white/75">
      {children}
    </em>
  ),
  blockquote: ({ children, ...props }: React.ComponentProps<'blockquote'>) => (
    <blockquote
      {...props}
      className="my-6 border-l-2 border-white/15 pl-5 text-sm text-white/40 italic font-[var(--font-geist-sans)]"
    >
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }: React.ComponentProps<'table'>) => (
    <div className="overflow-x-auto my-6 rounded-xl border border-white/8">
      <table {...props} className="w-full text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: React.ComponentProps<'thead'>) => (
    <thead {...props} className="bg-white/5 border-b border-white/8">
      {children}
    </thead>
  ),
  th: ({ children, ...props }: React.ComponentProps<'th'>) => (
    <th
      {...props}
      className="px-4 py-2.5 text-left text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]"
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.ComponentProps<'td'>) => (
    <td
      {...props}
      className="px-4 py-2.5 text-white/65 border-t border-white/5 font-[var(--font-geist-sans)]"
    >
      {children}
    </td>
  ),
  code: ({ children, ...props }: React.ComponentProps<'code'>) => (
    <code
      {...props}
      className="font-[var(--font-geist-mono)] text-xs bg-white/6 border border-white/8 rounded px-1.5 py-0.5 text-white/75"
    >
      {children}
    </code>
  ),
  hr: (props: React.ComponentProps<'hr'>) => (
    <hr {...props} className="my-8 border-white/8" />
  ),
} as const;
```
Then in `src/modules/esoteric/components/EssayPage.tsx`: (i) delete the section-comment + the entire `const PROSE_COMPONENTS = { … } as const;` block (`:52-154`); (ii) add the import after the `ReactMarkdown` import (`:17`):
```ts
import { PROSE_COMPONENTS } from './proseComponents';
```
The sole consumer `<ReactMarkdown components={PROSE_COMPONENTS}>` (`:248`) is unchanged. Verify the move compiled: `npm run typecheck` → PASS (pure relocation, no behavior change).

- [ ] **C2 — Write the failing test.** Create `src/modules/esoteric/components/__tests__/proseComponents.test.tsx` (node env — `renderToStaticMarkup` needs no DOM; verified working):
```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PROSE_COMPONENTS } from '../proseComponents';

// Stand-in for the hast `node` prop react-markdown passes to every component.
const fakeNode = { type: 'element', tagName: 'p', properties: {}, children: [] };

describe('PROSE_COMPONENTS never leak react-markdown `node` to the DOM', () => {
  for (const tag of Object.keys(PROSE_COMPONENTS)) {
    it(`<${tag}> renders no node="[object Object]" attribute`, () => {
      const Comp = PROSE_COMPONENTS[tag as keyof typeof PROSE_COMPONENTS];
      // Pass no children: <hr> is a void element and throws if given any.
      const html = renderToStaticMarkup(createElement(Comp as never, { node: fakeNode }));
      expect(html).not.toContain('node=');
      expect(html).not.toContain('[object Object]');
    });
  }

  it('still renders paragraph children after stripping node', () => {
    const html = renderToStaticMarkup(
      createElement(PROSE_COMPONENTS.p as never, { node: fakeNode, children: 'hello world' }),
    );
    expect(html).toContain('hello world');
    expect(html).not.toContain('node=');
  });
});
```

- [ ] **C3 — Run it; verify RED.** `npx vitest run src/modules/esoteric/components/__tests__/proseComponents.test.tsx`
Expected: FAIL — every leaky component renders `node="[object Object]"` (e.g. `<p node="[object Object]" class="…">`), so `not.toContain('node=')` fails.

- [ ] **C4 — Apply the fix: strip `node` from all 14 components.** In `src/modules/esoteric/components/proseComponents.tsx` add the type import at the top:
```ts
import type { ExtraProps } from 'react-markdown';
```
and update the doc-comment + each component to destructure `node` out of the spread and widen the param type with `& ExtraProps`. Replace the whole `export const PROSE_COMPONENTS = { … } as const;` with:
```tsx
/**
 * Prose component map for react-markdown essay rendering.
 *
 * react-markdown (v10) passes each custom component a `node` prop (the hast
 * element). Spreading it onto the DOM element leaked `node="[object Object]"`
 * into the SSR HTML on every tag. Each component destructures `node` out of the
 * spread (typed via react-markdown's ExtraProps) so it never reaches the DOM.
 */
export const PROSE_COMPONENTS = {
  h2: ({ node, children, ...props }: React.ComponentProps<'h2'> & ExtraProps) => (
    <h2
      {...props}
      className="mt-10 mb-4 text-xl font-semibold text-white/90 font-[var(--font-geist-sans)] tracking-tight border-b border-white/6 pb-2"
    >
      {children}
    </h2>
  ),
  h3: ({ node, children, ...props }: React.ComponentProps<'h3'> & ExtraProps) => (
    <h3
      {...props}
      className="mt-7 mb-3 text-base font-medium text-white/80 font-[var(--font-geist-sans)]"
    >
      {children}
    </h3>
  ),
  p: ({ node, children, ...props }: React.ComponentProps<'p'> & ExtraProps) => (
    <p
      {...props}
      className="mb-5 text-base text-white/70 leading-[1.8] font-[var(--font-crimson-pro),_'Crimson_Pro',_Georgia,_serif]"
    >
      {children}
    </p>
  ),
  ul: ({ node, children, ...props }: React.ComponentProps<'ul'> & ExtraProps) => (
    <ul {...props} className="mb-5 space-y-2 pl-5">
      {children}
    </ul>
  ),
  li: ({ node, children, ...props }: React.ComponentProps<'li'> & ExtraProps) => (
    <li
      {...props}
      className="text-base text-white/65 leading-[1.75] font-[var(--font-crimson-pro),_'Crimson_Pro',_Georgia,_serif] list-disc marker:text-white/25"
    >
      {children}
    </li>
  ),
  strong: ({ node, children, ...props }: React.ComponentProps<'strong'> & ExtraProps) => (
    <strong {...props} className="font-semibold text-white/85">
      {children}
    </strong>
  ),
  em: ({ node, children, ...props }: React.ComponentProps<'em'> & ExtraProps) => (
    <em {...props} className="italic text-white/75">
      {children}
    </em>
  ),
  blockquote: ({ node, children, ...props }: React.ComponentProps<'blockquote'> & ExtraProps) => (
    <blockquote
      {...props}
      className="my-6 border-l-2 border-white/15 pl-5 text-sm text-white/40 italic font-[var(--font-geist-sans)]"
    >
      {children}
    </blockquote>
  ),
  table: ({ node, children, ...props }: React.ComponentProps<'table'> & ExtraProps) => (
    <div className="overflow-x-auto my-6 rounded-xl border border-white/8">
      <table {...props} className="w-full text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ node, children, ...props }: React.ComponentProps<'thead'> & ExtraProps) => (
    <thead {...props} className="bg-white/5 border-b border-white/8">
      {children}
    </thead>
  ),
  th: ({ node, children, ...props }: React.ComponentProps<'th'> & ExtraProps) => (
    <th
      {...props}
      className="px-4 py-2.5 text-left text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]"
    >
      {children}
    </th>
  ),
  td: ({ node, children, ...props }: React.ComponentProps<'td'> & ExtraProps) => (
    <td
      {...props}
      className="px-4 py-2.5 text-white/65 border-t border-white/5 font-[var(--font-geist-sans)]"
    >
      {children}
    </td>
  ),
  code: ({ node, children, ...props }: React.ComponentProps<'code'> & ExtraProps) => (
    <code
      {...props}
      className="font-[var(--font-geist-mono)] text-xs bg-white/6 border border-white/8 rounded px-1.5 py-0.5 text-white/75"
    >
      {children}
    </code>
  ),
  hr: ({ node, ...props }: React.ComponentProps<'hr'> & ExtraProps) => (
    <hr {...props} className="my-8 border-white/8" />
  ),
} as const;
```
(`hr` has no `children` — destructure only `node`.)

- [ ] **C5 — Keep the `{node, …props}` omit lint-clean.** Without this, the 14 discarded `node` bindings each raise a `@typescript-eslint/no-unused-vars` warning (verified: 2 warnings on a 2-component fixture; `no-unused-vars` is `'warn'` with default options here, so `ignoreRestSiblings` is false). In `eslint.config.mjs`, add the override inside the existing `rules` block (`:8-14`). Change:
```js
  {
    rules: {
      // React Hooks v7 (Next 16) rules — downgrade to warnings until existing
      // effects/components are refactored. Not blocking for production.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
```
to:
```js
  {
    rules: {
      // Allow the `{ node, ...props }` omit-a-prop pattern: react-markdown passes
      // a `node` prop to every custom component and we strip it before spreading
      // onto the DOM. ignoreRestSiblings makes the discarded sibling lint-clean.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // React Hooks v7 (Next 16) rules — downgrade to warnings until existing
      // effects/components are refactored. Not blocking for production.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
```
(Verified: with `ignoreRestSiblings: true` the fixture lints to 0 problems.)

- [ ] **C6 — Run tests + types + targeted lint; verify GREEN.**
```bash
npx vitest run src/modules/esoteric/components/__tests__/proseComponents.test.tsx
npm run typecheck
npx eslint src/modules/esoteric/components/proseComponents.tsx
```
Expected: 15 tests PASS; typecheck PASS (the `& ExtraProps` map still satisfies react-markdown's `Components` at the `components={PROSE_COMPONENTS}` call site — it was already assignable with the looser type); eslint prints **0 problems** for the new file.

- [ ] **C7 — Commit.**
```bash
git add src/modules/esoteric/components/proseComponents.tsx \
        "src/modules/esoteric/components/EssayPage.tsx" \
        src/modules/esoteric/components/__tests__/proseComponents.test.tsx \
        eslint.config.mjs
git commit -m "fix(seo-p2/batch): stop react-markdown node prop leaking onto essay DOM"
```

---

#### Verification gate (whole batch)

- [ ] **V1 — Suite + types + lint.** `npm test && npm run typecheck && npm run lint`
Expected: all green. Per memory `feedback_lint_worktrees_pollution`, ignore pre-existing `.claude/worktrees/` noise — grep the lint output for `src/` paths; the four changed `src/` files (+ `eslint.config.mjs`) must be clean.

- [ ] **V2 — SSR curl-verify (the guarantees unit tests can't see).** With a local server (`npm run build && npm run start`, or `npm run dev`):
```bash
# robots: exactly ONE User-agent group, and the API allows survive
curl -s http://localhost:3000/robots.txt | grep -c '^User-[Aa]gent: \*'   # expect 1
curl -s http://localhost:3000/robots.txt | grep -E 'Allow: /api/(og|v1)'   # present
# sitemap: the two new URLs are emitted (EN + ES each)
curl -s http://localhost:3000/sitemap.xml | grep -o 'https://[^<]*/support' | sort -u          # 2
curl -s http://localhost:3000/sitemap.xml | grep -o 'https://[^<]*/tarot/spread' | sort -u      # 2
# MDX leak gone in server-rendered essay HTML (pick a real EN + ES slug)
curl -s http://localhost:3000/essays/sun-in-aries    | grep -c 'node="\[object Object\]"'   # expect 0
curl -s http://localhost:3000/es/essays/sun-in-aries | grep -c 'node="\[object Object\]"'   # expect 0
```
Expected: robots `User-agent: *` count = 1; both API Allow lines present; `/support` and `/tarot/spread` each appear twice in the sitemap; `node="[object Object]"` count = 0 on both essay locales (was ≥1 pre-fix).

- [ ] **V3 — Deploy** rides the Phase-1 deploy gate (roadmap §7); these three commits ship with the rest of Phase 2. No separate ops steps.