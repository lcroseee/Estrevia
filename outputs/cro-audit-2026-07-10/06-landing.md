# CRO Audit 2026-07-10 — Sector 06: Landing page + HeroCalculator + EmailGateModal

**Scope:** top-of-funnel page CRO, code-level. Files audited:
`src/app/[locale]/(marketing)/page.tsx`, `layout.tsx`, `LandingAnimations.tsx`, `NewFeatureCards.tsx`, `LandingViewTracker.tsx`,
`src/modules/astro-engine/components/HeroCalculator.tsx`, `DateInput.tsx`, `CityAutocomplete.tsx`, `ChartDisplay.tsx`,
`src/shared/components/EmailGateModal.tsx`, `src/app/api/v1/leads/route.ts`, `src/app/api/v1/chart/[id]/route.ts`,
`src/app/api/cron/cleanup-temp-charts/route.ts`, `messages/en.json` + `messages/es.json` (`landing`, `heroCalc`, `emailGate`, `pricing`, `paywall`).
Docs read: `docs/editorial-style-guide.md`. `.agents/product-marketing-context.md` and `.claude/product-marketing-context.md` do **not** exist.

**Data sources:** PostHog HogQL (US region) + Neon `email_leads`, via new read-only probe
`scripts/advertising/_cro_audit_2026_07_10_landing_probe.mjs`. Primary window **2026-05-29 → 2026-07-10** (~6 weeks); 30d trailing labeled where used. Repo has **no commits since 2026-05-30** — all code behavior below is what has been live throughout the window.

**Context:** Meta account dark since 2026-05-24 → organic-only trickle. Window volumes are small (landing_view 15 ev / 7 uniques; chart_calculated 44 ev / 21 uniques; 22 new leads in DB). Percentages below are directional; the *code-level* findings are exact.

---

## TL;DR

The landing page itself is well-built (clean hierarchy, single CTA, lean 3-field form, good a11y, curiosity-gap gate). But the **promise chain breaks one click after the gate**: the hero result's primary CTA and **all 6 drip-email CTAs** link to `/chart?chartId=...` — **a query param no code reads**. Every one of those clicks lands on an *empty birth-data form*. In-window, 12 unique visitors (11 of them from drip emails — the funnel's best-performing asset at 22% T+0 CTR) hit this dead end; of 10 hero calculators, 6 re-entered all their data manually and 4 never did. This is the sector's P0. Secondary: the email gate permanently disables itself on first dismissal, the entire above-fold is `opacity:0` until React hydrates, and client-side funnel events undercount reality by ≥2.4× (22 server-side leads vs 9 client-side gate views), which keeps prior-audit finding #5 (reconciler false-suspend on ad relaunch) open.

---

## (a) 5-second test — what a cold Meta-ad visitor sees

Exact rendered strings (from `messages/*.json`, rendered by `(marketing)/page.tsx`):

| Element | EN | ES |
|---|---|---|
| Eyebrow | `Sidereal · Lahiri · Swiss Ephemeris` | `Sideral · Lahiri · Swiss Ephemeris` |
| H1 line 1 | `Your True` | `Tu signo` |
| H1 line 2 (gold) | `Zodiac Sign` | `zodiacal verdadero` |
| Subtext | `Western astrology froze the zodiac to the seasons in 100 AD. The sky has shifted 24° since then. Sidereal astrology tracks the actual constellations — most people discover their Sun is in a different sign entirely.` | `La astrología occidental congeló el zodíaco a las estaciones en el año 100 d.C. El cielo se ha desplazado 24° desde entonces. La astrología sideral rastrea las constelaciones reales — la mayoría descubre que su Sol está en un signo completamente diferente.` |
| Form CTA | `☉ Discover My Sun Sign` | `☉ Descubrir mi signo solar` |
| Trust line | `No account needed · Calculation takes under 2 seconds` | `Sin cuenta necesaria · El cálculo tarda menos de 2 segundos` |

**Verdict:** value-prop is clear within 5s *if the visitor reads the subtext* — but the H1 alone ("Your True Zodiac Sign") is the *category*, not the *hook*. The hook that made the winning ad win ("OFF by 24°", "NASA's actual sky" — NASA creative was the EN winner at $1.14 CPL, ad-audit 2026-05-29 §13) is buried in sentence 2 of a 45-word subtext. Message-match between ad and landing headline is partial. The eyebrow (`Sidereal · Lahiri · Swiss Ephemeris`) is insider jargon that means nothing to a cold visitor — it earns trust only with astrology-literate traffic.

**Headline alternatives** (put the ad's hook in the H1; keep the gold-emphasis two-line structure):

1. EN: `Your Horoscope Is` / `24° Off` — ES: `Tu horóscopo está` / `corrido 24°`
   *Rationale: mirrors the winning "OFF by 24°" creative → perfect message-match; specific number = credibility + curiosity.*
2. EN: `The Sky Moved.` / `Your Sign Didn't.` — ES: `El cielo se movió.` / `Tu signo no.`
   *Rationale: tension/loss-aversion framing; 7 words; reads in <2s on mobile.*
3. EN: `Your Real Sign,` / `By the Actual Sky` — ES: `Tu signo real,` / `según el cielo real` *(keeps "true sign" equity, adds the NASA/actual-sky angle).*

**Subtext alternative** (cut 45 → ~22 words, end with the action): EN: `The zodiac most horoscopes use is 24° out of date. Enter your birth date and see where your Sun actually is — free, in 2 seconds.` ES: `El zodíaco de la mayoría de los horóscopos está desfasado 24°. Ingresa tu fecha de nacimiento y ve dónde está tu Sol en realidad — gratis, en 2 segundos.`

---

## (b) The email gate (EmailGateModal)

- **When it fires:** after a *successful* hero calculation (`HeroCalculator.tsx:296-298`) — user has invested effort and a result exists, but the result card is withheld (`{!gateOpen && ...}` at line 332). Correct Zeigarnik placement.
- **Value promised:** title `See your sidereal chart` / subtitle `Enter your email to reveal the chart we just calculated for you.` (ES: `Mira tu carta sideral` / `Ingresa tu email para ver la carta que calculamos.`). Zero value shown before the ask — pure curiosity gap (see §e for the broken promise after submit).
- **Fields:** 1 (email). `type=email inputMode=email autoComplete=email`. Good.
- **Bypass:** fully bypassable 4 ways — visible `Skip for now` button, X button, backdrop click, Escape. **All four call `handleDismiss` → `safeSetFlag()` → `localStorage.email_gate_passed = 1` → `shouldShowGate()` returns false forever** (`HeroCalculator.tsx:208-219`, `EmailGateModal.tsx:67-71`). One dismissal permanently opts the device out — the "hard email gate" described in project docs is actually a soft, self-disabling gate. Also `?no_gate=1` query bypass (QA backdoor, fine).
- **Privacy reassurance:** present — `By submitting, you agree to receive your chart and occasional astrology insights. Unsubscribe anytime.` Good copy; no link to `/privacy` from the modal (minor).
- **Focus management:** on open, focus goes to the **X (close) button** (`closeButtonRef.current?.focus()`, line 113) — the first Enter/`Tab` keystroke is aimed at dismissal, and mobile users don't get the keyboard raised. Autofocus should be on the email input.
- **Typo/bounce validation:** still absent — client regex + zod `email` only (prior-audit R2 recommended typo/MX validation at the gate; not shipped, consistent with no commits since 05-30).

**Window numbers** (PostHog HogQL, 2026-05-29→07-10): `email_gate_viewed` 9 uniques, `email_gate_dismissed` 3 uniques (33% of recorded views), `email_lead_resubmitted` 1. DB truth: **22 new leads** created (14 EN / 8 ES; `email_leads.created_at` in window) — more leads than recorded gate views, see §instrumentation.

**Gate copy alternatives** (the component already knows `result.sunSign` — it deliberately withholds it; lean into that):
1. Title EN: `Your result is in — and it may surprise you` / ES: `Tu resultado está listo — y puede sorprenderte`; subtitle EN: `Enter your email and we'll show it now, plus send you the full chart.` / ES: `Ingresa tu email y te lo mostramos ahora, más tu carta completa por correo.` *Rationale: names the immediate payoff (now) + the email's job (full chart) — currently the email has no stated benefit beyond unlocking.*
2. Submit CTA EN: `Reveal My True Sign` / ES: `Revelar mi signo verdadero` *(outcome language, stronger than the generic `See My Chart` / `Ver mi carta`)*.
3. Keep `Skip for now`, but make it honest about the cost: EN `Skip — just show the sign` / ES `Saltar — solo ver el signo` *(reframes skipping as getting less, not the same thing free).*

---

## (c) HeroCalculator friction

- **Field count: 3 visible** (segmented date MM/DD/YYYY(EN)·DD/MM/YYYY(ES) with calendar popover; city autocomplete; birth-time toggle **default OFF** revealing a 4th time field only when opted in). Email is deferred to the gate. This is lean and correctly sequenced.
- **Unknown-birth-time path:** good — toggle off by default, noon fallback, `houseSystem: null`, helper text explains the trade (`Time lets us compute your Ascendant and houses.`).
- **Error states:** per-field, cleared on change, `role=alert`, aria-wired. Future-date and invalid-date guarded. Offline detected (`navigator.onLine`). Solid.
- **Friction point — city must be *selected*, not typed:** typing "New York" and hitting submit yields `Please select a city from the list` (`errCityRequired`) because lat/lon only populate via `onCitySelect`. No auto-select of the top suggestion on submit/blur (`CityAutocomplete.tsx`). This is the #1 silent-failure pattern for autocomplete forms on mobile.
- **Time-to-first-value:** one POST to `/api/v1/chart/calculate`; trust line promises <2s; result card animates in with CSS (zero-dep, `prefers-reduced-motion` respected). Good.
- **DateInput i18n gap (ES):** calendar popover renders hardcoded English `MONTH_NAMES` ("January…") and `Su Mo Tu We…` weekday headers, plus EN-only aria-labels ("Open calendar", "Previous month", "Month/Day/Year") — `DateInput.tsx:37-45, 512`. ES users see an English calendar inside a Spanish page. Same class of issue: `aria-label="Close"` hardcoded in `EmailGateModal.tsx:217`.

---

## (d) Trust signals on the landing

- The "social proof" section is **not social proof**: `statsHeading` = `Join astrologers discovering their sidereal signs` above three *product-spec* stats (`±0.01°` accuracy / `12` celestial bodies / `120` essays). No user counts, no testimonials, no ratings anywhere on the page. Unused legacy keys `socialProofCharts` ("Charts calculated") / `socialProofCountries` / `socialProofAccuracy` in both message files show a real-numbers design existed and was dropped.
- "Join **astrologers**" is also the wrong audience frame for cold Meta traffic (they're horoscope readers, not astrologers). ES same: `Únete a astrólogos…`.
- What works: NASA/science framing is strong and consistent (Swiss Ephemeris, ±0.01°, FAQ citing Astro.com/Solar Fire, `heroTrust` "No account needed · under 2 seconds"). FAQ handles the top objections (sidereal vs tropical, accuracy, what's a Cosmic Passport).
- Note a small integrity tension: trust line says `No account needed` — then an email gate appears after calculation. Technically true (email ≠ account) but worth softening to e.g. EN `Free · No account · Under 2 seconds` only if the gate stays skippable.
- **Fix (cheap):** replace the spec-stats headline with a claim + one real number the DB already supports (279 all-time leads, 137 charts/30d at baseline): EN `Thousands of charts calculated — most Suns land in a different sign` (use the real cumulative `chart_calculated`/`natal_charts` count once ads resume); add 1–2 short quote-style testimonials near the final CTA when available.

---

## (e) Chart result → paywall transition (value-before-ask) — **the P0 lives here**

Sequence today: calc → gate (zero value shown) → submit/skip → result card shows **Sun sign + degree + element only** → primary CTA `See your full natal chart` → `/chart?chartId=<id>`.

**`chartId` is a dead query param.** Evidence:
- `ChartDisplay.tsx:160-175` reads only `bd, bt, ktb, lat, lon, place, tz` from the URL; `chartId` is never read (`grep` across `src/` finds **zero** consumers of `searchParams.get('chartId')`).
- The only by-id endpoint, `GET /api/v1/chart/[id]`, is `requireAuth()` + owner-only (`route.ts:15-27`) — useless for the anonymous visitors this link targets, and no page calls it anyway.
- Result: **the click lands on the blank `BirthDataForm`** (`ChartDisplay.tsx:283-316`) — the user must re-enter date, time, and city they entered 10 seconds ago, right after the gate promised "the chart we just calculated for you."
- **The same dead link is baked into all 6 drip emails**: `src/shared/lib/email.ts:435, 509, 599, 684, 815, 879` (`/chart?chartId=...&utm_source=lead-nurture&utm_campaign=t0|t1h|t24h|t7d|t14d|t21d`). The drip is the funnel's strongest asset (T+0: 30.6% open / 22.2% click, ad-audit 2026-05-29 R1) and every click hits an empty form.
- Even a naive "read the param" fix would half-work: `cleanup-temp-charts` deletes anonymous temp charts after **7 days** — T+7d/14d/21d drip links would 404 regardless. The durable fix is param-based (below).

**Measured impact** (PostHog HogQL, window 2026-05-29→07-10, low-traffic period):
- `$pageview` where `$current_url LIKE '%/chart?chartId=%'`: **16 pageviews / 12 uniques**, of which **14 pageviews / 11 uniques carried `utm_source=lead-nurture`** — live drip clicks hitting the dead end *right now, with ads off*.
- Of **10** uniques firing `chart_calculated` with `source='hero'`, **6 later re-fired `chart_calculated` from the full form** (re-entered everything), **4 never did**. At scale that's ~40% loss at the very step where interest peaks.

**Fix (hero side, ~5 lines):** HeroCalculator already holds the full form state; change the CTA href to the param format `ChartDisplay` already auto-calculates from:
`/chart?bd=${form.date}&ktb=${knowsBirthTime?1:''}&bt=${time}&lat=…&lon=…&tz=…&place=…` — identical to what `ChartDisplay.handleChartCalculated` itself writes to the URL (`ChartDisplay.tsx:240-251`), so it introduces no new PII surface beyond the existing pattern. **Fix (email side, flag for email sector):** drip links need the same param scheme (params are in the encrypted chart row — requires decrypt-at-send or a signed short-lived token route), else keep linking `/chart` but stop promising "your chart is waiting."

**Value-before-ask assessment:** currently 0 before the gate, and only sign+degree after. Given the gate is skippable anyway, a stronger pattern: show the result card *with the sign glyph blurred* behind the modal (real, visible, unreadable) — the gate then asks for email to unblur something the user can see exists.

---

## (f) Mobile layout concerns visible in code

1. **Whole above-fold is `opacity:0` until React hydrates.** `LandingAnimations.tsx` server-renders `[data-section] [data-animate] { opacity: 0; transform: translateY(20px); }` and only flips visibility when a `useEffect` + IntersectionObserver adds `data-visible` — i.e., **after hydration**. Eyebrow, H1, subtext, the calculator card wrapper (`data-animate="fade-up-3"`), and trust line are all invisible until the JS bundle executes. On Meta's in-app browser on mid-tier Android (this site's primary paid audience), that's a multi-second blank dark page, and it suppresses LCP (opacity:0 elements don't paint). The `<noscript>` fallback covers JS-off, **not** slow-JS. Fix: use self-running CSS keyframe animations with `both` fill for the hero (the exact pattern `HERO_CALC_STYLES` in HeroCalculator already uses, which needs no JS), keep IO-gated transitions for below-fold sections only.
2. **Submit CTA at/below the fold on short phones.** `min-h-[90svh]` hero with `pt-16` + eyebrow + 2-line H1 (text-4xl) + ~6 rendered lines of subtext (`mb-10`) stacks to ~450–500px before the calculator card; card ≈ 280px more. On 667px-tall viewports (iPhone SE class) `Discover My Sun Sign` sits below the fold. Shortening the subtext (§a) + reducing `mb-10` largely fixes it.
3. Fine elsewhere: gate is a bottom sheet on mobile (`items-end md:items-center`, `max-h-[90vh] overflow-y-auto`), result CTAs stack `flex-col sm:flex-row`, no fixed heights/overflow traps found, header is a slim sticky 56px.

---

## Cross-check: prior audit finding #6 (ES CTA copy) — **PARTIALLY fixed**

| String | ES value today | Status |
|---|---|---|
| `paywall.cta.ctaLabel` | `Comienza tu prueba gratis de 3 días` | ✅ fixed |
| `paywall.trialCta` (PaywallModal) | `Comenzar prueba de 3 días` | ❌ still formal infinitive, **no "gratis"** |
| `pricing.startTrial` | `Comenzar prueba de 3 días` | ❌ same |

EN says "Start 3-Day **Free** Trial" in all three spots; ES omits "free" in 2 of 3. One-line fix each: `Comienza tu prueba gratis de 3 días`. (Also flag for the pricing sector: `pricing.subheading` "Try Pro risk-free for **14 days**" next to a **3-day** trial CTA conflates the refund window with the trial and reads as a contradiction — both locales.)

## Instrumentation (affects every number above + ad relaunch)

`email_lead_submitted` is fired **server-side** in `/api/v1/leads` (route.ts:165) and recorded **22 uniques** in-window — while client-fired `email_gate_viewed` recorded only **9** and `landing_view` only **15 events / 7 uniques**. Leads > gate views > landing views is causally impossible; client events (consent-gated PostHog JS, ad-blockers, in-app browsers) are losing **≥59%** of sessions. Prior-audit finding #5 — server-side `landing_view` must ship before re-enabling ads, or the drift reconciler will false-suspend the agent — is **still open** (no commits since 2026-05-30; `LandingViewTracker.tsx` is client-only `useEffect`). One bright spot: `locale` super-prop null-rate on `landing_view` in-window = **0/15** (10 en / 5 es) — the locale race looks fixed for this event.

---

## Ranked findings

| # | Sev | Finding | Load-bearing number |
|---|---|---|---|
| LAND-1 | **P0** | `/chart?chartId=` is a dead param: hero result CTA + all 6 drip-email CTAs land on a blank re-entry form; by-id API is auth-only and uncalled; temp charts deleted after 7d anyway | 14/16 in-window `/chart?chartId` pageviews came from drip emails; 4/10 hero calculators never re-entered their data |
| LAND-2 | **P1** | Above-fold rendered `opacity:0` until hydration (IO-gated entrance animations) — blank page + suppressed LCP for slow-JS mobile (Meta in-app browser) | 100% of hero content (incl. form + CTA) invisible pre-hydration by CSS |
| LAND-3 | **P1** | Email gate permanently self-disables on first dismissal (`email_gate_passed` set on dismiss, not just on submit) + initial focus on the close button | 3/9 recorded gate views dismissed in-window; each opts the device out forever |
| LAND-4 | **P1** | Client-side funnel events undercount ≥2.4× vs server truth; server-side `landing_view` (prior finding #5, relaunch blocker) still unshipped | 22 server-side leads vs 9 client gate-views, same window |
| LAND-5 | **P1** | Prior finding #6 only partially fixed: `pricing.startTrial` + `paywall.trialCta` ES still lack "gratis" | 2 of 3 ES trial CTAs unfixed |
| LAND-6 | **P2** | Headline/ad message-match: winning-ad hook ("24° off / NASA sky") buried in 45-word subtext; H1 is category-generic; CTA likely below fold on ≤667px phones | winner NASA creative $1.14 CPL vs H1 that doesn't mention its hook |
| LAND-7 | **P2** | No genuine social proof: spec stats masquerading as "Join astrologers…"; testimonials absent; legacy `socialProof*` keys unused | 0 user-numbers/testimonials on page |
| LAND-8 | **P2** | City autocomplete requires explicit selection; typed-but-unselected city errors on submit | top silent-failure autocomplete pattern; no auto-select of first match |
| LAND-9 | **P3** | ES sees English calendar popover (month/weekday names) + EN-only aria-labels in DateInput and EmailGateModal | `MONTH_NAMES`/`Su Mo…` hardcoded at `DateInput.tsx:37-45,512` |
| LAND-10 | **P3** | Copy nits: "Join astrologers" wrong audience frame; "No account needed" vs email gate tension; ~15 dead legacy `landing.*` keys in both locales | — |

## Recommended fix order

1. **LAND-1** — change hero CTA to the `bd/lat/lon/tz` param link (5 lines, pattern already exists in `ChartDisplay`); hand the drip-link half to the email sector. Do this before any ad relaunch — it multiplies with spend.
2. **LAND-4** — server-side `landing_view` (relaunch blocker per prior audit) — unchanged recommendation.
3. **LAND-3** — stop setting `email_gate_passed` on dismiss (set a 7-day re-ask timestamp instead); autofocus the email input.
4. **LAND-2** — hero entrance = pure CSS keyframes (`both` fill), IO only below the fold.
5. **LAND-5** — two 1-line ES i18n edits.
6. **LAND-6/7/8** — headline A/B (variants in §a), real-number social proof, autocomplete auto-select.

*All measurements read-only. Probe script: `scripts/advertising/_cro_audit_2026_07_10_landing_probe.mjs`.*
