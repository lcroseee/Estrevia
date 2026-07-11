# SEO Remediation — Phase 1 (Recrawl Unblock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the two structurally-defective cohorts (tarot crash + orphans, thin compatibility) from dragging sitewide crawl-quality, and emit correct SEO signals sitewide, so a GSC recrawl request is worth making.

**Architecture:** Six code fixes + one founder-owned pre-flight gate + one founder-owned post-deploy ops step. Each code fix extracts a small **pure helper** (the repo's SEO test style — there is no async-server-component render harness) so it's unit-testable; the empty-SSR-shell guarantee that unit tests cannot see is covered by a mandatory `curl`-verify integration gate. All work lands on `main` (direct-to-main workflow).

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript 6 strict, next-intl, Vitest, Tailwind 4. Tests run with `npx vitest run <path>`.

## Global Constraints

- **Test runner:** `npx vitest run <path>` (single file), `npm test` (all). Type check: `npm run typecheck`. Lint: `npm run lint`. Copied verbatim from CLAUDE.md.
- **Zero-fail policy** on changed paths (auth/encryption/payment untouched here, but the SEO suite must stay green).
- **PII:** none of these tasks touch birth data — do not introduce any.
- **i18n:** Spanish = español neutro LATAM, `tú`. Sign names untranslated; planet names translated. (Relevant only to copy in T5.)
- **SEO single source of truth:** metadata via `createMetadata()` (`src/shared/seo/metadata.ts`); JSON-LD via `src/shared/seo/json-ld.ts`. New SEO utilities go in `src/shared/seo/`, never in feature folders.
- **SITE_URL** resolves to `https://estrevia.app` in the test env (from `src/shared/seo/constants.ts`). Import it in tests rather than hardcoding.
- **Commit style:** `fix(seo-p1/T<n>): …` / `feat(seo-p1/T<n>): …`, matching repo scope conventions.
- **Deploy is NOT isolated** (see Task 0): the first prod deploy since 2026-05-30 ships everything on `main`. Task 0 gates the deploy step, not the code tasks.

---

## File Structure

**New files:**
- `src/modules/esoteric/lib/tarotCards.ts` — pure card-data shaping: `buildCorrespondenceRows` (T1a) + `groupTarotCards` (T1b).
- `src/modules/esoteric/lib/faq.ts` — `extractFaqItems` moved out of the essay page, made bilingual (T6a).
- `src/shared/seo/essay-urls.ts` — `essayLocaleUrls` locale-aware URL builder for essay JSON-LD (T4).
- `src/modules/esoteric/lib/__tests__/tarotCards.test.ts`, `.../faq.test.ts`, `src/shared/seo/__tests__/essay-urls.test.ts` — new unit tests.

**Modified files:**
- `src/app/[locale]/(app)/tarot/[cardId]/page.tsx` — nullable interface + use `buildCorrespondenceRows` (T1a).
- `src/app/[locale]/(app)/tarot/page.tsx` — server-rendered 78-anchor grid via `groupTarotCards` (T1b).
- `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx` — `robots: {index:false, follow:true}` (T2).
- `src/app/sitemap.ts` — drop compat pairs; hreflang `en-US`→`en` (T2 + T6b).
- `src/shared/seo/json-ld.ts` — logo `/logo.png`→`/icons/icon-512.png` (T3).
- `src/app/[locale]/(app)/essays/[slug]/page.tsx` — locale-aware JSON-LD URLs + import moved FAQ helper (T4 + T6a).
- `src/shared/seo/metadata.ts` — hreflang `en-US`→`en` (T6b).
- `messages/es.json` — `pageMeta.landing` calculator copy (T5); `tarotPage.browseAllHeading` key (T1b).
- `messages/en.json` — `tarotPage.browseAllHeading` key (T1b).
- `src/shared/seo/__tests__/json-ld.test.ts`, `.../metadata.test.ts`, `.../sitemap.test.ts` — update assertions the fixes change.

---

## Task 0: Deploy-isolation pre-flight gate (founder-owned; blocks deploy, not code)

**No code. This gate must be cleared before Task 9's deploy/ops steps — code Tasks 1–8 proceed regardless.**

- [ ] **Step 1: Inventory what a deploy would ship**

Run:
```bash
git log --oneline 7241c3b..HEAD   # SEO commits added by this plan, on top of…
git log --oneline dpl..7241c3b 2>/dev/null || git log --oneline -12   # …41 days of unpushed main (HALF50, anon-payer fix, migrations 0013–0018)
git status --short
```
Expected: confirm the SEO commits sit atop the HALF50 discount + anon-payer work. **The prod deploy in Task 9 ships all of it.**

- [ ] **Step 2: Confirm prod migration + env state**

Verify with the founder, before deploying:
- DB migrations 0013–0018 status in prod (HALF50 tables etc.) — will the SEO deploy trigger/require them?
- `COMPANY_POSTAL_ADDRESS` **is set in Vercel prod** (memory `feedback_email_postal_address_gate`: `EmailLayout` throws on any commercial email without it — a deploy that enables sends would break email rendering otherwise).
- Whether the gated HALF50 blast is intended to go live with this deploy or must stay gated.

- [ ] **Step 3: Record the decision**

Founder decides: (a) ship SEO fixes together with the accumulated `main` work, or (b) hold and isolate. Write the choice into the PR/commit description. **Do not run Task 9's deploy until this is resolved.**

---

## Task 1: Tarot minor-arcana SSR crash guard (T1a) · P0

Fixes the TypeError at `tarot/[cardId]/page.tsx:239` (`card.treeOfLifeConnects.join(...)`) that crashes SSR on all 56 minors (their `treeOfLifePath`/`treeOfLifeConnects`/`hebrewLetter`/`liber777Column` are `null`). Extract the row-building into a pure, testable helper; render `astrology` always and null-able rows only when present.

**Files:**
- Create: `src/modules/esoteric/lib/tarotCards.ts`
- Test: `src/modules/esoteric/lib/__tests__/tarotCards.test.ts`
- Modify: `src/app/[locale]/(app)/tarot/[cardId]/page.tsx` (interface `:20–35`, correspondences block `:235–251`)

**Interfaces:**
- Produces: `buildCorrespondenceRows(card: CardCorrespondences): CorrespondenceRow[]` where `type CorrespondenceKey = 'detail.hebrewLetter' | 'detail.treeOfLifePath' | 'detail.connects' | 'detail.astrological' | 'detail.liber777Column'`, `interface CorrespondenceRow { key: CorrespondenceKey; value: string }`, `interface CardCorrespondences { hebrewLetter: string | null; treeOfLifePath: number | null; treeOfLifeConnects: number[] | null; astrology: string; liber777Column: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/esoteric/lib/__tests__/tarotCards.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildCorrespondenceRows } from '../tarotCards';

const major = {
  hebrewLetter: 'א',
  treeOfLifePath: 11,
  treeOfLifeConnects: [1, 2],
  astrology: 'Uranus',
  liber777Column: 'Air',
};
const minor = {
  hebrewLetter: null,
  treeOfLifePath: null,
  treeOfLifeConnects: null,
  astrology: 'Mars in Aries',
  liber777Column: null,
};

describe('buildCorrespondenceRows', () => {
  it('returns all five rows in order for a Major', () => {
    const rows = buildCorrespondenceRows(major);
    expect(rows.map((r) => r.key)).toEqual([
      'detail.hebrewLetter',
      'detail.treeOfLifePath',
      'detail.connects',
      'detail.astrological',
      'detail.liber777Column',
    ]);
    expect(rows.find((r) => r.key === 'detail.connects')?.value).toBe('1 ↔ 2');
  });

  it('does not throw and returns only the astrology row for a Minor', () => {
    expect(() => buildCorrespondenceRows(minor)).not.toThrow();
    const rows = buildCorrespondenceRows(minor);
    expect(rows.map((r) => r.key)).toEqual(['detail.astrological']);
    expect(rows[0].value).toBe('Mars in Aries');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/esoteric/lib/__tests__/tarotCards.test.ts`
Expected: FAIL — `Failed to resolve import "../tarotCards"` / `buildCorrespondenceRows is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/modules/esoteric/lib/tarotCards.ts`:
```ts
export type CorrespondenceKey =
  | 'detail.hebrewLetter'
  | 'detail.treeOfLifePath'
  | 'detail.connects'
  | 'detail.astrological'
  | 'detail.liber777Column';

export interface CorrespondenceRow {
  key: CorrespondenceKey;
  value: string;
}

export interface CardCorrespondences {
  hebrewLetter: string | null;
  treeOfLifePath: number | null;
  treeOfLifeConnects: number[] | null;
  astrology: string;
  liber777Column: string | null;
}

/**
 * Builds the "777 Correspondences" rows for a tarot card.
 *
 * The 22 Majors carry all five fields; the 56 Minors have path/Hebrew-letter
 * fields = null in cards.json (minors map to sephiroth, not paths). Rendering
 * card.treeOfLifeConnects.join() unconditionally threw during SSR for every
 * minor — this helper renders `astrology` always and the null-able fields only
 * when present, so minors get a valid (shorter) block instead of a crash.
 */
export function buildCorrespondenceRows(card: CardCorrespondences): CorrespondenceRow[] {
  const rows: CorrespondenceRow[] = [];
  if (card.hebrewLetter) rows.push({ key: 'detail.hebrewLetter', value: card.hebrewLetter });
  if (card.treeOfLifePath !== null) rows.push({ key: 'detail.treeOfLifePath', value: String(card.treeOfLifePath) });
  if (card.treeOfLifeConnects && card.treeOfLifeConnects.length > 0) {
    rows.push({ key: 'detail.connects', value: card.treeOfLifeConnects.join(' ↔ ') });
  }
  rows.push({ key: 'detail.astrological', value: card.astrology });
  if (card.liber777Column) rows.push({ key: 'detail.liber777Column', value: card.liber777Column });
  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/esoteric/lib/__tests__/tarotCards.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the helper into the card page and fix the type lie**

In `src/app/[locale]/(app)/tarot/[cardId]/page.tsx`:

(a) Add the import near the other esoteric imports (after line 13):
```ts
import { buildCorrespondenceRows } from '@/modules/esoteric/lib/tarotCards';
```

(b) Change the `CardData` interface fields (`:30–33`) from required to nullable:
```ts
  hebrewLetter: string | null;
  treeOfLifePath: number | null;
  treeOfLifeConnects: number[] | null;
  liber777Column: string | null;
```

(c) Replace the correspondences `<dl>` body (`:235–251`) — the inline array literal that unconditionally reads `card.treeOfLifeConnects.join(...)`:
```tsx
            <dl className="divide-y divide-white/6">
              {buildCorrespondenceRows(card).map(({ key, value }) => {
                const label = tPage(key);
                return (
                  <div key={key} className="grid grid-cols-[140px_1fr] px-5 py-2.5 hover:bg-white/3 transition-colors">
                    <dt className="text-xs text-white/40 uppercase tracking-wider self-center">{label}</dt>
                    <dd className="text-sm text-white/80" style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}>
                      {value}
                    </dd>
                  </div>
                );
              })}
            </dl>
```

- [ ] **Step 6: Verify types + the SEO suite are green**

Run: `npm run typecheck && npx vitest run src/modules/esoteric/lib/__tests__/tarotCards.test.ts`
Expected: typecheck PASS (the nullable interface + helper align); tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/esoteric/lib/tarotCards.ts \
        src/modules/esoteric/lib/__tests__/tarotCards.test.ts \
        "src/app/[locale]/(app)/tarot/[cardId]/page.tsx"
git commit -m "fix(seo-p1/T1a): guard tarot minor-arcana SSR crash via buildCorrespondenceRows"
```

---

## Task 2: Server-rendered 78-card grid on tarot hubs (T1b) · P0

The hub renders `<TarotCatalogClient>` (a client component) so minor-card anchors are absent from the initial SSR HTML — the 56 minors are sitemap-only orphans. Add a server-rendered `<nav>` of all 78 cards as plain `Link` anchors, layered alongside the interactive catalog.

**Files:**
- Modify: `src/modules/esoteric/lib/tarotCards.ts` (add `groupTarotCards`)
- Test: `src/modules/esoteric/lib/__tests__/tarotCards.test.ts` (add group tests)
- Modify: `src/app/[locale]/(app)/tarot/page.tsx` (render the grid)
- Modify: `messages/en.json`, `messages/es.json` (add `tarotPage.browseAllHeading`)

**Interfaces:**
- Consumes: `getCardName(card, locale)` from `@/modules/esoteric/components/tarotLocalize`.
- Produces: `groupTarotCards(cards, locale): TarotGridGroup[]` where `interface TarotGridCard { id: string; name: string; suit: string; number: number }`, `interface TarotGridGroup { suit: string; cards: TarotGridCard[] }`; groups ordered `major, wands, cups, swords, disks`, empty groups dropped.

- [ ] **Step 1: Write the failing test**

Append to `src/modules/esoteric/lib/__tests__/tarotCards.test.ts`:
```ts
import { groupTarotCards } from '../tarotCards';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const allCards = JSON.parse(
  readFileSync(join(process.cwd(), 'content/tarot/cards.json'), 'utf-8'),
).cards as Array<{ id: string; number: number; name: { en: string; es?: string }; suit: string }>;

describe('groupTarotCards', () => {
  it('groups all 78 cards into 5 ordered suits', () => {
    const groups = groupTarotCards(allCards, 'en');
    expect(groups.map((g) => g.suit)).toEqual(['major', 'wands', 'cups', 'swords', 'disks']);
    expect(groups.reduce((n, g) => n + g.cards.length, 0)).toBe(78);
    expect(groups.find((g) => g.suit === 'major')?.cards).toHaveLength(22);
    expect(groups.find((g) => g.suit === 'wands')?.cards).toHaveLength(14);
  });

  it('resolves localized names', () => {
    const groups = groupTarotCards(allCards, 'es');
    const fool = groups[0].cards.find((c) => c.id === 'the-fool');
    expect(typeof fool?.name).toBe('string');
    expect(fool?.name.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/esoteric/lib/__tests__/tarotCards.test.ts`
Expected: FAIL — `groupTarotCards is not a function`.

- [ ] **Step 3: Add the implementation**

Append to `src/modules/esoteric/lib/tarotCards.ts`:
```ts
import { getCardName } from '@/modules/esoteric/components/tarotLocalize';

export interface TarotGridCard {
  id: string;
  name: string;
  suit: string;
  number: number;
}

export interface TarotGridGroup {
  suit: string;
  cards: TarotGridCard[];
}

const SUIT_ORDER = ['major', 'wands', 'cups', 'swords', 'disks'] as const;

/**
 * Groups tarot cards by suit in canonical order for the server-rendered hub
 * grid. Every card becomes a crawlable anchor in the initial HTML (fixes the
 * minor-arcana orphan problem — see audit §2b).
 */
export function groupTarotCards(
  cards: Array<{ id: string; number: number; name: { en: string; es?: string }; suit: string }>,
  locale: string,
): TarotGridGroup[] {
  return SUIT_ORDER.map((suit) => ({
    suit,
    cards: cards
      .filter((c) => c.suit === suit)
      .sort((a, b) => a.number - b.number)
      .map((c) => ({ id: c.id, name: getCardName(c, locale), suit: c.suit, number: c.number })),
  })).filter((g) => g.cards.length > 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/esoteric/lib/__tests__/tarotCards.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the i18n heading key**

In `messages/en.json`, inside the existing `"tarotPage": { … }` object, add:
```json
    "browseAllHeading": "Browse all 78 cards",
```
In `messages/es.json`, inside the existing `"tarotPage": { … }` object, add:
```json
    "browseAllHeading": "Explora las 78 cartas",
```
(Locate with `grep -n '"tarotPage"' messages/en.json messages/es.json`; add the key alongside the sibling keys like `"h1"`/`"subtitle"`.)

- [ ] **Step 6: Render the server grid on the hub**

In `src/app/[locale]/(app)/tarot/page.tsx`:

(a) Extend the import at line 8 and add the locale/name imports:
```ts
import { TarotCatalogClient } from '@/modules/esoteric/components/TarotCatalogClient';
import { groupTarotCards } from '@/modules/esoteric/lib/tarotCards';
```

(b) In `TarotPage()`, after `const cards = await loadCards();` (`:58`), add:
```ts
  const locale = await getLocale();
  const groups = groupTarotCards(cards, locale);
```

(c) Replace the `<TarotCatalogClient cards={cards} />` line (`:87`) with the interactive catalog **plus** a server-rendered crawlable index:
```tsx
          <TarotCatalogClient cards={cards} />

          {/* Server-rendered crawlable index — guarantees all 78 card anchors
              exist in the initial HTML (not only the client gallery). SEO §2b. */}
          <nav aria-label={t('browseAllHeading')} className="space-y-6 pt-4">
            <h2 className="text-xs uppercase tracking-wider text-white/40 font-medium">
              {t('browseAllHeading')}
            </h2>
            {groups.map((group) => (
              <section key={group.suit} className="space-y-2">
                <h3 className="text-[11px] uppercase tracking-wider text-white/30">
                  {t(`suits.${group.suit}` as 'suits.major' | 'suits.wands' | 'suits.cups' | 'suits.swords' | 'suits.disks')}
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {group.cards.map((card) => (
                    <li key={card.id}>
                      <Link
                        href={`/tarot/${card.id}`}
                        className="inline-block px-2.5 py-1 rounded-md text-xs bg-white/5 text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors"
                      >
                        {card.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
```

- [ ] **Step 7: Verify types + tests**

Run: `npm run typecheck && npx vitest run src/modules/esoteric/lib/__tests__/tarotCards.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/esoteric/lib/tarotCards.ts \
        src/modules/esoteric/lib/__tests__/tarotCards.test.ts \
        "src/app/[locale]/(app)/tarot/page.tsx" \
        messages/en.json messages/es.json
git commit -m "feat(seo-p1/T1b): server-render 78-card grid on tarot hubs (de-orphan minors)"
```

---

## Task 3: Compatibility pairs noindex + sitemap drop (T2) · P1

Noindex the 156 thin compatibility-pair pages (keep them live for UX; keep the 2 `/compatibility` hub pages indexed) and remove them from the sitemap so they stop diluting crawl-quality. `createMetadata({noIndex:true})` yields `follow:false`; we want `follow:true`, so override robots on the returned object.

**Files:**
- Modify: `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx` (generateMetadata `:110–115`)
- Modify: `src/app/sitemap.ts` (`compatibilityPairs` const `:275–282`; return array `:312`)
- Test: `src/shared/seo/__tests__/sitemap.test.ts` (add assertions)

**Interfaces:**
- Consumes: `ALL_PAIR_SLUGS` from `@/shared/seo/compatibility-pairs`; `sitemap` default export from `@/app/sitemap`.

- [ ] **Step 1: Write the failing test**

Append to `src/shared/seo/__tests__/sitemap.test.ts` (import the default export at the top if not already imported — check the file head; it imports `sitemap` from `../../../app/sitemap` or `@/app/sitemap`):
```ts
describe('compatibility pairs removed from sitemap (T2)', () => {
  it('emits zero /compatibility/<pair> URLs', () => {
    const urls = sitemap().map((e) => e.url);
    const pairUrls = urls.filter((u) => /\/compatibility\/[^/]+$/.test(u));
    expect(pairUrls).toHaveLength(0);
  });

  it('keeps the /compatibility hub (EN + ES)', () => {
    const urls = sitemap().map((e) => e.url);
    const hubUrls = urls.filter((u) => /\/compatibility$/.test(u));
    expect(hubUrls).toHaveLength(2);
  });

  it('total entry count drops to 514', () => {
    expect(sitemap()).toHaveLength(514);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shared/seo/__tests__/sitemap.test.ts -t "compatibility pairs removed"`
Expected: FAIL — 156 pair URLs still present; length is 670.

- [ ] **Step 3: Remove compat pairs from the sitemap**

In `src/app/sitemap.ts`, delete the `compatibilityPairs` block (`:275–282`):
```ts
  // ── Compatibility pairs (78 × 2 locales = 156) ────────────────────────────
  const compatibilityPairs: MetadataRoute.Sitemap = ALL_PAIR_SLUGS.flatMap((pair) =>
    emitLocalized(`/compatibility/${pair}`, {
      lastModified: compatibilityBuildTime,
      changeFrequency: 'monthly',
      priority: 0.5,
    }),
  );
```
and remove `...compatibilityPairs,` from the return array (`:312`). If `ALL_PAIR_SLUGS` becomes an unused import, delete its import line (`:4`) to keep lint green. Leave `compatibilityIndex` and `compatibilityBuildTime` (still used by the hub).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/shared/seo/__tests__/sitemap.test.ts`
Expected: PASS (existing tests + the 3 new ones).

- [ ] **Step 5: Write the failing noindex test**

Append to `src/shared/seo/__tests__/sitemap.test.ts` (or a new `compatibility-noindex.test.ts` — keep it here for cohesion):
```ts
import { generateMetadata as compatPairMetadata } from '../../../app/[locale]/(marketing)/compatibility/[pair]/page';
import { ALL_PAIR_SLUGS } from '../compatibility-pairs';

describe('compatibility pair pages are noindex (T2)', () => {
  it('sets robots index:false, follow:true', async () => {
    const md = await compatPairMetadata({
      params: Promise.resolve({ locale: 'en' as const, pair: ALL_PAIR_SLUGS[0] }),
    });
    expect(md.robots).toEqual({ index: false, follow: true });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/shared/seo/__tests__/sitemap.test.ts -t "noindex"`
Expected: FAIL — `md.robots` is `{ index: true, follow: true }` (default).

- [ ] **Step 7: Add the robots override**

In `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx`, replace the final `return createMetadata({…})` in `generateMetadata` (`:110–115`):
```ts
  const metadata = createMetadata({
    title,
    description,
    path: `/compatibility/${pair}`,
    locale,
  });
  // Thin template pages — noindex until enriched (Phase 2 T7), but follow so
  // outbound links to the sign essays still pass equity.
  return { ...metadata, robots: { index: false, follow: true } };
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/shared/seo/__tests__/sitemap.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx" \
        src/app/sitemap.ts \
        src/shared/seo/__tests__/sitemap.test.ts
git commit -m "fix(seo-p1/T2): noindex compatibility pairs + drop 156 URLs from sitemap"
```

---

## Task 4: Sitewide JSON-LD logo 404 → icon-512 (T3) · P1

`json-ld.ts` emits `${SITE_URL}/logo.png` (never existed → 404) in Organization.logo and Article publisher.logo, voiding rich-result eligibility. Point both at the verified `/icons/icon-512.png`.

**Files:**
- Modify: `src/shared/seo/json-ld.ts` (`:50`, `:158`)
- Test: `src/shared/seo/__tests__/json-ld.test.ts` (update `:38`, add publisher assertion)

- [ ] **Step 1: Update the existing test to the new expectation (currently asserts the 404 path)**

In `src/shared/seo/__tests__/json-ld.test.ts`, the `organizationSchema` "includes logo with url" test (`:35–39`) currently asserts `.toContain('logo.png')`. Change it and add a publisher assertion:
```ts
  it('includes logo pointing at the existing icon-512 asset', () => {
    const schema = organizationSchema() as unknown as AnySchema;
    expect(schema.logo['@type']).toBe('ImageObject');
    expect(schema.logo.url).toContain('/icons/icon-512.png');
    expect(schema.logo.url).not.toContain('logo.png');
  });
```
And in the `articleSchema` describe block, add:
```ts
  it('publisher logo points at icon-512, not the 404 logo.png', () => {
    const schema = articleSchema({
      title: 'T', description: 'D', url: 'https://estrevia.app/essays/x',
      datePublished: '2026-01-01', dateModified: '2026-01-01',
    }) as unknown as AnySchema;
    expect(schema.publisher.logo.url).toContain('/icons/icon-512.png');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/seo/__tests__/json-ld.test.ts -t "logo"`
Expected: FAIL — url still contains `logo.png`.

- [ ] **Step 3: Fix the two logo URLs**

In `src/shared/seo/json-ld.ts`:
- `:50` (organizationSchema): `url: \`${SITE_URL}/logo.png\`,` → `url: \`${SITE_URL}/icons/icon-512.png\`,`
- `:158` (articleSchema publisher.logo): `url: \`${SITE_URL}/logo.png\`,` → `url: \`${SITE_URL}/icons/icon-512.png\`,`

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/seo/__tests__/json-ld.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/seo/json-ld.ts src/shared/seo/__tests__/json-ld.test.ts
git commit -m "fix(seo-p1/T3): JSON-LD logo -> /icons/icon-512.png (was 404 /logo.png)"
```

---

## Task 5: ES essay JSON-LD locale-aware URLs (T4) · P1

On all 120 ES essays the Article `url` + BreadcrumbList point to EN URLs (built at `essays/[slug]/page.tsx:90` without a locale prefix), contradicting the page's own correct canonical/hreflang. Extract a pure `essayLocaleUrls` helper and use it.

**Files:**
- Create: `src/shared/seo/essay-urls.ts`
- Test: `src/shared/seo/__tests__/essay-urls.test.ts`
- Modify: `src/app/[locale]/(app)/essays/[slug]/page.tsx` (`:90`, `:107–113`)

**Interfaces:**
- Produces: `essayLocaleUrls(slug: string, locale: 'en' | 'es', signSlug?: string | null): { canonicalUrl: string; homeUrl: string; signUrl: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `src/shared/seo/__tests__/essay-urls.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { essayLocaleUrls } from '../essay-urls';
import { SITE_URL } from '../constants';

describe('essayLocaleUrls', () => {
  it('EN essay uses root URLs', () => {
    const u = essayLocaleUrls('sun-in-aries', 'en', 'aries');
    expect(u.canonicalUrl).toBe(`${SITE_URL}/essays/sun-in-aries`);
    expect(u.homeUrl).toBe(SITE_URL.replace(/\/$/, ''));
    expect(u.signUrl).toBe(`${SITE_URL}/signs/aries`);
  });

  it('ES essay uses /es/ URLs on every field', () => {
    const u = essayLocaleUrls('sun-in-aries', 'es', 'aries');
    const base = SITE_URL.replace(/\/$/, '');
    expect(u.canonicalUrl).toBe(`${base}/es/essays/sun-in-aries`);
    expect(u.homeUrl).toBe(`${base}/es`);
    expect(u.signUrl).toBe(`${base}/es/signs/aries`);
  });

  it('returns null signUrl when no sign', () => {
    expect(essayLocaleUrls('foo', 'es', null).signUrl).toBeNull();
    expect(essayLocaleUrls('foo', 'es').signUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/seo/__tests__/essay-urls.test.ts`
Expected: FAIL — cannot resolve `../essay-urls`.

- [ ] **Step 3: Implement the helper**

Create `src/shared/seo/essay-urls.ts`:
```ts
import { SITE_URL } from './constants';

export interface EssayLocaleUrls {
  canonicalUrl: string;
  homeUrl: string;
  signUrl: string | null;
}

/**
 * Locale-aware absolute URLs for essay JSON-LD (Article.url + BreadcrumbList).
 * EN → root; ES → /es prefix. Fixes the cross-locale bug where ES essays
 * emitted EN URLs, contradicting their own canonical/hreflang.
 */
export function essayLocaleUrls(
  slug: string,
  locale: 'en' | 'es',
  signSlug?: string | null,
): EssayLocaleUrls {
  const base = SITE_URL.replace(/\/$/, '');
  const prefix = locale === 'es' ? '/es' : '';
  return {
    canonicalUrl: `${base}${prefix}/essays/${slug}`,
    homeUrl: `${base}${prefix}`,
    signUrl: signSlug ? `${base}${prefix}/signs/${signSlug}` : null,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/seo/__tests__/essay-urls.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Export from the SEO barrel**

In `src/shared/seo/index.ts`, add an export line next to the other re-exports:
```ts
export { essayLocaleUrls } from './essay-urls';
export type { EssayLocaleUrls } from './essay-urls';
```
(Confirm the barrel path with `grep -n "essay\|export" src/shared/seo/index.ts`; match its existing re-export style.)

- [ ] **Step 6: Use the helper in the essay page**

In `src/app/[locale]/(app)/essays/[slug]/page.tsx`:

(a) Add `essayLocaleUrls` to the `@/shared/seo` import (`:11–19`).

(b) Replace `const canonicalUrl = \`${SITE_URL}/essays/${slug}\`;` (`:90`) with:
```ts
  const { canonicalUrl, homeUrl, signUrl } = essayLocaleUrls(
    slug,
    locale as 'en' | 'es',
    parsed?.sign ?? null,
  );
```

(c) Replace the breadcrumb array (`:107–113`) so Home + sign use the locale-aware URLs:
```ts
  const breadcrumbLd = breadcrumbSchema([
    { name: 'Home', url: homeUrl },
    ...(parsed && signDisplay && signUrl
      ? [{ name: signDisplay, url: signUrl }]
      : []),
    { name: meta.title, url: canonicalUrl },
  ]);
```
(`articleSchema` already consumes `canonicalUrl` at `:95` — now locale-correct. `SITE_URL` may become unused; if lint flags it, drop it from the import.)

- [ ] **Step 7: Verify types + tests**

Run: `npm run typecheck && npx vitest run src/shared/seo/__tests__/essay-urls.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/shared/seo/essay-urls.ts src/shared/seo/__tests__/essay-urls.test.ts \
        src/shared/seo/index.ts "src/app/[locale]/(app)/essays/[slug]/page.tsx"
git commit -m "fix(seo-p1/T4): locale-aware essay JSON-LD URLs (ES essays no longer emit EN URLs)"
```

---

## Task 6: `/es/` landing title → calculator language (T5) · P1

The `/es/` homepage title misses the ES calculator cluster (203 impr @ pos 16.2 — the conversion path). Rewrite `pageMeta.landing` in `messages/es.json`. Pure copy change; verified by curl (no unit test — asserting a literal message string adds no value).

**Files:**
- Modify: `messages/es.json` (`:395–396`)

- [ ] **Step 1: Update the ES landing title + description**

In `messages/es.json`, replace `pageMeta.landing` (`:395–396`):
```json
    "landing": {
      "title": "Carta Natal Sideral Gratis — Calculadora Online (Lahiri)",
      "description": "Calcula gratis tu carta natal sideral con el ayanamsa Lahiri y el Swiss Ephemeris. Descubre tu signo verdadero, casas y aspectos en segundos."
    },
```
(`| Estrevia` is appended by the title template; `createMetadata` truncates title to ≤60 and description to ≤155 — the strings above fit.)

- [ ] **Step 2: Verify the messages file is valid JSON + suite green**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('es.json OK')" && npm test`
Expected: `es.json OK`; full suite PASS (no test references this string).

- [ ] **Step 3: Commit**

```bash
git add messages/es.json
git commit -m "feat(seo-p1/T5): /es/ landing title -> calculator cluster language"
```

---

## Task 7: FAQ extraction — bilingual + answer boundary (T6a) · P1

`extractFaqItems` (local in `essays/[slug]/page.tsx:143`) only matches `## FAQ`, missing the ES `## Preguntas Frecuentes`, and its answers can bleed into the trailing disclaimer. Move it to a testable lib, make the heading bilingual, and stop answers at `---`/blockquote.

**Files:**
- Create: `src/modules/esoteric/lib/faq.ts`
- Test: `src/modules/esoteric/lib/__tests__/faq.test.ts`
- Modify: `src/app/[locale]/(app)/essays/[slug]/page.tsx` (remove local `:143–162`, import from lib)

**Interfaces:**
- Produces: `extractFaqItems(markdown: string): Array<{ question: string; answer: string }>`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/esoteric/lib/__tests__/faq.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractFaqItems } from '../faq';

describe('extractFaqItems', () => {
  it('extracts English FAQ pairs under "## FAQ"', () => {
    const md = `## FAQ\n\n**What is sidereal astrology?**\nIt tracks the real constellations.\n`;
    const items = extractFaqItems(md);
    expect(items).toHaveLength(1);
    expect(items[0].question).toBe('What is sidereal astrology?');
    expect(items[0].answer).toBe('It tracks the real constellations.');
  });

  it('extracts Spanish FAQ pairs under "## Preguntas Frecuentes"', () => {
    const md = `## Preguntas Frecuentes\n\n**¿Qué es la astrología sideral?**\nSigue las constelaciones reales.\n`;
    const items = extractFaqItems(md);
    expect(items).toHaveLength(1);
    expect(items[0].question).toBe('¿Qué es la astrología sideral?');
    expect(items[0].answer).toBe('Sigue las constelaciones reales.');
  });

  it('stops the answer at a horizontal rule (no disclaimer bleed)', () => {
    const md = `## FAQ\n\n**Is this advice?**\nNo, it is for reflection.\n\n---\n\n*Not medical or financial advice.*\n`;
    const items = extractFaqItems(md);
    expect(items).toHaveLength(1);
    expect(items[0].answer).toBe('No, it is for reflection.');
    expect(items[0].answer).not.toContain('advice.');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/modules/esoteric/lib/__tests__/faq.test.ts`
Expected: FAIL — cannot resolve `../faq`.

- [ ] **Step 3: Implement the bilingual helper**

Create `src/modules/esoteric/lib/faq.ts` (moved from the essay page, with the two fixes applied):
```ts
/**
 * Extracts FAQ Q&A pairs from an essay markdown body.
 *
 * Heading is bilingual ("## FAQ" | "## Preguntas Frecuentes"). Answers stop at
 * the next question, the next H2, a horizontal rule (---), or a blockquote (>)
 * so the trailing disclaimer never bleeds into the last answer.
 */
export function extractFaqItems(
  markdown: string,
): Array<{ question: string; answer: string }> {
  const faqStart = markdown.search(/^##\s+(FAQ|Preguntas Frecuentes)/im);
  if (faqStart === -1) return [];

  const faqSection = markdown.slice(faqStart);

  const items: Array<{ question: string; answer: string }> = [];
  const questionRegex = /\*\*([^*]+\?)\*\*\s*\n([\s\S]*?)(?=\n\*\*[^*]+\?\*\*|\n##\s|\n---|\n>|$)/g;

  let match: RegExpExecArray | null;
  while ((match = questionRegex.exec(faqSection)) !== null) {
    const question = match[1]?.trim();
    const answer = match[2]?.trim().replace(/\n+/g, ' ');
    if (question && answer) {
      items.push({ question, answer });
    }
  }

  return items.slice(0, 8);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/modules/esoteric/lib/__tests__/faq.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Replace the local function with the import**

In `src/app/[locale]/(app)/essays/[slug]/page.tsx`:
- Delete the local `extractFaqItems` function (`:143–162`) **and** its section-header comment block (`:130–142`).
- Add the import near the top (after `getEssayBySlug` import, ~`:21`):
```ts
import { extractFaqItems } from '@/modules/esoteric/lib/faq';
```
(The call site at `:100` `const faqItems = extractFaqItems(content);` is unchanged.)

- [ ] **Step 6: Verify types + tests**

Run: `npm run typecheck && npx vitest run src/modules/esoteric/lib/__tests__/faq.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/esoteric/lib/faq.ts src/modules/esoteric/lib/__tests__/faq.test.ts \
        "src/app/[locale]/(app)/essays/[slug]/page.tsx"
git commit -m "fix(seo-p1/T6a): bilingual FAQ extraction + answer-boundary (ES FAQPage now emits)"
```

---

## Task 8: hreflang `en-US` → `en` (T6b) · P1

`hreflang="en-US"` is invalid as a language-only alternate; Google prefers `en`. Fix both emitters (`metadata.ts` head + `sitemap.ts`) and the existing tests that assert the old key.

**Files:**
- Modify: `src/shared/seo/metadata.ts` (`:138`)
- Modify: `src/app/sitemap.ts` (`buildAlternates` `:67`)
- Modify: `src/shared/seo/__tests__/metadata.test.ts` (`:188–189`, `:198–199`)
- Modify: `src/shared/seo/__tests__/sitemap.test.ts` (`:18`)

- [ ] **Step 1: Update the tests to the new key (they currently assert `en-US`)**

In `src/shared/seo/__tests__/metadata.test.ts`, change the two `languages` assertions:
- `:188–189` and `:198–199`: replace the key `'en-US'` with `'en'` in each `toMatchObject({ 'en-US': 'https://estrevia.app/chart', … })` → `toMatchObject({ 'en': 'https://estrevia.app/chart', … })`.

In `src/shared/seo/__tests__/sitemap.test.ts`, change `:18`:
```ts
      expect(e.alternates?.languages?.['en']).toBeTruthy();
```

Add one positive guard in `metadata.test.ts` (in the same describe as the chart cases):
```ts
  it('uses "en" (not "en-US") as the hreflang key', () => {
    const m = createMetadata({ title: 'T', description: 'D', path: '/x', locale: 'en' });
    const langs = m.alternates?.languages as Record<string, string>;
    expect(langs['en']).toBeDefined();
    expect(langs['en-US']).toBeUndefined();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/shared/seo/__tests__/metadata.test.ts src/shared/seo/__tests__/sitemap.test.ts`
Expected: FAIL — code still emits `en-US`.

- [ ] **Step 3: Fix both emitters**

In `src/shared/seo/metadata.ts:137–141`, change the hreflang map key:
```ts
  const hreflangLanguages: Record<string, string> = {
    'en': enUrl,
    'es': esUrl,
    'x-default': enUrl,
  };
```
In `src/app/sitemap.ts:62–68` (`buildAlternates`), change the returned key:
```ts
  return {
    languages: { 'en': en, 'es': es, 'x-default': en },
  };
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/shared/seo/__tests__/metadata.test.ts src/shared/seo/__tests__/sitemap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/seo/metadata.ts src/app/sitemap.ts \
        src/shared/seo/__tests__/metadata.test.ts src/shared/seo/__tests__/sitemap.test.ts
git commit -m "fix(seo-p1/T6b): hreflang en-US -> en in head + sitemap"
```

---

## Task 9: Full verification gate + deploy + founder ops (O1–O3)

Gates the wave. Code Tasks 1–8 must be committed and Task 0 cleared before the deploy/ops steps.

- [ ] **Step 1: Full suite + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green. (Lint may report pre-existing `.claude/worktrees/` noise — per memory `feedback_lint_worktrees_pollution`, grep the output for `src/` paths only; the changed `src/` files must be clean.)

- [ ] **Step 2: Local SSR smoke (catches the empty-shell class of bug unit tests cannot see)**

Run: `npm run build && npm run start` (or `npm run dev`), then in another shell:
```bash
# Tarot minor renders a body + Correspondences outside <script>
curl -s http://localhost:3000/tarot/two-of-wands | grep -c "<h1"
curl -s http://localhost:3000/es/tarot/queen-of-cups | grep -c "<h1"
# Hub exposes crawlable card anchors (expect 78)
curl -s http://localhost:3000/tarot | grep -o 'href="[^"]*/tarot/[a-z-]\+"' | sort -u | wc -l
# Compatibility pair is noindex
curl -s http://localhost:3000/compatibility/aries-leo | grep -i 'name="robots"'
# ES essay JSON-LD carries /es/ URLs (pick any real slug from content/essays/es/)
curl -s http://localhost:3000/es/essays/sun-in-aries | grep -o '"url":"https://[^"]*"' | head
# /es/ title
curl -s http://localhost:3000/es | grep -o '<title>[^<]*</title>'
```
Expected: `<h1` count ≥ 1 for both minors; ~78 unique tarot anchors on the hub; `content="noindex"` on the compat pair; `/es/essays/…` (not EN) URLs in the ES essay; title contains "Carta Natal Sideral Gratis".

- [ ] **Step 3: Push** (confirm with founder first — direct-to-main, shipping accumulated `main` work per Task 0)

```bash
git push origin main
```

- [ ] **Step 4 (founder, O1): www → 308.** Vercel → Domains → `www.estrevia.app` → set redirect to permanent (308).

- [ ] **Step 5 (founder, O2): Rich Results Test.** Run one EN essay + one ES essay through Google's Rich Results Test — confirm the logo resolves, Article `url` is locale-correct, and FAQPage validates.

- [ ] **Step 6 (founder, O3): GSC recrawl.** Request indexing for `/tarot`, `/es/tarot`, and a sample of `/tarot/<minor>` URLs; resubmit the sitemap (full URL, per memory `reference_gsc_setup`).

- [ ] **Step 7: Record baselines for the +2wk / +4wk re-measure** (from the spec §2): indexed 476; "Crawled — not indexed" 188; ES-calculator CTR 203 impr @ 16.2; tarot-ES pos 74; ES essays with impressions 4/120.

---

## Self-Review (completed)

- **Spec coverage:** T1a✓ T1b✓ (Tasks 1–2), T2✓ (Task 3), T3✓ (Task 4), T4✓ (Task 5), T5✓ (Task 6), T6a✓ (Task 7), T6b✓ (Task 8), O1–O3✓ + deploy-isolation✓ (Tasks 0, 9). All Phase-1 spec items map to a task.
- **Placeholder scan:** none — every code step shows verbatim old/new code and exact commands.
- **Type consistency:** `buildCorrespondenceRows`/`CorrespondenceRow`/`CardCorrespondences`, `groupTarotCards`/`TarotGridGroup`, `essayLocaleUrls`/`EssayLocaleUrls`, `extractFaqItems` signatures are identical between their producing task and every consumer.
- **Breaking-test coverage:** the three existing tests my changes invalidate — `json-ld.test.ts:38` (`logo.png`), `metadata.test.ts:188/198` (`en-US`), `sitemap.test.ts:18` (`en-US`) — are each updated in the same task that changes the code.
- **Out of scope (Phases 2–3):** compat enrichment, CTR pass, ES internal linking, token localization, real dates, `Article.image`, soft-404, `/about` + Person author, perf, Clerk route-group move — not in this plan.
