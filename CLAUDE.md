# CLAUDE.md

## Project
Estrevia — sidereal astrology PWA (Lahiri ayanamsa) with esoteric content (Thelema, Kabbalah, 777) and viral Cosmic Passport sharing. EN + ES (LATAM) launch. Solo founder, Russian-speaking; code/comments in English.

## Stack
- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript 6** (strict)
- **Tailwind 4**, **shadcn/ui**, **@base-ui/react**, **framer-motion**
- **next-intl** for `[locale]` routing (en/es), Clerk localizations
- **Swiss Ephemeris** via `sweph` (server-only, Moshier ephemeris, ±0.01°)
- **Neon Postgres** + **Drizzle ORM**, **Upstash Redis** (rate limit + cache)
- **Clerk** (auth, JWT verification), **Stripe** (subs), **PostHog** (analytics), **Resend** (email), **Sentry** (errors)
- **Vercel** deploy: Fluid Compute, Cron, Blob, `@vercel/og` (Satori)

## Commands
- Dev: `npm run dev`
- Build: `npm run build`
- Test single: `npx vitest run path/to/file.test.ts`
- Test all: `npm test`
- E2E: `npm run test:e2e`
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- DB: `npm run db:generate` · `db:migrate` · `db:studio`
- Ephemeris tables: `npm run generate:ephemeris`

## Architecture
- `src/modules/` → domain logic (`astro-engine`, `esoteric`, `auth`, `advertising`). No cross-module deps; depend only on `shared/`
- `src/shared/` → `seo/` (metadata + JSON-LD generators — single source of truth), `encryption/` (AES-256-GCM PII), `components/` (UI primitives), `types/`, `validation/` (zod), `hooks/`, `context/`, `lib/`
- `src/app/[locale]/` → routes split into `(app)` (chart, moon, hours, essays, signs, synastry, tarot, sidereal-dates, settings) and `(marketing)` (landing, pricing, why-sidereal, legal pages)
- `src/app/api/` → `chart/`, `cron/`, `og/`, `v1/` (public endpoints incl. `/v1/sidereal/sun-sign`), `webhooks/`, `admin/`, `health/`
- `src/app/admin/advertising/` → ops UI (Clerk allowlist auth)
- `src/i18n/` → `routing.ts`, `request.ts`, `navigation.ts` (next-intl config)
- `src/middleware.ts` → Clerk auth + next-intl locale routing; excludes `/opengraph-image` and `/api/og/*`
- `content/` → MDX essays, signs, correspondences, tarot, kabbalah (proprietary, NOT AGPL)
- `scripts/` → `generate-ephemeris-tables.ts`, `advertising/`, fixtures, QA mjs scripts
- `docs/` → architecture, mvp, marketing, design, editorial-style-guide (authoritative reference)

## Rules
- **License split:** code is AGPL-3.0 (Swiss Ephemeris compliance); `content/` is proprietary. Don't add AGPL headers in `content/`.
- **PII = birth date/time/location.** Encrypt via `src/shared/encryption/` AES-256-GCM before any DB write. Never log decrypted PII; never put PII in URLs, query params, error messages, or client state. Test fixtures use synthetic data only.
- **Auth:** Clerk JWT verification only (`@clerk/nextjs` middleware) — stateless, no DB lookup per request. No session-token tables.
- **Secrets:** read via `process.env` only; never hardcode. `.env` is git-ignored — only `.env.example` committed.
- **Astrology ≠ advice.** Every essay/sign page must include "not medical/financial advice" disclaimer (already enforced in `/sidereal-*-dates`).
- **Content legal:** Crowley pre-1929 only (777, Equinox I, Liber AL). DO NOT use Book of Thoth (1944, copyright until 2039), Frieda Harris Thoth images (until 2064), or Eshelman texts. NASA data is public domain.
- **Astro engine MVP:** Lahiri ayanamsa only; Placidus houses only; 12 bodies (Sun..Pluto + N.Node + Chiron); houses null when birth time unknown. Verify against `tests/fixtures/` (≥36 reference fixtures, ±0.01°).
- **i18n:** Spanish = español neutro LATAM, `tú` form. Sign names untranslated (Aries/Taurus/...); planet names translated.
- **a11y:** WCAG 2.1 AA. Chart SVG needs `aria-label` per planet + text fallback + Tab navigation.
- **IMPORTANT: SEO single source of truth.** All page metadata uses `createMetadata()` from `src/shared/seo/metadata.ts`; all JSON-LD comes from `src/shared/seo/json-ld.ts`. Frontend imports — never re-implements — these. New SEO utilities go in `src/shared/seo/`, not in feature folders.

## Workflow
- **Direct-to-main:** features land on `main`. Still verify before claiming done; confirm any shared-state action (push/PR/Stripe/DB migration).
- **Brainstorm → plan → implement** even for small tasks. Don't skip the plan step (see `feedback_follow_full_workflow`).
- **Trust code over brief:** when this file or founder brief contradicts repo state, baseline-verify (`git log`, read files) before writing fixes.
- **Test before "done":** run `npm test` + `npm run typecheck` + `npm run lint`. Zero failing tests / type errors policy on auth, encryption, payment paths.
- **Commits:** conventional-style scopes used in repo (`feat(content/T10):`, `fix(seo-phase2/T4):`, `chore(qa/T20):`, `perf(...):`, `a11y(...)`). Match existing style on the branch.
- **Brief updates:** during work, one-sentence status updates; end-of-turn ≤2 sentences. Founder reads diffs.
- **Ask vs act:** ask for destructive ops (force push, drop tables, delete branches, push to prod). Act on local edits, tests, doc updates.

## Out of scope
- `content/` essays — proprietary content. Don't rewrite without explicit ask; treat as data.
- `docs/` long-form specs (PRD, marketing, audience) — manually maintained by founder. Read for context; don't restructure.
- Third-party MCP servers for PII / payments / deployment — never. Use first-party integrations (Vercel, Clerk, Stripe) only.
- Image generation pipeline — provider-agnostic interface in `src/modules/advertising/creative-gen/generators/`. Don't bypass; don't generate Cosmic Passport cards via AI (use Satori / `@vercel/og` deterministic only).
- `tmp/qa-reports/` — force-added QA artifacts; don't modify outside the QA flow.
- Auto-iteration in advertising agent — gated until winning patterns exist (~month 3+). Don't ship the loop; build perceive/decide/act primitives only.
