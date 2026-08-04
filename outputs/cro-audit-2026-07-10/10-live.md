# Sector 10 — Live Production Walkthrough (what a first-time visitor experiences RIGHT NOW)

**CRO audit 2026-07-10 · read-only · Playwright against https://estrevia.app**
Viewports: mobile **390×844** and desktop **1440×900**. Synthetic birth data only (1990-01-15, 12:00, Mexico City). No email submitted, no card entered. One live Stripe Checkout session was *viewed* (created by clicking the app's own trial CTA; abandoned unpaid — it will expire).

Baseline for comparisons: `outputs/ad-audit-2026-05-29/REPORT.md`.

---

## 0. Deployment truth

| Fact | Value | Source |
|---|---|---|
| Live production deployment | `dpl_BUttqr1LDtUCstfsQeo2h5VxgBqr`, target=production, state=READY | Vercel API `list_deployments` (project `prj_rjCptNrW3yBqUxSPAD8bZgptbWlp`), 2026-07-10 |
| Its commit | **`de39cee`** "fix(checkout): anon payers can sign in — Redis ticket + extractClerkUserId guard" | same |
| Deployed | **2026-05-30 ≈17:43 UTC → live site is 41 days stale** | `created: 1780148589721` |
| Local unpushed commits | **6** (all HALF50 discount work, `9c69b61..7241c3b`) | `git rev-list origin/main..main --count` |
| HALF50/discount UI on live site | **Absent** (correct — unpushed). No discount copy anywhere on landing//pricing/paywall/checkout. Stripe Checkout shows a generic "Add code" field (`allow_promotion_codes`), predates HALF50. | live walkthrough |

**Conclusion: live = origin/main = de39cee exactly, as expected.** The anon-payer sign-in fix IS live; nothing has shipped since.

---

## 1. Landing — EN `/` and ES `/es`

Screenshots: [01 EN mobile](screenshots/01-landing-en-mobile-390.png) · [02 EN desktop](screenshots/02-landing-en-desktop-1440.png) · [03 ES desktop](screenshots/03-landing-es-desktop-1440.png) · [04 ES mobile](screenshots/04-landing-es-mobile-390.png)

### Above the fold (mobile 390×844, a11y-snapshot box coordinates)
- Header (y0–57): logo, EN/ES toggle, "Open App".
- Badge y122: "☉ SIDEREAL · LAHIRI · SWISS EPHEMERIS"
- **H1 y180: "Your True *Zodiac Sign*"** / ES: "Tu signo *zodiacal verdadero*"
- Sub y282: "Western astrology froze the zodiac to the seasons in 100 AD. The sky has shifted 24° since then. Sidereal astrology tracks the actual constellations — most people discover their Sun is in a different sign entirely."
- **Calculator form y473–695 with primary CTA "Discover My Sun Sign" at y617 — fully above the fold.** ES: "Descubrir mi signo solar".
- Reassurance y736: "No account needed · Calculation takes under 2 seconds" — **partially covered by the cookie banner** (banner box y741–844).

**Verdict: the hero is genuinely good.** Value prop passes the 5-second test (what: your real zodiac sign; why care: the sign you know is 24° off), the tool is the hero, one clear CTA, zero competing CTAs, DD/MM order correctly localized for LATAM (ES shows `DD/MM/YYYY`, EN `MM/DD/YYYY`). Desktop 1440×900 also keeps form + CTA above the fold.

### Landing issues
1. **Cookie banner on `/es` is 100% English** — "Analytics cookies only. Privacy / Decline / Accept" (mobile) and "We use analytics cookies… No ads, no third-party tracking." (desktop), links to `/privacy` not `/es/privacy`. It is the FIRST interactive element an ES visitor sees. Source: live snapshot of `/es`, both viewports. → **P2, part of LIVE-9.**
2. **Consent-integrity contradiction**: banner claims "**No ads, no third-party tracking**", yet on first paint — before any consent — the Meta pixel sets `_fbp` and fires to the CAPI gateway `capig.datah04.com`; both persist **after clicking Decline** (verified: `document.cookie` contains `_fbp=fb.1.1783380464570…` post-Decline; the capig request repeats on every navigation). → **LIVE-7 (P2 trust/compliance).**
3. **CAPI gateway is broken**: `https://capig.datah04.com/events/c21ae…` → **HTTP 422 on every page load** (browser console, every page this session). The gateway is deliberately CSP-allowlisted (`next.config.ts:74–77`, shipped in `9318183` Meta-attribution fix), so server-side/gateway events are currently being **rejected**, not delivered. Invisible to users, but it will degrade Meta EMQ/attribution at relaunch. → **LIVE-8 (P2, hand to tracking sector).**
4. **Social proof is specs, not people**: "Join astrologers discovering their sidereal signs" is followed by ±0.01° / 12 bodies / 120 essays. No user count, no testimonial, no shared-passport count anywhere on the page. → **LIVE-11 (P2).**
5. Aria-only EN leaks on `/es`: textbox labels `Day/Month/Year`, button `Open calendar`, list label `New features`. Screen-reader ES users get mixed language. → fold into **LIVE-9 (P2/P3)**.

### Headline copy alternatives (only if testing; current H1 is serviceable)
- EN A: **"Your Zodiac Sign Is Probably Wrong"** — matches the winning "OFF by 24°/NASA" ad angles (message match with paid traffic; the current H1 asserts, this one provokes verification).
- EN B: **"The Sky Moved. Your Sign Didn't."** — states the mechanism in 6 words, sets up the calculator as proof.
- ES A: **"Tu signo probablemente no es el que crees"** — direct curiosity, tú form.
- ES B: **"El cielo se movió. Tu signo no."**

---

## 2. HeroCalculator flow → email gate → "Skip for now"

Screenshots: [05 filled form](screenshots/05-calculator-filled-mobile.png) · [06 email gate](screenshots/06-email-gate-mobile.png) · [07 skip result](screenshots/07-skip-result-inline-mobile.png)

**Friction: low.** Date typing auto-advances between MM/DD/YYYY segments; birth-time toggle expands an HH:MM + AM/PM + 12h/24h group with helper "Time lets us compute your Ascendant and houses."; city autocomplete returned "Mexico City · Mexico · 12.3M" as the first suggestion after typing the name. Calculation is effectively instant (result modal present in the same interaction round-trip; page perf: TTFB 43 ms, DCL 185 ms on /pricing via `performance.getEntriesByType('navigation')`, this session).

**The email gate** (bottom sheet, `EmailGateModal`):
> "**See your sidereal chart**" / "Enter your email to reveal the chart we just calculated for you." / [Email] / **See My Chart** (disabled until valid) / **Skip for now** / "By submitting, you agree to receive your chart and occasional astrology insights. Unsubscribe anytime."

ES equivalents are properly translated (`messages/es.json`: "Mira tu carta sideral", "Ver mi carta", "Saltar por ahora").

### Finding LIVE-4 (P1) — the gate sells nothing and the skip gives everything
- The modal shows **zero preview of the value it's gating** — no sign glyph, no "we found something surprising", no blurred chart. Generic curiosity only.
- **"Skip for now" (one tap) reveals the complete result inline**: "Your Sidereal Sun Sign — ♑ Capricorn — 1° — Earth sign" + link "See your full natal chart" + "Try another date". The skipper loses *nothing* relative to the submitter. ("Skip" has been there since the original gate ship `8f34368`, 2026-05-07 — this is design, not regression.)
- Baseline email-capture was **28.5%** (conversion baseline 2026-05-17). With a zero-cost skip and a zero-tease modal, that is the ceiling this UI deserves.
- Bonus leak: `?no_gate=1` disables the gate entirely (`HeroCalculator.tsx:210`) — fine for QA, just know it's live.

**Fix (copy-level, no dark patterns needed):** tease the actual computed result in the modal.
- EN A: title **"Your sidereal Sun sign is ready"**, sub **"It's often not the sign you think. Enter your email and see it now — plus your Moon and Ascendant."**
- EN B (dynamic, strongest): **"We found your real Sun sign — and it's not {tropicalSign}"** (the API already computes both zodiacs; only show when they differ, which is ~86% of dates).
- ES A: **"Tu signo solar sideral está listo"** / **"Suele no ser el que crees. Ingresa tu email y míralo ahora — con tu Luna y Ascendente."**
- ES B: **"Encontramos tu signo real — y no es {tropicalSign}"**
- Keep "Skip for now" (it protects UX and deliverability) but make the skip path show **only the Sun sign**, with Moon + Ascendant + full chart link gated on email. Today email buys literally nothing.

---

## 3. THE BROKEN BRIDGE — `/chart?chartId=…` dead-ends at an empty form

Screenshot: [08 chart page after clicking "See your full natal chart"](screenshots/08-chart-page-top-mobile.png)

### Finding LIVE-2 (P0)
The result card's single yellow CTA — **"See your full natal chart"** → `/chart?chartId=WEVt13ewY5aU9RTpniCNm` — lands on the **blank Natal Chart calculator**. No chart, no prefill; the visitor must re-enter date, time, and city from scratch. Verified live (waited 5 s for hydration; still blank) **and** in code:

- `HeroCalculator.tsx:385` links `/chart?chartId=${result.chartId}`
- `ChartDisplay.tsx:156–167` reads only `bd, bt, ktb, lat, lon, place, tz` from the URL — **`chartId` is read by nothing on the receiving page** (grep across `src/app/[locale]/(app)/chart/` + astro-engine components).

This affects **100% of landing-calculator users who click through — both those who submitted an email and those who skipped** (`onSubmitted` and `onDismiss` both land on the same result card, `HeroCalculator.tsx:326–390`). It is the exact hop from "lead captured" to "paywalled AI reading" (the monetization surface), and it silently discards the work the user just did. On mobile, re-entering birth data is a ~45-second penalty imposed at peak curiosity. The T+0 drip email's 22% click-rate lands users on chart links too — if those use the same pattern, the drip's best asset feeds the same dead end (verify in email sector).

**Fix:** on `/chart`, if `chartId` is present, fetch the temp chart server-side (the temp-chart store and `/api/v1/chart/interpret` already key off `chartId`) and render the result directly. Do **not** switch the link to `bd/lat/lon` params — that path puts the birth date in the URL (see LIVE-10). Also fire a regression test: landing→result→chart-link must render a chart without re-entry.

---

## 4. Chart page + paywalled AI reading

Screenshot: [09 paywall section](screenshots/09-paywall-reading-mobile.png)

After manually re-entering the data (date + city only, birth-time toggle OFF), the chart renders: wheel + houses + planet table, tabs Wheel/Table, then the reading section:

> eyebrow "**AI Reading · Pro**" · H2 "Your natal chart reading" · teaser "What your luminaries say:" ✦ Sun in Capricorn — Cardinal earth… ✦ Moon in Leo… ✦ Ascendant in Aries… · blurred strip "Mercury · Venus · … + 12 houses + top 3 aspects woven into a personal synthesis…" · "10 more planets, houses & aspects" · **"Locked behind Star"** · H3 "Get your full natal chart reading" · "An AI-crafted synthesis of all your planets, houses, and aspects — written for your chart, not a generic horoscope." · button **"Start 3-Day Free Trial"**

The value-then-block structure is right, the teaser works. Two defects:

### Finding LIVE-5a (P2 copy, at the money moment) — "Locked behind Star"
`paywall.cta.eyebrow` = EN "Locked behind Star" / ES "Bloqueado tras Star" (`messages/*.json`). **No plan called "Star" exists anywhere** — the app says "Pro", pricing says "Pro", Stripe says "Estrevia Premium". At the exact moment of purchase-intent the product names a plan the user cannot find. Fix: EN **"Included in Pro"** / ES **"Incluido en Pro"** (or "Pro feature" / "Función Pro").

### Finding LIVE-6 (P2, trust/correctness) — Ascendant & houses shown for a time-unknown chart
URL after calculation: `?bd=1990-01-15&lat=…&place=…&tz=…` — **no `bt`/`ktb`** (birth time unknown; form sends `time:'12:00', houseSystem:null` — `BirthDataForm.tsx:99–103`). Yet the live UI displays "Ascendant in Aries", house cusps 1–12, and per-planet houses ("Sun in Capricorn at 1°36′, house 9"). CLAUDE.md's own engine rule says **houses must be null when birth time is unknown**. For the astrology-literate audience this page targets, a confidently wrong Ascendant sits directly under a "±0.01° accuracy" claim — it corrodes the only trust pillar the brand has. (Also: the reading teaser leads with that Ascendant.) → verify server-side default and suppress AC/houses (the UI already supports `lockedLabelNoHouses`).

### Console noise (P3, LIVE-13)
`GET /api/v1/user/subscription` → **401** logged on every anon chart view; the capig 422 repeats. No visible UI impact.

---

## 5. PaywallModal → the cookie banner eats the trial button

Screenshots: [10 modal](screenshots/10-after-trial-cta-click.png) · [11 CTA sliver under banner](screenshots/11-paywall-cta-blocked-by-cookie-banner.png)

Clicking "Start 3-Day Free Trial" opens `PaywallModal` (contextual title "Get your full natal chart reading", subtitle "Continue reading with Estrevia Pro", Monthly/**Annual** toggle with Annual pre-selected, **$34.99/year ~$2.92/mo**, 10 feature bullets, CTA, then "You won't be charged until Jul 13, 2026").

### Finding LIVE-1 (P0) — on mobile, the modal's trial CTA is physically unclickable while the cookie banner is up
Measured at 390×844 (live, `getBoundingClientRect` + `document.elementFromPoint`):

| Element | Box (y) |
|---|---|
| Modal CTA "Start 3-Day Free Trial" | **739.5 → 787.5** |
| Cookie consent banner (fixed, z-50) | **741 → 844** |
| `elementFromPoint` at CTA center | **→ "Cookie consent"** |

The modal does **not** scroll (`scrollIntoView({block:'center'})` leaves the CTA at exactly y=739.5), so at most a **1.5 px sliver** of the button is ever tappable. Playwright's click retried for 5 s and failed with "Cookie consent intercepts pointer events" — a real thumb fails the same way, **silently**. Any mobile visitor who ignores the cookie banner (a very common behavior) taps the yellow button and *nothing happens*.

**Root cause (code):** all three overlays are `z-50`. `EmailGateModal` is **portaled to `document.body`** (fix `3cb15f3`) so it paints above the banner — that's why the email gate works. `PaywallModal.tsx:150` is **not portaled** (`fixed inset-0 z-50` rendered in page flow), and `CookieConsent.tsx:62-63` (`z-50`, root layout, later in DOM) wins the tie. The banner's mobile `pb-[calc(0.5rem+60px)]` makes it 103 px tall, maximizing overlap with the modal's bottom-sheet CTA (`items-end` on mobile).

**Fix (1 line-ish):** portal `PaywallModal` to body exactly like `EmailGateModal`, or bump it to `z-[60]`, or suppress `CookieConsent` while any dialog is open. Add a Playwright regression: paywall CTA must be clickable at 390×844 with consent banner visible.

**Who it hits:** every anon mobile visitor pre-consent — i.e. the majority of paid Meta traffic at the single monetization moment. Baseline cross-ref: 2026-05-21 audit measured paywall_click as the ES funnel break; this bug is a plausible mechanical contributor for mobile ES/EN alike (banner shows until Accept/Decline).

### Finding LIVE-3 (P1) — modal defaults & content
1. **Annual ($34.99) is the pre-selected plan** in the modal AND on /pricing. A first conversion where LTV proof is ~$4.99 total MRR (5/29 audit) is being anchored at a 7× bigger commitment on the trial button. The 5/29 audit showed trial-end failures are `insufficient_funds` declines — a $34.99 post-trial charge makes that strictly worse than $4.99. Recommendation: default **Monthly** in the *modal* (impulse context), keep Annual default on /pricing (deliberate context), or at least A/B it.
2. **The 10-bullet feature list omits the one thing being sold** — the AI natal reading is not among "Everything in Free, plus:" bullets (essays, moon, hours, spreads, tarot AI, synastry, compatibility AI, tree, avatars, support). The user is asked to trial for a feature the list doesn't mention. Add bullet #1: EN "**Full AI reading of YOUR chart — every planet, house & aspect**" / ES "**Lectura IA completa de TU carta — cada planeta, casa y aspecto**". Cut the list to 5-6 items; 10 bullets push the CTA off-screen (which is what arms LIVE-1).
3. Good stuff worth keeping: contextual title, "You won't be charged until {date}", Save 42% chip.

---

## 6. Stripe Checkout (viewed, not completed)

Screenshot: [12 checkout](screenshots/12-stripe-checkout-annual-mobile.png)

Live session `cs_live_b1GX…` (created via the app's own CTA, expired unused):

> Header/merchant: **"Kirill Kovalenko"** · "Back to Kirill Kovalenko" → /pricing
> "**Try Estrevia Premium**" · "3 days free" · "Then **$34.99** per year starting July 13, 2026" · "**Unlimited saved charts, detailed aspects, future transits, priority support.**" · Add code · Apple Pay / Link / **Card / Bank app** · [Email] · **Start trial**

### Finding LIVE-3 continued (P1) — the payment page is off-brand and off-message
1. **Merchant name = "Kirill Kovalenko"**, not Estrevia. Browser tab title, header, and "Back to…" all show a stranger's personal name at the exact moment a user is deciding whether to hand over a card **to an astrology site**. This is a Stripe dashboard setting (Public business name / statement descriptor) — **zero code, 5 minutes**. Cross-ref: 5/29 audit `STR-2`: **23/24 ES sessions abandoned before card entry**; an unrecognizable personal-name merchant is exactly the kind of thing that does that (and guarantees "unrecognized charge" disputes later: statement descriptor likely also personal).
2. **Product name/desc mismatch**: "Estrevia **Premium**" (app says Pro; paywall says Star) and the description promises "**Unlimited saved charts, detailed aspects, future transits**" — features that appear **nowhere** in the app's Pro list, while the AI reading the user clicked for is absent. Fix in Stripe Products: name "Estrevia Pro", description "Full AI natal reading, all 120+ essays, unlimited synastry & AI tarot. Cancel anytime."
3. **"Bank app" payment method visible on a trial subscription** despite the card+link-only policy (memory: `feedback_stripe_wallet_pmt_for_subs`; 5/29 audit `STR-5` found one leaking path). Non-card rails are how destinig7996 got stuck. → hand to Stripe sector to locate which checkout path leaks methods.
4. Trial mechanics copy itself is fine: "3 days free / Then $34.99 per year starting July 13, 2026" is accurate and clear.

---

## 7. /pricing — EN + ES

Screenshots: [13 EN mobile](screenshots/13-pricing-en-mobile-390.png) · [14 ES mobile](screenshots/14-pricing-es-mobile-390.png) · [15 ES desktop](screenshots/15-pricing-es-desktop-1440.png) · [16 EN desktop](screenshots/16-pricing-en-desktop-1440.png)

Rendered copy (EN): eyebrow "♄ Plans & Pricing" · **H1 "Sidereal Vedic charts — Lahiri-accurate"** · sub "The way the ancient texts intended. **Try Pro risk-free for 14 days.**" · billing toggle (**Annual default**, "Save 42%") · "$34.99/year · ~$2.92/mo" · Free card (9 ✓) with dead "Current Plan" chip · Pro card (10 ✓) · **"Start 3-Day Free Trial"** · "Cancel anytime. You won't be charged until Jul 13, 2026." · "14-day money-back guarantee, no questions asked" · trust chips (Lahiri ±0.01° / Built by working astrologers / Cancel anytime) · FAQ ×3.

ES mirrors it, with the LATAM badge live inside the Pro card: annual "≈ 630 MXN · 147 000 COP · 33 200 CLP · 133 PEN · 1 400 UYU", monthly "≈ 90 MXN · 21 000 COP · 4 740 CLP · 19 PEN · 200 UYU" (verified by toggling Mensual).

### Finding LIVE-5 (P1) — "14 days" vs "3-Day" trial contradiction + plan-name chaos
The hero says "**Try Pro risk-free for 14 days**" (ES: "Prueba Pro sin riesgo por 14 días") and the button says "**Start 3-Day Free Trial**" (ES: "Comenzar prueba de 3 días"). The 14 refers to the refund guarantee, but nothing says so until 2,000 px later — as written, the page contradicts itself on the single most anxiety-laden number. Meanwhile the plan is called **Pro** here, **Premium** in this page's own FAQ ("Premium adds unlimited saves and detailed analysis" — also a feature set that matches neither card), **Star** at the paywall, and **Estrevia Premium** on Stripe. Fixes:
- Sub-headline EN: **"Try Pro free for 3 days — and if you subscribe, a 14-day money-back guarantee, no questions asked."**
- ES: **"Prueba Pro gratis por 3 días — y si te suscribes, garantía de devolución de 14 días, sin preguntas."**
- One plan name — **Pro** — in messages, FAQ, Stripe product, paywall eyebrow.
- ES CTA still lacks "gratis": **"Comienza tu prueba gratis de 3 días"** — this is finding #6 of the 2026-05-29 audit, **still unfixed 42 days later** (one-line i18n edit, `pricing.startTrial` + `paywall.trialCta`).

### Finding LIVE-12 (P2) — structure works against the sale on mobile
- Free card (y576) renders **before** Pro; the Pro CTA sits at **y=1883 of 3282 px** (EN) / **y=1977 of 3501 px** (ES) — ≈2.2 viewports of scrolling, past 9 free ✓s that argue for not paying. Reorder Pro-first on mobile (or sticky trial CTA).
- H1 "Sidereal Vedic charts — Lahiri-accurate" is practitioner jargon; the traffic this page receives was promised *"your true zodiac sign"* and *"your full natal chart reading"*. Alternatives:
  - EN A: **"Unlock your full sidereal reading"** (continuity with the paywall CTA that sent them here)
  - EN B: **"Everything your chart is trying to tell you — $4.99/mo"**
  - ES A: **"Desbloquea tu lectura sideral completa"**
  - ES B: **"Todo lo que tu carta intenta decirte — US$4.99/mes"**

### Finding LIVE-14 (P1, ES only) — bare "$" prices read as pesos in Mexico
Every ES price renders as "**$34.99/año**", "**$4.99/mes**", "paga $34.99 una vez" — with **no USD label anywhere on the page**. In Mexico (the largest ES segment) "$" *is* the peso sign; $34.99 reads as ≈US$2. The LATAM badge ("≈ 630 MXN…") is the only disambiguation and it sits only inside the Pro card, not beside the toggle price, and never says the base is USD. The user discovers the real price ("US$34.99") only on the Stripe page → sticker shock → the pre-card abandonment pattern the 5/29 audit measured (23/24). One-line fix in `messages/es.json`: "**US$4.99/mes**", "**US$34.99/año**" (+ keep the badge). This complements — not repeats — the already-shipped Stripe `custom_text` fix (`5849f22`), which only helps *after* the user reaches Stripe.

---

## 8. Performance / misc UX
- **Perf is a non-issue**: /pricing TTFB 43 ms, DOMContentLoaded 185 ms, transfer 53 KB (nav timing, this session, warm CDN). No layout shifts or broken images observed on any audited page; no mixed-content.
- Console errors per page: `capig.datah04.com` 422 (every page), `/api/v1/user/subscription` 401 (chart page, anon). Nothing else at error level.
- Locale persistence: after visiting `/es`, `https://estrevia.app/` 307s to `/es` via `NEXT_LOCALE` cookie (standard next-intl; correct behavior, no finding).
- The email gate CTA ("See My Chart", y679–727) clears the cookie banner; only the *paywall* modal CTA collides (LIVE-1).

---

## Ranked findings (this sector)

| # | Sev | Finding | Load-bearing number | Fix |
|---|---|---|---|---|
| LIVE-1 | **P0** | Cookie banner (z-50, root layout) covers PaywallModal's "Start 3-Day Free Trial" on mobile 390×844; modal not portaled/scrollable → button untappable pre-consent | `elementFromPoint(CTA center)` = "Cookie consent"; CTA y739.5–787.5 vs banner y741–844 | Portal PaywallModal to body (as EmailGateModal `3cb15f3`) or z-60; hide banner while dialog open; add 390×844 Playwright regression |
| LIVE-2 | **P0** | "See your full natal chart" → `/chart?chartId=…` renders empty form; all landing leads (email OR skip) must re-enter birth data to reach the paywalled reading | `ChartDisplay.tsx:156–167` reads `bd/bt/lat/lon/place/tz`, never `chartId` → 100% of handoffs lose the chart | Fetch temp chart by `chartId` on /chart (interpret/passport APIs already key on it); don't switch to bd-params (PII-in-URL) |
| LIVE-3 | **P1** | Stripe Checkout shows merchant "**Kirill Kovalenko**", product "Estrevia **Premium**" with a feature description matching nothing in-app, plus "Bank app" method on a trial sub | 23/24 ES sessions abandoned pre-card (5/29 audit `STR-2`) — this page is where they abandoned | Stripe dashboard: public business name + descriptor "ESTREVIA"; rename product "Estrevia Pro" + rewrite description; audit payment_method_types leak |
| LIVE-4 | **P1** | Email gate teases nothing and "Skip for now" yields the identical result — email buys zero value | Email capture baseline 28.5% (2026-05-17); skip = 1 tap, 0 cost | Tease computed result ("…and it's not {tropicalSign}"); gate Moon/ASC + chart link, leave Sun sign free on skip |
| LIVE-5 | **P1** | Pricing self-contradicts: "risk-free for 14 days" vs "3-Day Free Trial"; plan named Pro/Premium/Star/Estrevia-Premium across 4 surfaces; ES CTA still missing "gratis" (open since 5/29 audit #6) | 42 days unfixed; 4 conflicting plan names between paywall click and card entry | Rewrite subhead (copy above); unify on "Pro"; `pricing.startTrial`/`paywall.trialCta` ES → "…prueba gratis…"; eyebrow → "Included in Pro"/"Incluido en Pro" |
| LIVE-14 | **P1** | ES prices render bare "$34.99" — reads as MXN in Mexico; USD revealed only at Stripe | ES chart: $34.99 ≈ **630 MXN** (the badge's own number = 18× the naive peso reading) | `messages/es.json`: "US$4.99/mes" / "US$34.99/año" |
| LIVE-6 | **P2** | Live chart shows Ascendant + 12 houses for time-unknown chart (noon default), violating own engine rule; reading teaser leads with the fabricated AC | URL has no `bt/ktb`, UI shows "Ascendant in Aries…, house 9"; CLAUDE.md: houses=null w/o birth time | Suppress AC/houses when `ktb` absent (UI already has `lockedLabelNoHouses` path); verify API default |
| LIVE-7 | **P2** | Consent banner says "No ads, no third-party tracking" while Meta `_fbp` + CAPI gateway fire pre-consent and post-Decline | `_fbp` cookie present after Decline (this session) | Gate fbq on consent or fix banner claim + privacy policy |
| LIVE-8 | **P2** | CAPI gateway `capig.datah04.com` returns 422 on every page view — gateway events rejected | 100% of observed capig requests failed (console, all pages, this session) | Tracking sector: fix gateway config before ad relaunch |
| LIVE-9 | **P2** | ES locale leaks: cookie banner fully English on /es (first interactive element), EN aria-labels (Day/Month/Year/Open calendar/New features) | 100% of ES first-visits see an English consent dialog | Localize CookieConsent + aria labels via next-intl |
| LIVE-12 | **P2** | Mobile /pricing: Free card first, Pro CTA 2.2 viewports deep; Annual pre-selected in impulse contexts; jargon H1 breaks message-match with ads/paywall | Pro CTA at y1883/3282 (EN), y1977/3501 (ES) | Pro-first on mobile or sticky CTA; test Monthly default in modal; H1 alternatives above |
| LIVE-11 | **P3** | No human social proof anywhere near CTAs (stats are product specs) | 0 testimonials/user-counts on landing+pricing | Add passport-share count or 2-3 short testimonials when honest numbers exist |
| LIVE-13 | **P3** | Anon chart page logs 401 (`/api/v1/user/subscription`) on every view | 1 error/page-view | Skip the call when signed out |

### What's genuinely good (keep)
Hero + calculator above the fold on both locales and both viewports; instant calculation; localized date order; value-then-block paywall teaser structure; "You won't be charged until {date}" + 14-day guarantee + cancel-anytime microcopy; LATAM badge live; excellent load performance; legal disclaimer present without polluting the sell.

### Sequencing note
LIVE-1 and LIVE-2 are both **pre-relaunch blockers** in the same sense as the 5/29 Phase-0 list: they sit between "lead captured" and "trial started", and both are silent (no error surfaces anywhere — not to the user, not in analytics). LIVE-3's merchant-name fix is the highest leverage-per-minute item in this entire report: a Stripe dashboard field, no deploy needed, aimed directly at the measured 23/24 pre-card abandonment.
