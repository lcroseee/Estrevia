# Deployment Blockers — Must Fix Before Production Traffic

This document tracks issues that **cannot be fixed in code** and require
manual action on Vercel, Clerk, DNS, or Stripe dashboards. Compiled from
real-user QA walkthroughs in `docs/qa-findings-2026-04-18.md`.

## Status Legend

- **BLOCKER** — product cannot function; traffic must not be sent
- **MAJOR** — product functions but leaks dev artifacts or misrepresents itself
- **MINOR** — polish, non-critical

---

## BLOCKER: `estrevia.app` domain does not resolve

**Symptom:** `dig estrevia.app` returns `NXDOMAIN`. Any `/s/[id]` share
link, any Cosmic Passport URL, any ad destination currently points at a
non-existent host.

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

**Symptom:** HTML contains
`publishableKey=pk_test_...mighty-mink-92.clerk.accounts.dev`.
`signInUrl` and `signUpUrl` are empty strings, so `/sign-in` and
`/sign-up` return 404. No user can register, therefore no user can
subscribe.

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

## BLOCKER: `/api/chart/calculate` (legacy path) returns 404

**Symptom:** QA reports the form's Calculate button hits
`POST /api/chart/calculate` which returns the 404 page. The live endpoint
lives at `/api/v1/chart/calculate`.

**Fix:** Check the form handler in
`src/modules/astro-engine/components/HeroCalculator.tsx` and wherever the
submit lives. All fetches must target `/api/v1/chart/calculate`. If the
QA report is current, there is a stale non-versioned path somewhere.

**Owner:** backend engineer.

**Verification:**

```bash
curl -X POST https://estrevia.app/api/v1/chart/calculate \
  -H 'Content-Type: application/json' \
  -d '{"date":"1997-11-14","time":"14:30","lat":19.43,"lon":-99.13,"tz":"America/Mexico_City"}' \
  -i | head -20
```

Expected: `200 OK` with JSON body containing `planets` array.

---

## MAJOR: `NEXT_PUBLIC_SITE_URL` leaks `http://localhost:3000`

**Symptom:** `robots.txt` says `Sitemap: http://localhost:3000/sitemap.xml`.
All 539 sitemap URLs are `<loc>http://localhost:3000/...</loc>`. OG meta
tag `og:image` is `http://localhost:3000/opengraph-image`.

**Root cause:** `NEXT_PUBLIC_SITE_URL` environment variable on Vercel is
either unset or set to localhost. The code falls back to
`https://estrevia.app` when unset (after the fix in
`src/shared/seo/constants.ts`), but this env value needs to be correct in
all environments.

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

## MAJOR: Missing production pages — `/essays`, `/signs`, `/about`, `/passport`

**Symptom:** QA found that the pricing card advertises "All 120+ essays"
but `/essays` returns 404. Same for `/signs`, `/about`,
`/passport`, `/correspondences`, `/sidereal-vs-tropical`. Files exist in
the repo (some as untracked `??` in `git status`), but the routes are
not built or not linked.

**Fix:**
1. Decide scope for MVP launch. Minimum viable:
   - `/essays` — index page listing all 120 essays (one exists as
     untracked `src/app/(app)/essays/page.tsx`). Commit and wire up.
   - `/signs` — index of 12 sign pages (one exists as untracked
     `src/app/(app)/signs/page.tsx`). Commit and wire up.
   - `/why-sidereal` — already live, add to header nav (currently
     SEO-only, no UI link).
2. For pages that are **not** ready: remove from nav/footer/pricing card
   and sitemap until they ship. Do not promise what you cannot deliver.
3. Add `/about` with at least one paragraph + legal entity (required for
   German Impressumspflicht, UK advertising standards).

**Owner:** frontend + content engineers.

---

## MAJOR: No `Impressum` / legal entity on site

**Symptom:** Terms of Service refers to "Estrevia and its operators"
without naming a legal entity, address, or UK representative. In
Germany §5 TMG requires an Impressum page; in UK the Companies Act
requires trading details; ASA requires astrology-entertainment
disclaimer visible from landing.

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
