# Passport Share i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localize the Cosmic Passport share flow (ShareButton + OG image) to ES, and refactor `getRarityTier()` to return typed keys instead of display literals — closing audit items #10, #11, #12 from the 2026-05-03 audit.

**Architecture:** 5 sequential commits T1→T5 ordered by blast radius. T1 lays catalog keys (deploy-safe). T2 changes `getRarityTier()` return type and updates all 5 callsites (deploy-safe in EN; ES-locale gets translated tier word). T3 i18ns ShareButton in `[locale]/chart`. T4 reads `passport.locale` from DB row and translates OG image. T5 adds key-parity test for catalogs. Each commit is independently revertable.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 6 · `next-intl` (hook + `getTranslations`) · `vitest` 4 + `@testing-library/react` + `jsdom` (per-file via `// @vitest-environment jsdom`) · `@vercel/og` (Satori) · Drizzle ORM (Neon) · `@sentry/nextjs`.

**Spec reference:** `docs/superpowers/specs/2026-05-03-passport-share-i18n-design.md`

---

## File Structure

| Action | Path | Responsibility |
| --- | --- | --- |
| Modify | `messages/en.json` | Extend `share.passport` with `title`/`button.*`/`aria.*`/`og.*`; add new top-level `astro.rarityTier` |
| Modify | `messages/es.json` | Same shape, ES values per spec §3.3 |
| Modify | `src/modules/astro-engine/rarity.ts` | Change `RarityTier` from display-literal union to key union; rewrite `getRarityTier()` body |
| Create | `src/modules/astro-engine/__tests__/rarity.test.ts` | T2 unit + type tests (U1, U2) |
| Modify | `src/modules/astro-engine/components/PassportCard.tsx` | Add `useTranslations('astro.rarityTier')` hook; wrap 3 callsites at lines 163, 207, 227 |
| Modify | `src/app/s/[id]/page.tsx` | Replace 1 callsite at line 234 with `getTranslations({ locale: 'en', namespace: 'astro.rarityTier' })` (locale forced EN per `s/layout.tsx`) |
| Modify | `src/app/api/og/passport/[id]/route.tsx` | Translate `getRarityTier()` output via `getTranslations({ locale: 'en' })` (T2: keep EN to avoid regression); read `passport.locale` and translate ~10 strings (T4) |
| Modify | `src/modules/astro-engine/components/ShareButton.tsx` | Replace ~13 hardcoded EN strings/aria-labels with `t()` calls |
| Create | `src/modules/astro-engine/components/__tests__/ShareButton.test.tsx` | T3 component tests in EN+ES (C1, C2, C3) |
| Create | `src/app/api/og/passport/[id]/__tests__/route.test.ts` | T4 route tests with mocks (R1, R2) |
| Create | `scripts/qa/i18n-key-parity.test.ts` | T5 deep-key parity between en.json ↔ es.json (I1) |

---

## Task 1 (T1): Add EN+ES translation catalog keys

**Why first:** Zero behavior change. Pure additive JSON. Required before any code reads new keys, otherwise next-intl renders raw key paths (e.g., `"share.passport.button.share"`) and that gets baked into the `IMMUTABLE_1Y` OG cache (real regression).

**Files:**
- Modify: `messages/en.json` (extend block at lines 1424-1432; append top-level `astro` after `siderealDates`)
- Modify: `messages/es.json` (mirror)

- [ ] **Step 1.1: Edit `messages/en.json` — extend `share.passport` object**

Locate the existing `share` block (line 1423-1433) and replace the `passport` value. Old block:

```json
  "share": {
    "passport": {
      "copy": {
        "x": "Apparently I'm a 1-in-{rarity} cosmic blueprint 👀 {url}",
        "telegram": "Just calculated my sidereal cosmic passport — Sun in {sun}, Moon in {moon}, Rising in {rising}. {url}",
        "whatsapp": "Look what I got 👇 {url}",
        "stories_caption": "Cosmic blueprint unlocked 🌌",
        "native_share": "My Cosmic Passport — {url}"
      }
    }
  },
```

Replace with:

```json
  "share": {
    "passport": {
      "copy": {
        "x": "Apparently I'm a 1-in-{rarity} cosmic blueprint 👀 {url}",
        "telegram": "Just calculated my sidereal cosmic passport — Sun in {sun}, Moon in {moon}, Rising in {rising}. {url}",
        "whatsapp": "Look what I got 👇 {url}",
        "stories_caption": "Cosmic blueprint unlocked 🌌",
        "native_share": "My Cosmic Passport — {url}"
      },
      "title": "My Cosmic Passport",
      "button": {
        "share": "Share Passport",
        "copyLink": "Copy Link",
        "copyShort": "Copy",
        "copied": "Copied!",
        "copiedShort": "Copied",
        "downloading": "Downloading..."
      },
      "aria": {
        "container": "Share your Cosmic Passport",
        "shareNative": "Share your Cosmic Passport via the native share menu",
        "shareOnX": "Share on X",
        "shareOnTelegram": "Share on Telegram",
        "shareOnWhatsApp": "Share on WhatsApp",
        "linkCopied": "Link copied to clipboard",
        "copyShareLink": "Copy share link",
        "linkCopiedShort": "Link copied",
        "copyLinkShort": "Copy link",
        "downloadFormat": "Download format",
        "downloadAs": "Download as {format} PNG"
      },
      "og": {
        "eyebrow": "Sidereal Astrology",
        "title": "COSMIC BLUEPRINT",
        "titleLine1": "COSMIC",
        "titleLine2": "BLUEPRINT",
        "label": {
          "sun": "☉ SUN",
          "moon": "☽ MOON",
          "rising": "↑ RISING"
        },
        "rarityLabel": "RARITY",
        "ruledBy": "Ruled by",
        "unknown": "Unknown"
      }
    }
  },
```

- [ ] **Step 1.2: Edit `messages/en.json` — append top-level `astro` namespace**

The last top-level key in en.json is `siderealDates`. Find its closing brace and the file's final `}` (closes the root). Insert a new key before the final `}`. Locate the tail of the file:

```json
    "siderealDates": { ... }
  }
}
```

becomes:

```json
    "siderealDates": { ... }
  },
  "astro": {
    "rarityTier": {
      "exceptional": "Exceptional",
      "veryRare": "Very Rare",
      "rare": "Rare",
      "uncommon": "Uncommon"
    }
  }
}
```

(Note the comma after the previous closing brace.)

- [ ] **Step 1.3: Verify `messages/en.json` parses and typechecks**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('en.json OK')"
npm run typecheck
```

Expected: `en.json OK` and zero new TS errors. If `JSON.parse` throws, fix the trailing-comma or quoting issue.

- [ ] **Step 1.4: Edit `messages/es.json` — extend `share.passport` object with ES translations**

Locate `share` block (around line 1424-1434) and replace the `passport` value. Old block ends with the existing `copy` keys. Replace with:

```json
  "share": {
    "passport": {
      "copy": {
        "x": "Resulta que soy un blueprint cósmico de 1 entre {rarity} 👀 {url}",
        "telegram": "Acabo de calcular mi pasaporte cósmico sideral — Sol en {sun}, Luna en {moon}, Ascendente en {rising}. {url}",
        "whatsapp": "Mira lo que me salió 👇 {url}",
        "stories_caption": "Blueprint cósmico desbloqueado 🌌",
        "native_share": "Mi Pasaporte Cósmico — {url}"
      },
      "title": "Mi Pasaporte Cósmico",
      "button": {
        "share": "Compartir pasaporte",
        "copyLink": "Copiar enlace",
        "copyShort": "Copiar",
        "copied": "¡Copiado!",
        "copiedShort": "Copiado",
        "downloading": "Descargando..."
      },
      "aria": {
        "container": "Comparte tu Pasaporte Cósmico",
        "shareNative": "Comparte tu Pasaporte Cósmico mediante el menú nativo",
        "shareOnX": "Compartir en X",
        "shareOnTelegram": "Compartir en Telegram",
        "shareOnWhatsApp": "Compartir en WhatsApp",
        "linkCopied": "Enlace copiado al portapapeles",
        "copyShareLink": "Copiar enlace para compartir",
        "linkCopiedShort": "Enlace copiado",
        "copyLinkShort": "Copiar enlace",
        "downloadFormat": "Formato de descarga",
        "downloadAs": "Descargar como PNG {format}"
      },
      "og": {
        "eyebrow": "Astrología sideral",
        "title": "BLUEPRINT CÓSMICO",
        "titleLine1": "BLUEPRINT",
        "titleLine2": "CÓSMICO",
        "label": {
          "sun": "☉ SOL",
          "moon": "☽ LUNA",
          "rising": "↑ ASC"
        },
        "rarityLabel": "RAREZA",
        "ruledBy": "Regido por",
        "unknown": "Desconocido"
      }
    }
  },
```

- [ ] **Step 1.5: Edit `messages/es.json` — append top-level `astro`**

Same pattern as Step 1.2 but with ES values:

```json
  "astro": {
    "rarityTier": {
      "exceptional": "Excepcional",
      "veryRare": "Muy raro",
      "rare": "Raro",
      "uncommon": "Poco común"
    }
  }
```

- [ ] **Step 1.6: Verify `messages/es.json` parses and typechecks**

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('es.json OK')"
npm run typecheck
```

Expected: `es.json OK` + zero TS errors.

- [ ] **Step 1.7: Commit**

```bash
git add messages/en.json messages/es.json
git commit -m "feat(passport-share-i18n/T1): add EN+ES catalog keys for ShareButton + OG image + rarity tier

Adds share.passport.{title, button.*, aria.*, og.*} and new top-level
astro.rarityTier.{exceptional, veryRare, rare, uncommon} per
docs/superpowers/specs/2026-05-03-passport-share-i18n-design.md §3.

No code consumes these keys yet — deploy-safe."
```

---

## Task 2 (T2): Refactor `getRarityTier()` to return typed keys + update all 5 callsites + add unit tests

**Why second:** `getRarityTier()` is the cross-cutting contract used by 5 sites. Refactor + propagate before touching ShareButton/OG so neither commit owns conflicting logic. Every callsite is updated in this commit; EN render stays visually identical (translations from T1 catalog map keys back to existing display words).

**Files:**
- Modify: `src/modules/astro-engine/rarity.ts:209,224`
- Create: `src/modules/astro-engine/__tests__/rarity.test.ts`
- Modify: `src/modules/astro-engine/components/PassportCard.tsx:13,163,207,227`
- Modify: `src/app/s/[id]/page.tsx:11,234`
- Modify: `src/app/api/og/passport/[id]/route.tsx:172` (locale stays `'en'` here; T4 will swap it)

- [ ] **Step 2.1: Write failing unit test `rarity.test.ts`**

Create `src/modules/astro-engine/__tests__/rarity.test.ts`:

```ts
import { describe, expect, it, expectTypeOf } from 'vitest';
import { getRarityTier, type RarityTier } from '../rarity';

describe('getRarityTier — returns typed keys (not display literals)', () => {
  describe('weight buckets', () => {
    it('returns "exceptional" for weight < 5', () => {
      expect(getRarityTier(4.0)).toBe('exceptional');
      expect(getRarityTier(4.99)).toBe('exceptional');
    });

    it('returns "veryRare" for 5 <= weight < 6', () => {
      expect(getRarityTier(5.0)).toBe('veryRare');
      expect(getRarityTier(5.999)).toBe('veryRare');
    });

    it('returns "rare" for 6 <= weight < 7.5', () => {
      expect(getRarityTier(6.0)).toBe('rare');
      expect(getRarityTier(7.49)).toBe('rare');
    });

    it('returns "uncommon" for weight >= 7.5', () => {
      expect(getRarityTier(7.5)).toBe('uncommon');
      expect(getRarityTier(9.3)).toBe('uncommon');
    });
  });

  describe('boundary values', () => {
    it('classifies the rarity-table extremes correctly', () => {
      // Lower extreme of RARITY_TABLE = 4.0 (Aquarius/Virgo)
      expect(getRarityTier(4.0)).toBe('exceptional');
      // Upper extreme of RARITY_TABLE = 9.3 (Pisces/Pisces)
      expect(getRarityTier(9.3)).toBe('uncommon');
    });
  });
});

describe('RarityTier type contract', () => {
  it('is exactly the four key union (not display literals)', () => {
    expectTypeOf<RarityTier>().toEqualTypeOf<
      'exceptional' | 'veryRare' | 'rare' | 'uncommon'
    >();
  });
});
```

- [ ] **Step 2.2: Run the new test — verify it fails**

```bash
npx vitest run src/modules/astro-engine/__tests__/rarity.test.ts
```

Expected: FAIL with assertion mismatch (current return is `'Exceptional'` etc., not `'exceptional'`) AND a TypeScript error inside `expectTypeOf` block.

- [ ] **Step 2.3: Update `rarity.ts` — change return type and body**

Open `src/modules/astro-engine/rarity.ts`. Replace lines 209 and 224-229.

Old line 209:

```ts
export type RarityTier = 'Exceptional' | 'Very Rare' | 'Rare' | 'Uncommon';
```

New line 209:

```ts
export type RarityTier = 'exceptional' | 'veryRare' | 'rare' | 'uncommon';
```

Old lines 224-229:

```ts
export function getRarityTier(weight: number): RarityTier {
  if (weight < 5) return 'Exceptional';
  if (weight < 6) return 'Very Rare';
  if (weight < 7.5) return 'Rare';
  return 'Uncommon';
}
```

New lines 224-229:

```ts
export function getRarityTier(weight: number): RarityTier {
  if (weight < 5) return 'exceptional';
  if (weight < 6) return 'veryRare';
  if (weight < 7.5) return 'rare';
  return 'uncommon';
}
```

- [ ] **Step 2.4: Run the new test — verify it passes**

```bash
npx vitest run src/modules/astro-engine/__tests__/rarity.test.ts
```

Expected: PASS (all 6 specs green).

- [ ] **Step 2.5: Run typecheck — observe expected callsite breakage**

```bash
npm run typecheck
```

Expected: TS errors in 3 places (5 callsites, but some implicit-string-flow types may not error). The errors will appear because callsites use the function's return string for display, and that string is no longer a display word. Continue to Step 2.6 to fix them.

- [ ] **Step 2.6: Update `PassportCard.tsx` — add hook + wrap 3 callsites**

Open `src/modules/astro-engine/components/PassportCard.tsx`. The file currently has no `'use client'` directive and no hooks; we add `useTranslations` from `next-intl` (works in both RSC and Client Components in next-intl v3+).

At the top of the imports block (after line 12), add:

```ts
import { useTranslations } from 'next-intl';
```

Inside `PassportCard()` (after line 143, just before `const elementConfig` on line 145), add:

```ts
const tTier = useTranslations('astro.rarityTier');
```

Then update three callsites:

**Line 163 (aria-label on the article element)** — old:

```tsx
aria-label={`Cosmic Passport: Sun in ${sunSign}, Moon in ${moonSign}, ${ascendantSign ? `Ascendant in ${ascendantSign}` : 'Ascendant unknown'}, Element ${element}, Ruling planet ${rulingPlanet}, Rarity ${getRarityTier(rarityPercent)}`}
```

new:

```tsx
aria-label={`Cosmic Passport: Sun in ${sunSign}, Moon in ${moonSign}, ${ascendantSign ? `Ascendant in ${ascendantSign}` : 'Ascendant unknown'}, Element ${element}, Ruling planet ${rulingPlanet}, Rarity ${tTier(getRarityTier(rarityPercent))}`}
```

**Line 207 (rarity badge aria-label)** — old:

```tsx
aria-label={`Rarity tier: ${getRarityTier(rarityPercent)}`}
```

new:

```tsx
aria-label={`Rarity tier: ${tTier(getRarityTier(rarityPercent))}`}
```

**Line 227 (rarity badge display)** — old:

```tsx
{getRarityTier(rarityPercent)}
```

new:

```tsx
{tTier(getRarityTier(rarityPercent))}
```

- [ ] **Step 2.7: Update `s/[id]/page.tsx` — translate the tier callout**

Open `src/app/s/[id]/page.tsx`. The file imports `getRarityTier` at line 11 (from `@/shared/lib/rarity`, the re-export shim — works after T2). The page is `async function SharePage` (server component) — use `getTranslations` from `next-intl/server`. Locale is forced `'en'` by `s/layout.tsx` per Q3=a in spec.

At the top, add to imports (group with other server-side next-intl imports if present, or as a new line):

```ts
import { getTranslations } from 'next-intl/server';
```

Inside the `SharePage` function body (above the `return` and after the existing `passport` is loaded), add:

```ts
const tTier = await getTranslations({ locale: 'en', namespace: 'astro.rarityTier' });
```

(Place this after the line where `passport` is first available in the current scope; if the function passes `passport` to a sub-render, the `tTier` should also be in the same scope.)

Update line 234. Old:

```tsx
              {getRarityTier(passport.rarityPercent)}
```

new:

```tsx
              {tTier(getRarityTier(passport.rarityPercent))}
```

- [ ] **Step 2.8: Update `og/passport/[id]/route.tsx` — translate tier (locale stays EN for now)**

Open `src/app/api/og/passport/[id]/route.tsx`. At the top, add:

```ts
import { getTranslations } from 'next-intl/server';
```

In the GET handler, after the DB lookup succeeds and before the "Derived display values" comment block (line 160), add:

```ts
  // T2: Translate rarity tier — locale always 'en' until T4 reads passport.locale.
  const tTier = await getTranslations({ locale: 'en', namespace: 'astro.rarityTier' });
```

Then update line 172. Old:

```ts
  const rarityDisplay   = getRarityTier(passport.rarityPercent);
```

new:

```ts
  const rarityDisplay   = tTier(getRarityTier(passport.rarityPercent));
```

- [ ] **Step 2.9: Run typecheck + full test suite**

```bash
npm run typecheck
npm test
```

Expected: zero TS errors, all tests green (including the new `rarity.test.ts`).

- [ ] **Step 2.10: Manual smoke — verify EN render unchanged**

Run `npm run dev` and:
- Open `http://localhost:3000/chart` (EN locale fallback). Generate a passport. PassportCard displays "Exceptional" / "Very Rare" / "Rare" / "Uncommon" identically to pre-T2.
- Open `http://localhost:3000/api/og/passport/<some-existing-id>?format=og` directly — rarity stamp shows uppercase EN tier word as before.

- [ ] **Step 2.11: Commit**

```bash
git add src/modules/astro-engine/rarity.ts \
        src/modules/astro-engine/__tests__/rarity.test.ts \
        src/modules/astro-engine/components/PassportCard.tsx \
        src/app/s/[id]/page.tsx \
        src/app/api/og/passport/[id]/route.tsx
git commit -m "refactor(passport-share-i18n/T2): getRarityTier returns typed keys + i18n-translate at all 5 callsites

RarityTier: 'Exceptional' | 'Very Rare' | 'Rare' | 'Uncommon'
       →    'exceptional' | 'veryRare' | 'rare' | 'uncommon'

Every callsite now wraps the key with a translator from astro.rarityTier
(EN locale forced in OG route — T4 will swap to passport.locale).

EN-locale render is identical to pre-T2.
ES-locale (/es/chart, PassportCard) now displays 'Excepcional' / 'Muy raro'
/ 'Raro' / 'Poco común' for the tier word."
```

---

## Task 3 (T3): i18n the ShareButton component + add render tests

**Why third:** Self-contained client component. EN render is identical post-T3 (one-to-one string→key swap). Activates ES localization in `[locale]/chart`. The `/s/[id]` render context is intentionally EN-only by `s/layout.tsx:24` (per spec Q3=a) — T3 wires keys but they only activate from `[locale]/chart`.

**Files:**
- Modify: `src/modules/astro-engine/components/ShareButton.tsx`
- Create: `src/modules/astro-engine/components/__tests__/ShareButton.test.tsx`

- [ ] **Step 3.1: Write failing component test `ShareButton.test.tsx`**

Create `src/modules/astro-engine/components/__tests__/ShareButton.test.tsx`:

```tsx
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ShareButton } from '../ShareButton';

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: {
    PASSPORT_RESHARED: 'passport_reshared',
    PASSPORT_DOWNLOADED: 'passport_downloaded',
  },
}));

vi.mock('@/shared/lib/share', () => ({
  buildShareUrl: (url: string, _channel: string) => url,
}));

const passport = {
  id: 'test-id',
  sunSign: 'Aries',
  moonSign: 'Taurus',
  ascendantSign: 'Gemini',
  element: 'Fire',
  rulingPlanet: 'Mars',
  rarityPercent: 5.5,
} as unknown as Parameters<typeof ShareButton>[0]['passport'];

const enMessages = {
  share: {
    passport: {
      copy: { x: '', telegram: '', whatsapp: '', stories_caption: '', native_share: '' },
      title: 'My Cosmic Passport',
      button: {
        share: 'Share Passport',
        copyLink: 'Copy Link',
        copyShort: 'Copy',
        copied: 'Copied!',
        copiedShort: 'Copied',
        downloading: 'Downloading...',
      },
      aria: {
        container: 'Share your Cosmic Passport',
        shareNative: 'Share your Cosmic Passport via the native share menu',
        shareOnX: 'Share on X',
        shareOnTelegram: 'Share on Telegram',
        shareOnWhatsApp: 'Share on WhatsApp',
        linkCopied: 'Link copied to clipboard',
        copyShareLink: 'Copy share link',
        linkCopiedShort: 'Link copied',
        copyLinkShort: 'Copy link',
        downloadFormat: 'Download format',
        downloadAs: 'Download as {format} PNG',
      },
    },
  },
};

const esMessages = {
  share: {
    passport: {
      copy: { x: '', telegram: '', whatsapp: '', stories_caption: '', native_share: '' },
      title: 'Mi Pasaporte Cósmico',
      button: {
        share: 'Compartir pasaporte',
        copyLink: 'Copiar enlace',
        copyShort: 'Copiar',
        copied: '¡Copiado!',
        copiedShort: 'Copiado',
        downloading: 'Descargando...',
      },
      aria: {
        container: 'Comparte tu Pasaporte Cósmico',
        shareNative: 'Comparte tu Pasaporte Cósmico mediante el menú nativo',
        shareOnX: 'Compartir en X',
        shareOnTelegram: 'Compartir en Telegram',
        shareOnWhatsApp: 'Compartir en WhatsApp',
        linkCopied: 'Enlace copiado al portapapeles',
        copyShareLink: 'Copiar enlace para compartir',
        linkCopiedShort: 'Enlace copiado',
        copyLinkShort: 'Copiar enlace',
        downloadFormat: 'Formato de descarga',
        downloadAs: 'Descargar como PNG {format}',
      },
    },
  },
};

beforeEach(() => {
  // jsdom doesn't define navigator.share — stub it so primary "Share Passport"
  // branch renders. Without this, ShareButton falls back to "Copy Link".
  vi.stubGlobal('navigator', { ...globalThis.navigator, share: vi.fn(), clipboard: { writeText: vi.fn() } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ShareButton — EN render', () => {
  it('shows primary button "Share Passport"', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ShareButton passportId="test-id" passport={passport} />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole('button', { name: /share your cosmic passport via the native share menu/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Share Passport')).toBeInTheDocument();
  });
});

describe('ShareButton — ES render', () => {
  it('shows primary button "Compartir pasaporte"', () => {
    render(
      <NextIntlClientProvider locale="es" messages={esMessages}>
        <ShareButton passportId="test-id" passport={passport} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Compartir pasaporte')).toBeInTheDocument();
  });

  it('localizes one aria-label per category (container, social, download)', () => {
    render(
      <NextIntlClientProvider locale="es" messages={esMessages}>
        <ShareButton passportId="test-id" passport={passport} />
      </NextIntlClientProvider>,
    );
    // Container
    expect(screen.getByLabelText('Comparte tu Pasaporte Cósmico')).toBeInTheDocument();
    // Social link
    expect(screen.getByLabelText('Compartir en X')).toBeInTheDocument();
    // Download format select
    expect(screen.getByLabelText('Formato de descarga')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3.2: Run the test — verify it fails**

```bash
npx vitest run src/modules/astro-engine/components/__tests__/ShareButton.test.tsx
```

Expected: FAIL — current ShareButton renders hardcoded EN strings; ES expectations fail.

- [ ] **Step 3.3: Update `ShareButton.tsx` — change useTranslations namespace + replace strings**

Open `src/modules/astro-engine/components/ShareButton.tsx`. The component currently calls `useTranslations('share.passport.copy')` (line 43). Change the hook to root namespace and derive copy via sub-namespace:

Replace line 43:

```tsx
  const t = useTranslations('share.passport.copy');
```

with:

```tsx
  const t = useTranslations('share.passport');
```

Then update lines 60-63 (per-channel copy text) — old:

```tsx
  const xCopy        = interpolate(t('x'),            { ...copyVars, url: buildShareUrl(rawUrl, 'x') });
  const telegramCopy = interpolate(t('telegram'),      { ...copyVars, url: buildShareUrl(rawUrl, 'telegram') });
  const whatsappCopy = interpolate(t('whatsapp'),      { ...copyVars, url: buildShareUrl(rawUrl, 'whatsapp') });
  const nativeCopy   = interpolate(t('native_share'),  { ...copyVars, url: buildShareUrl(rawUrl, 'native') });
```

new (route through `copy.*` sub-namespace):

```tsx
  const xCopy        = interpolate(t('copy.x'),            { ...copyVars, url: buildShareUrl(rawUrl, 'x') });
  const telegramCopy = interpolate(t('copy.telegram'),      { ...copyVars, url: buildShareUrl(rawUrl, 'telegram') });
  const whatsappCopy = interpolate(t('copy.whatsapp'),      { ...copyVars, url: buildShareUrl(rawUrl, 'whatsapp') });
  const nativeCopy   = interpolate(t('copy.native_share'),  { ...copyVars, url: buildShareUrl(rawUrl, 'native') });
```

Update line 70 (Web Share API title) — old:

```tsx
        title: "My Cosmic Passport",
```

new:

```tsx
        title: t('title'),
```

Replace line 133 (container aria-label) — old:

```tsx
      aria-label="Share your Cosmic Passport"
```

new:

```tsx
      aria-label={t('aria.container')}
```

Replace line 146 (native-share button aria-label) — old:

```tsx
          aria-label="Share your Cosmic Passport via the native share menu"
```

new:

```tsx
          aria-label={t('aria.shareNative')}
```

Replace line 149 (native-share button text) — old:

```tsx
          Share Passport
```

new:

```tsx
          {t('button.share')}
```

Replace line 165 (copy-link button aria-label, conditional) — old:

```tsx
          aria-label={shareState === 'copied' ? 'Link copied to clipboard' : 'Copy share link'}
```

new:

```tsx
          aria-label={shareState === 'copied' ? t('aria.linkCopied') : t('aria.copyShareLink')}
```

Replace line 169 (copy-link button text, conditional) — old:

```tsx
          {shareState === 'copied' ? 'Copied!' : 'Copy Link'}
```

new:

```tsx
          {shareState === 'copied' ? t('button.copied') : t('button.copyLink')}
```

Replace line 186 (secondary copy aria-label, conditional) — old:

```tsx
            aria-label={shareState === 'copied' ? 'Link copied' : 'Copy link'}
```

new:

```tsx
            aria-label={shareState === 'copied' ? t('aria.linkCopiedShort') : t('aria.copyLinkShort')}
```

Replace line 190 (secondary copy text, conditional) — old:

```tsx
            {shareState === 'copied' ? 'Copied' : 'Copy'}
```

new:

```tsx
            {shareState === 'copied' ? t('button.copiedShort') : t('button.copyShort')}
```

Replace line 206 (X aria-label) — old:

```tsx
          aria-label="Share on X"
```

new:

```tsx
          aria-label={t('aria.shareOnX')}
```

Replace line 225 (Telegram aria-label) — old:

```tsx
          aria-label="Share on Telegram"
```

new:

```tsx
          aria-label={t('aria.shareOnTelegram')}
```

Replace line 244 (WhatsApp aria-label) — old:

```tsx
          aria-label="Share on WhatsApp"
```

new:

```tsx
          aria-label={t('aria.shareOnWhatsApp')}
```

Replace line 262 (download-format select aria-label) — old:

```tsx
            aria-label="Download format"
```

new:

```tsx
            aria-label={t('aria.downloadFormat')}
```

Replace line 278 (download button aria-label, conditional) — old:

```tsx
            aria-label={shareState === 'downloading' ? 'Downloading...' : `Download as ${downloadFormat} PNG`}
```

new:

```tsx
            aria-label={shareState === 'downloading' ? t('button.downloading') : t('aria.downloadAs', { format: downloadFormat })}
```

(Note: `t('aria.downloadAs', { format })` interpolates the catalog placeholder `{format}` per next-intl ICU MessageFormat.)

- [ ] **Step 3.4: Run the test — verify it passes**

```bash
npx vitest run src/modules/astro-engine/components/__tests__/ShareButton.test.tsx
```

Expected: PASS — all 3 specs (C1, C2, C3) green.

- [ ] **Step 3.5: Run typecheck + lint**

```bash
npm run typecheck
npm run lint
```

Expected: zero errors.

- [ ] **Step 3.6: Manual smoke — confirm EN unchanged + ES localized**

Run `npm run dev`:
- `http://localhost:3000/chart` → ShareButton text/aria identical to pre-T3.
- `http://localhost:3000/es/chart` → ShareButton primary button reads "Compartir pasaporte"; native sharesheet title "Mi Pasaporte Cósmico"; aria-labels in ES.
- `http://localhost:3000/s/<existing-id>` → ShareButton stays in EN (per `s/layout.tsx` Q3=a). This is intentional.

- [ ] **Step 3.7: Commit**

```bash
git add src/modules/astro-engine/components/ShareButton.tsx \
        src/modules/astro-engine/components/__tests__/ShareButton.test.tsx
git commit -m "feat(passport-share-i18n/T3): localize ShareButton UI + aria-labels in EN+ES

Replaces 13 hardcoded EN strings/aria-labels with t() calls from
share.passport namespace (button.*, aria.*, title for Web Share API).

Hook namespace widened from share.passport.copy → share.passport;
existing copy keys re-routed through copy.* sub-namespace.

EN render identical to pre-T3.
/es/chart now fully localized (button text, aria-labels, native sharesheet).
/s/[id] stays EN-only by design (s/layout.tsx Q3=a)."
```

---

## Task 4 (T4): Read `passport.locale` from DB row + i18n the OG image route

**Why fourth:** Higher blast radius — affects the viral preview path that external crawlers cache for `IMMUTABLE_1Y`. Must come after T1 (catalog keys) and T2 (rarity refactor + EN translation in route). Closes audit item #12.

**Files:**
- Modify: `src/app/api/og/passport/[id]/route.tsx`
- Create: `src/app/api/og/passport/[id]/__tests__/route.test.ts`

- [ ] **Step 4.1: Write failing route test `route.test.ts`**

Create `src/app/api/og/passport/[id]/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks must be declared BEFORE the route import (vitest hoists vi.mock). ──

const mockGetTranslations = vi.fn(async ({ locale, namespace }: { locale: string; namespace: string }) => {
  // Return a translator that echoes "[locale][namespace.key]" so the test
  // can assert which locale + namespace was actually requested.
  return ((key: string, vars?: Record<string, string>) => {
    const interpolated = vars
      ? key.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
      : key;
    return `[${locale}][${namespace}.${interpolated}]`;
  }) as unknown as ReturnType<typeof Object>;
});

vi.mock('next-intl/server', () => ({
  getTranslations: mockGetTranslations,
}));

const mockSentryCapture = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: mockSentryCapture,
}));

// Chainable Drizzle mock: db.select().from(t).where(c).limit(n) returns rows.
function makeDbMock(row: Record<string, unknown> | null) {
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(row ? [row] : []),
  };
  return { select: () => builder };
}

const dbHandle = { current: makeDbMock(null) };
vi.mock('@/shared/lib/db', () => ({
  getDb: () => dbHandle.current,
}));

vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({
    limit: async () => ({ success: true, limit: 60, remaining: 59, reset: Date.now() + 60_000 }),
  }),
}));

// ImageResponse: replace with a no-op that returns a 200 Response.
vi.mock('@vercel/og', () => ({
  ImageResponse: vi.fn().mockImplementation(() => new Response('mock-png', {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
  })),
}));

// fs.promises.readFile for the font load — return a 4-byte fake buffer.
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn().mockResolvedValue(Buffer.from([0, 0, 0, 0])),
  },
}));

// ── Import the route under test AFTER all mocks are set up ──────────────────
import { GET } from '../route';

const baseRow = {
  id: 'test-id',
  sunSign: 'Aries',
  moonSign: 'Taurus',
  ascendantSign: 'Gemini',
  element: 'Fire',
  rulingPlanet: 'Mars',
  rarityPercent: 5.5,
  locale: 'en',
};

function buildRequest(): Request {
  return new Request('https://estrevia.app/api/og/passport/test-id?format=og', {
    method: 'GET',
    headers: { 'x-forwarded-for': '127.0.0.1' },
  });
}

const params = Promise.resolve({ id: 'test-id' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OG passport route — locale propagation (R1)', () => {
  it('passes locale=es to getTranslations when passport.locale is "es"', async () => {
    dbHandle.current = makeDbMock({ ...baseRow, locale: 'es' });

    const res = await GET(buildRequest(), { params });

    expect(res.status).toBe(200);
    expect(mockGetTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'es', namespace: 'share.passport.og' }),
    );
    expect(mockGetTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'es', namespace: 'astro.rarityTier' }),
    );
  });

  it('passes locale=en when passport.locale is "en"', async () => {
    dbHandle.current = makeDbMock({ ...baseRow, locale: 'en' });

    await GET(buildRequest(), { params });

    expect(mockGetTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en', namespace: 'share.passport.og' }),
    );
  });
});

describe('OG passport route — invalid-locale fallback (R2)', () => {
  it('falls back to EN + reports Sentry when locale is unexpected', async () => {
    dbHandle.current = makeDbMock({ ...baseRow, locale: 'fr' as 'en' | 'es' });

    const res = await GET(buildRequest(), { params });

    expect(res.status).toBe(200);
    // Fallback to EN
    expect(mockGetTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en', namespace: 'share.passport.og' }),
    );
    // Sentry observability tag
    expect(mockSentryCapture).toHaveBeenCalled();
    const captured = mockSentryCapture.mock.calls[0]?.[0];
    const message = captured instanceof Error ? captured.message : String(captured);
    expect(message).toMatch(/og_locale_invalid/);
  });
});
```

- [ ] **Step 4.2: Run the test — verify it fails**

```bash
npx vitest run src/app/api/og/passport/[id]/__tests__/route.test.ts
```

Expected: FAIL — route still uses hardcoded `'en'` locale (from T2); R1 ES assertion fails; R2 Sentry capture not yet implemented.

- [ ] **Step 4.3: Update OG route — read `passport.locale` + translate all OG strings**

Open `src/app/api/og/passport/[id]/route.tsx`.

**Imports** — already added in T2:

```ts
import { getTranslations } from 'next-intl/server';
```

Add (or confirm) Sentry import. The file already does dynamic `await import('@sentry/nextjs')` for DB errors at lines 127-128. For T4, hoist to a top-level static import for the locale-fallback path:

After line 9 (existing imports), add:

```ts
import { captureException } from '@sentry/nextjs';
```

(Keep the dynamic import in the DB catch block — they don't conflict.)

**Replace the T2 translator block** (currently inserted just above "Derived display values" comment — after the `if (!passport)` block). Old:

```ts
  // T2: Translate rarity tier — locale always 'en' until T4 reads passport.locale.
  const tTier = await getTranslations({ locale: 'en', namespace: 'astro.rarityTier' });
```

new:

```ts
  // -------------------------------------------------------------------------
  // T4: Resolve locale from DB row + load translations
  // -------------------------------------------------------------------------
  const rawLocale = passport.locale;
  const safeLocale: 'en' | 'es' = rawLocale === 'es' ? 'es' : 'en';
  if (rawLocale !== 'en' && rawLocale !== 'es') {
    captureException(new Error(`og_locale_invalid: ${rawLocale}`));
  }

  let t: Awaited<ReturnType<typeof getTranslations>>;
  let tTier: Awaited<ReturnType<typeof getTranslations>>;
  try {
    [t, tTier] = await Promise.all([
      getTranslations({ locale: safeLocale, namespace: 'share.passport.og' }),
      getTranslations({ locale: safeLocale, namespace: 'astro.rarityTier' }),
    ]);
  } catch (err) {
    // Fallback to EN: better an EN preview than a 500 in the viral path.
    captureException(new Error(`og_i18n_load_failed: ${String(err)}`));
    [t, tTier] = await Promise.all([
      getTranslations({ locale: 'en', namespace: 'share.passport.og' }),
      getTranslations({ locale: 'en', namespace: 'astro.rarityTier' }),
    ]);
  }
```

**Update derived display values** at lines 169-173 — old:

```ts
  const elementStyle    = ELEMENT_STYLE[passport.element]      ?? { color: '#888', symbol: '◇' };
  const rulingColor     = PLANET_COLOR[passport.rulingPlanet]  ?? '#E2C97E';
  const rulingSymbol    = (PLANET_SYMBOL[passport.rulingPlanet] ?? '★') + TV;
  const rarityDisplay   = tTier(getRarityTier(passport.rarityPercent));
  const rarityPct       = passport.rarityPercent.toFixed(1);
```

(unchanged — `tTier(getRarityTier(...))` already correct from T2; the locale source has flipped via the new `tTier` binding above.)

**Update RarityStamp internal label** at line 245. Old:

```tsx
          RARITY
```

new:

```tsx
          {t('rarityLabel')}
```

**Update OG layout (lines 372, 379)** — old:

```tsx
            Sidereal Astrology
```

```tsx
            COSMIC BLUEPRINT
```

new:

```tsx
            {t('eyebrow')}
```

```tsx
            {t('title')}
```

**Update OG layout sign labels (lines 397, 402, 408, 410)** — old:

```tsx
            <SignCol label="☉ SUN" glyph={sunGlyph} signName={passport.sunSign}
```

```tsx
            <SignCol label="☽ MOON" glyph={moonGlyph} signName={passport.moonSign}
```

```tsx
              label="↑ RISING"
              glyph={ascGlyph ?? '–'}
              signName={passport.ascendantSign ?? 'Unknown'}
```

new:

```tsx
            <SignCol label={t('label.sun')} glyph={sunGlyph} signName={passport.sunSign}
```

```tsx
            <SignCol label={t('label.moon')} glyph={moonGlyph} signName={passport.moonSign}
```

```tsx
              label={t('label.rising')}
              glyph={ascGlyph ?? '–'}
              signName={passport.ascendantSign ?? t('unknown')}
```

**Update Stories layout (lines 463, 470, 477)** — old:

```tsx
            Sidereal Astrology
```

```tsx
            COSMIC
```

```tsx
            BLUEPRINT
```

new:

```tsx
            {t('eyebrow')}
```

```tsx
            {t('titleLine1')}
```

```tsx
            {t('titleLine2')}
```

**Update Stories layout sign labels (lines 495, 500, 506, 508)** — same `label={...}` pattern as OG layout above:

```tsx
            <SignCol label={t('label.sun')} glyph={sunGlyph} signName={passport.sunSign}
```

```tsx
            <SignCol label={t('label.moon')} glyph={moonGlyph} signName={passport.moonSign}
```

```tsx
              label={t('label.rising')}
              glyph={ascGlyph ?? '–'}
              signName={passport.ascendantSign ?? t('unknown')}
```

**Update Square layout (lines 553, 556)** — old:

```tsx
            Sidereal Astrology
```

```tsx
            COSMIC BLUEPRINT
```

new:

```tsx
            {t('eyebrow')}
```

```tsx
            {t('title')}
```

**Update Square layout sign labels (lines 563, 566, 569-572)** — old:

```tsx
          <SignCol label="☉ SUN" glyph={sunGlyph} signName={passport.sunSign}
```

```tsx
          <SignCol label="☽ MOON" glyph={moonGlyph} signName={passport.moonSign}
```

```tsx
            label="↑ RISING"
            glyph={ascGlyph ?? '–'}
            signName={passport.ascendantSign ?? 'Unknown'}
```

new:

```tsx
          <SignCol label={t('label.sun')} glyph={sunGlyph} signName={passport.sunSign}
```

```tsx
          <SignCol label={t('label.moon')} glyph={moonGlyph} signName={passport.moonSign}
```

```tsx
            label={t('label.rising')}
            glyph={ascGlyph ?? '–'}
            signName={passport.ascendantSign ?? t('unknown')}
```

**Update BadgeRow "Ruled by" label (line 315)** — old:

```tsx
        <span style={{ fontSize: `${px}px`, color: 'rgba(255,255,255,0.45)', display: 'flex' }}>Ruled by</span>
```

new:

```tsx
        <span style={{ fontSize: `${px}px`, color: 'rgba(255,255,255,0.45)', display: 'flex' }}>{t('ruledBy')}</span>
```

- [ ] **Step 4.4: Run the test — verify it passes**

```bash
npx vitest run src/app/api/og/passport/[id]/__tests__/route.test.ts
```

Expected: PASS — both R1 (locale propagation) and R2 (invalid-locale fallback) green.

- [ ] **Step 4.5: Run typecheck + full test suite**

```bash
npm run typecheck
npm test
```

Expected: zero errors, all tests green.

- [ ] **Step 4.6: Manual smoke — verify ES OG image renders correctly**

Run `npm run dev`:
- Create an ES passport: `http://localhost:3000/es/chart` → enter birth data → record passport ID.
- Open the OG image directly: `http://localhost:3000/api/og/passport/<es-id>?format=og`. Verify rendering shows: `Astrología sideral`, `BLUEPRINT CÓSMICO`, `☉ SOL`, `☽ LUNA`, `↑ ASC`, `RAREZA`, `Regido por`.
- Open an existing EN passport's OG image — should be identical to pre-deploy (zero EN regression).
- Stories format: `?format=stories` → verify two-line title shows `BLUEPRINT` then `CÓSMICO` (titleLine1/titleLine2).
- POCO COMÚN visual check: find or create a passport with `rarityPercent ≥ 7.5` → verify text fits within 148px stamp without overflow. If overflow: reduce `tierPx` from 14 to 12 in the og/stories/square layouts (fields on `<RarityStamp tierPx={...} />`).

- [ ] **Step 4.7: Commit**

```bash
git add src/app/api/og/passport/[id]/route.tsx \
        src/app/api/og/passport/[id]/__tests__/route.test.ts
git commit -m "feat(passport-share-i18n/T4): OG image route reads passport.locale + i18n strings

OG route now resolves locale from cosmicPassports.locale (already in schema)
and renders all 10 strings via getTranslations({ locale: safeLocale }).

Defensive: invalid locale value → fallback to EN + Sentry tag og_locale_invalid.
Translator load failure → fallback to EN + Sentry tag og_i18n_load_failed.

ES passports now render localized OG previews ('Astrología sideral',
'BLUEPRINT CÓSMICO', '☉ SOL' / '☽ LUNA' / '↑ ASC', 'RAREZA', 'Regido por').

Pre-existing EN passports render identically — IMMUTABLE_1Y cache key
(passport ID + format) is stable; locale is determined by row, not URL."
```

---

## Task 5 (T5): i18n key parity test

**Why last:** Test-only, can be merged any time after T1. Sequence at the end so failures from earlier tasks (e.g. forgetting to add an ES key) are caught now and not at deploy.

**Files:**
- Create: `scripts/qa/i18n-key-parity.test.ts`

- [ ] **Step 5.1: Verify the directory exists (create if not)**

```bash
mkdir -p scripts/qa
```

- [ ] **Step 5.2: Write the parity test**

Create `scripts/qa/i18n-key-parity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

/**
 * Recursively flattens a nested object into a list of dot-separated key paths.
 * Stops descending at non-object values.
 */
function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const next = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) {
      return flattenKeys(v, next);
    }
    return [next];
  });
}

/**
 * KNOWN_DRIFT — pre-existing parity violations not in scope of Cluster A.
 *
 * Populate empirically on first run: any keys this test reports as missing
 * BEFORE Cluster A added new keys are baseline drift, to be cleaned up in a
 * follow-up commit outside this plan. Keys added in T1 (Cluster A) MUST
 * NOT be added here — they should be present on both sides.
 *
 * After cleanup commit, this set should be emptied.
 */
const KNOWN_DRIFT: ReadonlySet<string> = new Set<string>([
  // Populated on first run after T5 lands. Empty for now.
]);

describe('i18n key parity — messages/en.json ↔ messages/es.json', () => {
  const enKeys = new Set(flattenKeys(en));
  const esKeys = new Set(flattenKeys(es));

  it('every EN key exists in ES (no missing translations)', () => {
    const missing = [...enKeys].filter(
      (k) => !esKeys.has(k) && !KNOWN_DRIFT.has(k),
    );
    expect(missing, `Missing in es.json: ${missing.join(', ')}`).toEqual([]);
  });

  it('every ES key exists in EN (no orphan translations)', () => {
    const missing = [...esKeys].filter(
      (k) => !enKeys.has(k) && !KNOWN_DRIFT.has(k),
    );
    expect(missing, `Missing in en.json: ${missing.join(', ')}`).toEqual([]);
  });
});
```

- [ ] **Step 5.3: Run the test — observe result**

```bash
npx vitest run scripts/qa/i18n-key-parity.test.ts
```

Possible outcomes:

**(a) PASS** — catalogs are clean post-T1. Continue to Step 5.5.

**(b) FAIL with missing keys** — pre-existing drift in en.json or es.json beyond what Cluster A added. The failure message lists the offending keys. Inspect each:

- If the key was added by T1 (search for it in the new keys section of §3.3 of the spec): the corresponding catalog is missing it. Fix in T1 file (re-edit `messages/en.json` or `messages/es.json` to add the key) and re-run.
- If the key is unrelated to Cluster A (e.g., something in `essays.*` or `pricing.*`): copy the key path into `KNOWN_DRIFT`. Continue to Step 5.4.

- [ ] **Step 5.4 (conditional): Populate `KNOWN_DRIFT` if pre-existing drift found**

If Step 5.3 reported pre-existing drift unrelated to Cluster A, edit `scripts/qa/i18n-key-parity.test.ts` and add the offending key paths to `KNOWN_DRIFT`. Example shape:

```ts
const KNOWN_DRIFT: ReadonlySet<string> = new Set<string>([
  'essays.someOrphanKey',
  'pricing.legacyPromoBanner.headline',
  // ... etc
]);
```

Then re-run Step 5.3 — should PASS now.

**Follow-up task (NOT in this plan):** clean baseline drift in a separate commit. Open a TODO with the listed keys; either translate or remove them, then empty `KNOWN_DRIFT`.

- [ ] **Step 5.5: Run full test suite + lint**

```bash
npm test
npm run lint
```

Expected: all green.

- [ ] **Step 5.6: Commit**

```bash
git add scripts/qa/i18n-key-parity.test.ts
git commit -m "test(passport-share-i18n/T5): i18n key parity en.json ↔ es.json

Recursive deep-key diff. Fails on any new key drift in either direction.
Pre-existing drift (if any) captured in KNOWN_DRIFT to scope this commit
to Cluster A; baseline cleanup is a separate follow-up task."
```

---

## Pre-merge verification (after T5)

- [ ] **All commits in correct order**: `git log --oneline -5` shows T1 → T2 → T3 → T4 → T5 chronologically.
- [ ] `npm test` passes (rarity unit + ShareButton component + OG route + i18n parity).
- [ ] `npm run typecheck` passes (no widening of `RarityTier` return type).
- [ ] `npm run lint` passes.
- [ ] Manual smoke per spec §7.3 completed for both EN and ES (Steps 2.10, 3.6, 4.6 are the per-task subsets; do a final whole-flow walkthrough).
- [ ] No new Sentry alerts on `og_locale_invalid` or `og_i18n_load_failed` after T4 deploys.
- [ ] Translation review: founder confirms ES copy reads naturally in español neutro LATAM (cross-check spec §3.3 against any precedent collisions).

---

## Self-review notes (inline fixes applied)

- **T2 ordering**: Initially considered leaving `og/route.tsx:172` for T4. Rejected — would render `'exceptional'` lowercase between T2 and T4 (visible regression in EN OG images). T2 now wraps the literal locally with `getTranslations({ locale: 'en' })`; T4 swaps the locale source to `safeLocale`. Visual identity preserved at every commit boundary.
- **PassportCard `useTranslations` in shared component**: `next-intl@3+`'s `useTranslations` hook works in both Server Components (RSC) and Client Components without `'use client'` directive — confirmed by next-intl docs. PassportCard remains shared, no directive change needed.
- **Component test path coupling**: ShareButton.test.tsx uses inline `enMessages`/`esMessages` objects rather than importing `messages/{en,es}.json` (5-up relative path). Real-catalog drift is caught by T5's parity test instead. Cleaner separation of concerns: T3 verifies key→render binding; T5 verifies catalog completeness.
- **Sentry import in OG route**: Hoisted to top-level static import (already present as dynamic in DB catch). Both can co-exist — dynamic for DB-error path, static for locale-fallback path.
