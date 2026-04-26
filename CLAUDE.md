# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Estrevia is a PWA combining sidereal astrology, esoteric tradition (Thelema, Kabbalah, Thoth Tarot), and viral sharing mechanics. Not a social network — an astrology platform with viral growth. Pre-MVP phase — documentation complete, code not yet started.

**License:** Code is AGPL-3.0. Content in `content/` is proprietary (not AGPL). This split is intentional — Swiss Ephemeris is AGPL, so the entire codebase must be AGPL to comply.

**Language:** The founder communicates in Russian. Documentation is mixed Russian/English. Code, comments, and variable names should be in English.

## Architecture

**Key architectural decision:** Natal chart calculation happens on the server via Swiss Ephemeris Node.js bindings (`sweph`). The client sends birth data to an API endpoint, receives calculated positions back. This gives proven stability (native bindings, not experimental WASM), simple deployment, and consistent results across all devices.

### Module structure (planned)

```
src/
├── modules/           # Domain modules — independent, no cross-dependencies
│   ├── astro-engine/  # Swiss Ephemeris (server), chart calculation, planetary hours
│   ├── data-feed/     # NASA DONKI, USGS earthquake polling + Redis cache (Phase 2)
│   ├── esoteric/      # Essays (MDX), 777 correspondences, signs/planets
│   └── auth/          # Clerk integration wrapper
├── shared/            # Types, hooks, utilities shared across modules
│   └── types/         # Planet, Sign, Chart, Aspect TypeScript types
├── app/               # Next.js App Router — routes only, no business logic
│   ├── (marketing)/   # Landing, pricing, about (public)
│   ├── (app)/         # Main app (chart, moon, hours, essays; feed Phase 2)
│   └── api/           # Server routes (calculate, save chart, webhooks, passport)
└── content/           # Proprietary essays (separate license, NOT AGPL)
```

**Module rules:** Modules depend on `shared/` but never on each other. `app/` composes modules but contains no business logic. This enables future extraction into separate services.

### Client vs Server split

| Client (browser) | Server (Vercel Functions) |
|-------------------|--------------------------|
| Chart UI rendering (SVG) | Natal chart calculation via `POST /api/chart/calculate` (Swiss Ephemeris) |
| Essay reading (cached) | Moon phase & planetary hours calculation |
| Sidereal/tropical toggle (UI offset) | Save/load charts (DB, encrypted PII) |
| PWA installable shell | Auth (Clerk webhooks) |
| City autocomplete (server-side search API) | Stripe subscription webhooks |
| | OG image generation (`/api/og/passport/:id`) |
| | NASA/USGS cron polling (Phase 2) |

### Birth data is PII

Birth date, time, and location are encrypted with AES-256-GCM before storage. Encryption key lives in Vercel env vars, never in code. MVP: explicit `encrypt()`/`decrypt()` calls in API routes (no ORM middleware yet).

### Git Security Rules

Hard rules to prevent secrets and PII from leaking into git:

- **NEVER commit `.env`** — it contains API keys and secrets. Only `.env.example` (without values) is committed
- **NEVER hardcode** API keys, tokens, passwords, or encryption keys in source code. Use `process.env` only
- **NEVER log** decrypted PII (birth date/time/location), API keys, or session tokens
- **NEVER put PII** in URLs, query parameters, error messages, or client-accessible state
- **NEVER commit** files matching: `*.pem`, `*.key`, `*.cert`, `credentials.json`, `serviceAccountKey.json`
- **Before every `git add`**: review staged files — no `.env`, no secrets in code, no PII in test fixtures
- **Test fixtures** with birth data must use fake/synthetic data, never real user data

### Auth Middleware Rules

- **JWT verification, not session tokens.** Auth middleware must verify Clerk-issued JWTs (`@clerk/nextjs` middleware) — stateless, no DB round-trip per request. Do not implement session-token-based auth that stores/looks up tokens in the database
- **After any auth change** — run the full existing test suite before considering the change complete
- **Zero failing tests policy** — fix all test failures and type errors introduced by auth changes before marking work as done. No known-broken commits

## Tech Stack

- **Next.js 16+** (App Router), **TypeScript** (strict mode), **Tailwind CSS 4**, **shadcn/ui**
- **Swiss Ephemeris** via `sweph` on server (Node.js native C addon, prebuilt binaries for linux-x64). Uses Moshier analytical ephemeris (built-in, no `.se1` files needed). Accuracy: ±0.01°
- **PostgreSQL** (Neon serverless) + **Drizzle** ORM
- **Upstash Redis** for rate limiting (MVP) and NASA/USGS cache (Phase 2)
- **Clerk** for auth, **Stripe** for subscriptions, **PostHog** for analytics, **Resend** for email
- **Sentry** (`@sentry/nextjs`) for error monitoring (free tier 5K errors/mo, source maps, alerting)
- **Vercel** for hosting (Fluid Compute functions, Cron, Blob storage)

## Design Constraints

- Dark theme by default: background `#0A0A0F`, not pure black
- Planetary colors are defined in `docs/design.md` (gold for Sun, silver for Moon, etc.)
- Geist Sans for UI, Crimson Pro for esoteric content text, Geist Mono for degrees/numbers
- Mobile-first (375px minimum), bottom tab navigation on mobile
- Progressive disclosure: beginners see simple chart, experts see degrees/orbs/decanates

## Content Legal Rules

These are hard legal constraints, not preferences:

- **Crowley texts before 1929:** Free to use (public domain). This includes 777, Equinox Vol I, Liber AL.
- **Book of Thoth (1944):** DO NOT use. Copyright until 2039 (OTO).
- **Thoth Tarot images (Frieda Harris):** DO NOT use. Copyright until 2064. Generate original illustrations only.
- **Eshelman texts:** DO NOT reproduce. Write original interpretations referencing his work.
- **NASA data/photos/sounds:** Free to use (public domain).
- **Astrology ≠ advice:** Every essay must include disclaimer that astrology is not medical/financial advice.

## Astro Engine Specifics

- MVP: Lahiri ayanamsa only. Fagan-Bradley, Krishnamurti deferred to Phase 2
- Sidereal/tropical toggle is a simple offset subtraction (~24°), not a full recalculation
- 12 celestial bodies in chart: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, North Node, Chiron
- MVP essays: 120 (10 planets Sun–Pluto × 12 signs). North Node & Chiron essays deferred to Phase 2
- MVP house system: Placidus only. Whole Sign & Equal deferred to Phase 2
- Houses calculated only when birth time is known; otherwise houses/ASC = null
- Verification: 100+ reference charts in CI, compared against Astro.com/Solar Fire at ±0.01°

## Viral Share — «Cosmic Passport»

Primary growth mechanism. User does our marketing because they're bragging about themselves, not about Estrevia.

- **Cosmic Passport card:** Sun/Moon/ASC + ruling planet + element + rarity % ("1 of 8%")
- Share page: `/s/[id]` — shows friend's passport + CTA to calculate own
- OG image: `/api/og/passport/[id]` — generated via `@vercel/og` (Satori), cached on CDN
- Pre-filled share text in EN
- Share button: Web Share API (mobile) + fallbacks (copy link, Twitter intent, Telegram URL)
- Download PNG for Instagram Stories
- No PII stored in share data — only sign results, element, rarity
- Share works without registration (critical for viral loop)
- PostHog events: `passport_created`, `passport_viewed`, `passport_converted`, `passport_reshared`
- Phase 2 artifacts: Lunar Cards (2×/month on new/full moon), Birthday Wrapped (annual)

## MCP Server

Estrevia publishes an MCP server so AI assistants (Claude, ChatGPT, etc.) can call our Swiss Ephemeris API directly. 5 tools: `calculate_chart`, `get_moon_phase`, `get_planetary_hours`, `compare_sidereal_tropical`, `get_correspondences_777`. Every AI response includes `estrevia.app/s/[id]` link — zero CAC acquisition. Published to Smithery/mcpt/OpenTools. Built in week 6-7 (1 day, wrapper over existing API).

## Accessibility

WCAG 2.1 Level AA. Key requirement: natal chart SVG must have `aria-label` on every planet, text table fallback for screen readers, keyboard navigation (Tab through planets). Details in `docs/accessibility.md`.

## SEO & AEO

- **SEO-Growth agent** owns the full SEO lifecycle: infrastructure, implementation, review. Creates and maintains `src/shared/seo/` (metadata utilities, JSON-LD generators, internal linking config, sitemap, robots). Reviews every page for SEO compliance before it ships.
- **Single source of truth:** all pages use `createMetadata()` from `src/shared/seo/metadata.ts` and JSON-LD generators from `src/shared/seo/json-ld.ts`. Frontend imports these — does NOT create SEO utilities independently.
- **AEO (AI Engine Optimization):** every essay page is structured for AI citation — direct answer in first paragraph, FAQ schema markup, comparison tables, specific dates/numbers. Goal: be the source ChatGPT/Perplexity cites for sidereal astrology queries.
- **Programmatic SEO:** ~150 pages at launch (120 essays + 12 sign pages + 12 sidereal-vs-tropical + pillar pages). Scale only after >80% GSC indexation.
- **Essay format:** AI-text = 30% of page. 70% = mini-calculator + ephemeris table + 777 correspondences + tropical vs sidereal comparison.
- **Ephemeris tables:** build-time script (`scripts/generate-ephemeris-tables.ts`) generates unique Swiss Ephemeris data for each essay. This is our featured snippet advantage — no other site has this data in structured format.

## External API Keys — Setup Before Development

Before starting MVP development, the following API keys must be configured in Vercel env vars:

1. **Image/Video Generation** — hybrid provider stack via a provider-agnostic interface (`ImageGenerator` / `VideoGenerator` types in `src/modules/advertising/creative-gen/generators/`). Swap providers in config, not business logic.

   **Default — Gemini API** (`GEMINI_API_KEY`):
   - **Imagen 4 Fast** ($0.02/image) — bulk atmospheric work: essay headers, decorative backgrounds, zodiac sign art, celestial textures
   - **Imagen 4 Ultra** ($0.06/image) — hero/landing visuals, atmospheric ad backgrounds (background only — text rendered via post-processing, see below)
   - **Nano Banana 2** (Gemini 3.1 Flash Image) — style-consistent batches (14 reference images for cross-batch brand recall). Activate when generating ≥10 ads in a series; brand consistency outweighs per-image cost
   - **Veo 3.1 Lite** ($0.05/sec 720p, $0.08/sec 1080p) — atmospheric Reels/Stories with built-in audio

   **Optional fallbacks** (when default underperforms):
   - **Ideogram 3.0** (`IDEOGRAM_API_KEY`) — creatives requiring complex in-image text composition. Imagen 4 still breaks text on phrases >5 words
   - **Runway Gen-4** (`RUNWAY_API_KEY`) — narrative Reels with story arc, complex camera motion, characters

2. **NOT generated by AI** — use deterministic code for structured data:
   - **Cosmic Passport cards** (share OG + ad creative variants) — Satori / `@vercel/og`. Exact sun/moon/asc + rarity %, perfect typography, $0 per variant
   - **Ephemeris tables, rarity badges, charts with exact values** — React + Sharp/Canvas
   - **Text overlays on AI backgrounds** (CTAs, hooks, headlines) — Sharp/Canvas post-processing on AI atmospheric base. AI generates background only; copy rendered in code → 100% text accuracy + free A/B copy variations without re-generation cost

   **Principle:** AI for atmosphere/aesthetics where outcome is undefined; code for structured data with exact values. Don't pay $0.06 to test a different CTA.

3. **Meta Marketing API** — programmatic ad campaign management (create/pause campaigns, set budgets, upload creatives, configure targeting, read analytics).

**Post-MVP: Advertising Agent** — autonomous agent for Meta Ads management. Perceives Meta Insights + PostHog + Stripe attribution; decides via layered rules (deterministic hard rules active from launch; Bayesian decision engine in shadow mode until ≥5K impressions per creative; LLM-based anomaly context for unusual events); acts via Meta Marketing API with hard daily spend caps; audits every decision in append-only log. Initial creative batch generation with founder approval is active from launch. Continuous auto-iteration without approval is deferred until winning patterns are identified (~month 3+). See `src/modules/advertising/`. Admin UI lives at `/admin/advertising/*` in the same Next.js app (Clerk allowlist auth); Telegram bot handles mobile alerts and high-priority approvals. Pre-launch data seeding ("Cold Start Strategy" in `docs/marketing.md`) is required ≥7 days before first paid spend. Parallel EN+ES campaigns from day 1 (70/30 budget split — see `docs/marketing.md`).

## MCP Security Policy

Before installing or connecting any third-party MCP server:

1. **Open source required** — no repository = no install
2. **Verify the author** — check GitHub/Smithery profile, account age, other projects. Fresh account with one repo is a red flag. Unverified Smithery authors require extra scrutiny: review the source code more carefully, check issues/stars, and explicitly warn the user before proceeding
3. **Review permissions** — MCP must only request access relevant to its function. A weather MCP asking for filesystem access = reject
4. **Use scoped tokens** — never pass full API keys. Use Smithery `--policy` with minimal operations, metadata filters, and TTL
5. **Isolate by namespace** — untrusted MCP servers go into a separate Smithery namespace, never into production
6. **Never pass secrets** — no API keys, passwords, or tokens from other services to third-party MCP
7. **Ask before connecting** — always confirm with the user before installing any new MCP, showing author, source, and requested permissions
8. **No third-party MCP for critical paths** — PII handling, payments, and deployment use only our own code or first-party integrations (Vercel, Clerk, Stripe)

## Documentation

Extensive docs live in `docs/`. Key references:
- `docs/technical/architecture/` — system diagrams, data flows, API design, chart calculation internals
- `docs/technical/stack/` — 16 files explaining each technology choice with alternatives and trade-offs
- `docs/technical/open-source.md` — AGPL strategy, what's open vs proprietary
- `docs/data-model.md` — full Drizzle schema design with encryption strategy
- `docs/mvp.md` — what's in scope, what's not, development order
