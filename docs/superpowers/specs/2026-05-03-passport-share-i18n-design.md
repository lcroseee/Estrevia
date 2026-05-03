# Passport Share i18n — Design Spec

| Field | Value |
| --- | --- |
| Date | 2026-05-03 |
| Status | Draft → pending founder review |
| Authors | Lead (Claude Opus 4.7) + brainstorming with founder |
| Trigger | 2026-05-03 audit (in-conversation) — Cluster A of 7-cluster decomposition |
| Scope | Passport share flow i18n — ShareButton in `[locale]/chart` + OG image route + `getRarityTier()` refactor |
| Branch model | Direct-to-main per CLAUDE.md `feedback_main_branch_workflow`; 5 sequential commits T1–T5 |
| Estimated effort | ~3h end-to-end |
| Verification | `npm test` + `npm run typecheck` + `npm run lint` + manual share smoke (EN+ES) post-deploy |

## Decisions log (from brainstorming Q1–Q3)

| Q | Decision | Reasoning |
| --- | --- | --- |
| Q1 — scope boundary | **B** — Comprehensive sweep (~13 ShareButton strings + ~10 OG strings + rarity refactor) | Audit named 3 items; actual surface is much larger. Doing it twice (now A, later "i18n part 2") doubles the diff and review without gain. ES users with screen readers deserve ES aria-labels per WCAG 2.1 AA (CLAUDE.md). |
| Q2 — `getRarityTier()` i18n strategy | **(a) + (a-with-card)** — Refactor function return type to typed key; translate at all 5 callsites including PassportCard | Function return is a public contract; tier identity (code-level) belongs separated from display label (UI/i18n). All 5 callsites are in our codebase, breaking change is safe. Translating at PassportCard avoids leaving a lurking i18n bug; bilingual aria mix accepted as stepping-stone. |
| Q3 — `/s/[id]` layout localization | **(a)** — Keep EN-only by existing design | Layout comment explicitly cites `spec §2.3 #14` (noindex, simplification for viral URLs). Localizing introduces SEO/cache complexity outside Cluster A scope; the OG image (T4) already addresses the recipient-preview UX. Localizing the share landing page is a separate sub-project. |
| Implementation strategy | **Approach 3** — Risk-graded sequence (5 separate commits) | Matches the established `seo-phase3/T1`–`T6` pattern; smallest blast radius first; each commit independently revertable; T1+T2 are deploy-safe (no behavior change in EN-locale). |

---

## §0. Context — state at session start (verified 2026-05-03)

Cluster A is the first of 7 sub-projects identified in the May-3 audit decomposition. Audit named items #10, #11, #12 in this cluster. Verification expanded the surface to ~13 hardcoded EN strings in `ShareButton.tsx` (not just 2) + ~10 strings in `og/passport/[id]/route.tsx` + the `getRarityTier()` literal-return problem.

**Verified ground truth:**

| Claim | Verified | Action |
| --- | --- | --- |
| `ShareButton.tsx:70` hardcoded `title: "My Cosmic Passport"` | ✓ | T3 |
| `ShareButton.tsx:149` hardcoded `Share Passport` button label | ✓ | T3 |
| 11 additional hardcoded strings/aria-labels in `ShareButton.tsx` | ✓ (lines 133, 146, 165, 169, 186, 190, 206, 225, 244, 262, 278) | T3 |
| `og/passport/[id]/route.tsx` does not accept `?locale=` searchParam | ✓ (only `format` param at line 110) | T4 — read locale from `passport.locale` DB column instead (cleaner than URL param; auto backwards-compat) |
| ~10 hardcoded strings in OG route render | ✓ (lines 245, 252, 315, 372, 379, 397/402/408, 410, 463, 470/477, 553, 556) | T4 |
| `getRarityTier()` returns display literal, not key | ✓ (`rarity.ts:209,224`) | T2 |
| `getRarityTier()` is called from 5 sites | ✓ (`og/route:172`, `s/[id]/page:234`, `PassportCard:163,207,227`) | T2 |

**Key infrastructure finding:** `cosmicPassports.locale` column already exists in the schema (`schema.ts:218` — `text('locale', { enum: ['en', 'es'] }).notNull()`). The OG route can read locale directly from the DB row it already fetches. No URL parameter changes needed; automatic backwards compatibility for all existing passports.

**Critical context for ShareButton scope** — `src/app/s/layout.tsx:24` explicitly hardcodes `setRequestLocale('en')` with comment citing `spec §2.3 #14` ("share pages are EN-only, noindex, never localized"). This means ShareButton renders in two contexts:

| Context | Locale source | T3 effect |
| --- | --- | --- |
| `[locale]/chart` via `ChartDisplay.tsx:93` | URL segment via `[locale]/layout.tsx` | ✅ ES users see ES button + ES aria-labels |
| `/s/[id]` via `s/[id]/page.tsx:240` | Forced `'en'` by `s/layout.tsx:24` | ⚪ T3 strings wired but never activate (intentional per design) |

T3 closes audit items #10, #11 only for Context A (creator's experience when sharing). T4 closes audit item #12 for both creator-share and recipient-preview surfaces because the OG image is fetched directly by external crawlers, bypassing the EN-only share page layout.

---

## §1. Scope

### In scope (5 tickets)

- **T1** — Add EN+ES translation catalog keys per §3 (no behavior change).
- **T2** — Refactor `getRarityTier()` return type from display literal to typed key; update all 5 callsites; add unit tests.
- **T3** — `ShareButton.tsx`: replace ~13 hardcoded EN strings/aria-labels with `t()` calls. Add component test in EN+ES.
- **T4** — `og/passport/[id]/route.tsx`: read `passport.locale` from DB row; translate ~10 rendered strings via `getTranslations({ locale })`. Add route test.
- **T5** — i18n key parity test between `messages/en.json` and `messages/es.json`.

### Out of scope (explicit non-goals)

- ❌ Full i18n of `PassportCard.tsx` — in-app card hardcoded EN strings beyond rarity tier (e.g., the long aria-label on line 163 with `Sun in {sign}, Moon in {sign}, Element {element}, Ruling planet {planet}`). Separate sub-project "in-app card i18n".
- ❌ Localization of `/s/[id]` share landing page layout (currently EN-only by design — see §0). Separate sub-project "localize share landing page".
- ❌ `SynastryShareButton` and `s/synastry/[id]` i18n. No `SynastryShareButton` component currently exists; `s/synastry/[id]` page may have hardcoded EN strings of its own. Separate sub-project.
- ❌ A/B testing of share copy or OG copy variants — Cluster D / E in the May-3 decomposition.
- ❌ OG image visual redesign / new layout elements / WebP/AVIF conversion.
- ❌ Cleanup of unused catalog key `share.passport.copy.stories_caption` (no callsite found in code).
- ❌ Audit items #1–9, #13–20 — separate clusters per the May-3 decomposition table.
- ❌ Audit item #19 (paywall trigger UX) — verified correct in `PaywallModal.tsx:48`, dropped.

---

## §2. Approach — risk-graded sequence (5 commits)

5 separate commits in order of increasing blast radius. Each commit is independently revertable; no commit depends on a later one for correctness.

| Order | Ticket | Files | Blast radius | Effort |
| --- | --- | --- | --- | --- |
| 1 | **T1** Add catalog keys | `messages/en.json`, `messages/es.json` | Zero — no code reads new keys yet | 30 min |
| 2 | **T2** Rarity refactor + callsite updates + unit test | `rarity.ts`, `PassportCard.tsx`, `s/[id]/page.tsx`, `og/route.tsx`, `rarity.test.ts` | Zero in EN-locale (identical render); ES-locale shows translated tier word in `/es/chart` | 45 min |
| 3 | **T3** ShareButton i18n + component test | `ShareButton.tsx`, `ShareButton.test.tsx` | One component; EN identical, ES localized in `/es/chart` | 45 min |
| 4 | **T4** OG image i18n + locale read + route test | `og/passport/[id]/route.tsx`, `route.test.ts` | OG render path; EN passport identical, ES passport newly localized | 45 min |
| 5 | **T5** i18n key parity script | `scripts/qa/i18n-key-parity.test.ts` | Zero | 15 min |

Total ~3h, plus ~30 min manual smoke and translation review.

**Deploy-safety properties:**
- T1 alone: deploy-safe, no behavior change.
- T1+T2 alone: deploy-safe in EN-locale (visually identical); `/es/chart` PassportCard now shows translated tier word.
- T1+T2+T3 alone: ShareButton in `/es/chart` is fully localized; OG image still EN regardless of `passport.locale` (hot path unchanged).
- T1+T2+T3+T4: full Cluster A behavior. ES OG images render in ES.
- T5: test-only, can be merged anytime after T1.

---

## §3. Translation Catalog Structure

### 3.1 Extension to existing `share.passport`

```
share.passport.
├── copy.{x, telegram, whatsapp, stories_caption, native_share}   (no change, existing)
├── title                                                          (NEW: Web Share API title)
├── button.{share, copyLink, copyShort, copied, copiedShort, downloading}
├── aria.{container, shareNative, shareOnX, shareOnTelegram, shareOnWhatsApp,
│         linkCopied, copyShareLink, linkCopiedShort, copyLinkShort,
│         downloadFormat, downloadAs}
└── og.
    ├── eyebrow                        "Sidereal Astrology"
    ├── title                          "COSMIC BLUEPRINT"     (og + square layouts)
    ├── titleLine1                     "COSMIC"               (stories — 2 lines)
    ├── titleLine2                     "BLUEPRINT"
    ├── label.{sun, moon, rising}      "☉ SUN" / "☽ MOON" / "↑ RISING"
    ├── rarityLabel                    "RARITY"
    ├── ruledBy                        "Ruled by"
    └── unknown                        "Unknown"
```

### 3.2 New top-level `astro.rarityTier`

```
astro.rarityTier.{exceptional, veryRare, rare, uncommon}
```

**Rationale for separate top-level:** `getRarityTier()` is consumed in 3 contexts — in-app `PassportCard`, share landing `/s/[id]`, OG image route. Placing tier translations under `share.*` would force the in-app card to import via the share-namespace; semantically wrong. `astro.*` is an astrology-domain namespace, correctly cross-context.

### 3.3 Exact translations (review surface)

| Key | EN | ES | Source |
| --- | --- | --- | --- |
| `share.passport.title` | "My Cosmic Passport" | "Mi Pasaporte Cósmico" | precedent line 840 |
| `share.passport.button.share` | "Share Passport" | "Compartir pasaporte" | new |
| `share.passport.button.copyLink` | "Copy Link" | "Copiar enlace" | new |
| `share.passport.button.copyShort` | "Copy" | "Copiar" | new |
| `share.passport.button.copied` | "Copied!" | "¡Copiado!" | new |
| `share.passport.button.copiedShort` | "Copied" | "Copiado" | new |
| `share.passport.button.downloading` | "Downloading..." | "Descargando..." | new |
| `share.passport.aria.container` | "Share your Cosmic Passport" | "Comparte tu Pasaporte Cósmico" | new |
| `share.passport.aria.shareNative` | "Share your Cosmic Passport via the native share menu" | "Comparte tu Pasaporte Cósmico mediante el menú nativo" | new |
| `share.passport.aria.shareOnX` | "Share on X" | "Compartir en X" | new |
| `share.passport.aria.shareOnTelegram` | "Share on Telegram" | "Compartir en Telegram" | new |
| `share.passport.aria.shareOnWhatsApp` | "Share on WhatsApp" | "Compartir en WhatsApp" | new |
| `share.passport.aria.linkCopied` | "Link copied to clipboard" | "Enlace copiado al portapapeles" | new |
| `share.passport.aria.copyShareLink` | "Copy share link" | "Copiar enlace para compartir" | new |
| `share.passport.aria.linkCopiedShort` | "Link copied" | "Enlace copiado" | new |
| `share.passport.aria.copyLinkShort` | "Copy link" | "Copiar enlace" | new |
| `share.passport.aria.downloadFormat` | "Download format" | "Formato de descarga" | new |
| `share.passport.aria.downloadAs` | "Download as {format} PNG" | "Descargar como PNG {format}" | new |
| `share.passport.og.eyebrow` | "Sidereal Astrology" | "Astrología sideral" | precedent passim |
| `share.passport.og.title` | "COSMIC BLUEPRINT" | "BLUEPRINT CÓSMICO" | precedent line 1426 |
| `share.passport.og.titleLine1` | "COSMIC" | "BLUEPRINT" | new |
| `share.passport.og.titleLine2` | "BLUEPRINT" | "CÓSMICO" | new |
| `share.passport.og.label.sun` | "☉ SUN" | "☉ SOL" | precedent line 480 |
| `share.passport.og.label.moon` | "☽ MOON" | "☽ LUNA" | precedent line 854 |
| `share.passport.og.label.rising` | "↑ RISING" | "↑ ASC" | precedent line 840 (not "ASCENDENTE" — see note) |
| `share.passport.og.rarityLabel` | "RARITY" | "RAREZA" | precedent line 78 |
| `share.passport.og.ruledBy` | "Ruled by" | "Regido por" | precedent line 312 |
| `share.passport.og.unknown` | "Unknown" | "Desconocido" | standard |
| `astro.rarityTier.exceptional` | "Exceptional" | "Excepcional" | standard |
| `astro.rarityTier.veryRare` | "Very Rare" | "Muy raro" | standard |
| `astro.rarityTier.rare` | "Rare" | "Raro" | standard |
| `astro.rarityTier.uncommon` | "Uncommon" | "Poco común" | standard |

**Decision on "↑ RISING":** ES uses "↑ ASC" rather than "↑ ASCENDENTE" because:
1. Existing precedent in `messages/es.json:840` already uses "↑ ASC en {asc}" in shareText.
2. "ASCENDENTE" (10 chars + `letterSpacing: 3px` at 22px font) likely overflows the column width (~400px in og, ~360px in stories, ~300px in square layouts).
3. ASC is the standard ES astrology abbreviation, parallel to RISING in EN.

**Risk on "POCO COMÚN" in rarity stamp:** Uppercase rendering in 148px circular stamp. Length similar to "UNCOMMON" but with `letterSpacing: 0.5px` may be tight. If implementation reveals overflow: reduce `tierPx` from 14 to 12 in the stories/og/square layouts of `og/passport/[id]/route.tsx`, or set `letterSpacing: '0'` for the tier text only. Visual smoke step in §7.3 will catch this.

---

## §4. Files Changed

| # | File | Changes | Commit |
| --- | --- | --- | --- |
| 1 | `messages/en.json` | Add keys per §3.1, §3.2 with EN values from §3.3 | T1 |
| 2 | `messages/es.json` | Add keys per §3.1, §3.2 with ES values from §3.3 | T1 |
| 3 | `src/modules/astro-engine/rarity.ts` | Change `RarityTier` type from display-literal union to key union (`'exceptional' \| 'veryRare' \| 'rare' \| 'uncommon'`); rewrite `getRarityTier()` body to return keys | T2 |
| 4 | `src/modules/astro-engine/components/PassportCard.tsx` | 3 callsites (lines 163, 207, 227) wrap `getRarityTier()` output with translator. Add `useTranslations('astro.rarityTier')` hook. | T2 |
| 5 | `src/app/s/[id]/page.tsx` | 1 callsite (line 234) wraps tier with translator. Server component → `getTranslations({ namespace: 'astro.rarityTier' })`. | T2 |
| 6 | `src/modules/astro-engine/__tests__/rarity.test.ts` *(new)* | Tests U1, U2 — return key for each weight bucket; type contract via `expectTypeOf` | T2 |
| 7 | `src/modules/astro-engine/components/ShareButton.tsx` | Single-root `useTranslations('share.passport')`. Replace ~13 hardcoded strings: title, button labels, aria-labels via `t('button.share')`, `t('aria.container')`, etc. Pre-build dynamic strings (`copyButtonText = shareState === 'copied' ? t('button.copied') : t('button.copyLink')`) for clarity. | T3 |
| 8 | `src/modules/astro-engine/components/__tests__/ShareButton.test.tsx` *(new)* | Tests C1, C2, C3 — render in EN+ES locale, assert button text and one aria-label per category. `// @vitest-environment jsdom` | T3 |
| 9 | `src/app/api/og/passport/[id]/route.tsx` | After DB select: `safeLocale = passport.locale === 'es' ? 'es' : 'en'`. Try/catch around `await Promise.all([getTranslations({ locale: safeLocale, namespace: 'share.passport.og' }), getTranslations({ locale: safeLocale, namespace: 'astro.rarityTier' })])`. Fallback to EN on translator failure with Sentry tag `og_i18n_load_failed`. Replace ~10 string literals with `t('eyebrow')`, `t('label.sun')`, `tTier(rarityKey)`, etc. The `rarityDisplay` computation becomes `tTier(getRarityTier(passport.rarityPercent))`. | T4 |
| 10 | `src/app/api/og/passport/[id]/__tests__/route.test.ts` *(new)* | Tests R1, R2 — mock DB row, spy `getTranslations`, assert locale propagation and invalid-locale fallback | T4 |
| 11 | `scripts/qa/i18n-key-parity.test.ts` *(new)* | Test I1 — recursive deep-key diff between `messages/en.json` and `messages/es.json`. If pre-existing drift is found in T5, log it as expected violations in a `KNOWN_DRIFT` set within the test file (so the test passes today and any *new* drift fails CI), then file a follow-up task to clean the baseline drift in a separate commit outside Cluster A. | T5 |

### 4.1 Trade-off — bilingual aria in `PassportCard.tsx` after T2

`PassportCard.tsx:163` aria-label currently:
```tsx
aria-label={`Cosmic Passport: Sun in ${sunSign}, Moon in ${moonSign}, ${ascendantSign ? `Ascendant in ${ascendantSign}` : 'Ascendant unknown'}, Element ${element}, Ruling planet ${rulingPlanet}, Rarity ${getRarityTier(rarityPercent)}`}
```

After T2 in `/es/chart`:
```
"Cosmic Passport: Sun in Aries, Moon in Taurus, ..., Rarity Excepcional"
```

Bilingual mix — scaffolding remains EN, tier word becomes ES. Screen readers parse as text and read this awkwardly. **Accepted as a stepping-stone:** one ES word is better than zero, and full PassportCard i18n is an explicit out-of-scope sub-project. Re-visited and addressed when "in-app card i18n" cluster is brainstormed.

---

## §5. Data Flow

### 5.1 ShareButton — two render contexts

```
[locale]/chart  →  ChartDisplay.tsx:93  →  <ShareButton/>
  locale: from URL segment ([locale])
  next-intl: NextIntlClientProvider in [locale]/layout.tsx
  useTranslations() resolves to user's locale
  ✅ T3 changes activate here

/s/[id]  →  s/[id]/page.tsx:240  →  <ShareButton/>
  locale: forced 'en' by /s/layout.tsx:24
  next-intl: NextIntlClientProvider locale="en"
  useTranslations() resolves to EN regardless of recipient
  ⚪ T3 strings are wired but never activate (intentional per Q3=a)
```

### 5.2 OG image — locale from DB row

```
External crawler (WhatsApp / Facebook / Telegram)
    ↓ GET /api/og/passport/[id]?format=og
    ↓
db.select().from(cosmicPassports).where(eq(cosmicPassports.id, params.id))
    ↓
passport.locale  ←  schema.ts:218 ('en' | 'es')
    ↓
safeLocale = passport.locale === 'es' ? 'es' : 'en'    // defensive
    ↓
[t, tTier] = await Promise.all([
  getTranslations({ locale: safeLocale, namespace: 'share.passport.og' }),
  getTranslations({ locale: safeLocale, namespace: 'astro.rarityTier' }),
])
    ↓
JSX render with t('eyebrow'), t('title'), t('label.sun'), tTier(rarityKey), ...
    ↓
ImageResponse → PNG bytes → CDN cache (IMMUTABLE_1Y)
```

**Key invariant:** `passport.locale` is set on row creation and never changes. One passport = one locale = one deterministic OG image. `Cache-Control: IMMUTABLE_1Y` remains valid.

### 5.3 Backward compatibility

All `cosmic_passports` rows already carry `locale` (NOT NULL constraint, schema.ts:218). Pre-existing EN passports continue rendering EN OG images post-deploy. ES passports (created post-ES-launch) start rendering ES OG images immediately after T4 deploys. No backfill migration required.

---

## §6. Error Handling

### 6.1 Missing translation key
next-intl in production: missing key renders the key path string (e.g., `"share.passport.button.share"`) and logs a warning. Not a runtime error. **Defense:** Test I1 in T5 enforces key parity between EN and ES catalogs.

### 6.2 Invalid `passport.locale`
Schema enforces `enum: ['en', 'es']`. Defensive in OG route:
```ts
const safeLocale = passport.locale === 'es' ? 'es' : 'en';
```
If row corruption produces an unexpected value, fallback to EN + Sentry tag `og_locale_invalid` for observability.

### 6.3 Translator load failure
Wrap both `getTranslations` calls in a try/catch. On failure, fall back to EN catalog + Sentry tag `og_i18n_load_failed`. **Principle:** better an EN OG image than a 500 in the viral preview path — a 500 means WhatsApp/Telegram show a bare URL with no rich preview.

### 6.4 Deploy ordering
Risk-graded sequence (T1 → T2 → T3 → T4) prevents stale-catalog issues. If T4 deployed without T1, OG image renders literal key strings (e.g., "share.passport.og.eyebrow") in `IMMUTABLE_1Y` cache — a real regression with long TTL. Discipline: always merge T1 before any code that consumes its keys.

### 6.5 Observability post-deploy
- Sentry tag `og_locale_invalid` (per §6.2) — sanity check that row corruption is not occurring.
- Sentry tag `og_i18n_load_failed` (per §6.3) — alarm if catalog becomes unreadable.
- Optional: PostHog event `passport_og_rendered` with `locale` property — measure ES OG render ratio post-deploy.

---

## §7. Testing

### 7.1 Test matrix

| ID | File | Scope | Commit |
| --- | --- | --- | --- |
| **U1** | `src/modules/astro-engine/__tests__/rarity.test.ts` | `getRarityTier()` returns keys for each weight bucket; boundary checks at 5.0, 6.0, 7.5 | T2 |
| **U2** | Same | TypeScript contract via `expectTypeOf` — return type is exactly `'exceptional' \| 'veryRare' \| 'rare' \| 'uncommon'` | T2 |
| **C1** | `src/modules/astro-engine/components/__tests__/ShareButton.test.tsx` | EN render → primary button text "Share Passport"; uses `<NextIntlClientProvider locale="en">` wrapper | T3 |
| **C2** | Same | ES render → primary button text "Compartir pasaporte" | T3 |
| **C3** | Same | One aria-label per category in ES (container, social, download) — point check, not full coverage of all 13 strings | T3 |
| **R1** | `src/app/api/og/passport/[id]/__tests__/route.test.ts` | Mock DB row with `locale: 'es'`; spy `getTranslations` via `vi.mock('next-intl/server')`; assert call args include `{ locale: 'es' }` for both namespaces | T4 |
| **R2** | Same | Invalid locale value → fallback to EN + assert `Sentry.captureException` called with tag `og_locale_invalid` | T4 |
| **I1** | `scripts/qa/i18n-key-parity.test.ts` | Recursive deep-key diff between `messages/en.json` and `messages/es.json` — fails on missing keys in either direction | T5 |

### 7.2 What we don't test (and why)

- **Image bytes assert** — Satori output is non-deterministic between runs (font loader, layout engine); binary diff would be flaky.
- **Visual regression (Playwright/Percy)** — overhead not justified for a 2-locale i18n change.
- **Real social crawler integration** — Facebook/WhatsApp/Telegram caches inaccessible from CI.
- **`/s/[id]` ShareButton rendering in ES** — by design forced EN per Q3=a; testing "always EN" is an inverted test with no value.

### 7.3 Manual smoke (post-T4 deploy)

1. **Create ES passport:** open `https://estrevia.app/es/chart` → enter birth data → create passport → record passport ID.
2. **Verify OG image (ES):** open `https://estrevia.app/api/og/passport/<es-id>?format=og` directly in browser — verify rendering shows: "Astrología sideral", "BLUEPRINT CÓSMICO", "☉ SOL", "☽ LUNA", "↑ ASC", "RAREZA", "Regido por", correct ES tier word.
3. **Verify OG image (EN, regression):** open an existing EN passport's OG image — should be identical to pre-deploy (zero regression in EN render).
4. **WhatsApp Web smoke:** send `https://estrevia.app/s/<es-id>` to self via WhatsApp Web — preview should appear in ES. WhatsApp may cache stale previews; if stale, use Facebook Sharing Debugger or append `?v=2` to bust cache.
5. **iOS Safari native share:** open `/es/chart` in Safari iOS → create passport → tap "Compartir pasaporte" — verify native sharesheet title shows "Mi Pasaporte Cósmico".
6. **POCO COMÚN visual check:** find or create a passport whose tier renders as "uncommon" (rarityPercent ≥ 7.5) → confirm text fits within the 148px stamp without overflow. If overflow, reduce `tierPx` to 12 in the OG route layouts.

---

## §8. Verification checklist (pre-merge for last commit)

- [ ] `npm test` passes (all U/C/R/I tests green)
- [ ] `npm run typecheck` passes (no widening of `RarityTier` return type)
- [ ] `npm run lint` passes
- [ ] Manual smoke per §7.3 completed for both EN and ES
- [ ] `messages/{en,es}.json` deep-key parity confirmed (I1 green)
- [ ] No new Sentry alerts on `og_locale_invalid` or `og_i18n_load_failed` post-deploy
- [ ] Translation review: founder confirms ES copy in §3.3 reads naturally in español neutro LATAM (founder has domain expertise; cross-check against any precedent collisions)

---

## §9. Implementation note

After this spec is approved by founder, hand off to the writing-plans skill for the implementation plan that maps T1–T5 into executable, file-by-file diffs with verification checkpoints between commits.
