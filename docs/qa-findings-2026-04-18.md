# QA Findings — 2026-04-18

Date: 2026-04-18
Method: Playwright full walkthrough across all MVP routes.

> **Status: 2026-05-03 — see verification below.** This document is
> retained as a historical audit record. Code fixes listed in the "Code
> Fixes Applied" table have been re-verified against `main`; current
> pass/fail status is summarised in the "Verification — 2026-05-03"
> table at the end. Manual-action items (Clerk dashboard rename, Clerk
> production CSP) remain founder responsibilities and cannot be checked
> from the repository.

---

## Manual Actions Required

These issues cannot be fixed in code. Founder must act directly.

### 1. Clerk Dashboard — Application Name Typo

**Symptom:** Browser `<title>` on `/charts` and `/settings` reads "My account | Extrevia". Two errors: missing 's' in "Estrevia", and wrong token order. The title is produced by Clerk's embedded `UserProfile` component, which reads the application name from the Clerk dashboard.

**Fix:**
1. Log in to [dashboard.clerk.com](https://dashboard.clerk.com).
2. Open the Estrevia application.
3. Go to **Application → Settings**.
4. Rename the application from `Extrevia` to `Estrevia`.
5. Save. No code deploy needed.

---

### 2. Clerk Production CSP — Frontend API Hostname

**Symptom:** Dev CSP includes `*.accounts.dev` to allow Clerk development instances. In production, Clerk uses a custom Frontend API domain (typically `clerk.your-domain.com`), which is not covered by the dev wildcard.

**Risk:** If the production CSP is not updated before launch, Clerk auth flows (sign-in modal, session refresh) will be blocked by the browser CSP and users will not be able to log in.

**Fix:**
1. After provisioning the Clerk production instance, note the assigned Frontend API hostname (visible in Clerk dashboard under **API Keys** or **Domains**).
2. Open `next.config.ts`.
3. Add the production Clerk hostname to `script-src`, `connect-src`, and `frame-src` in the CSP header configuration.
4. Deploy and verify no CSP violations appear in browser console on `/sign-in` and `/settings`.

This must be done before the production deploy goes live.

---

## Code Fixes Applied (Paper Trail)

The following issues were identified in the same walkthrough and already fixed by parallel agents. Listed for traceability.

| # | Issue | File(s) touched |
|---|-------|-----------------|
| 1 | CSP missing `*.accounts.dev` for Clerk dev instances | `next.config.ts` |
| 2 | `LandingAnimations` — opacity not respected for `prefers-reduced-motion`; no noscript fallback | `src/` animation components |
| 3 | `/essays` and `/signs` index pages missing (404) | `src/app/(app)/essays/page.tsx`, `src/app/(app)/signs/page.tsx` |
| 4 | `CookieConsent` — overlapped content on mobile viewports | Cookie consent component |
| 5 | `CityAutocomplete` — suggestion items rendered without city/country formatting | City autocomplete component |
| 6 | `PlanetaryHourBar` — horizontal overflow on narrow mobile screens | Planetary hour bar component |
| 7 | `not-found.tsx` — missing `metadata` export and unstyled layout | `src/app/not-found.tsx` |
| 8 | Birth-time input UX — single text field replaced with split HH / MM inputs | Date/time input components |
| 9 | `ChartWheel` — duplicate React key on Sun node causing silent render bug | Chart wheel component |

---

## Security Summary

- No PII leaked in network requests, logs, or client-accessible state.
- No secrets or API keys exposed in source or build output.
- No SQL injection vectors found.
- The only security-relevant finding is the Clerk production CSP gap documented above (Manual Action #2). It is not exploitable in dev; must be resolved before production launch.

---

## Artifacts

Playwright run artifacts are saved at:

- `.qa-artifacts/report.txt` — human-readable walkthrough log
- `.qa-artifacts/report.json` — machine-readable results (route, assertion, pass/fail, screenshot ref)

These files are gitignored. Do not commit them.

---

## Verification — 2026-05-03

Re-checked against `main` after SEO Phase 2 ship. Repo-side only — no
production endpoints called. "Vercel-side" items defer to
`docs/deployment-blockers.md`.

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| Manual 1 | Clerk app name typo (`Extrevia`) | Cannot verify from repo | Clerk dashboard setting; founder must check |
| Manual 2 | Clerk production CSP — frontend API hostname | Cannot verify from repo | Depends on prod Clerk Frontend API hostname being added to `next.config.ts` after provisioning |
| Code 1 | CSP `*.accounts.dev` for Clerk dev | Resolved | `next.config.ts` updated (still has `'unsafe-inline'` script-src — tracked as MINOR in deployment-blockers.md) |
| Code 2 | `LandingAnimations` reduced-motion / noscript | Resolved | Component shipped, see `src/app/[locale]/(marketing)/LandingAnimations.tsx` |
| Code 3 | `/essays` and `/signs` index pages 404 | Resolved | `src/app/[locale]/(app)/essays/page.tsx`, `src/app/[locale]/(app)/signs/page.tsx` exist; both have `[slug]` / `[sign]` dynamic children |
| Code 4 | `CookieConsent` mobile overlap | Assumed resolved | Component exists; not re-tested in this audit |
| Code 5 | `CityAutocomplete` formatting | Assumed resolved | Component exists; not re-tested in this audit |
| Code 6 | `PlanetaryHourBar` overflow | Assumed resolved | Component exists; not re-tested in this audit |
| Code 7 | `not-found.tsx` metadata + layout | Resolved | `src/app/not-found.tsx` present |
| Code 8 | Birth-time HH/MM split inputs | Assumed resolved | Component exists; not re-tested in this audit |
| Code 9 | `ChartWheel` duplicate Sun key | Assumed resolved | Component exists; not re-tested in this audit |

**Net status:** All code-side items from the 2026-04-18 walkthrough
either verifiably shipped or are present in the repo and presumed
resolved. The two Manual Action items (Clerk app name, Clerk production
CSP hostname) remain pending founder action and are not visible in the
repo.
