# SEO Remediation — Phase 3 (Gated Backlog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Growth surfaces that only pay off once the two defective cohorts have resolved: per-planet hour pages, a synastry FAQ gap, tarot deck-bridge + depth, and off-site brand anchors.

> ⚠️ **GATE (applies to all new-page-type items — T15, and any expansion):** ship **only** after both defective cohorts have indexed-or-noindexed (Phase 1 landed + recrawled) **and** GSC "Crawled — currently not indexed" (188 baseline) is trending down. This is the §1 crawl-quality gate. T16–T19 are lower-risk enhancements to existing surfaces and may proceed once Phase 2 lands, but T15 is hard-gated.

**Architecture:** Five task groups (T15–T19). Same discipline as Phase 1/2: pure helpers + Vitest, curl-verify for SSR, placeholder-detecting tests for founder-authored prose. **T16 was found already-shipped** and re-scoped to the one real data-backed gap. **T18's structured correspondences are derived deterministically in code** (Golden Dawn canonical) so the founder only authors prose. **T19 is founder-owned ops** with a single code seam.

**Tech Stack:** Next.js 16 (App Router/RSC), React 19, TS 6 strict, next-intl, Vitest, Tailwind 4.

## Global Constraints

Same as Phase 2 (see that plan): `npx vitest run` / `npm test` / `typecheck` / `lint`; SEO in `src/shared/seo/`; `content/` prose is founder-authored (mechanism + placeholder test only); español neutro LATAM, sign names untranslated / planet names translated, astrology-not-advice disclaimer; **tarot legal — Waite *Pictorial Key* (1911) + Marseille + Liber 777 (1909) are public domain; NO Book of Thoth (1944) prose, Harris imagery, or 1944-only major renames**; `SITE_URL` from `constants.ts`; commit `feat(seo-p3/T<n>):`.

## Decisions log

1. **T15 — `PLANETARY_HOUR_PLANETS` (7 Chaldean rulers, no outers)**; new `/planetary-hours/[planet]` route mirroring the proven city-page pattern; `dynamicParams=false`; 14 sitemap URLs; hard-gated.
2. **T16 — re-scoped (trust-code-over-brief):** the informational section + FAQPage are *already live*; the real gap is that the pos-10.5 "que es sinastria / what is synastry" query is answered only in prose, never in the FAQPage schema. Adds one leading "What is synastry?" Q&A via a shared `SYNASTRY_FAQ_KEYS` module (on-page/schema parity); answer prose founder-gated behind a sentinel test.
3. **T17 — env kill-switch ES retitle** (`TAROT_ES_RETITLE_EXPERIMENT`, default ON, truncation-safe pure `buildTarotCardTitle`) + a `deckBridge` per-locale field rendered on truthiness; legal-guard test; prose founder-authored.
4. **T18 — deterministic minor 777 correspondences in code** (pip→sephirah/world, court→element-of-element), extending the Phase-1 `buildCorrespondenceRows` helper; prose depth (upright/reversed/love-work) as optional founder fields. Corrects the "fields are null" claim → they are absent/undefined.
5. **T19 — centralize `SAME_AS_URLS` in constants** (one append-point + a placeholder-detecting validity test); Tier-1 anchors = Crunchbase / Product Hunt / LinkedIn / GitHub; NAP-consistent brand-facts table; explicitly the *amplifier* for Phase-1 O1 (www→308) + Phase-2 T13 (/about entity home), not a standalone brand-SERP fix.

## Verification status

- **Adversarially verified:** **T16, T17**.
- **Grounded draft, verify pending** (usage-limit): **T19**.
- **Authored in-session against live code:** **T15, T18** (T18 corrected the Phase-1 null-vs-undefined claim, which was fixed back into the Phase-1 plan).
- Verify the pending set by resuming workflow `wf_605b7c99-eb0` after the usage-limit reset.

---

## Tasks


---

### P3-T15: Per-planet "Hora de X hoy" pages (7 planets × 2 locales) — GATED

> ⚠️ **GATED behind the §1 crawl-quality gate.** Do NOT ship until **both** defective cohorts have indexed-or-noindexed (Phase 1 T1/T2 landed and recrawled) **and** GSC "Crawled — currently not indexed" (188 baseline) is falling. This is a *new programmatic page type* — the roadmap's no-new-types rule blocks it until the existing cohorts resolve. Verify the gate in GSC before starting.

**Goal:** Replicate the site's best-performing cluster ("horas planetarias hoy" pos 8.6 / **71% CTR**; Madrid ES **16.3% CTR**) with 7 per-planet informational pages targeting "hora de la luna / hora de venus / …" queries — the exact ES query shape that already converts. Reuse the existing planetary-hours engine + the proven `planetary-hours-cities/[city]` page pattern. 7 planets (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn — the 7 Chaldean planetary-hour rulers, **not** the outers) × 2 locales = 14 URLs.

**Files:**
- Create: `src/shared/seo/planetary-hour-rulers.ts` — `PLANETARY_HOUR_PLANETS` (7 slugs) + `findPlanetHourRuler`
- Test: `src/shared/seo/__tests__/planetary-hour-rulers.test.ts`
- Create: `src/app/[locale]/(marketing)/planetary-hours/[planet]/page.tsx` — the route
- Modify: `src/app/sitemap.ts` — emit the 7 × 2 = 14 URLs
- Modify: `messages/en.json`, `messages/es.json` — `planetaryHourPlanet.*` namespace
- Content spec (founder): the per-planet informational + FAQ prose

**Interfaces:**
- Produces: `PLANETARY_HOUR_PLANETS: readonly string[]` (7 slugs: `sun|moon|mars|mercury|jupiter|venus|saturn`); `findPlanetHourRuler(slug): { slug; enName; esName } | undefined`.
- Consumes: `calculatePlanetaryHours` (already used by the city page); `localizePlanet` (from Phase-2 T10 `astro-i18n.ts`) for translated planet names.

- [ ] **Step 1: Write the failing test (the pure allowlist)**

Create `src/shared/seo/__tests__/planetary-hour-rulers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PLANETARY_HOUR_PLANETS, findPlanetHourRuler } from '../planetary-hour-rulers';

describe('planetary-hour rulers (T15)', () => {
  it('is exactly the 7 Chaldean planets (no outers)', () => {
    expect([...PLANETARY_HOUR_PLANETS].sort()).toEqual(
      ['jupiter', 'mars', 'mercury', 'moon', 'saturn', 'sun', 'venus'],
    );
  });
  it('resolves a known ruler and rejects an outer planet', () => {
    expect(findPlanetHourRuler('venus')?.enName).toBe('Venus');
    expect(findPlanetHourRuler('pluto')).toBeUndefined();
  });
});
```
Run → FAIL (module missing).

- [ ] **Step 2: Implement the allowlist**

Create `src/shared/seo/planetary-hour-rulers.ts`:
```ts
/** The 7 classical rulers of the planetary hours (Chaldean order). Outers are
 *  never planetary-hour rulers, so they are intentionally excluded. */
export const PLANETARY_HOUR_PLANETS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'] as const;

const NAMES: Record<string, { enName: string; esName: string }> = {
  sun: { enName: 'Sun', esName: 'Sol' },
  moon: { enName: 'Moon', esName: 'Luna' },
  mars: { enName: 'Mars', esName: 'Marte' },
  mercury: { enName: 'Mercury', esName: 'Mercurio' },
  jupiter: { enName: 'Jupiter', esName: 'Júpiter' },
  venus: { enName: 'Venus', esName: 'Venus' },
  saturn: { enName: 'Saturn', esName: 'Saturno' },
};

export function findPlanetHourRuler(slug: string): { slug: string; enName: string; esName: string } | undefined {
  const n = NAMES[slug];
  return n ? { slug, ...n } : undefined;
}
```
Run → PASS.

- [ ] **Step 3: Scaffold the route (mirror the city page)**

Create `src/app/[locale]/(marketing)/planetary-hours/[planet]/page.tsx` modeled on `planetary-hours-cities/[city]/page.tsx`:
- `export const dynamicParams = false;` + `generateStaticParams` over `PLANETARY_HOUR_PLANETS`.
- `generateMetadata`: title `Hora de {esName} hoy — horas planetarias` / `Hour of {enName} today — planetary hours`; description built from the `planetaryHourPlanet` messages; `createMetadata({ path: '/planetary-hours/'+planet, locale })`.
- Body: `<h1>`, an informational section (what the hour of X governs, how to compute it), a **worked "today" example** using `calculatePlanetaryHours` for a default anchor location (reuse a prominent city from `cities.ts`, e.g. the first ES-market city) to show the next hour-of-X, a link to the `/planetary-hours-cities` tool for the user's own city, a link to the essays of that planet (reuse Phase-2 T9 `relatedEssaySlugs`-style linking), and an `articleSchema` + `faqSchema` (bilingual) via the shared generators.
- Planet names via `localizePlanet` (Phase-2 T10). Follow the city page's inline-EN/ES-string style.

- [ ] **Step 4: Wire the sitemap**

In `src/app/sitemap.ts`, add a block mirroring `planetaryHoursCities` (use `lastModifiedFor('planetary-hours-cities')` from Phase-2 T11c, or a new route type):
```ts
  const planetaryHourPlanetPages: MetadataRoute.Sitemap = PLANETARY_HOUR_PLANETS.flatMap((planet) =>
    emitLocalized(`/planetary-hours/${planet}`, {
      lastModified: lastModifiedFor('planetary-hours-cities'),
      changeFrequency: 'daily',
      priority: 0.6,
    }),
  );
```
Add `...planetaryHourPlanetPages,` to the return array and import `PLANETARY_HOUR_PLANETS`. Add a sitemap test asserting 14 `/planetary-hours/<planet>` URLs.

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck && npm test`. Curl-verify one page renders `<h1>` + the "today" example + FAQPage JSON-LD. Commit the scaffold; the informational + FAQ **prose is founder-authored** (content spec below) — ship the route behind a placeholder-detecting test so main never carries a stub.

- [ ] **Step 6: Founder content spec**

Per planet (EN + ES neutro LATAM): (a) 2–3 sentences on what the planetary hour of X governs (traditional attributions — public-domain sources only), (b) 3 FAQ pairs including the head query "¿Qué es la hora de {planeta}?" / "What is the hour of {planet}?", (c) a one-line "best-for" (e.g. Venus → love/beauty; Saturn → discipline). Planet names translated; astrology-not-advice disclaimer required (CLAUDE.md).

**Measurement:** re-check the "hora de X" query cluster at +4 weeks; this cluster already proved 16–71% CTR, so success = these 14 pages entering the same range. If they don't index within the gate, do not expand to per-planet-per-city (140 URLs).


---

### P3-T16: `/synastry` FAQPage — add the pos-10.5 "what is synastry" query (both locales)

> **GATED (Phase 3):** do not start until the §1 crawl-quality gate opens — both defective cohorts (tarot, compatibility) index-or-noindexed **and** GSC "Crawled — currently not indexed" (188 baseline) is falling.

**Roadmap correction (trust code over brief — baseline-verified this session).** Roadmap §5 T16 asks to *"add an informational content section + FAQPage schema to the synastry page (both locales)."* **Both already exist on `main`** and were in the 2026-05-30 audited prod build (git `-S`: `cd66caa` / `b205bf0` `content(t16)` / `1f3be1e`):
- Informational section: `synastry/page.tsx:84-167` renders four H2 blocks (`whatIs`, `keyAspects`→sunMoon/venusMars/saturnContacts/moonMoon, `scoreInterpretation`, `siderealVsTropical`) from the `educational.synastry` namespace, both locales (`en.json:1603-…`, `es.json:1606-…`).
- FAQPage schema: `synastry/page.tsx:68-73` builds `faqSchema(faqs.map(...))` and injects it at `:78`; 5 Q&As in `en.json:1127-1136` / `es.json:1130-1139`.

The **real gap** (matches the audit data): the exact query ranking pos 10.5 — *"que es sinastria"* / *"what is synastry"* — is answered only in the `whatIs` **prose paragraph**, and is **absent from the FAQPage structured data** (`faq1Q` is *"What is the most important aspect…"*, not *"What is synastry"*). So T16 = add one **"What is synastry? / ¿Qué es la sinastría?"** Q&A as the **first** FAQ, feeding **both** the visible FAQ and the FAQPage JSON-LD from a single source. Benefit: AEO/LLM answer-extraction + on-page structured coverage for the pos-10.5 query (per `json-ld.ts`'s own faqSchema rationale — not blue-link rich stars, which are gov/health-restricted).

No schema-injection change is needed (`<JsonLdScript schema={synastryFaq}/>` already at `:78`); no new i18n namespace (the new keys go into the existing top-level `synastry` namespace read by `t`, distinct from `educational.synastry`).

**Files:**
- Create: `src/modules/astro-engine/lib/synastryFaq.ts` — `SYNASTRY_FAQ_KEYS` (ordered, single source for visible FAQ + FAQPage schema).
- Create: `src/modules/astro-engine/lib/__tests__/synastryFaq.test.ts` — order + schema + i18n-parity + placeholder-detecting tests.
- Modify: `src/app/[locale]/(app)/synastry/page.tsx` — import `SYNASTRY_FAQ_KEYS`, drop the inline `faqs` array, map the helper in both places.
- Modify: `messages/en.json` — add `synastry.whatIsQ` (real) + `synastry.whatIsA` (founder-authored).
- Modify: `messages/es.json` — add `synastry.whatIsQ` (real) + `synastry.whatIsA` (founder-authored).

**Interfaces:**
- Produces: `SYNASTRY_FAQ_KEYS: readonly { readonly qKey: string; readonly aKey: string }[]` — `as const` tuple, `whatIs` first, then `faq1..faq5`.
- Consumes: `faqSchema(items: FaqItem[])` from `@/shared/seo` (pure, `json-ld.ts:192`); `getTranslations('synastry')` `t`.

---

- [ ] **Step 1: Write the failing test**

Create `src/modules/astro-engine/lib/__tests__/synastryFaq.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SYNASTRY_FAQ_KEYS } from '../synastryFaq';
import { faqSchema } from '@/shared/seo';

type FaqBlock = Record<string, string>;
const loadSynastry = (locale: 'en' | 'es'): FaqBlock =>
  JSON.parse(readFileSync(join(process.cwd(), `messages/${locale}.json`), 'utf-8')).synastry;

const PLACEHOLDERS = ['__PENDING_COPY__', 'TODO', 'TBD', 'Lorem', 'XXX'];

describe('SYNASTRY_FAQ_KEYS', () => {
  it('leads with the "what is synastry" pair (targets pos-10.5 query)', () => {
    expect(SYNASTRY_FAQ_KEYS[0]).toEqual({ qKey: 'whatIsQ', aKey: 'whatIsA' });
    expect(SYNASTRY_FAQ_KEYS).toHaveLength(6);
  });

  it('every key resolves in both locales (en/es parity)', () => {
    for (const locale of ['en', 'es'] as const) {
      const syn = loadSynastry(locale);
      for (const { qKey, aKey } of SYNASTRY_FAQ_KEYS) {
        expect(typeof syn[qKey], `${locale}.synastry.${qKey}`).toBe('string');
        expect(typeof syn[aKey], `${locale}.synastry.${aKey}`).toBe('string');
      }
    }
  });

  it('FAQPage JSON-LD leads with the "what is synastry" question (both locales)', () => {
    const en = loadSynastry('en');
    const es = loadSynastry('es');
    const build = (syn: FaqBlock) =>
      faqSchema(SYNASTRY_FAQ_KEYS.map(({ qKey, aKey }) => ({ question: syn[qKey], answer: syn[aKey] }))) as unknown as {
        mainEntity: Array<{ '@type': string; name: string; acceptedAnswer: { text: string } }>;
      };
    const enSchema = build(en);
    expect(enSchema.mainEntity).toHaveLength(6);
    expect(enSchema.mainEntity[0].name).toBe('What is synastry?');
    expect(build(es).mainEntity[0].name).toBe('¿Qué es la sinastría?');
  });

  // Content gate — RED until the founder authors whatIsA per the content spec.
  it('no FAQ answer is a placeholder or a stub (both locales)', () => {
    for (const locale of ['en', 'es'] as const) {
      const syn = loadSynastry(locale);
      for (const { aKey } of SYNASTRY_FAQ_KEYS) {
        const answer = syn[aKey];
        expect(answer.length, `${locale}.synastry.${aKey} too short`).toBeGreaterThan(40);
        for (const marker of PLACEHOLDERS) {
          expect(answer.includes(marker), `${locale}.synastry.${aKey} contains ${marker}`).toBe(false);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/astro-engine/lib/__tests__/synastryFaq.test.ts`
Expected: FAIL — `Failed to resolve import "../synastryFaq"`.

- [ ] **Step 3: Create the helper (single source of truth)**

Create `src/modules/astro-engine/lib/synastryFaq.ts`:
```ts
/**
 * Ordered FAQ key list for the synastry page (namespace `synastry` in the
 * message files). Single source of truth so the visible <details> FAQ and the
 * FAQPage JSON-LD stay in lockstep — Google requires a FAQ's structured answer
 * to be visible on the page.
 *
 * `whatIs` leads deliberately: the query "que es sinastria" already ranks
 * pos 10.5 (SEO audit 2026-07-06 finding #16) but had no matching FAQ entry —
 * this puts that exact question into the FAQPage structured data for AEO / LLM
 * answer-extraction.
 */
export const SYNASTRY_FAQ_KEYS = [
  { qKey: 'whatIsQ', aKey: 'whatIsA' },
  { qKey: 'faq1Q', aKey: 'faq1A' },
  { qKey: 'faq2Q', aKey: 'faq2A' },
  { qKey: 'faq3Q', aKey: 'faq3A' },
  { qKey: 'faq4Q', aKey: 'faq4A' },
  { qKey: 'faq5Q', aKey: 'faq5A' },
] as const;
```
(`as const` preserves the literal `qKey`/`aKey` unions so `t(qKey)` stays type-safe on the page; verified this session that no next-intl typed-messages (`IntlMessages`) augmentation exists, so a widened key would also compile — `as const` matches the page's current style.)

- [ ] **Step 4: Add the i18n keys — question authored, answer scaffolded as a gated placeholder**

In `messages/en.json`, insert **after** `:1126` (`"aboutHeading": "About Synastry",`), before `"faq1Q"`:
```json
    "whatIsQ": "What is synastry?",
    "whatIsA": "__PENDING_COPY__",
```
In `messages/es.json`, insert **after** `:1129` (`"aboutHeading": "Sobre la Sinastría",`), before `"faq1Q"`:
```json
    "whatIsQ": "¿Qué es la sinastría?",
    "whatIsA": "__PENDING_COPY__",
```
(Both insertions land inside the **top-level** `synastry` namespace — en.json:1094 / es.json:1097 — not the `educational.synastry` block, so there is no collision with the existing `whatIs` object there.)

Run: `npx vitest run src/modules/astro-engine/lib/__tests__/synastryFaq.test.ts`
Expected: the order / parity / schema tests **PASS** (keys now exist, whatIs leads, both locales); the **"no FAQ answer is a placeholder"** test **FAILS** (`whatIsA` is `__PENDING_COPY__`). This is the intended content-gate RED state.

- [ ] **Step 5 (founder-owned content gate — blocks the wiring commit): author `whatIsA` in EN + ES**

Replace both `"whatIsA": "__PENDING_COPY__"` values with real answers per the **Content spec** below. This is founder-owned like Task 0 / O1–O3 in Phase 1 — the wiring commit (Step 8) must not land while a placeholder is present, so `main` never carries `__PENDING_COPY__`.

Content spec — `synastry.whatIsA`, one plain-text answer per locale (no markdown):
- **Intent:** the featured-snippet / LLM answer for "what is synastry" / "que es sinastria". **Open by defining the term** ("Synastry is…" / "La sinastría es…") so it front-loads the query match.
- **Length:** ~40-70 words (must clear the test's 40-char floor; existing FAQ answers run 200-350 chars — match that register).
- **Must include:** (1) comparing/overlaying **two natal charts**; (2) that it reads the **aspects between the two people's planets**; (3) the Estrevia differentiator — **Lahiri ayanamsa / true sidereal positions**.
- **Must NOT:** predict outcomes/destiny (consistent with `faq2A`); duplicate the longer `whatIs.body` prose verbatim (keep it a tight snippet); no medical/financial claims.
- **ES rules (CLAUDE.md):** español neutro LATAM, **`tú`** form; **planet names translated** (planetas), **sign names untranslated** (none needed here); no `usted`.

Optional reference draft the founder may use verbatim or refine (not committed by this plan — provided so the gate clears in seconds):
- EN: *"Synastry is the astrological comparison of two natal charts — it measures the aspects between one person's planets and the other's to show where energy flows easily and where it strains. Estrevia calculates it with the Lahiri ayanamsa, using true sidereal positions rather than the tropical approximation."*
- ES: *"La sinastría es la comparación astrológica de dos cartas natales: mide los aspectos entre los planetas de una persona y los de la otra para mostrar dónde fluye la energía y dónde se tensa. Estrevia la calcula con el ayanamsa Lahiri, usando posiciones siderales reales en lugar de la aproximación tropical."*

Run: `npx vitest run src/modules/astro-engine/lib/__tests__/synastryFaq.test.ts`
Expected: **all four tests PASS**.

- [ ] **Step 6: Wire the helper into the page (drop the inline array)**

In `src/app/[locale]/(app)/synastry/page.tsx`:

(a) Add the import after line 6 (`import { SynastryClient } …`):
```ts
import { SYNASTRY_FAQ_KEYS } from '@/modules/astro-engine/lib/synastryFaq';
```

(b) Replace the inline array + schema build (`:60-73`):
```tsx
  const faqs = [
    { qKey: 'faq1Q', aKey: 'faq1A' },
    { qKey: 'faq2Q', aKey: 'faq2A' },
    { qKey: 'faq3Q', aKey: 'faq3A' },
    { qKey: 'faq4Q', aKey: 'faq4A' },
    { qKey: 'faq5Q', aKey: 'faq5A' },
  ] as const;

  const synastryFaq = faqSchema(
    faqs.map(({ qKey, aKey }) => ({
      question: t(qKey),
      answer: t(aKey),
    })),
  );
```
with:
```tsx
  const synastryFaq = faqSchema(
    SYNASTRY_FAQ_KEYS.map(({ qKey, aKey }) => ({
      question: t(qKey),
      answer: t(aKey),
    })),
  );
```
(c) Update the visible FAQ map (`:174`):
```tsx
          {faqs.map(({ qKey, aKey }) => (
```
to:
```tsx
          {SYNASTRY_FAQ_KEYS.map(({ qKey, aKey }) => (
```
(One source now drives both the schema and the rendered `<details>` — parity guaranteed by construction. `t` is still used; `faqs` is fully removed — its only three references were the def at :60-66, the `.map` at :69, and the `.map` at :174, all replaced → no unused-var lint.)

- [ ] **Step 7: Verify types + the targeted suite are green**

Run: `npm run typecheck && npx vitest run src/modules/astro-engine/lib/__tests__/synastryFaq.test.ts src/shared/seo/__tests__/json-ld.test.ts`
Expected: typecheck PASS (literal `qKey` unions preserved); synastryFaq PASS (4); json-ld faqSchema tests unaffected.

- [ ] **Step 8: Commit** (only after Step 5 is green — no placeholder in the tree)

```bash
git add src/modules/astro-engine/lib/synastryFaq.ts \
        src/modules/astro-engine/lib/__tests__/synastryFaq.test.ts \
        "src/app/[locale]/(app)/synastry/page.tsx" \
        messages/en.json messages/es.json
git commit -m "feat(seo-p3/T16): add 'what is synastry' FAQ to synastry FAQPage (both locales)"
```

- [ ] **Step 9: curl exit-verify (against the deploy) — SSR parity + no placeholder**

```bash
# FAQPage now carries the "what is synastry" question (EN) and "que es" (ES),
# and the placeholder is gone from the rendered HTML.
curl -s https://estrevia.app/synastry     | grep -o '"@type":"Question","name":"[^"]*"' | head
curl -s https://estrevia.app/es/synastry  | grep -o '"@type":"Question","name":"[^"]*"' | head
curl -s https://estrevia.app/es/synastry  | grep -c '¿Qué es la sinastría?'
curl -s https://estrevia.app/es/synastry  | grep -c '__PENDING_COPY__'
```
Expected: EN Question list leads with `What is synastry?`; ES leads with `¿Qué es la sinastría?`; the `¿Qué es la sinastría?` count ≥ 1 (visible `<details>` + JSON-LD); the `__PENDING_COPY__` count is **0**. (`JsonLdScript` serializes via `JSON.stringify` with no spaces, so the `"@type":"Question","name":"…"` grep pattern matches the emitted markup.)

**Out of scope (noted, not done here):** additional FAQ entries (wait for real GSC query data for `/synastry`); the broader "173 impr @ pos 28" lift — that depends on Phase-2 **T9** (ES internal linking into `/synastry`) and the deferred Clerk route-group perf move, not this task.

---

### P3-T17: Tarot deck-bridge paragraphs + ES retitle experiment

> **Phase 3 — GATED.** Unlock trigger (spec §5): both defective cohorts (Phase-1 tarot crash + compat) have index-or-noindexed **and** GSC "Crawled — currently not indexed" (188 baseline) is falling. Do not start until Phase 1 (T1a/T1b) has shipped and indexed — this task edits the same `tarot/[cardId]/page.tsx`, additively, on top of the T1a crash-guard.

**What this ships:** (A) a time-boxed **ES title experiment** — `/es/tarot/*` titles rebrand to the `"<Carta>: significado en el tarot (Thoth)"` query cluster, behind an env kill-switch, measured 4 weeks then capped; (B) a **deck-bridge paragraph mechanism** — a per-locale `deckBridge` field + getter + render that surfaces the public-domain Marseille / Rider-Waite naming ("En el Tarot de Marsella / Rider-Waite esta carta se llama X…") to capture those ES/EN queries. Prose is **founder-authored** (legal constraint) — this task ships the field, getter, render, i18n label, a placeholder/legal-guard test, and a precise content spec.

**Correction to spec/Phase-1 plan:** the minors' esoteric fields are **absent (`undefined`), not `null`** in `content/tarot/cards.json` (verified: `'hebrewLetter' in nineOfWands === false`). All render guards below use truthiness, never `!== null`.

**Files:**
- Create: `src/shared/seo/tarot-title.ts` — pure `buildTarotCardTitle` + `isTarotEsRetitleEnabled` (SEO util → lives in `src/shared/seo/` per the single-source-of-truth rule).
- Create: `src/shared/seo/__tests__/tarot-title.test.ts`.
- Modify: `src/shared/seo/index.ts` — barrel export.
- Modify: `src/app/[locale]/(app)/tarot/[cardId]/page.tsx` — retitle wiring (`generateMetadata`) + deck-bridge render + `CardData` field.
- Modify: `src/modules/esoteric/components/tarotLocalize.ts` — `getCardDeckBridge` getter + `deckBridge` on `CardLike`.
- Create: `src/modules/esoteric/components/__tests__/tarotDeckBridge.test.ts`.
- Modify: `messages/en.json`, `messages/es.json` — `tarotPage.detail.deckBridgeHeading`.
- Content (founder-authored, mechanism only here): `content/tarot/cards.json` — optional `deckBridge: { en, es }` per card.

**Interfaces:**
- `buildTarotCardTitle(localizedName: string, locale: 'en' | 'es', retitleEnabled: boolean): string` — pre-suffix title; `createMetadata` appends `TITLE_SUFFIX` + truncates.
- `isTarotEsRetitleEnabled(): boolean` — `process.env.TAROT_ES_RETITLE_EXPERIMENT !== 'off'` (default ON). Note: build-time flag (see below) — a redeploy is required to change it in prod.
- `getCardDeckBridge(card: CardLike, locale: string): string` — mirrors `getCardDescription`; `''` when absent.

---

#### T17a — ES title retitle experiment

- [ ] **Step 1: Write the failing test**

Create `src/shared/seo/__tests__/tarot-title.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTarotCardTitle, isTarotEsRetitleEnabled } from '../tarot-title';
import { TITLE_SUFFIX, MAX_TITLE_LENGTH } from '../constants';

describe('buildTarotCardTitle', () => {
  it('EN is the unchanged control regardless of the flag', () => {
    expect(buildTarotCardTitle('The Fool', 'en', true)).toBe('The Fool — Thoth Tarot');
    expect(buildTarotCardTitle('The Fool', 'en', false)).toBe('The Fool — Thoth Tarot');
  });

  it('ES with the experiment OFF is the control title', () => {
    expect(buildTarotCardTitle('Nueve de Bastos', 'es', false)).toBe('Nueve de Bastos — Thoth Tarot');
  });

  it('ES with the experiment ON uses the significado cluster + (Thoth) when it fits', () => {
    expect(buildTarotCardTitle('Nueve de Bastos', 'es', true)).toBe(
      'Nueve de Bastos: significado en el tarot (Thoth)',
    );
  });

  it('ES ON drops " (Thoth)" (never mid-word truncates) for a long name', () => {
    const t = buildTarotCardTitle('Caballero de Espadas', 'es', true);
    expect(t).toBe('Caballero de Espadas: significado en el tarot');
    expect(t).not.toContain('(Thoth)');
    expect((t + TITLE_SUFFIX).length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  it('no ES card title exceeds 60 chars once the suffix is appended', () => {
    const cards = JSON.parse(
      readFileSync(join(process.cwd(), 'content/tarot/cards.json'), 'utf-8'),
    ).cards as Array<{ name: { es?: string; en: string } }>;
    for (const c of cards) {
      const name = c.name.es ?? c.name.en;
      const full = buildTarotCardTitle(name, 'es', true) + TITLE_SUFFIX;
      expect(full.length, `${name} -> ${full} (${full.length})`).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    }
  });
});

describe('isTarotEsRetitleEnabled', () => {
  const original = process.env.TAROT_ES_RETITLE_EXPERIMENT;
  afterEach(() => {
    if (original === undefined) delete process.env.TAROT_ES_RETITLE_EXPERIMENT;
    else process.env.TAROT_ES_RETITLE_EXPERIMENT = original;
  });

  it('defaults ON when unset', () => {
    delete process.env.TAROT_ES_RETITLE_EXPERIMENT;
    expect(isTarotEsRetitleEnabled()).toBe(true);
  });
  it('is OFF only for the literal "off"', () => {
    process.env.TAROT_ES_RETITLE_EXPERIMENT = 'off';
    expect(isTarotEsRetitleEnabled()).toBe(false);
    process.env.TAROT_ES_RETITLE_EXPERIMENT = 'on';
    expect(isTarotEsRetitleEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shared/seo/__tests__/tarot-title.test.ts`
Expected: FAIL — `Failed to resolve import "../tarot-title"`.

- [ ] **Step 3: Implement the helper**

Create `src/shared/seo/tarot-title.ts`:
```ts
import { TITLE_SUFFIX, MAX_TITLE_LENGTH } from './constants';

/**
 * Builds the tarot card page <title> (pre-suffix — createMetadata appends
 * TITLE_SUFFIX and truncates to MAX_TITLE_LENGTH).
 *
 * EN, and the ES control (experiment off): "<Name> — Thoth Tarot".
 *
 * ES retitle experiment (T17): "<Name>: significado en el tarot (Thoth)" —
 * targets the "<carta> significado tarot" ES query cluster (tarot-ES cluster is
 * wavg pos 74 / 0 clicks at baseline, spec §2). The " (Thoth)" deck signal is
 * dropped when the composed title would exceed the 60-char budget, so no ES
 * card ever truncates mid-word (13/78 ES names would otherwise overflow — e.g.
 * "Caballero de Espadas"). Both variants stay ≤ 49 chars pre-suffix.
 */
export function buildTarotCardTitle(
  localizedName: string,
  locale: 'en' | 'es',
  retitleEnabled: boolean,
): string {
  if (locale !== 'es' || !retitleEnabled) {
    return `${localizedName} — Thoth Tarot`;
  }
  const budget = MAX_TITLE_LENGTH - TITLE_SUFFIX.length; // 60 - 11 = 49
  const withDeck = `${localizedName}: significado en el tarot (Thoth)`;
  if (withDeck.length <= budget) return withDeck;
  return `${localizedName}: significado en el tarot`;
}

/**
 * Env kill-switch for the 4-week ES-retitle measurement (T17). Default ON so
 * the experiment runs on the deploy that ships this code; set
 * TAROT_ES_RETITLE_EXPERIMENT=off in Vercel prod AND redeploy to "cap"/revert
 * after the window. This is a BUILD-TIME flag: the 78 tarot pages are
 * statically pre-rendered (generateStaticParams + revalidate=86400), so the
 * title is baked at build — changing the env var in Vercel requires a rebuild
 * for the flip to take effect. No source-code change is needed to flip it.
 */
export function isTarotEsRetitleEnabled(): boolean {
  return process.env.TAROT_ES_RETITLE_EXPERIMENT !== 'off';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/shared/seo/__tests__/tarot-title.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Export from the SEO barrel**

In `src/shared/seo/index.ts`, add after the `createMetadata` / `CreateMetadataOptions` exports (`:23-24`):
```ts
export { buildTarotCardTitle, isTarotEsRetitleEnabled } from './tarot-title';
```

- [ ] **Step 6: Wire the retitle into the card page's generateMetadata**

In `src/app/[locale]/(app)/tarot/[cardId]/page.tsx`:

(a) Extend the `@/shared/seo` import (`:7`) to add the helpers:
```ts
import { createMetadata, JsonLdScript, breadcrumbSchema, buildTarotCardTitle, isTarotEsRetitleEnabled } from '@/shared/seo';
```

(b) Replace the title line in `generateMetadata` (`:86`):
```ts
    title: `${localizedName} — Thoth Tarot`,
```
with:
```ts
    title: buildTarotCardTitle(localizedName, locale as 'en' | 'es', isTarotEsRetitleEnabled()),
```
(`locale` is already `const locale = await getLocale();` at `:66`. EN titles are byte-identical to today — this is a pure ES-only, flag-gated change. The `keywords` array at `:90` is unchanged.)

- [ ] **Step 7: Verify types + tests**

Run: `npm run typecheck && npx vitest run src/shared/seo/__tests__/tarot-title.test.ts`
Expected: typecheck PASS; tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/shared/seo/tarot-title.ts \
        src/shared/seo/__tests__/tarot-title.test.ts \
        src/shared/seo/index.ts \
        "src/app/[locale]/(app)/tarot/[cardId]/page.tsx"
git commit -m "feat(seo-p3/T17a): ES tarot retitle experiment (significado cluster, env-gated, truncation-safe)"
```

---

#### T17b — Deck-bridge field + getter + render + guards

- [ ] **Step 1: Write the failing test**

Create `src/modules/esoteric/components/__tests__/tarotDeckBridge.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCardDeckBridge } from '../tarotLocalize';

describe('getCardDeckBridge', () => {
  it('returns the locale-specific bridge when present', () => {
    const card = {
      name: { en: 'Nine of Wands', es: 'Nueve de Bastos' },
      deckBridge: { en: 'EN bridge', es: 'ES puente' },
    };
    expect(getCardDeckBridge(card, 'es')).toBe('ES puente');
    expect(getCardDeckBridge(card, 'en')).toBe('EN bridge');
  });

  it('falls back to EN when the es bridge is missing', () => {
    const card = { name: { en: 'X' }, deckBridge: { en: 'only en' } };
    expect(getCardDeckBridge(card, 'es')).toBe('only en');
  });

  it('returns "" when there is no deckBridge (renders nothing)', () => {
    const card = { name: { en: 'X' } };
    expect(getCardDeckBridge(card, 'es')).toBe('');
    expect(getCardDeckBridge(card, 'en')).toBe('');
  });
});

const PLACEHOLDER = /\b(TODO|TKTK|FIXME|lorem ipsum|placeholder|XXX)\b/i;
// Legal guard (CLAUDE.md): Book of Thoth (1944) prose + Harris imagery are
// copyright — the bridge may only NAME public-domain deck equivalents.
const BANNED = /(book of thoth|frieda harris|harris deck|thoth 1944)/i;

describe('cards.json deckBridge content quality (activates as founder authors)', () => {
  const cards = JSON.parse(
    readFileSync(join(process.cwd(), 'content/tarot/cards.json'), 'utf-8'),
  ).cards as Array<{ id: string; deckBridge?: { en?: string; es?: string } }>;
  const authored = cards.filter((c) => c.deckBridge);

  it('every authored deckBridge is bilingual and free of placeholders', () => {
    for (const c of authored) {
      const b = c.deckBridge!;
      expect(b.en?.trim(), `${c.id}.en empty`).toBeTruthy();
      expect(b.es?.trim(), `${c.id}.es empty (español neutro required)`).toBeTruthy();
      expect(PLACEHOLDER.test(b.en ?? ''), `${c.id}.en placeholder`).toBe(false);
      expect(PLACEHOLDER.test(b.es ?? ''), `${c.id}.es placeholder`).toBe(false);
    }
  });

  it('no authored deckBridge references copyrighted Thoth 1944 / Harris sources', () => {
    for (const c of authored) {
      expect(BANNED.test(c.deckBridge!.en ?? ''), `${c.id}.en legal`).toBe(false);
      expect(BANNED.test(c.deckBridge!.es ?? ''), `${c.id}.es legal`).toBe(false);
    }
  });
});
```
(The two `cards.json` `describe` blocks pass vacuously today — `authored` is empty — and become live guards the moment the founder adds any `deckBridge`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/esoteric/components/__tests__/tarotDeckBridge.test.ts`
Expected: FAIL — `getCardDeckBridge` is not exported yet (import resolves to undefined / "is not a function" when called).

- [ ] **Step 3: Add the field to `CardLike` + the getter**

In `src/modules/esoteric/components/tarotLocalize.ts`:

(a) Add `deckBridge` to `CardLike` (`:22-29`):
```ts
interface CardLike {
  name: LocalizedString;
  description?: LocalizedString;
  deckBridge?: LocalizedString;
  keywords?: {
    upright?: LocalizedStringArray;
    reversed?: LocalizedStringArray;
  };
}
```

(b) Add the getter after `getCardDescription` (`:62`):
```ts
export function getCardDeckBridge(card: CardLike, locale: string): string {
  return pickString(card.deckBridge, locale);
}
```
(`pickString` already returns `''` for `undefined` and falls back to `en` when `es` is missing — `:41-45`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/esoteric/components/__tests__/tarotDeckBridge.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the i18n heading label**

In `messages/en.json`, inside `tarotPage.detail` (object begins `:1232`), add a key (alongside `"correspondences"` at `:1236`):
```json
    "deckBridgeHeading": "In other decks",
```
In `messages/es.json`, inside `tarotPage.detail` (begins `:1235`; `"correspondences"` at `:1239`), add:
```json
    "deckBridgeHeading": "En otras barajas",
```
(Both JSON objects use trailing commas between keys — insert the new line before `disclaimer` so the comma placement stays valid. No parity/snapshot test guards these files, so the additive keys are safe.)

- [ ] **Step 6: Add the field to `CardData` + render the paragraph**

In `src/app/[locale]/(app)/tarot/[cardId]/page.tsx`:

(a) Add `getCardDeckBridge` to the tarotLocalize import (`:9-13`):
```ts
import {
  getCardName,
  getCardDescription,
  getCardKeywords,
  getCardDeckBridge,
} from '@/modules/esoteric/components/tarotLocalize';
```

(b) Add the optional field to `CardData` (after `description` at `:34`):
```ts
  description: { en: string; es?: string };
  deckBridge?: { en: string; es?: string };
```

(c) Compute the bridge in the page body, after `getCardDescription` (`:115`):
```ts
  const localizedDescription = getCardDescription(card, locale);
  const deckBridge = getCardDeckBridge(card, locale);
```

(d) Render it directly after the description `<p>` (which ends at `:198`), before the Keywords grid (`:200`):
```tsx
          {/* Public-domain deck bridge (Marseille / Rider-Waite naming) — SEO
              intent for "tarot de marsella" / "rider waite" queries. Rendered
              only when authored; progressive rollout. Prose founder-authored. */}
          {deckBridge && (
            <section className="rounded-xl border border-white/8 p-4 space-y-1.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <h3 className="text-xs text-white/40 uppercase tracking-wider font-medium">
                {tPage('detail.deckBridgeHeading')}
              </h3>
              <p
                className="text-sm text-white/70 leading-relaxed"
                style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
              >
                {deckBridge}
              </p>
            </section>
          )}
```
(`tPage` is `getTranslations('tarotPage')` at `:111`; `tPage('detail.deckBridgeHeading')` resolves the new key.)

- [ ] **Step 7: Verify types + tests + i18n JSON valid**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));JSON.parse(require('fs').readFileSync('messages/es.json','utf8'));console.log('messages OK')" \
&& npm run typecheck \
&& npx vitest run src/modules/esoteric/components/__tests__/tarotDeckBridge.test.ts
```
Expected: `messages OK`; typecheck PASS; tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/esoteric/components/tarotLocalize.ts \
        src/modules/esoteric/components/__tests__/tarotDeckBridge.test.ts \
        "src/app/[locale]/(app)/tarot/[cardId]/page.tsx" \
        messages/en.json messages/es.json
git commit -m "feat(seo-p3/T17b): deck-bridge field + getter + render + content-quality/legal-guard tests"
```

---

#### T17c — Content spec (founder-authored) + verification + measurement

**Content spec — `deckBridge` field in `content/tarot/cards.json`** *(founder authors; do not commit prose from this task).* For each card object add:
```json
  "deckBridge": {
    "en": "<1–2 sentences, English>",
    "es": "<1–2 sentences, español neutro LATAM, tú form>"
  }
```
Rules (encoded in the T17b tests):
- **Name the public-domain deck equivalents.** Both the Tarot de Marseille and the Rider-Waite-Smith deck (Waite, *The Pictorial Key to the Tarot*, 1911) are public domain — you may name and describe those cards freely.
- **Thoth title:** for the 40 pips / 16 courts you MAY add the Golden Dawn / **Liber 777 (1909, public domain)** minor title (e.g. Nine of Wands = "Strength"). For the 22 **Majors, do NOT** use the Book-of-Thoth (1944) renames (Lust, Art, The Aeon, The Universe, Adjustment, Fortune, The Magus, The Priestess) unless you verify them in a pre-1929 source — safest for majors is to name the Marseille + RWS titles and omit a distinct "Thoth reads it as" clause.
- **Never** reproduce Book of Thoth (1944) prose, reference Frieda Harris imagery, or use the words caught by the legal-guard test (`book of thoth`, `frieda harris`, `harris deck`, `thoth 1944`).
- Spanish = español neutro LATAM, `tú`. Card **titles** carry into ES naturally (e.g. "Fuerza", "Amor"); do not invent sign-name translations in the prose.

Three legally-safe worked examples (minors — Thoth titles from 777/1909) for founder review:
- **nine-of-wands** — en: "In the Tarot de Marseille and the Rider-Waite-Smith deck this card is the Nine of Wands. Its Golden Dawn / Liber 777 title is 'Strength' — the reserve of force held back for the final push (Moon in Sagittarius)." · es: "En el Tarot de Marsella y en la baraja Rider-Waite esta carta es el Nueve de Bastos. Su título en el Liber 777 es 'Fuerza': la reserva de energía guardada para el último tramo (Luna en Sagitario)."
- **two-of-cups** — en: "Called the Two of Cups in both the Marseille and Rider-Waite decks; its 777 title is 'Love,' Venus in Cancer." · es: "Se llama Dos de Copas tanto en Marsella como en Rider-Waite; su título en el 777 es 'Amor', Venus en Cáncer."
- **ten-of-swords** — en: "The Ten of Swords in the Marseille and Rider-Waite decks; the 777 title is 'Ruin,' Sun in Gemini." · es: "El Diez de Espadas en las barajas de Marsella y Rider-Waite; su título en el 777 es 'Ruina', Sol en Géminis."

- [ ] **Step 1: Full suite + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green. (Per memory `feedback_lint_worktrees_pollution`, grep lint output for `src/` paths only — `.claude/worktrees/` noise is pre-existing.)

- [ ] **Step 2: Local SSR curl-verify (the empty-shell class unit tests can't see)**

Because the 78 tarot pages are statically pre-rendered, the ES-retitle flag is applied at **build** — set `TAROT_ES_RETITLE_EXPERIMENT` on the `npm run build` command (not just `npm run start`) whenever you want to change the baked title.

Run `npm run build && npm run start`, then in another shell:
```bash
# ES retitle live on an /es card (experiment default ON), EN control unchanged
curl -s http://localhost:3000/es/tarot/nine-of-wands | grep -o '<title>[^<]*</title>'
curl -s http://localhost:3000/tarot/nine-of-wands   | grep -o '<title>[^<]*</title>'
# Kill-switch caps it (control title returns) — env must be set at BUILD time
TAROT_ES_RETITLE_EXPERIMENT=off npm run build >/dev/null && npm run start &
curl -s http://localhost:3000/es/tarot/nine-of-wands | grep -o '<title>[^<]*</title>'
# Deck-bridge renders in SSR outside <script> once a card is authored
curl -s http://localhost:3000/es/tarot/nine-of-wands | grep -o 'En otras barajas'
```
Expected: `/es` title contains `significado en el tarot`; EN title is `Nine of Wands — Thoth Tarot | Estrevia`; with the env `off` **at build**, the `/es` title reverts to `Nueve de Bastos — Thoth Tarot | Estrevia`; `En otras barajas` present once a `deckBridge` is authored (skip this line until then).

- [ ] **Step 3: Push** (direct-to-main; confirm with founder).
```bash
git push origin main
```

- [ ] **Step 4 (founder): author `deckBridge`** for a first batch (start with the ~40 pips/courts that get impressions; majors last, per the legal note). The T17b tests gate quality on merge.

- [ ] **Step 5 (founder): measure 4 weeks, then cap.** Record GSC tarot-ES cluster **position + CTR** at deploy, +2wk, +4wk against the spec §2 baseline (wavg pos 74, 0 clicks). After 4 weeks decide: keep the retitle (leave env unset) or **cap/revert** by setting `TAROT_ES_RETITLE_EXPERIMENT=off` in Vercel prod **and triggering a redeploy** — no source-code change, but because the tarot pages are statically pre-rendered the flag is applied at build, so a rebuild is required for the change to take effect. Note the decision in the roadmap's founder checklist.

---

### P3-T18: Tarot content depth + correct minor 777 correspondences

> **Depends on Phase-1 T1a** (`src/modules/esoteric/lib/tarotCards.ts` `buildCorrespondenceRows`). This task extends that helper. **Correction to Phase-1/roadmap:** the minor fields are *absent/undefined* in `cards.json` (ace-of-wands has no `treeOfLifePath` key at all), not literal `null` — so the guard must use `!= null` (loose), which Phase-1 T1a should already do after its fix.

**Goal (Decision 2 — "correct minor data later"):** Give the 56 minors their esoterically-correct 777 correspondences. These are **deterministic** in the Golden Dawn / Thoth system, so derive them in code — no founder data-entry for the structured fields: the 40 pips map to **sephirah + world** (pip number → sephirah 1–10; suit → world), the 16 courts map to **element-of-element** (rank element × suit element). Render minor-specific rows. The *prose depth* (upright/reversed meanings, love/work) is founder-authored via optional per-locale fields, rendered only when present.

**Files:**
- Modify: `src/modules/esoteric/lib/tarotCards.ts` (extend `buildCorrespondenceRows`; add `minorCorrespondences`)
- Test: `src/modules/esoteric/lib/__tests__/tarotCards.test.ts` (minor-derivation cases)
- Modify: `src/app/[locale]/(app)/tarot/[cardId]/page.tsx` (pass whole card; render optional prose fields)
- Modify: `messages/en.json`, `messages/es.json` (`tarotPage.detail.sephirah|world|elementOfElement` + prose headings)
- Content spec (founder): optional `meaning.uprightLong|reversedLong|loveWork` per-locale fields in `content/tarot/cards.json`

**Interfaces:**
- Produces: `minorCorrespondences(card: { id: string; suit: string; number: number }): CorrespondenceRow[]` (sephirah/world for pips; element-of-element/world for courts; `[]` for majors). `buildCorrespondenceRows` gains `id`, `suit`, `number` on its input and appends the minor rows when the major path fields are absent.

- [ ] **Step 1: Write the failing test**

Append to `src/modules/esoteric/lib/__tests__/tarotCards.test.ts`:
```ts
import { minorCorrespondences } from '../tarotCards';

describe('minorCorrespondences (deterministic 777)', () => {
  it('pip → sephirah + world (Ace of Wands = Kether in Atziluth)', () => {
    const rows = minorCorrespondences({ id: 'ace-of-wands', suit: 'wands', number: 1 });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(byKey['detail.sephirah']).toContain('Kether');
    expect(byKey['detail.world']).toContain('Atziluth');
  });
  it('pip number maps to the right sephirah (10 of Disks = Malkuth in Assiah)', () => {
    const byKey = Object.fromEntries(minorCorrespondences({ id: 'ten-of-disks', suit: 'disks', number: 10 }).map((r) => [r.key, r.value]));
    expect(byKey['detail.sephirah']).toContain('Malkuth');
    expect(byKey['detail.world']).toContain('Assiah');
  });
  it('court → element-of-element (Knight of Cups = Fire of Water)', () => {
    const byKey = Object.fromEntries(minorCorrespondences({ id: 'knight-of-cups', suit: 'cups', number: 11 }).map((r) => [r.key, r.value]));
    expect(byKey['detail.elementOfElement']).toBe('Fire of Water');
    expect(byKey['detail.world']).toContain('Briah');
  });
  it('major → [] (majors use path/Hebrew-letter rows instead)', () => {
    expect(minorCorrespondences({ id: 'the-fool', suit: 'major', number: 0 })).toEqual([]);
  });
});
```
Run → FAIL (`minorCorrespondences` missing).

- [ ] **Step 2: Implement the deterministic derivation**

Append to `src/modules/esoteric/lib/tarotCards.ts` (add the new keys to `CorrespondenceKey` too):
```ts
// extend CorrespondenceKey union:
//   | 'detail.sephirah' | 'detail.world' | 'detail.elementOfElement'

const SEPHIROTH: Record<number, string> = {
  1: 'Kether (Crown)', 2: 'Chokmah (Wisdom)', 3: 'Binah (Understanding)',
  4: 'Chesed (Mercy)', 5: 'Geburah (Severity)', 6: 'Tiphareth (Beauty)',
  7: 'Netzach (Victory)', 8: 'Hod (Splendour)', 9: 'Yesod (Foundation)',
  10: 'Malkuth (Kingdom)',
};
const SUIT_WORLD: Record<string, string> = {
  wands: 'Atziluth (Emanation / Fire)', cups: 'Briah (Creation / Water)',
  swords: 'Yetzirah (Formation / Air)', disks: 'Assiah (Action / Earth)',
};
const SUIT_ELEMENT: Record<string, string> = { wands: 'Fire', cups: 'Water', swords: 'Air', disks: 'Earth' };
// Thoth court→element: Knight=Fire, Queen=Water, Prince=Air, Princess=Earth.
const COURT_ELEMENT: Record<string, string> = { knight: 'Fire', queen: 'Water', prince: 'Air', princess: 'Earth' };

export function minorCorrespondences(card: { id: string; suit: string; number: number }): CorrespondenceRow[] {
  if (card.suit === 'major') return [];
  const rows: CorrespondenceRow[] = [];
  const world = SUIT_WORLD[card.suit];
  const rank = card.id.split('-of-')[0];
  if (rank in COURT_ELEMENT) {
    rows.push({ key: 'detail.elementOfElement', value: `${COURT_ELEMENT[rank]} of ${SUIT_ELEMENT[card.suit]}` });
  } else if (SEPHIROTH[card.number]) {
    rows.push({ key: 'detail.sephirah', value: SEPHIROTH[card.number] });
  }
  if (world) rows.push({ key: 'detail.world', value: world });
  return rows;
}
```
Then extend `buildCorrespondenceRows` input to `CardCorrespondences & { id: string; suit: string; number: number }` and, when the major fields are absent (i.e. `card.treeOfLifePath == null && card.hebrewLetter == null`), insert `minorCorrespondences(card)` rows before the `astrology` row. Majors are unaffected (they short-circuit on the present path fields).

Run → PASS.

- [ ] **Step 3: Add i18n labels**

Add to `tarotPage.detail` in **both** `messages/en.json` and `messages/es.json` (sephirah/world names are Hebrew/Hermetic transliterations — identical across locales; only the labels localize):
```json
      "sephirah": "Sephirah",
      "world": "World",
      "elementOfElement": "Element of element"
```
ES labels: `"sephirah": "Sefirá"`, `"world": "Mundo"`, `"elementOfElement": "Elemento de elemento"`.

- [ ] **Step 4: Verify render (the page already maps rows → `tPage(key)`)**

The Phase-1 render loop `buildCorrespondenceRows(card).map(({key,value}) => tPage(key) …)` now emits the minor rows automatically once the helper returns them and the label keys exist. Run `npm run typecheck` + `npx vitest run src/modules/esoteric/lib/__tests__/tarotCards.test.ts` → PASS. Curl-verify a pip:
```bash
curl -s http://localhost:3000/tarot/ace-of-wands | grep -o 'Kether\|Atziluth'   # expect both
```

- [ ] **Step 5: Commit the deterministic correspondences**

```bash
git add src/modules/esoteric/lib/tarotCards.ts src/modules/esoteric/lib/__tests__/tarotCards.test.ts \
        "src/app/[locale]/(app)/tarot/[cardId]/page.tsx" messages/en.json messages/es.json
git commit -m "feat(seo-p3/T18): correct minor-arcana 777 correspondences (sephirah/world, element-of-element)"
```

- [ ] **Step 6: Founder content spec — prose depth (optional per-locale fields)**

Add optional fields to each minor in `content/tarot/cards.json` and render guarded on truthiness (mirrors `getCardDescription`):
- `meaning.uprightLong: { en, es }` — 1–2 sentences on the upright reading.
- `meaning.reversedLong: { en, es }` — 1–2 sentences reversed.
- `meaning.loveWork: { en, es }` — the card "en el amor / en el trabajo" context (the highest-intent ES query shape).
Rules: ES = neutro LATAM (`tú`); sign/card names untranslated; **no** Book of Thoth (1944) prose or Harris imagery (CLAUDE.md). Add a placeholder-detecting test (rejects `TODO`/`TBD`/empty) that stays green until fields are authored, then a render guard + curl-verify. Ship progressively — each card renders its prose the moment its fields land.


---

### P3-T19: Off-site brand anchors vs the "Estreva"-drug SERP collision (founder-owned ops + one code seam)

> **Nature of this task:** This is **founder-owned marketing/ops**, not a code feature (roadmap §5 T19, §7 "Out of scope"). It is written as an **ops checklist** plus the **single code touchpoint** the roadmap calls for: centralizing `organizationSchema.sameAs` behind a shared, testable constant so that each off-site profile URL is a one-line append covered by a placeholder-detecting test. **Phase 3, gated** by the §1 crawl-quality gate for *new page types* — but the code seam (Part B) touches no page type and is safe to land with the Phase-1 deploy; only the **URL appends** wait on the founder creating the profiles.

**Problem (grounded).** Audit finding **#15** (`outputs/seo-audit-2026-07-06/REPORT.md:39`, CONFIRMED): the brand query **"estrevia" sits at pos 3.61 / CTR 0.65%** because **"Estreva" (estradiol gel) outranks the site** (`:129` — "drug pages #1–2, site #3") *and* the brand is diluted across the www/apex split. Finding **#17** (`:41`, `:131`): Google has almost nothing to disambiguate the entity with — `Organization.sameAs` is **one X account** (`src/shared/seo/json-ld.ts:54`), the Article author is an anonymous Organization, and no crawlable `/about` HTML page exists (only `llms.txt` names the founder). The fix is **entity consolidation + off-site anchors that Google can tie back to `estrevia.app`**, fed into `sameAs`.

**Why sameAs is the amplifier, not the fix.** `sameAs` only *confirms* an entity Google already believes in. It must ride on two siblings from other tasks, or it does nothing:
- **Phase-1 O1 — www → 308 permanent** (roadmap §3 O1) collapses the www/apex split — the *other half* of finding #15.
- **Phase-2 T13 — `/about` + `/es/about`** (roadmap §4 T13, Decision 3) gives the crawlable **entity home** + upgrades the Article author Organization→**Person** (Kirill Kovalenko). That page becomes the hub every `sameAs` profile links *back* to.
Do **not** land T19's URL appends before O1 and T13 exist, or the anchors point at an unconsolidated, home-less entity.

---

#### Part A — Founder-owned ops checklist (non-code)

**A0. Canonical brand facts — the NAP table (single source, keep every profile byte-identical).**
Pulled verbatim from the repo so off-site profiles never disagree (NAP-consistency is the whole point):

| Field | Canonical value | Source in repo |
|-------|----------------|----------------|
| Name | **Estrevia** | `src/shared/seo/constants.ts:1` (`SITE_NAME`) |
| One-liner | **Sidereal astrology platform — natal charts, planetary hours, esoteric correspondences** | `constants.ts:21` (`SITE_DESCRIPTION`) |
| Website | **https://estrevia.app** (apex, no `www`, no trailing slash) | `constants.ts` (`SITE_URL`) |
| Handle | **@estrevia_app** | `constants.ts:20` (`TWITTER_HANDLE`) |
| Support | **support@estrevia.app** | `public/llms.txt` (Contact) |
| Founder | **Kirill Kovalenko** | `public/llms.txt` (Founder) |
| Category | Astrology / Lifestyle web app | `json-ld.ts:72` (`applicationCategory: 'LifestyleApplication'`) |

Rule: name string, one-liner, apex URL, and handle must be **character-identical** on every profile below. Any physical/postal address used publicly (e.g. Crunchbase) must match the CAN-SPAM `COMPANY_POSTAL_ADDRESS` already set for email footers — do **not** paste a second, different address (PII stays out of this repo; the founder holds the canonical value in Vercel env).

**A1. Tier-1 anchors — create these first (highest entity-graph weight, all verifiable).**
For each: use the A0 facts, link the profile's website field to `https://estrevia.app`, then hand the **canonical profile URL** to Part B.
- [ ] **Crunchbase** — company profile `https://www.crunchbase.com/organization/estrevia` (org name Estrevia; website apex; short description = A0 one-liner). *Directly named in audit `:129`.*
- [ ] **Product Hunt** — product page `https://www.producthunt.com/products/estrevia` (a launch also drives the first non-drug branded impressions). *Directly named in audit `:129`.*
- [ ] **LinkedIn company page** — `https://www.linkedin.com/company/estrevia` (Company, not personal; tagline = A0 one-liner; website apex).
- [ ] **GitHub** — the repo is **AGPL-3.0** (`CLAUDE.md` license split), so a public source mirror is a *legitimate, high-trust* anchor: `https://github.com/<org-or-user>/estrevia` with the repo "About" website = apex. **Founder decision** whether/when to make the mirror public; if not public, skip — do **not** invent a URL.

**A2. Tier-2 anchors — add after Tier-1 (breadth signals).**
- [ ] **Bluesky** — `https://bsky.app/profile/estrevia.app` (verify the domain-handle via the DNS `_atproto` TXT record so the handle *is* the domain — strongest possible NAP tie).
- [ ] **Instagram** — `https://www.instagram.com/estrevia_app` (reuse the exact handle).
- [ ] **Wikidata item** — `https://www.wikidata.org/wiki/Q<id>` once notability supports it (P856 "official website" = apex; P2002 = X handle). Highest Knowledge-Graph payoff, hardest to land — do last.

**A3. Consolidation hygiene (do alongside, no new profiles):**
- [ ] Confirm Phase-1 **O1 (www→308)** shipped before appending any URL (§ dependency above).
- [ ] Confirm the live **X bio** website field = `https://estrevia.app` (apex) and bio one-liner = A0, so the *existing* `sameAs` entry is itself consistent.
- [ ] After Phase-2 **T13** ships, ensure every Tier-1 profile's "website" points at `https://estrevia.app/about` **or** apex (pick one and keep it consistent) so back-links reinforce the entity home.

---

#### Part B — The one code touchpoint: centralize + guard `Organization.sameAs`

Turns the hard-coded single-element array at `json-ld.ts:54` into a shared, founder-editable `SAME_AS_URLS` list with a validity/placeholder guard, so A1–A2 URLs are appended in **one place** and can never ship malformed. This refactor is **output-identical today** (still emits only the X URL) → safe to land with the Phase-1 deploy; the founder appends real URLs later as profiles go live.

**Files:**
- Modify: `src/shared/seo/constants.ts` (add `SAME_AS_URLS` after `TWITTER_HANDLE`, `:20`)
- Modify: `src/shared/seo/json-ld.ts` (import `SAME_AS_URLS` `:32`; use it `:54`)
- Modify: `src/shared/seo/__tests__/json-ld.test.ts` (new describe block — does **not** touch the logo test Phase-1 T3 rewrites)

**Interface:** `export const SAME_AS_URLS: readonly string[]` — the append-point. `organizationSchema()` spreads it into `sameAs`.

- [ ] **Step 1: Write the failing test**

Append to `src/shared/seo/__tests__/json-ld.test.ts` (the file already imports `organizationSchema` and defines `AnySchema`; add the `SAME_AS_URLS` import beside the existing `../json-ld` import):
```ts
import { SAME_AS_URLS } from '../constants';

describe('organizationSchema sameAs — brand entity anchors (T19)', () => {
  it('emits exactly the shared SAME_AS_URLS list', () => {
    const schema = organizationSchema() as unknown as AnySchema;
    expect(Array.isArray(schema.sameAs)).toBe(true);
    expect(schema.sameAs).toEqual([...SAME_AS_URLS]);
  });

  it('includes the live X profile', () => {
    const schema = organizationSchema() as unknown as AnySchema;
    expect(schema.sameAs).toContain('https://x.com/estrevia_app');
  });

  it('every entry is an absolute, unique, non-placeholder https profile URL', () => {
    const seen = new Set<string>();
    for (const raw of SAME_AS_URLS) {
      expect(raw).toBe(raw.trim()); // no stray whitespace
      expect(raw).not.toMatch(/example\.com|your-|placeholder|TODO|TBD|xxxx|[<>]/i);
      const url = new URL(raw); // throws (fails test) if not a valid absolute URL
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toContain('.');
      expect(raw).not.toMatch(/^https:\/\/[^/]+\/?$/); // must carry a profile path/handle, not a bare origin
      expect(seen.has(url.href)).toBe(false); // no duplicates
      seen.add(url.href);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shared/seo/__tests__/json-ld.test.ts -t "brand entity anchors"`
Expected: FAIL — `Failed to resolve import { SAME_AS_URLS } from '../constants'` (the constant does not exist yet).

- [ ] **Step 3: Add the constant (the founder append-point)**

In `src/shared/seo/constants.ts`, immediately after `export const TWITTER_HANDLE = '@estrevia_app';` (`:20`):
```ts
/**
 * Canonical off-site brand-entity profiles for Organization.sameAs.
 *
 * Finding #15 (SEO audit 2026-07-06): the "estrevia" brand SERP is being lost to
 * the "Estreva" estradiol drug. Google uses sameAs to disambiguate the entity and
 * build a Knowledge Panel. Seeded with the live X account.
 *
 * APPEND each profile's canonical URL here — and ONLY here — as it goes live
 * (Crunchbase, Product Hunt, LinkedIn, GitHub, Bluesky, Instagram, Wikidata).
 * Every entry MUST be an absolute https:// URL to a real, live profile with a
 * path/handle; the json-ld unit test rejects placeholders, bare origins, and dupes.
 */
export const SAME_AS_URLS: readonly string[] = [
  'https://x.com/estrevia_app',
] as const;
```

- [ ] **Step 4: Point `organizationSchema` at the constant**

In `src/shared/seo/json-ld.ts`:

(a) Extend the constants import (`:32`):
```ts
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from './constants';
```
→
```ts
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, SAME_AS_URLS } from './constants';
```

(b) Replace the inline `sameAs` array (`:54`):
```ts
    sameAs: ['https://x.com/estrevia_app'],
```
→
```ts
    sameAs: [...SAME_AS_URLS],
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/shared/seo/__tests__/json-ld.test.ts`
Expected: PASS — the new 3-test block plus all pre-existing `organizationSchema` tests (the emitted `sameAs` value is byte-for-byte unchanged from before this task).

- [ ] **Step 6: Verify types + no regression**

Run: `npm run typecheck && npx vitest run src/shared/seo/__tests__/json-ld.test.ts`
Expected: typecheck PASS (`readonly string[]` spreads into the schema-dts `sameAs` string-array without a cast); tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/seo/constants.ts src/shared/seo/json-ld.ts \
        src/shared/seo/__tests__/json-ld.test.ts
git commit -m "feat(seo-p3/T19): centralize Organization sameAs into SAME_AS_URLS + validity guard"
```

- [ ] **Step 8 (repeat, founder-gated — one per profile from Part A):** as each Tier-1/Tier-2 profile goes live, add its canonical URL to `SAME_AS_URLS` in `constants.ts`, e.g.
```ts
export const SAME_AS_URLS: readonly string[] = [
  'https://x.com/estrevia_app',
  'https://www.crunchbase.com/organization/estrevia',
  'https://www.producthunt.com/products/estrevia',
  'https://www.linkedin.com/company/estrevia',
] as const;
```
Re-run `npx vitest run src/shared/seo/__tests__/json-ld.test.ts` (the guard catches a malformed/placeholder paste) and commit `feat(seo-p3/T19): add <profile> to Organization sameAs`. **Only add a URL that resolves to a real, live profile** — never a reserved-but-empty handle.

---

#### Sequencing, gate & measurement

- **Gate:** Phase-3-tagged. The **code seam (Steps 1–7)** carries no new page type and is safe to deploy with Phase 1. The **profile creation (Part A) + URL appends (Step 8)** are founder work that should follow **O1 (www→308)** and **T13 (`/about` + Person author)** so the anchors point at a consolidated, home-owning entity.
- **No code beyond Part B.** Per roadmap §7, off-site anchors are marketing; `content/` prose, PII, auth, and payment paths are untouched.
- **Measurement (GSC, roadmap §2 last row):** brand **"estrevia" position 3.61 / CTR 0.65%** is the baseline. Re-measure at **+2wk / +4wk** after O1 + first Tier-1 profiles + `/about`. Success = position climbs above the "Estreva" drug results and/or a **Knowledge Panel** appears for "estrevia". Secondary signal: branded-query CTR rising as the panel/sitelinks render.
- **Founder checklist hook:** this maps to roadmap §8 "[ ] T19 — off-site brand anchors (Phase 3)". Add the sub-items A1/A2 under it.
