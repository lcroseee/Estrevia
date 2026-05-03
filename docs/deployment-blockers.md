# Deployment Blockers — Must Fix Before Production Traffic

This document tracks issues that **cannot be fixed in code** and require
manual action on Vercel, Clerk, DNS, or Stripe dashboards. Compiled from
real-user QA walkthroughs in `docs/qa-findings-2026-04-18.md`.

> **Status update — 2026-05-03:** Several blockers from the original
> 2026-04-18 audit have been resolved in code (route pages shipped, legacy
> API path removed, `NEXT_PUBLIC_SITE_URL` fallback wired in
> `src/shared/seo/constants.ts`, Clerk JWT middleware live in
> `src/middleware.ts`). See "Resolved Blockers (2026-05-03)" at the end of
> this file for the audit trail. Items below either still block launch
> or cannot be verified from the repository alone.

## Status Legend

- **BLOCKER** — product cannot function; traffic must not be sent
- **MAJOR** — product functions but leaks dev artifacts or misrepresents itself
- **MINOR** — polish, non-critical

---

## BLOCKER: `estrevia.app` domain does not resolve

**Symptom:** `dig estrevia.app` returns `NXDOMAIN`. Any `/s/[id]` share
link, any Cosmic Passport URL, any ad destination currently points at a
non-existent host.

**Founder must verify in Vercel dashboard** — this cannot be confirmed
from the repository. If the domain is already attached and SSL issued,
mark this resolved manually.

**Fix:**
1. Register `estrevia.app` through a registrar (Namecheap, Cloudflare,
   Google Domains).
2. In Vercel dashboard → Project `estrevia` → Settings → Domains → Add
   `estrevia.app` and `www.estrevia.app`.
3. Follow Vercel's DNS instructions (either use Vercel nameservers or add
   `A 76.76.21.21` for apex and `CNAME cname.vercel-dns.com` for `www`).
4. Wait for SSL cert provisioning (1–15 min).
5. Verify: `curl -I https://estrevia.app` returns `200` with
   `strict-transport-security` header.

**Owner:** founder (DNS access required).

---

## BLOCKER: Clerk is running on test keys in production

**Symptom (2026-04-18):** HTML contains
`publishableKey=pk_test_...mighty-mink-92.clerk.accounts.dev`.
`signInUrl` and `signUpUrl` are empty strings, so `/sign-in` and
`/sign-up` return 404.

**Code-side status (2026-05-03):** `src/middleware.ts` uses
`clerkMiddleware` with stateless JWT verification, and `/sign-in` /
`/sign-up` route pages exist under `src/app/[locale]/sign-in/` and
`src/app/[locale]/sign-up/`. **Founder must verify in Vercel dashboard**
that production environment variables are populated with `pk_live_...` /
`sk_live_...` values (the repo only contains empty placeholders in
`.env.example`).

**Fix:**
1. Clerk dashboard → create a new **Production** instance (or promote the
   existing dev instance).
2. Configure sign-in/sign-up redirect URLs to `https://estrevia.app/sign-in`
   and `https://estrevia.app/sign-up`.
3. Copy the production `pk_live_...` publishable key and `sk_live_...`
   secret key.
4. Vercel → Settings → Environment Variables — replace:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_live_...`
   - `CLERK_SECRET_KEY` = `sk_live_...`
   - `NEXT_PUBLIC_CLERK_SIGN_IN_URL` = `/sign-in`
   - `NEXT_PUBLIC_CLERK_SIGN_UP_URL` = `/sign-up`
5. Add the Clerk webhook endpoint in Clerk dashboard:
   `https://estrevia.app/api/webhooks/clerk` and paste the signing secret
   into Vercel as `CLERK_WEBHOOK_SECRET`.
6. Redeploy.
7. Verify: `curl -s https://estrevia.app | grep -c 'pk_test_'` returns
   `0`.

**Owner:** founder.

---

## MAJOR: `NEXT_PUBLIC_SITE_URL` must be set on Vercel Production

**Symptom (2026-04-18):** `robots.txt` said
`Sitemap: http://localhost:3000/sitemap.xml`. All sitemap URLs and the
`og:image` meta tag pointed at localhost.

**Code-side status (2026-05-03):** The fallback to
`https://estrevia.app` is in place in `src/shared/seo/constants.ts`, and
`.env.example` documents `NEXT_PUBLIC_SITE_URL=https://estrevia.app`.
**Founder must verify in Vercel dashboard** that the Production
environment variable is actually set to `https://estrevia.app` (and not
empty or localhost) — the repo cannot confirm Vercel env values.

**Fix:**
1. Vercel → Settings → Environment Variables.
2. Set for **Production**: `NEXT_PUBLIC_SITE_URL=https://estrevia.app`.
3. Set for **Preview**: `NEXT_PUBLIC_SITE_URL=$VERCEL_URL` (or leave
   unset — the code auto-derives from `VERCEL_URL`).
4. Set for **Development**: `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
   (only local `.env.local`, not Vercel).
5. Also set `NEXT_PUBLIC_APP_URL` identically (used by Stripe
   `/api/v1/stripe/checkout` and `/portal`).
6. Redeploy.

**Verification:**

```bash
curl -s https://estrevia.app/robots.txt | grep Sitemap
curl -s https://estrevia.app/sitemap.xml | head -5
curl -s https://estrevia.app/ | grep 'og:image'
```

All three should contain `https://estrevia.app`, never `localhost`.

---

## MAJOR: No `Impressum` / legal entity on site

**Symptom:** Terms of Service refers to "Estrevia and its operators"
without naming a legal entity, address, or UK representative. In
Germany §5 TMG requires an Impressum page; in UK the Companies Act
requires trading details; ASA requires astrology-entertainment
disclaimer visible from landing.

**Repo-side status (2026-05-03):** No `/about` or `/legal/imprint` route
exists under `src/app/[locale]/(marketing)/`. Still blocking for EU/UK
launch.

**Fix:**
1. Register a legal entity (sole trader, LLC, UK Ltd — founder's
   decision).
2. Add `/legal/imprint` page with: legal entity name, registered
   address, VAT number (if applicable), email, representative name.
3. Add link in footer.
4. Add "For entertainment and self-reflection only" disclaimer in
   landing footer (not only in Terms).
5. If targeting EU/UK: add UK IDTA addendum to Privacy Policy for
   US-based sub-processors (Neon, Vercel).

**Owner:** founder (legal entity), frontend engineer (page).

---

## MAJOR: No Portuguese (pt-BR) localization

**Symptom:** Spanish locale exists (`messages/es.json`) but Brazilian
market — second largest astrology market globally — has no PT-BR file.
Gen Z QA (Luiza, São Paulo) flagged this as blocker for LATAM reach.

**Repo-side status (2026-05-03):** Confirmed — `messages/` contains only
`en.json` and `es.json`; `src/i18n/routing.ts` declares
`locales: ['en', 'es']`. PT-BR not yet wired.

**Fix:**
1. Copy `messages/es.json` to `messages/pt.json`.
2. Translate to Brazilian Portuguese (NOT European — they differ
   significantly; LATAM uses "você", not "tu").
3. Add `pt` to `locales` array in `src/i18n/request.ts`.
4. Add PT option to `LanguageSwitcher.tsx`.
5. Verify `Accept-Language: pt-BR` correctly resolves to PT locale.

**Owner:** content + frontend.

---

## MAJOR: Stripe checkout accepts only USD, no PIX / iDEAL / SEPA

**Symptom:** QA (Carmen, Barcelona; Luiza, São Paulo) flagged that the
Stripe checkout shows USD only and does not offer regional payment
methods. For LATAM (PIX), EU (SEPA, iDEAL, Bizum), this is a checkout
conversion killer.

**Founder must verify in Stripe dashboard** which payment methods are
enabled — this cannot be confirmed from the repository. Code change in
`src/app/api/v1/stripe/checkout/route.ts` (currency: 'auto') still
required regardless.

**Fix:**
1. Stripe dashboard → Payment methods → enable SEPA, iDEAL, Bizum, PIX
   (requires Stripe Brazil connection), Cartão de Crédito.
2. Configure automatic currency conversion based on buyer location:
   `currency: 'auto'` in checkout session creation (code fix — see
   `src/app/api/v1/stripe/checkout/route.ts`).
3. Verify EUR, BRL, MXN render correctly in checkout UI.

**Owner:** backend engineer + founder (Stripe settings).

---

## MAJOR: Test Clerk webhook + Stripe webhook secrets in Vercel

**Symptom:** (corollary of the Clerk blocker above) If Clerk is on
production keys, webhook signing secret must also be production, else
`/api/webhooks/clerk` will 401 every event and user-table sync breaks.
Same for Stripe.

**Repo-side status (2026-05-03):** Both webhook endpoints exist
(`src/app/api/webhooks/clerk/`, `src/app/api/webhooks/stripe/`) and
`CLERK_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET` are documented in
`.env.example`. **Founder must verify in Vercel dashboard** that the
Production env vars hold live signing secrets.

**Fix:**
- Clerk dashboard → Webhooks → copy live signing secret → Vercel env
  `CLERK_WEBHOOK_SECRET`.
- Stripe dashboard → Developers → Webhooks → live endpoint → signing
  secret → Vercel env `STRIPE_WEBHOOK_SECRET`.

**Owner:** founder.

---

## MINOR: CSP includes `'unsafe-inline'` for `script-src`

**Symptom:** QA (Markus, Berlin PM) noted security headers are otherwise
solid but `Content-Security-Policy` contains `script-src 'self'
'unsafe-inline'`. This weakens XSS protection.

**Fix:** Next.js 16 supports nonce-based CSP. Update `next.config.ts` and
middleware to inject per-request nonces. This is a week of work, low
priority compared to launch blockers. Track as post-launch Phase 2 item.

**Owner:** security / backend engineer.

---

## Pre-Launch Smoke Test

Run this 15-command smoke test before promoting to production. All must
pass before traffic is sent.

```bash
DOMAIN="https://estrevia.app"

# 1. Domain resolves + HTTPS + HSTS
curl -sI $DOMAIN | grep -i 'strict-transport-security'

# 2. No localhost leak in sitemap
! curl -s $DOMAIN/sitemap.xml | grep -q 'localhost'

# 3. Robots.txt correct
curl -s $DOMAIN/robots.txt | grep -q "Sitemap: $DOMAIN/sitemap.xml"

# 4. OG image URL absolute + production
curl -s $DOMAIN | grep 'og:image' | grep -qv 'localhost'

# 5. No Clerk test key
! curl -s $DOMAIN | grep -q 'pk_test_'

# 6. Manifest valid
curl -sI $DOMAIN/manifest.webmanifest | grep -q '200'

# 7. Sign-up page live
curl -sI $DOMAIN/sign-up | grep -q '200'

# 8. Sign-in page live
curl -sI $DOMAIN/sign-in | grep -q '200'

# 9. Chart page live
curl -sI $DOMAIN/chart | grep -q '200'

# 10. Pricing page live
curl -sI $DOMAIN/pricing | grep -q '200'

# 11. Health endpoint returns Sun longitude
curl -s $DOMAIN/api/health/sweph | grep -q 'status'

# 12. Chart calculation API works (versioned path)
curl -sX POST $DOMAIN/api/v1/chart/calculate \
  -H 'Content-Type: application/json' \
  -d '{"date":"1990-01-01","time":"12:00","lat":0,"lon":0,"tz":"UTC"}' \
  | grep -q 'planets'

# 13. Privacy + terms live
curl -sI $DOMAIN/privacy | grep -q '200'
curl -sI $DOMAIN/terms | grep -q '200'

# 14. Language switcher present in HTML header
curl -s $DOMAIN | grep -q 'role="radiogroup"'

# 15. JSON-LD FAQPage schema present on landing
curl -s $DOMAIN | grep -q '"@type":"FAQPage"'
```

If any line fails, **do not launch**.

---

## Resolved Blockers (2026-05-03)

Audit trail of items removed from the active list above. Verified
against repo state on 2026-05-03 — code-side resolution only; production
behaviour still depends on the Vercel-side items above.

- **BLOCKER: `/api/chart/calculate` (legacy path) returns 404 — RESOLVED.**
  `src/modules/astro-engine/components/HeroCalculator.tsx` now fetches
  `/api/v1/chart/calculate`. The remaining reference in
  `src/modules/esoteric/components/MiniCalculator.tsx` is a doc comment;
  the actual `fetch()` call hits `/api/chart/sun-sign`, which exists as
  a route handler.
- **MAJOR: Missing production pages (`/essays`, `/signs`, `/why-sidereal`)
  — RESOLVED.** Route pages now exist at
  `src/app/[locale]/(app)/essays/page.tsx`,
  `src/app/[locale]/(app)/signs/page.tsx`, and
  `src/app/[locale]/(marketing)/why-sidereal/page.tsx`. Sitemap
  (`src/app/sitemap.ts`) reaches 466 URLs as of SEO Phase 2 ship
  (2026-05-03), including the new `/sidereal-{sign}-dates × 24` set.
  Note: `/about`, `/passport` (UI), `/correspondences`, and
  `/sidereal-vs-tropical` UI pages are still not present in the repo —
  but are no longer linked from pricing/nav, so they no longer
  misrepresent the product. Whether to ship them is a scoping decision,
  not a blocker.
- **Spanish localization claim — PARTIALLY OBSOLETE.** Spanish is now
  live for sidereal-dates and shipped pages via `messages/es.json` +
  `[locale]` routing with `localePrefix: 'as-needed'`. PT-BR remains
  missing (kept as MAJOR above).
- **Code-side fixes from 2026-04-18 walkthrough — RESOLVED.** Clerk JWT
  middleware (`src/middleware.ts`), `NEXT_PUBLIC_SITE_URL` fallback in
  `src/shared/seo/constants.ts`, and Sentry / PostHog / Stripe / Resend /
  Upstash dependencies are all wired (verified in `package.json` and
  `.env.example`). Vercel-side configuration of these (live keys, prod
  URLs) is tracked separately above and still requires founder action.
