# Frontend Architecture Design — Estrevia MVP

**Date:** 2026-04-05
**Status:** Approved
**Scope:** Full MVP frontend — all P0 features

---

## Emotional Design

Every screen must achieve a target emotion. Design decisions are validated against this table.

| Moment | Target Emotion | How achieved |
|--------|---------------|--------------|
| First visit (landing) | **Curiosity** + light anxiety ("my sign is wrong?!") | Provocation + curiosity gap before the form |
| Calculation (animation) | **Anticipation** | Planets appear one by one, like revealing a secret |
| Result (wheel) | **Awe** + surprise | Beautiful wheel + strikethrough sign. "This is MY chart, and it's beautiful" |
| Reading essay | **Self-recognition** | "Yes, that's exactly me." Self-reference effect — text about ME |
| Sharing passport | **Pride** | "Look how unique I am. 1 of 8%!" |
| Return visit (day 2+) | **Ritual** + calm | "What's the Moon doing today?" Daily micro-meditation. Planetary hour in header |
| Premium offer | **Desire** to know more, not pressure | "Here's what else your chart hides" — natural continuation, not paywall |

---

## Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MVP scope | Full MVP (A) | All P0 features: chart, essays, moon, passport, Stripe, PWA |
| Chart wheel interactivity | Taps + toggle (B) | Taps on planets/signs, sidereal/tropical animation. No zoom/rotate — Phase 2 |
| Essay storage | MDX files in repo (A) | 120 files, generated once, edited rarely. ISR on CDN |
| City autocomplete | Server search with debounce (B) | Responsive from first keystroke, no 500KB download |
| Sidereal/tropical toggle | Single toggle, smooth animation (A) | One component everywhere. WOW comes from copywriting, not forced sequence |
| Result display | Separate page /chart/[id] (B) | Unique URL for bookmarks, sharing, browser back. Calc animation masks navigation |
| Project structure | Modules from day 1 (approach 1) | Boundaries from CLAUDE.md are well-defined domains, not guesses |

---

## 1. Project Structure

```
src/
├── app/                          # Next.js App Router — routes only, zero business logic
│   ├── (marketing)/              # Public pages
│   │   ├── layout.tsx            # Minimal header + footer, no app navigation
│   │   ├── page.tsx              # Landing (hero + BirthDataForm)
│   │   ├── why-sidereal/page.tsx
│   │   └── pricing/page.tsx
│   ├── (app)/                    # Application (post-calculation)
│   │   ├── layout.tsx            # Bottom tabs (mobile) / sidebar (desktop). Reads auth state, does NOT require it
│   │   ├── chart/[id]/page.tsx   # Chart page
│   │   ├── moon/page.tsx         # Moon calendar
│   │   ├── essays/page.tsx       # Essay list
│   │   ├── essays/[slug]/page.tsx
│   │   ├── hours/page.tsx        # Planetary hours
│   │   ├── signs/[sign]/page.tsx # 12 sign pages (SEO)
│   │   ├── compare/[sign]/page.tsx # 12 sidereal-vs-tropical comparison pages (SEO)
│   │   ├── planets/[planet]/page.tsx # 10 planet pages (SEO)
│   │   └── settings/page.tsx     # Profile, subscription, preferences (auth required)
│   ├── terms/page.tsx            # Terms of Service
│   ├── privacy/page.tsx          # Privacy Policy
│   ├── s/[id]/                   # Share page — minimal layout, no navigation
│   │   └── page.tsx
│   ├── api/
│   │   ├── chart/calculate/route.ts
│   │   ├── chart/save/route.ts
│   │   ├── cities/search/route.ts
│   │   ├── moon/route.ts
│   │   ├── hours/route.ts
│   │   ├── health/route.ts           # Warm-up ping (wakes Neon + Vercel Function)
│   │   ├── og/passport/[id]/route.ts
│   │   ├── stripe/checkout/route.ts
│   │   └── webhooks/
│   │       ├── clerk/route.ts
│   │       └── stripe/route.ts
│   └── layout.tsx                # Root: fonts, dark theme, PostHog, Clerk providers
│
├── modules/                      # Domain modules — independent, depend only on shared/
│   ├── astro-engine/
│   │   ├── components/           # ChartWheel, PlanetIcon, MoonPhase SVG, PositionsTable
│   │   ├── lib/                  # sweph wrapper, aspect calculation, sidereal offset
│   │   ├── hooks/                # useChartData, useMoonPhase
│   │   └── types.ts              # Module-internal types
│   ├── esoteric/
│   │   ├── components/           # EssayPage, CorrespondenceTable, EphemerisTable
│   │   ├── lib/                  # MDX loading, 777 data lookup
│   │   └── types.ts
│   ├── auth/
│   │   ├── components/           # AuthGuard, PremiumGate
│   │   └── lib/                  # Clerk wrapper, permission checks
│   └── passport/
│       ├── components/           # PassportCard, ShareButton
│       └── lib/                  # Share URL generation, rarity calculation
│
├── shared/                       # Cross-module shared code
│   ├── components/               # BirthDataForm, CityAutocomplete, BottomNav, Sidebar,
│   │                             # CalculationAnimation, shadcn/ui customized (Button, Card, etc.)
│   ├── hooks/                    # useMediaQuery, useDebounce
│   ├── lib/                      # date utils, encryption, PostHog wrapper
│   └── types/                    # Planet, Sign, Chart, Aspect, House (shared domain types)
│
└── content/                      # Proprietary content (NOT AGPL)
    └── essays/
        └── en/                   # 120 MDX files
            ├── sun-in-aries.mdx
            ├── sun-in-taurus.mdx
            └── ...
```

**Module rules:**
- Modules depend on `shared/` but never on each other
- `app/` composes modules but contains no business logic
- `passport/` is a separate module (not part of `astro-engine/`) — distinct domain: viral sharing, image generation, rarity calculation
- Server/client code coexists in modules — Next.js splits via `'use client'` / `'use server'` directives, not folder structure

---

## 2. Key Components

### ChartWheel (astro-engine/components/)

The most complex component. Pure SVG.

**Structure:**
- Outer ring — 12 zodiac signs (glyphs + element color)
- Inner ring — 12 houses (only when birth time is known)
- Planets — 12 icons at their degree positions
- Aspect lines — between planets (trine, square, opposition, etc.)
- ASC/MC markers

**Interactivity (MVP):**
- Tap planet (Sun–Pluto) → navigate to essay (`/essays/sun-in-pisces`)
- Tap North Node / Chiron → tooltip with position + "Essay coming soon" (essays deferred to Phase 2)
- Tap sign → bottom sheet with sign description + link to full page
- Hover (desktop) / long press (mobile) → tooltip with degrees and minutes
- Sidereal/tropical toggle → smooth arc animation of planet positions (Framer Motion)

**Progressive disclosure (behavioral, not manual):**
- Default: beginner mode — planets + signs, no degrees
- If user interacts with degree tooltips 3+ times in a session → soft prompt: "Want to see degrees and aspects permanently?"
- Accepted → stored in `localStorage`, becomes default
- No settings page toggle — transition happens organically through usage (IKEA effect)

**Accessibility (WCAG 2.1 AA):**
- `aria-label` on every planet ("Sun at 24° Pisces")
- PositionsTable below wheel as text fallback for screen readers
- Keyboard navigation: Tab through planets, Enter → essay
- Focus-visible ring on all interactive elements

### PositionsTable (astro-engine/components/)

Tabular duplicate of the wheel. Always visible — below wheel on mobile, beside it on desktop.
Each row is clickable → navigates to essay. Primary navigation for accessibility.

### PassportCard (passport/components/)

Share card in three sizes: OG (1200x630), Square (1080x1080), Stories (1080x1920).

**Content:**
- Struck-through tropical sign → bright sidereal sign
- Big three: Sun / Moon / Ascendant
- Ruling planet + element + rarity ("1 of 8%")
- Background: gradient #0A0A0F → element color (opacity ~15%)
- CTA: "estrevia.app — discover yours"

**Generation:** `@vercel/og` (Satori) server-side, cached on CDN. Client receives ready PNG.

### EssayPage (esoteric/components/)

Each page has 5 blocks:
1. **Essay** (~30%) — MDX text, Crimson Pro font
2. **Mini-calculator** — BirthDataForm (shared component, lazy loaded on scroll)
3. **Ephemeris table** — planet ingress/egress dates for 5 years
4. **777 correspondences** — kabbalistic correspondences from MDX frontmatter
5. **Tropical vs Sidereal** — comparison table for this position

Premium gate: Sun/Moon/ASC essays free. Others: first paragraph + CTA.

### MoonCalendar (astro-engine/components/)

- Monthly grid, each day = SVG phase icon
- Current day highlighted
- Tap day → details: phase, sign, degree, moonrise/moonset
- Header: current phase large + "New Moon in 5 days"

### Landing Page Structure

Not "hero + form." A three-beat sequence leveraging curiosity gap:

1. **Provocation (1-2 sec):** Visual of two zodiac rings (tropical + sidereal) overlaid, showing ~24° offset. Or text: "87% of people live under the wrong zodiac sign." Brain: "Wait, what?"
2. **Curiosity gap (2-3 sec):** "Your tropical sign is not where the stars actually are. Want to find out your real one?" Brain: "Yes! My sign might be different?!"
3. **Form (BirthDataForm):** Now the user has MOTIVATION to enter birth data. They're not filling a form — they're closing a curiosity gap.
4. **Social proof:** Counter below form: "12,345 charts calculated"

The provocation is CSS animation (two rings rotating) or static visual — zero JS overhead. The copy does the heavy lifting.

### BirthDataForm (shared/components/)

Reused on landing, essay mini-calculator, share page `/s/[id]`.
- Date input (required)
- Time input (optional — without time: no houses, no ASC)
- CityAutocomplete (server search with 300ms debounce)
- Zod validation (no future dates, no dates before 1800)

### CityAutocomplete (shared/components/)

- Input field with dropdown
- Server search: `GET /api/cities/search?q=...` with 300ms debounce
- Loading state in dropdown while searching
- "City not found" → manual lat/lon input fields
- 44px+ touch targets for dropdown items

### ShareButton (passport/components/)

Share mechanism with platform detection:
- **Mobile:** Web Share API (`navigator.share`) with pre-filled text in EN
- **Desktop:** Dropdown — Copy link, Twitter intent, Telegram share URL
- **Download PNG** button — for Instagram Stories (1080x1920 size)
- PostHog events: `passport_share_clicked` with method property

### CookieConsent (shared/components/)

GDPR cookie consent banner. Shown on first visit. Controls PostHog and Meta Pixel initialization.
Consent stored in `localStorage`. If declined — analytics scripts not loaded.

### AstrologyDisclaimer (esoteric/components/)

"Astrology is not medical, financial, or legal advice." Shown on every essay page. Legal requirement from CLAUDE.md.

### CalculationAnimation (shared/components/)

- Shows while server calculates chart (~300ms warm, ~2-3s cold start)
- Rotating planet glyphs + "Calculating positions of 12 celestial bodies..."
- Masks navigation transition from landing to /chart/[id]

### PlanetaryHourBar (shared/components/)

Persistent single line in `(app)/layout` header: "☿ Mercury Hour — 47min left". Always visible on every app page. Tap → navigate to `/hours`. Creates ambient awareness — astrology becomes part of daily rhythm. Updates locally every minute (no server calls after initial fetch). This is the primary retention mechanism — reason to open the app every day.

### BottomNav / Sidebar (shared/components/)

- Mobile (< 640px): 4 bottom tabs — Chart, Moon, Essays, More
- Tablet (640-1024px): sidebar visible (narrow) + 2-column content layout
- Desktop (> 1024px): sidebar (full), collapsible to icons
- "More" contains: settings, pricing, about
- Active tab highlighted with planetary color
- Planetary hours NOT in "More" — covered by PlanetaryHourBar in header

---

## 3. Data and State

### Data Sources

| Data | Source | Caching |
|------|--------|---------|
| Planet positions | `POST /api/chart/calculate` → sweph | Saved to DB (positions only, no PII) → permanent URL |
| City autocomplete | `GET /api/cities/search?q=...` | No cache, fresh each request, 300ms debounce |
| Essays | MDX files → Next.js ISR | CDN cache, revalidate 24h |
| Moon calendar | `GET /api/moon` → sweph | Client cache per session (30 days don't change during visit) |
| Planetary hours | `GET /api/hours?lat=X&lon=Y` → sweph | Client cache per day. Clock hand updates locally every minute |
| Passport OG image | `GET /api/og/passport/[id]` → @vercel/og | CDN cache (immutable) |
| Premium status | Clerk session → User DB | Clerk refreshes each request |

### State Management

**No global store.** No Redux, Zustand, Jotai. State lives where it's used:

| State | Location | Reason |
|-------|----------|--------|
| Sidereal/tropical toggle | `useState` in `/chart/[id]` page | Needed by ChartWheel, PositionsTable, and essay links — passed as props |
| Chart positions | DB → `fetch` on `/chart/[id]` page | Unique URL, survives refresh |
| Progressive disclosure | `localStorage` + `useState` | Behavioral trigger (3+ tooltip interactions) → soft prompt → stored preference |
| Current month in moon calendar | `useState` in MoonCalendar | Local navigation state |
| Auth / Premium | Clerk `useAuth()` / `useUser()` | Clerk manages session |

### Data Flow: Chart Calculation

```
BirthDataForm → POST /api/chart/calculate
  → Server: sweph calculation + save positions to DB (no PII) → {chartId: "uuid"}
  → router.push(`/chart/[uuid]`)
  → Chart page fetches positions from DB, renders ChartWheel + PositionsTable
  → User clicks "Save" → associate with account + encrypt & store birth data (PII)
  → URL stays /chart/[uuid] — now permanent
```

**Rate limiting:** `/api/chart/calculate` and `/api/chart/save` protected by Upstash Redis rate limiter (per IP). Every calculation creates a DB record — without rate limiting, the DB can be spammed. Orphaned temp records cleaned by cron after 7 days.

**Why save positions (not PII) immediately:** gives every chart a unique URL from first calculation. Birth data (date, time, location) only saved encrypted when user explicitly clicks "Save" while authenticated. Orphaned temp records cleaned by cron after 7 days.

---

## 4. Pages and Routing

### Route Groups and Layouts

| Layout | Pages | What it provides |
|--------|-------|-----------------|
| `(marketing)/layout.tsx` | Landing, why-sidereal, pricing | Minimal header + footer. No app navigation |
| `(app)/layout.tsx` | chart, moon, essays, hours, settings | Bottom tabs / sidebar. Reads auth state (does NOT require it) |
| `s/[id]/layout.tsx` | Share page | Empty. No navigation. Focus on passport + CTA |

### Page Details

| Page | Rendering | Auth | Purpose |
|------|-----------|------|---------|
| `/` | Server + client form | No | Landing: provocation → curiosity gap → BirthDataForm → redirect to /chart/[id] |
| `/chart/[id]` | Server fetch + client render | No (guests see chart) | ChartWheel + PositionsTable + toggle + Save/Share |
| `/moon` | Server fetch + client render | No | MoonCalendar + current phase |
| `/essays` | Server (ISR) | No | List of 120 essays grouped by planet |
| `/essays/[slug]` | Server (ISR) | PremiumGate on content | EssayPage: text + calculator + ephemeris + 777 |
| `/hours` | Server fetch + client render | No | Planetary hours (user geolocation) |
| `/signs/[sign]` | Server (ISR) | No | Sign description page (12 pages, SEO) |
| `/compare/[sign]` | Server (ISR) | No | Sidereal vs tropical for sign (12 pages, SEO) |
| `/s/[id]` | Server fetch | No | Friend's passport + "What's YOUR real sign?" + BirthDataForm |
| `/why-sidereal` | Server (static) | No | Educational article |
| `/pricing` | Server (static) | No | Free vs Star, CTA to Stripe |
| `/settings` | Client | Yes | Profile, subscription, preferences |
| `/terms` | Server (static) | No | Terms of Service (legal requirement for MVP) |
| `/privacy` | Server (static) | No | Privacy Policy (legal requirement for MVP) |
| `/planets/[planet]` | Server (ISR) | No | Planet description page (10 pages, SEO) |

### Navigation

**Mobile (< 640px):** 4 bottom tabs — Chart, Moon, Essays, More. Active tab = planetary color accent. PlanetaryHourBar above content.

**Tablet (640-1024px):** Narrow sidebar visible. 2-column layout: main content (~60%) + secondary panel (~40%). Chart page: wheel left, table right. Essays: text centered, max-width 680px (optimal 60-75 chars per line for readability).

**Desktop (> 1024px):** Full sidebar with same items. Collapsible to icons. PlanetaryHourBar in sidebar header.

**Marketing pages:** Minimal header (logo + "Sign in"). No bottom tabs/sidebar.

**Share page:** No navigation at all. Single focus: see friend's result → calculate own.

---

## 5. Styling and Design System

### Theme

Tailwind CSS 4 with custom dark theme. **Dark only** — no light mode. "Cosmic minimalism."

**CSS Variables:**
```
--background:        #0A0A0F    (Deep Space — not pure black, blue-tinted)
--surface:           #12121A    (cards, modals)
--border:            #1E1E2A    (dividers)
--text-primary:      #F0F0F5
--text-secondary:    #8888A0    (cold gray, blue-tinted)
--text-tertiary:     #787898    (cold gray, blue-tinted — #555570 from design.md failed WCAG AA at 2.75:1, lightened to 4.64:1)

Planetary colors: sun #FFD700, moon #C0C0E0, mercury #B8D430, venus #50C878,
mars #E04040, jupiter #4169E1, saturn #708090, uranus #00CED1,
neptune #9370DB, pluto #8B0000

Element colors: fire #FF6B35, earth #4A8A2C, air #87CEEB, water #2E7DA8

Adjusted planet color: pluto #C41E1E (was #8B0000)

Note: Earth (#2D5016→#4A8A2C), Water (#1B4D6E→#2E7DA8), Pluto (#8B0000→#C41E1E) were lightened
because original values had <2.2:1 contrast on #0A0A0F — invisible on screen. 25% of users (Earth signs)
would get ugly, muddy passport cards. New values preserve hue, achieve 3.3-4.7:1 contrast.
```

Monochrome UI with planetary/element colors as sharp accents only.

**Background depth (not flat fill):**
- Subtle star field: random dots (1-2px, opacity 5-10%) on `--background`. Static, not animated. CSS radial-gradient dots or SVG pattern. Zero JS. Brain reads "cosmos", not "app".
- Radial gradient toward user's element color (opacity ~15%) on chart and passport pages
- Noise texture (2-3% opacity) on `--surface` cards — like grain of night sky through telescope

### shadcn/ui Customization

| Component | Customization |
|-----------|-------------|
| Button | `planetary` variant — background = planet color for CTA. Press animation (scale 0.98) |
| Card | Solid `surface` (#12121A) + noise texture + border glow (element color on hover). NO backdrop-blur — cards are "earthly", grounded |
| Dialog | Dark backdrop with `backdrop-blur` — "celestial" layer, star field shows through |
| Tabs | For sidereal/tropical toggle |
| Tooltip | Astrological hints on chart wheel |
| Sheet | Bottom panel (mobile) for sign descriptions on tap. `backdrop-blur` — "celestial" floating layer |
| Navigation Menu | Desktop sidebar |

**Not using** from shadcn/ui: Calendar (custom MoonCalendar), Chart (custom ChartWheel).

### Fonts

| Font | Where | Loaded via |
|------|-------|-----------|
| Geist Sans | Navigation, buttons, labels, meta-info, small UI text (~50%) | `next/font` (bundled with Next.js, zero network requests) |
| Crimson Pro | Sign names on wheel/table, planet names in context, "Your real sign is...", essay text, section headings, key interpretive moments (~40%) | `next/font/google` (self-hosted, preloaded globally — used on every page) |
| Geist Mono | Degrees, minutes, numeric data, ephemeris tables (~10%) | `next/font` (bundled with Next.js) |

**Rationale:** Serif (Crimson Pro) signals authority and ancient tradition — critical for a product about millennia-old knowledge. Sans-serif (Geist Sans) signals functionality — correct for UI controls. The user subconsciously trusts "♓ Pisces" in serif more than in sans-serif (self-reference effect + authority bias). Crimson Pro is preloaded globally because it appears on every page (sign names, planet names, key messages), not just essays.

### Animations

**Framer Motion** (lazy loaded, only on /chart/[id]):
- Sidereal/tropical toggle — planet positions shift along arc path (~24°)
- Chart wheel appearance (fade in + scale)
- Strikethrough tropical sign → sidereal sign appears
- Confetti on Premium payment — via canvas-confetti (~3KB), NOT Framer Motion (settings page doesn't load FM)

**CSS animations** (zero additional JS):
- Landing page staggered entrance (`@keyframes` + `animation-delay`)
- Hover/active effects on buttons, cards
- Sheet/Dialog open-close (shadcn/ui CSS transitions)
- Tab highlight transitions

**Principle:** subtle, not flashy. `duration: 300-500ms`, `ease: easeInOut`. No bouncy/spring effects except confetti.

### Icons

- **UI:** Lucide React (ships with shadcn/ui)
- **Astrological glyphs:** Custom SVG components (12 signs + 12 planets + moon phases). Use `currentColor` for recoloring to planetary colors. Inline SVG, tree-shakeable.

### Anti-AI-Slop Design Checklist

Applied to every component during implementation:

- [ ] Fonts — NOT Inter/Roboto/Arial (Geist Sans + Crimson Pro + Geist Mono)
- [ ] Colors — NOT purple gradient on white (#0A0A0F + planetary accents)
- [ ] Whitespace — generous padding, content breathes
- [ ] Hover states (desktop) + active/press states (mobile) — on ALL interactive elements
- [ ] Background — star field (CSS dots, 5-10% opacity) + noise texture + radial gradient to element color. Not flat fill
- [ ] Two visual layers — "earthly" (solid cards with noise) and "celestial" (overlays with backdrop-blur showing stars through)
- [ ] Animations — staggered, not simultaneous
- [ ] Shadows — glow effects on dark theme (colored glow from element), not flat box-shadow
- [ ] Emotional check — does this screen achieve its target emotion from the Emotional Design table?
- [ ] Hierarchy — one dominant element per page (landing=form, chart=wheel, essay=text)
- [ ] One memorable element — strikethrough tropical sign → sidereal appears
- [ ] Mobile — tested at 375px, 44px+ touch targets
- [ ] Grays — cold/blue-tinted (#8888A0, #787898), not neutral. All text passes WCAG AA (4.5:1+)
- [ ] Buttons — weight and presence: planetary color + glow on hover + press animation

---

## 5b. Error Handling

Error states from docs/design.md, mapped to frontend components:

### Chart Calculation
| Situation | What user sees | Component |
|-----------|---------------|-----------|
| Server timeout (> 5s) | "Calculation taking longer than usual..." + spinner → auto-retry × 1 → "Try again in a minute" | CalculationAnimation |
| Server 500 | "Could not calculate chart. Our team has been notified." + "Try again" button | CalculationAnimation |
| Offline | "Calculation requires internet. Saved charts are available offline." + link to saved charts | CalculationAnimation |
| Invalid date (future, < 1800) | Inline error under field: "Date must be between 1800 and today" | BirthDataForm (Zod validation, client-side before submit) |

### City / Geocoding
| Situation | What user sees | Component |
|-----------|---------------|-----------|
| City not found | "Couldn't find [city]. Enter coordinates manually:" + lat/lon fields | CityAutocomplete |
| Polar latitude (> 66.5°) | Info banner: "Using Whole Sign houses for polar latitudes" (not an error) | ChartWheel |

### Auth / Stripe
| Situation | What user sees | Component |
|-----------|---------------|-----------|
| Clerk unavailable | "Sign in temporarily unavailable. You can calculate a chart without registration." Hide "Sign in", show "Calculate" | AuthGuard |
| Stripe checkout failed | "Payment failed. Try another card or come back later." Redirect back with error param | Settings page |
| Webhook delay (premium not updated) | "Payment received! Status may take a couple minutes to update." Polling `/api/user/status` every 10s × 6 | Settings page |

### Principles
1. Never show stack traces or technical details to user
2. Always give an action — "Try again" button, link, or explanation of when it will be fixed
3. Track all errors via PostHog (`calculation_error`, `api_error`) + Sentry
4. Graceful degradation — if one feature is broken, others still work (essays from cache, chart without houses)

---

## 6. Performance and PWA

### Performance Budget

| Metric | Target |
|--------|--------|
| Lighthouse Performance (mobile) | >= 90 |
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Time to Interactive | < 3s |
| CLS | < 0.1 |

**JS budget per page (gzipped):**

| Page | Target | What's included |
|------|--------|----------------|
| Landing `/` | < 200KB | React + Next.js + form + autocomplete + PostHog |
| Chart `/chart/[id]` | < 250KB | + Framer Motion + ChartWheel |
| Essay `/essays/[slug]` | < 180KB | Minimal JS, content = static HTML (ISR) |

### Loading Strategies

**Landing** — critical, first impression:
- Server-rendered HTML + minimal JS (form, autocomplete)
- Staggered entrance animations via CSS (no Framer Motion)
- Warm-up ping `fetch('/api/health')` on page load (wakes Neon + Vercel Function)

**Chart page** — delay masked by animation:
- CalculationAnimation shows while loading ChartWheel + Framer Motion + server data
- ChartWheel renders after data arrives from server

**Essays** — ISR, cached on CDN:
- Static HTML, ready on CDN. Minimal JS
- Mini-calculator (BirthDataForm) — lazy loaded, appears on scroll

**Heavy dependencies:**

| Dependency | Size (gzip) | Strategy |
|-----------|-------------|----------|
| Framer Motion | ~30KB | Lazy import only on /chart/[id]. CSS animations elsewhere |
| Crimson Pro | ~20KB | `next/font/google`, self-hosted, preload only on essay pages |
| Astro glyphs SVG | ~15KB (all 24) | Inline SVG, tree-shaking — only used glyphs loaded |

### PWA

**Manifest:** `theme_color: "#0A0A0F"`, `display: "standalone"`, maskable icons 192/512px.

**MVP:** No Service Worker, no offline caching. All features require network. PWA manifest provides installability only (home screen icon, standalone window).

**Phase 2:** Evaluate Service Worker caching for essays and saved charts based on analytics data.

**Install prompt:** Not on first visit. After second visit or after saving a chart.

---

## 6b. SEO & AEO

### Page count at launch: ~156

- 120 essay pages (`/essays/[slug]`)
- 12 sign pages (`/signs/[sign]`)
- 12 sidereal-vs-tropical comparison pages (`/compare/[sign]`)
- 10 planet pages (`/planets/[planet]`)
- Landing, why-sidereal, pricing = 3

All ISR, indexable, server-rendered.

### Structured data on every essay page

- **FAQ schema markup** — common questions about the position (e.g., "What does Sun in Pisces mean in sidereal astrology?")
- **Direct answer in first paragraph** — optimized for AI citation (AEO). ChatGPT/Perplexity should cite Estrevia
- **Comparison tables** — tropical vs sidereal for this position (structured `<table>`)
- **Ephemeris table** — planet ingress/egress dates for 5 years. Generated at build time via `scripts/generate-ephemeris-tables.ts` → cached as JSON (~50KB). No runtime server call

### Share pages `/s/[id]`

- `noindex` — user-generated content, don't pollute search index
- OG meta tags: `og:title`, `og:description`, `og:image` pointing to `/api/og/passport/[id]`
- Pre-filled share text in EN

### Meta Pixel + CAPI

From docs/analytics.md: Meta Pixel (client) + Meta Conversions API (server) for ad attribution. Events: `PageView`, `ChartCalculated`, `Lead`, `Subscribe`. Deduplicated via shared `event_id`.

---

## 6c. Analytics Events (PostHog)

Key events that the frontend must fire. From docs/analytics.md:

### Core
| Event | Trigger |
|-------|---------|
| `page_view` | Every page load |
| `chart_input_started` | User focuses on date field |
| `chart_calculated` | Chart calculation complete |
| `signup_completed` | Registration |
| `chart_saved` | Chart saved to account |

### Content
| Event | Trigger |
|-------|---------|
| `essay_read` | Essay page opened |
| `essay_scrolled` | Scroll milestones (25%, 50%, 75%, 100%) |
| `moon_calendar_viewed` | Moon tab opened |
| `sidereal_explainer_viewed` | Why-sidereal page opened |

### Viral Loop (Critical Funnel)
| Event | Trigger |
|-------|---------|
| `passport_created` | User clicks "Share" and passport is generated |
| `passport_share_clicked` | Click on specific share method (web_share/copy_link/twitter/telegram/download_png) |
| `passport_viewed` | Someone opens `/s/[id]` |
| `passport_cta_clicked` | Visitor on `/s/[id]` clicks "Find your sign" |
| `passport_converted` | Visitor on `/s/[id]` calculates their own chart |
| `passport_reshared` | Visitor on `/s/[id]` creates their own passport |

### Conversion
| Event | Trigger |
|-------|---------|
| `premium_clicked` | Click on subscribe CTA |
| `premium_subscribed` | Payment completed |

---

## 6d. Legal Requirements (MVP)

From docs/mvp.md readiness criteria:

- **Terms of Service** — `/terms` page, linked from footer
- **Privacy Policy** — `/privacy` page, linked from footer
- **Cookie consent banner** — shown on first visit. PostHog + Meta Pixel require consent in EU (GDPR). Component in `shared/components/CookieConsent`
- **COPPA age check (13+)** — age verification in Clerk registration flow (date of birth field or checkbox)
- **Astrology disclaimer** — every essay page must include: "Astrology is not medical, financial, or legal advice." Component in `modules/esoteric/components/AstrologyDisclaimer`

---

## 7. Testing

### Unit Tests (Vitest)

Pure logic, no UI:
- Sidereal/tropical offset calculation
- Passport rarity calculation
- Form validation (Zod schemas)
- 777 correspondences lookup
- Aspect calculation between planets

### Component Tests (Vitest + Testing Library)

UI rendering and interactivity. API calls mocked.
- ChartWheel renders all 12 planets with correct `aria-label`
- PositionsTable shows correct signs for given positions
- Toggle switches system, table updates accordingly
- PremiumGate: guest sees preview + CTA, premium sees full text
- BirthDataForm validates input (empty date, future date, etc.)
- CityAutocomplete shows results after debounced input

### E2E Tests (Playwright)

Critical user paths on real test environment:
- Guest calculates chart: landing → input → /chart/[id] → wheel rendered → table matches
- Sidereal/tropical toggle: click → positions shift → signs change where ayanamsa crosses boundary
- Tap planet → essay: click Sun on wheel → /essays/sun-in-pisces → text loaded
- Share flow: Share button → passport rendered → /s/[id] link works
- Viral loop: open /s/[id] → see friend's passport → enter own data → get own result
- Premium gate: click locked essay → preview + CTA → Stripe checkout redirect
- Mobile navigation: bottom tabs switch pages, active state correct

### Accessibility Tests (WCAG 2.1 AA)

- **axe-core** integration in every Playwright E2E test (`@axe-core/playwright`)
- Keyboard navigation: Tab through planets on ChartWheel, Enter → essay
- Screen reader labels: every planet has `aria-label` ("Sun at 24° Pisces")
- Color contrast: verified — primary 17.39:1, secondary 5.71:1, tertiary 4.64:1 (all pass AA)
- Focus-visible: all interactive elements show visible focus ring on Tab

### Reference Charts

100+ reference charts in CI — verified against Astro.com/Solar Fire at +/-0.01° accuracy. Frontend tests additionally verify:
- Correct sign displayed for boundary degrees (29°59' vs 0°01')
- Toggle correctly handles boundary cases (planet changes sign on system switch)

### Not Tested

- Visual pixel-perfect snapshots (fragile, break on every CSS change)
- shadcn/ui internals (tested by maintainers)
- Clerk auth flow (mocked in tests)
- Stripe checkout (tested by Stripe; we verify redirect only)
