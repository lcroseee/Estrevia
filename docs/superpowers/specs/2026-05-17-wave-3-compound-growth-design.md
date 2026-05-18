# Wave 3 — compound growth foundation (design spec)

**Status:** Spec (drafted 2026-05-17). Implementation plan to follow.
**Wave 3 Top-3 scope:** L1-F viral instrumentation gap-fill + L1-G+L5-E advertising-agent Phase 1 + L5-C SEO Phase 3 + AEO infra. Deferred to Wave 3.5: L3-E trial, L5-B viral A/B incentive, L5-D pricing test cycle (all blocked on baseline data accumulation).
**Parent:** `docs/superpowers/specs/2026-05-17-advertising-improvements-design.md` §8 Wave 3.
**Predecessor:** Wave 1 (instrumentation) + Wave 2 (conversion foundation) — both shipped 2026-05-17.

---

## 1. Goal

Ship three foundation pieces that compound over the next quarter without requiring further engineer-time per iteration:

1. **L1-F viral instrumentation gap-fill** — close the missing `passport_reshared` event firing on Synastry share, unlocking PostHog viral-coefficient funnel (`reshared → viewed → converted`).
2. **L1-G+L5-E advertising-agent Phase 1 launch** — add senior-buyer conversion-count guard to `tier-1-rules.ts`, ship founder observability + env-flip runbooks, prepare for `ADVERTISING_AGENT_ENABLED=true DRY_RUN=true` ramp.
3. **L5-C SEO Phase 3 + AEO infrastructure** — ship 144-pair `/compatibility` SSG routes + 20-city `/planetary-hours-cities` ISR routes + `definedTermSchema()` helper + inject existing `faqSchema()` on `/why-sidereal` as proof-of-pattern.

**Out of scope (Wave 3.5):** L3-E (Free → Pro trial) requires 5-10 full-price conversions first. L5-B (Cosmic Passport A/B + referral incentive) requires 2 weeks of viral-coefficient data from L1-F. L5-D (pricing test cycle) requires ≥150 conversions per variant.

---

## 2. Pre-flight ground truth (verified 2026-05-17 via grep)

Three audit-roadmap assumptions disconfirmed by code-state grep. Spec adapted accordingly.

| Roadmap claim | Code state (verified) | Spec adaptation |
|---|---|---|
| "Cosmic Passport needs `share_clicked` event" | `PASSPORT_RESHARED: 'passport_reshared'` already fires on all 5 ShareButton channels (native/copy/twitter/telegram/whatsapp) | Real gap = SynastryResult.handleShare doesn't fire any event + no UTM. Fix this one location, build dashboard from existing data. |
| "LEARNING_PHASE_DAYS=2 is too aggressive" (memory `feedback_meta_learning_phase`) | `tier-1-rules.ts:10` already shows `const LEARNING_PHASE_DAYS = 7` | Memory is stale; flag for update post-ship. Real gap = no `MIN_CONVERSIONS_BEFORE_ACTION` guard. |
| "Need FAQ schema + entity markup" (audit §L5-C) | `faqSchema()` helper exists at `src/shared/seo/json-ld.ts:191` but 0 callers in `src/app/`; `DefinedTerm` helper missing | Add `definedTermSchema()`; inject existing `faqSchema()` on /why-sidereal as proof-of-pattern. |

Lesson re-applied: **[[feedback-grep-callers-not-just-definitions]]** — grep callers, not just roadmap descriptions.

---

## 3. Architecture (3 sections, independent file sets)

```
Wave 3 Top-3 compound growth foundation
│
├── Section 1: L1-F viral instrumentation gap-fill  [~1-2d]
│   ├── src/modules/astro-engine/components/SynastryResult.tsx           [modify]
│   ├── src/modules/astro-engine/components/__tests__/SynastryResult.test.tsx  [new/extend]
│   └── docs/runbooks/viral-coefficient-dashboard.md                     [new]
│
├── Section 2: L1-G+L5-E advertising-agent Phase 1  [~2-3d]
│   ├── src/modules/advertising/decide/tier-1-rules.ts                   [modify]
│   ├── src/modules/advertising/decide/__tests__/tier-1-rules.test.ts    [extend]
│   ├── docs/runbooks/advertising-agent-phase1-observability.md          [new]
│   └── docs/runbooks/advertising-agent-phase1-env-flip.md               [new]
│
└── Section 3: L5-C SEO Phase 3 + AEO infra  [~4-5d]
    ├── src/shared/seo/json-ld.ts                                        [extend: +definedTermSchema()]
    ├── src/shared/seo/__tests__/json-ld.test.ts                         [extend]
    ├── src/app/[locale]/(marketing)/compatibility/page.tsx              [new — index 12×12]
    ├── src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx       [new — 144 SSG pairs]
    ├── src/app/[locale]/(marketing)/planetary-hours-cities/page.tsx     [new — 20-city directory]
    ├── src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx  [new — per-city ISR daily]
    ├── src/app/[locale]/(marketing)/why-sidereal/page.tsx               [modify: inject faqSchema + definedTermSchema]
    ├── src/app/sitemap.ts                                               [extend: +166 URLs]
    └── docs/runbooks/seo-content-cadence.md                             [new]
```

**Independence claim:** No section writes to a file that another section reads or writes. SynastryResult.tsx (S1), tier-1-rules.ts (S2), and json-ld.ts/new-routes (S3) are disjoint code paths. Agent Teams parallel via `isolation:worktree` is safe.

---

## 4. Section 1 — L1-F viral instrumentation gap-fill

### 4.1. Diagnosis

`PASSPORT_RESHARED: 'passport_reshared'` (enum at `src/shared/lib/analytics.ts:220`) already fires from `ShareButton.tsx` on every channel via `trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform, passport_id })`. Verified at file lines 74, 95, 207, 226, 245 for native/copy/twitter/telegram/whatsapp respectively.

**Single live gap:** `src/modules/astro-engine/components/SynastryResult.tsx:152-163` — `handleShare()` calls `navigator.share()` (or clipboard fallback) without (a) firing `PASSPORT_RESHARED`, (b) wrapping `shareUrl` with `buildShareUrl()`. Synastry shares therefore lose UTM and don't appear in viral funnel.

### 4.2. Code change

`src/modules/astro-engine/components/SynastryResult.tsx`:

```tsx
// Add to imports at top of file:
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { buildShareUrl } from '@/shared/lib/share';

// Replace existing handleShare() (line 152-163) with:
const handleShare = async () => {
  const text = `${person1Label} & ${person2Label}: ${Math.round(scores.overall)}% compatibility`;
  const taggedUrl = buildShareUrl(shareUrl, 'native');
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: text, url: taggedUrl });
      trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'native', passport_id: id });
    } catch {
      // User dismissed — not an error
    }
  } else {
    await navigator.clipboard.writeText(taggedUrl);
    trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'copy_link', passport_id: id });
  }
};
```

**Pre-condition:** verify `SynastryResult.tsx` receives `id` as prop (the synastry id used in /s/synastry/[id] URL). If not, propagate from parent.

### 4.3. Runbook deliverable

`docs/runbooks/viral-coefficient-dashboard.md` — 1-page PostHog setup guide:

- **Insight 1: Viral Funnel** — Funnel type, 3 steps:
  1. `passport_reshared` (any platform)
  2. `passport_viewed`
  3. `passport_converted`
  - Breakdown: `platform` property
  - Window: 7 days
- **Insight 2: Viral Coefficient Trend** — Trends type:
  - Numerator series: `passport_converted` count
  - Denominator series: `passport_reshared` distinct passport_id count
  - Display as ratio over weekly
- **Insight 3: Per-channel Share Heatmap** — Trends type:
  - `passport_reshared` breakdown `platform`
  - Stacked bars weekly, 12-week trail
- **Acceptance:** All 3 insights pinned to "Viral" PostHog dashboard. Founder weekly review checklist appended.

### 4.4. Tests

`src/modules/astro-engine/components/__tests__/SynastryResult.test.tsx` (extend or new):

- Fire `PASSPORT_RESHARED` with `{ platform: 'native', passport_id: id }` when `navigator.share` available
- Fire `PASSPORT_RESHARED` with `{ platform: 'copy_link', passport_id: id }` when fallback path taken
- Pass `buildShareUrl(shareUrl, 'native')` (with UTM) to `navigator.share` `url` argument
- Pass tagged URL (with UTM) to `clipboard.writeText` in fallback branch
- No event fire when `navigator.share` throws (dismissed)

Use `vi.mock('@/shared/lib/analytics')` to spy on `trackEvent`. Provide mocked `navigator.share` + `navigator.clipboard` via `Object.defineProperty(global, 'navigator', ...)` per existing jsdom pattern.

---

## 5. Section 2 — L1-G+L5-E advertising-agent Phase 1

### 5.1. Diagnosis

`src/modules/advertising/decide/tier-1-rules.ts` already has correct `LEARNING_PHASE_DAYS=7` guard (memory `feedback_meta_learning_phase` is stale on the "=2" claim). But there's no second guard for **conversion sample size**: an ad set could pass the 7-day check but only have accumulated 10 conversions in that window, making any pause/scale decision statistically unsound.

Senior media-buyer best practice: do not act on per-ad-set metrics below `≥50 conversions` in the lookback window. Per Meta documentation, learning phase officially exits at 50 optimization events in 7 days.

### 5.2. Code change

`src/modules/advertising/decide/tier-1-rules.ts`:

```ts
// Add new constant near existing thresholds (line 6 area):
const MIN_CONVERSIONS_BEFORE_ACTION = 50;

// Inside applyTier1Rules(), AFTER the learning-phase check (after line 34)
// and BEFORE the frequency-cap check:
if (m.conversions_7d != null && m.conversions_7d < MIN_CONVERSIONS_BEFORE_ACTION) {
  return {
    ...base,
    action: 'hold',
    reason: `insufficient_conversions: ${m.conversions_7d}/7d, need ≥${MIN_CONVERSIONS_BEFORE_ACTION}`,
  };
}

// Update export list (line 70):
export { FREQUENCY_CAP, CPC_HARD_CAP, SPEND_DAILY_OVERAGE, LEARNING_PHASE_DAYS, MIN_CONVERSIONS_BEFORE_ACTION };
```

**Fail-open semantics:** if `m.conversions_7d` is `null`/`undefined` (Meta API edge case), skip the guard and let downstream checks run. Logged via existing `audit_actions` reasoning field. We prefer the agent acting on partial data over freezing entirely on a metric-fetch hiccup.

**Pre-condition:** verify `AdMetric` type at `src/shared/types/advertising.ts` includes `conversions_7d?: number | null`. If not, extend the type in the same edit.

### 5.3. Runbook deliverables

**`docs/runbooks/advertising-agent-phase1-observability.md`** — weekly KPIs to monitor in DRY_RUN observation period:

1. `decision_count_by_action` — count(audit_actions WHERE action IN ('hold', 'pause', 'maintain', 'scale', 'edit')) by week — proves the agent is actually evaluating
2. `false_positive_count` — count(audit_actions WHERE founder_overridden = true) — proves agent decisions match founder judgment (target: < 5% week-over-week)
3. `hold_reasons_breakdown` — count(audit_actions WHERE action='hold') GROUP BY reason — distinguishes learning_phase vs insufficient_conversions vs frequency_cap
4. `top_3_paused_ads` + `top_3_scaled_ads` — last 7 days, sanity check that pausing/scaling targets make sense
5. **Acceptance criterion:** 4 consecutive weeks with zero false positives = ready for `DRY_RUN=false` flip (Wave 3.5)

**`docs/runbooks/advertising-agent-phase1-env-flip.md`** — founder ramp playbook:

1. **Step 1 — Verify env vars** in Vercel production:
   - `ADVERTISING_AGENT_ENABLED` — currently `false`, will flip to `true`
   - `ADVERTISING_AGENT_DRY_RUN` — keep at `true` (no real Meta API actions)
   - `META_GRAPH_API_TOKEN` — ensure not expired (90-day lifecycle)
   - `META_AD_ACCOUNT_ID` — `act_1435842067150024` (per memory)
   - `META_PAGE_ID` — `1087394517790815` (Estrevia Page per memory)
2. **Step 2 — Run T4 seed script** (per v3b autonomy fixes memory) — seeds initial `advertising_ad_set_state` rows from live Meta ad sets:
   ```bash
   npm run seed:ad-set-states
   ```
3. **Step 3 — Flip ENABLED** in Vercel env (keep DRY_RUN=true)
4. **Step 4 — Verify cron** (`/api/cron/advertising/triage-hourly`) runs successfully within 1 hour. Check `audit_actions` table: ≥1 new row.
5. **Step 5 — Weekly observation** per `phase1-observability.md` runbook.
6. **Step 6 (4w later, Wave 3.5)** — Flip `DRY_RUN=false` if observability acceptance met.

### 5.4. Tests

`src/modules/advertising/decide/__tests__/tier-1-rules.test.ts` (extend):

- `applyTier1Rules` returns `action='hold'` with reason `insufficient_conversions:...` when `conversions_7d < 50`
- Returns next-rule decision (e.g. `'maintain'`) when `conversions_7d === 50` (boundary)
- Returns next-rule decision when `conversions_7d > 50`
- Learning-phase guard wins over conversion guard (when `days_running < 7`, return learning-phase reason regardless of conversions value)
- **Fail-open**: when `conversions_7d` is `null` or `undefined`, skip the guard (no `hold` returned)
- Existing frequency-cap / CPC / spend tests still pass

---

## 6. Section 3 — L5-C SEO Phase 3 + AEO infra

### 6.1. Programmatic SEO routes

**`src/app/[locale]/(marketing)/compatibility/page.tsx`** (new): index page rendering 12×12 grid of sign pairs. Each cell is an `<Link>` to `/compatibility/[pair]`. Pair slug format: `${sign1}-${sign2}` lowercase, where sign1 and sign2 sorted alphabetically to canonicalize (avoid `aries-leo` and `leo-aries` as duplicate URLs).

Pair count: C(12, 2) + 12 (same-sign self-pairs) = 66 + 12 = **78 unique pairs** (not 144 — sorted canonicalization halves the matrix excluding self-pairs, then self-pairs added back).

Decision: **78 unique pair routes** (`aries-aries`, `aries-leo`, ..., `pisces-pisces`).

**`src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx`** (new): per-pair SSG page. Content shape:

- Pair element compatibility (Fire+Fire harmonious, Fire+Water clash, etc.)
- Pair modality compatibility (Cardinal+Cardinal challenging, Cardinal+Mutable stable, etc.)
- Aspect type by 30°-distance (conjunction/sextile/square/trine/opposition/none)
- Ruling planets of each sign
- Pull from existing `content/signs/*.mdx` frontmatter (`element`, `modality`, `ruler`)
- **No brand-voice prose** — purely structured factual data; founder may add prose later

`generateStaticParams` returns all 78 valid sorted-pair slugs. `dynamicParams: false` → invalid slugs return 404.

JSON-LD: `articleSchema()` + `breadcrumbSchema()` (existing helpers).

**`src/app/[locale]/(marketing)/planetary-hours-cities/page.tsx`** (new): index of 20 cities. Card grid linking to per-city pages.

**`src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx`** (new): per-city dynamic page using existing planetary-hours engine. ISR with `revalidate: 86400` (24h).

**Top-20 city list** (mixed EN + ES locales by traffic potential):

```ts
const TOP_CITIES = [
  // EN-primary
  { slug: 'new-york',     name: 'New York',     lat: 40.7128,  lng:  -74.0060, tz: 'America/New_York' },
  { slug: 'los-angeles',  name: 'Los Angeles',  lat: 34.0522,  lng: -118.2437, tz: 'America/Los_Angeles' },
  { slug: 'chicago',      name: 'Chicago',      lat: 41.8781,  lng:  -87.6298, tz: 'America/Chicago' },
  { slug: 'london',       name: 'London',       lat: 51.5074,  lng:   -0.1278, tz: 'Europe/London' },
  { slug: 'toronto',      name: 'Toronto',      lat: 43.6532,  lng:  -79.3832, tz: 'America/Toronto' },
  { slug: 'sydney',       name: 'Sydney',       lat: -33.8688, lng:  151.2093, tz: 'Australia/Sydney' },
  { slug: 'singapore',    name: 'Singapore',    lat:  1.3521,  lng:  103.8198, tz: 'Asia/Singapore' },
  { slug: 'dubai',        name: 'Dubai',        lat: 25.2048,  lng:   55.2708, tz: 'Asia/Dubai' },
  { slug: 'mumbai',       name: 'Mumbai',       lat: 19.0760,  lng:   72.8777, tz: 'Asia/Kolkata' },
  { slug: 'amsterdam',    name: 'Amsterdam',    lat: 52.3676,  lng:    4.9041, tz: 'Europe/Amsterdam' },
  // ES-primary (LATAM)
  { slug: 'ciudad-de-mexico', name: 'Ciudad de México', lat: 19.4326, lng:  -99.1332, tz: 'America/Mexico_City' },
  { slug: 'buenos-aires',     name: 'Buenos Aires',     lat: -34.6037, lng: -58.3816, tz: 'America/Argentina/Buenos_Aires' },
  { slug: 'bogota',           name: 'Bogotá',           lat:  4.7110,  lng: -74.0721, tz: 'America/Bogota' },
  { slug: 'lima',             name: 'Lima',             lat: -12.0464, lng: -77.0428, tz: 'America/Lima' },
  { slug: 'santiago',         name: 'Santiago',         lat: -33.4489, lng: -70.6693, tz: 'America/Santiago' },
  { slug: 'sao-paulo',        name: 'São Paulo',        lat: -23.5505, lng: -46.6333, tz: 'America/Sao_Paulo' },
  { slug: 'rio-de-janeiro',   name: 'Rio de Janeiro',   lat: -22.9068, lng: -43.1729, tz: 'America/Sao_Paulo' },
  { slug: 'madrid',           name: 'Madrid',           lat: 40.4168,  lng:  -3.7038, tz: 'Europe/Madrid' },
  { slug: 'barcelona',        name: 'Barcelona',        lat: 41.3851,  lng:   2.1734, tz: 'Europe/Madrid' },
  { slug: 'caracas',          name: 'Caracas',          lat: 10.4806,  lng: -66.9036, tz: 'America/Caracas' },
] as const;
```

`generateStaticParams` returns these 20 slugs. `dynamicParams: false`.

### 6.2. AEO schema infrastructure

**`src/shared/seo/json-ld.ts`** — add `definedTermSchema()` helper:

```ts
import type { DefinedTerm, WithContext } from 'schema-dts';

interface DefinedTermItem {
  name: string;        // e.g. "Lahiri ayanamsa"
  description: string; // factual description, 1-2 sentences
  url?: string;        // optional canonical URL for the term
  inDefinedTermSet?: string; // optional taxonomy URL (e.g. Wikipedia)
}

export function definedTermSchema(item: DefinedTermItem): WithContext<DefinedTerm> {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: item.name,
    description: item.description,
    ...(item.url ? { url: item.url } : {}),
    ...(item.inDefinedTermSet ? { inDefinedTermSet: item.inDefinedTermSet } : {}),
  };
}
```

Export from `src/shared/seo/index.ts`.

### 6.3. Inject AEO schema on /why-sidereal (proof-of-pattern)

**`src/app/[locale]/(marketing)/why-sidereal/page.tsx`** — add:

- `faqSchema([...])` with 5-7 engineer-writeable factual Q/A pairs. Sample Q/As:
  - "What is sidereal astrology?" → "Sidereal astrology calculates planetary positions against the actual constellations as they appear in the sky today, applying the Lahiri ayanamsa correction (~24° as of 2026) to account for Earth's axial precession."
  - "What is the Lahiri ayanamsa?" → "The Lahiri ayanamsa is the official sidereal reference point defined by the Indian Calendar Reform Committee in 1955, used by Estrevia for all chart calculations."
  - "How accurate is Estrevia's chart calculation?" → "Estrevia uses Swiss Ephemeris with the Moshier algorithm, accurate to ±0.01°. Houses use the Placidus system."
  - "What is the difference between sidereal and tropical astrology?" → "Tropical astrology uses the seasons (Sun's apparent path) as its reference frame; sidereal astrology uses the actual constellations. They differ by the current ayanamsa value."
  - "Is Vedic astrology the same as sidereal astrology?" → "Vedic (Jyotish) astrology uses sidereal calculations as its mathematical foundation but layers additional doctrines (nakshatras, dashas, yogas) on top."

- `definedTermSchema([...])` with 3 terms:
  - "Lahiri ayanamsa" — described above; `inDefinedTermSet: 'https://en.wikipedia.org/wiki/Ayanamsa'`
  - "Sidereal astrology" — described above
  - "Vedic astrology" — described above

Render both via existing `<JsonLdScript />` component.

Founder may extend `faqSchema()` injection to `/pricing` and `/sidereal-dates` root async post-Wave-3 via the seo-content-cadence runbook.

### 6.4. Sitemap extension

`src/app/sitemap.ts` — extend with:

- 1 × `/compatibility`
- 78 × `/compatibility/[pair]`
- 1 × `/planetary-hours-cities`
- 20 × `/planetary-hours-cities/[city]`

EN + ES locales each → **+200 URLs total** (466 → ~666). All entries follow existing `lastModifiedFor()` + `buildAlternates()` patterns.

### 6.5. Founder runbook

`docs/runbooks/seo-content-cadence.md` — 1-page guide covering:

- **1 essay/week cadence** — topic queue suggestions (planetary hours practical use, Vedic dasha intro for sidereal beginners, sign-by-sign in español neutro)
- **FAQ extension template** — how to add Q/A to `/pricing` and `/sidereal-dates` root pages once founder has 3-5 Q/A pairs per page
- **Synastry pair content extension** — how to add prose to any of the 78 `/compatibility/[pair]` pages when founder has time; engineer-shipped factual stub remains valid baseline
- **DefinedTerm extension** — how to add more astrological terms beyond initial 3

### 6.6. Tests

`src/shared/seo/__tests__/json-ld.test.ts` (extend):

- `definedTermSchema()` returns valid `@type: 'DefinedTerm'` JSON-LD
- Optional `url` + `inDefinedTermSet` fields included only when provided
- Required `name` + `description` always present

`src/app/[locale]/(marketing)/compatibility/__tests__/page.test.tsx` (new):

- Index page renders 78 pair links
- Per-pair page renders for valid pair slug; includes element + modality + ruler facts
- Invalid pair slug → throw `notFound()` (Next.js 404)
- JSON-LD output validates against `articleSchema` + `breadcrumbSchema`

`src/app/[locale]/(marketing)/planetary-hours-cities/__tests__/page.test.tsx` (new):

- Index renders 20 city cards
- Per-city renders planetary hours table for known city slug
- Invalid city slug → `notFound()`

`src/app/__tests__/sitemap.test.ts` (extend if exists, otherwise add):

- Sitemap includes all 78 compatibility URLs
- Sitemap includes all 20 city URLs
- Total URL count = previous + 200 (EN + ES)

---

## 7. Execution model

Mirror Wave 2 pattern: Agent Teams parallel via `isolation:worktree`. Each section is independently buildable. Suggested wave split:

- **Wave A (3 parallel)** — S1 SynastryResult fix + S1 runbook + S2 tier-1-rules guard + S2 tests
- **Wave B (3 parallel)** — S2 observability runbook + S2 env-flip runbook + S3 definedTermSchema helper + S3 tests
- **Wave C (3 parallel)** — S3 compatibility index + S3 compatibility/[pair] + S3 why-sidereal injection
- **Wave D (3 parallel)** — S3 planetary-hours-cities index + S3 planetary-hours-cities/[city] + S3 sitemap extension
- **Wave E (1)** — S3 seo-content-cadence runbook + final cross-section verification

Estimated wall-clock: ~30 min (vs ~6-9 engineer-days serial).

---

## 8. Acceptance criteria

**Section 1:**
- `npm test src/modules/astro-engine/components/__tests__/SynastryResult.test.tsx` passes with new event-fire assertions
- `passport_reshared` events visible in PostHog within 24h of deploy when founder triggers a synastry share manually
- Viral-coefficient dashboard renders correctly per runbook

**Section 2:**
- `npm test src/modules/advertising/decide/__tests__/tier-1-rules.test.ts` passes with new guard tests
- `MIN_CONVERSIONS_BEFORE_ACTION` exported from `tier-1-rules.ts`
- Both runbooks committed under `docs/runbooks/`
- Founder completes env-flip dry-run checklist (verify env vars only; actual flip happens async post-spec)

**Section 3:**
- `definedTermSchema()` exported from `src/shared/seo/`
- `/compatibility` and `/compatibility/[pair]` render 78 SSG pages
- `/planetary-hours-cities` and `/planetary-hours-cities/[city]` render 20 ISR pages
- `/why-sidereal` page includes both FAQ + DefinedTerm JSON-LD (validated via Schema.org markup tester)
- `npm run build` succeeds with all new routes
- Sitemap shows +200 URLs

---

## 9. Out of scope

- L3-E Free → Pro trial window — blocked on 5-10 full-price conversions baseline.
- L5-B Cosmic Passport A/B + referral incentive — blocked on 2 weeks of L1-F viral-coefficient data.
- L5-D Pricing test cycle — blocked on ≥150 conversions per variant (multiple months at current 1 sub/day).
- Founder voice rewrite of engineer-shipped factual content (synastry pair prose, FAQ Q/A) — ongoing async.
- Vercel deploy promotion + prod migration of Wave 2 (`0012_lean_preak.sql`) — founder owes BEFORE Wave 3 ships.
- Phase 2 of advertising agent (Telegram approval flow, tier-2 autonomous) — Wave 3.5 after 4w observability ramp.

---

## 10. References

- Parent audit roadmap: `docs/superpowers/specs/2026-05-17-advertising-improvements-design.md`
- Wave 1 spec: `docs/superpowers/specs/2026-05-17-wave-1-instrumentation-design.md`
- Wave 2 spec: `docs/superpowers/specs/2026-05-17-wave-2-conversion-foundation-design.md`
- Senior media buyer spec (v3b): `docs/superpowers/specs/2026-05-03-senior-media-buyer-mode-design.md`
- SEO Phase 2 shipped memory: `[[project-seo-phase2-shipped]]`
- Anti-AI-slop checklist: `[[feedback-anti-ai-slop]]`
- Grep-callers lesson: `[[feedback-grep-callers-not-just-definitions]]`
- Spanish style: `[[feedback-spanish-style]]`
