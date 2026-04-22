# Estrevia Launch Runbook

> Single source of truth for the production deploy sequence.
> Every item is traceable to an audit zone — reference in parentheses.

---

## Phase 1: Environment Variables

Set all variables in Vercel dashboard under **Settings → Environment Variables**.
Use separate values for Preview vs Production where indicated.

### Core

| Variable | Purpose | Format | Source |
|---|---|---|---|
| `DATABASE_URL` | Neon pooled connection (app queries) | `postgresql://...` | Neon dashboard → Connection string (pooled) |
| `DIRECT_URL` | Neon direct connection (drizzle-kit migrations) | `postgresql://...` | Neon dashboard → Connection string (direct) |
| `PII_ENCRYPTION_KEY` | AES-256-GCM key for birth data at rest | 32 bytes base64: `openssl rand -base64 32` | Generate locally, store in Vercel only |
| `PII_ENCRYPTION_KEY_V2` | (optional) pre-rotated key for key-rotation prep | Same format | Generate when rotation is planned (Zone C P1) |
| `CRON_SECRET` | Bearer token for Vercel cron endpoints | 32+ random chars: `openssl rand -hex 16` | Generate locally (Zone B P1-B) |
| `NEXT_PUBLIC_APP_URL` | Canonical origin for Stripe redirects and OG URLs | `https://estrevia.app` | Hardcoded for prod |

### Auth (Clerk)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Client-side Clerk key |
| `CLERK_SECRET_KEY` | Server-side Clerk key |
| `CLERK_WEBHOOK_SECRET` | svix signature secret for `/api/webhooks/clerk` — get from Clerk dashboard after creating webhook |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/chart` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/chart` |

### Payments (Stripe)

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server-side Stripe key — `sk_test_...` for Preview, `sk_live_...` for Production |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` — get after creating webhook endpoint in Stripe dashboard |
| `STRIPE_PRICE_ID_PRO_MONTHLY` | Price ID for $4.99/mo plan (`price_...`) |
| `STRIPE_PRICE_ID_PRO_ANNUAL` | Price ID for $34.99/yr plan (`price_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-side Stripe key |

### Redis (Upstash)

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | REST URL from Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | Bearer token from Upstash console |

> Rate limiting and VOC pre-warming both use this connection. EU region recommended (co-located with PostHog EU).

### Observability

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side Sentry DSN (visible in browser bundle — this is normal) |
| `SENTRY_DSN` | Server-side Sentry DSN — may be the same value |
| `SENTRY_AUTH_TOKEN` | Source map upload during CI build — from Sentry Settings → Auth Tokens |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project API key |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com` (EU region, GDPR) |

### AI / Generation

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key — used by Imagen 4 and Veo 3.1 Lite |

### Email

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key for transactional email |
| `RESEND_FROM` | Verified sender address, e.g. `hello@estrevia.app` |

### Web Push (optional — deferred to push notifications Phase 2)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | VAPID private key |
| `VAPID_SUBJECT` | `mailto:push@estrevia.app` |

---

## Phase 2: External Services Setup

### Clerk

1. Create application in **production mode** (not development).
2. Add webhook endpoint: `https://estrevia.app/api/webhooks/clerk`
3. Subscribe to events: `user.created`, `user.updated`, `user.deleted`
4. Copy the signing secret → `CLERK_WEBHOOK_SECRET`
5. Enable OAuth providers as desired (Google recommended).
6. Set localizations: English + Spanish (ES).
7. (Optional) Configure custom domain to remove `clerk.accounts.dev` from CSP.

### Stripe

1. Create two prices under one product ("Estrevia Pro"):
   - Monthly: $4.99/mo, 3-day free trial
   - Annual: $34.99/yr, 3-day free trial
2. Add webhook endpoint: `https://estrevia.app/api/webhooks/stripe`
3. Subscribe to events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.trial_will_end`
4. Copy signing secret (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`
5. Confirm webhook API version is pinned to `2025-03-31.basil` (Zone D P3-5).
6. In dunning settings: configure retry schedule to end in **"Cancel subscription"**, not "Mark as unpaid" (Zone D open question 2).
7. Use test-mode keys for Preview; live-mode keys for Production only.

### Neon Postgres

1. Create a production branch (separate from dev branch).
2. Run migrations in order against `DIRECT_URL`:
   ```bash
   npx drizzle-kit migrate
   ```
   This applies: `0000_huge_snowbird`, `0001_graceful_wolfpack` (processed_stripe_events), `0002_cascade_synastry_fks` (ON DELETE CASCADE fix).
3. Additionally run the idempotent usage-counters script:
   ```bash
   DATABASE_URL=$DIRECT_URL npx tsx scripts/apply-usage-counters-migration.ts
   ```
4. Verify tables present: `users`, `natal_charts`, `synastry_results`, `cosmic_passports`, `usage_counters`, `waitlist_entries`, `processed_stripe_events`, `tarot_readings`, `daily_cards`, `push_subscriptions`, `notification_preferences`.
5. Enable point-in-time recovery (PITR) on the production branch — required for DB rollback procedure (Phase 6).

### Upstash Redis

1. Create database in the **EU region** (Frankfurt / eu-west-1).
2. Set eviction policy: `allkeys-lru`.
3. Note: free tier is 10K commands/day — likely insufficient under launch traffic. Provision the Pay-as-you-Go plan.

### Sentry

1. Create project with **Next.js** template.
2. In project settings, set release tracking to use `VERCEL_GIT_COMMIT_SHA` (already wired in `sentry.*.config.ts` files via Zone J fix).
3. Confirm `SENTRY_AUTH_TOKEN` is set in Vercel environment (required for source map upload during build).
4. Create alert rules:

   | Condition | Action |
   |---|---|
   | New unhandled error (any) | Slack `#errors` immediately |
   | Error rate > 1% of requests over 5 min | Email + SMS on-call |
   | Error message contains `[health/sweph]` | Slack `#errors` immediately |
   | 5xx count > 5 in 60 seconds | Email + SMS on-call |
   | Error message contains `[stripe-webhook]` | Slack `#payments` |
   | Error message contains `[clerk-webhook]` | Slack `#auth` |

5. After first production deploy, trigger a test error and verify source maps resolve to original TypeScript.

### PostHog

1. Use EU cloud instance (`eu.i.posthog.com`).
2. `autocapture: false` is already set in code — leave it.
3. Create conversion funnels:
   - Viral loop: `chart_calculated` → `passport_created` → `passport_viewed` → `passport_cta_clicked` → `USER_SIGNED_UP`
   - Revenue: `landing_view` → `chart_calculated` → `USER_SIGNED_UP` → `SUBSCRIPTION_STARTED`
4. Create dashboards: daily active users, viral K-factor, revenue per user.
5. Verify `identifyUser()` is called on sign-in (wired via `AnalyticsIdentifier` component, Zone J).

### Vercel

1. Import repository, select **Next.js** preset.
2. Enable **Fluid Compute** (default on new projects).
3. Node.js runtime: **24 LTS**.
4. Regions: `iad1` (US East) + `cdg1` or `fra1` (EU) for dual-region coverage.
5. Custom domain: `estrevia.app` + `www.estrevia.app` (redirect www → apex).
6. Add all Phase 1 env vars to both **Preview** and **Production** environments.
7. Confirm `vercel.json` cron schedule is correct:
   - `notifications`: `0 0 * * *` (daily midnight UTC)
   - `prewarm-voc`: `0 0 * * *` (daily midnight UTC)
   - `cleanup-temp-charts`: `0 3 * * *` (daily 03:00 UTC)
8. Enable **Vercel Speed Insights** (Analytics tab) — free Core Web Vitals per route.
9. Set up uptime monitor on `/api/health` pinging every 5 minutes with alert on non-200.

---

## Phase 3: Pre-launch Gate Checklist

Run these in sequence against the Preview deployment URL before promoting to production.

### Build quality

- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — zero errors (the one known ESLint error in `tarot/page.tsx:71` must be fixed first; Zone V02 P0)
- [ ] `npm run test` — all 533 tests pass
- [ ] `npm run build` — completes without errors, generates 257+ static pages

### Functional smoke tests

- [ ] Landing page loads, no console errors
- [ ] Core Web Vitals in Vercel Speed Insights: LCP < 2.5s, CLS < 0.1 on `/`
- [ ] Calculate natal chart as anonymous user → chart renders with all 12 bodies
- [ ] Sign up as new user via Clerk
- [ ] Save chart — chart appears in chart list
- [ ] Upgrade via Stripe test card `4242 4242 4242 4242` → user status becomes Pro
- [ ] Synastry calculation works (logged-in free user gets 1/day limit)
- [ ] Synastry AI analysis accessible only to Pro user
- [ ] Tarot interpret accessible only to Pro user
- [ ] Cosmic Passport creates and renders at `/s/[id]` — OG image loads
- [ ] Share page visible without auth

### Auth & security

- [ ] Cron endpoints return 401 without `Authorization: Bearer <CRON_SECRET>` header
- [ ] Cron endpoints return 200 with correct header
- [ ] `DELETE /api/v1/user/account` removes user, all charts, synastry results, and usage counters (no FK violation — cascades verified by Zone C P0 fix)
- [ ] Webhook replay from Stripe CLI (`stripe trigger customer.subscription.created`) → user row updates to Pro
- [ ] Webhook replay from Clerk CLI → user row created in DB
- [ ] `/api/health` returns 200 with `sweph`, `db`, and `redis` all showing `ok`
- [ ] `/api/health/sweph` returns `{ status: "ok" }` with a valid Sun longitude

### Observability

- [ ] Trigger a test error in Preview → verify Sentry receives it with readable TypeScript source lines (not minified)
- [ ] Verify Sentry error shows `environment: production` (or `preview`) and a release tag matching the commit SHA
- [ ] Sign up in Preview → verify PostHog receives `USER_SIGNED_UP` event with a named user identity (not anonymous)
- [ ] Verify Vercel Analytics shows data in Speed Insights tab

### Performance & accessibility

- [ ] Lighthouse mobile on `/`: Performance >= 90, Accessibility >= 95
- [ ] Chart SVG has `aria-label` on each planet glyph (keyboard navigation test)
- [ ] Spanish locale renders when `NEXT_LOCALE=es` cookie is set

### Legal

- [ ] `/signs` and `/signs/[sign]` pages render `<Disclaimer />` (Zone 10 High-4)
- [ ] Tarot SVG assets at `/tarot/*.svg` are original illustrations — no Harris images (Zone 10 High-5)
- [ ] Footer on marketing pages includes a "Source code" link to the public GitHub repo (Zone 10 Medium-2, AGPL §13)

---

## Phase 4: Launch

- [ ] Merge to `main` — Vercel promotes the verified Preview build to Production automatically
- [ ] Verify `estrevia.app` serves HTTPS with correct SSL certificate (Vercel-managed)
- [ ] Confirm `www.estrevia.app` redirects to `estrevia.app`
- [ ] Run one complete transaction yourself (sign up → calculate chart → upgrade) on production
- [ ] Monitor Sentry for 30 minutes after deploy — watch for any new issues
- [ ] Verify cron jobs fire on next scheduled run (check Vercel → Functions → Cron logs)

---

## Phase 5: Post-launch Monitoring (first 72 hours)

| Metric | Target | Where |
|---|---|---|
| HTTP 5xx rate | < 1% of all requests | Sentry error rate alert |
| Stripe webhook success | 100% | Stripe Dashboard → Webhooks → Recent deliveries |
| Clerk webhook sync | No failures | Sentry `[clerk-webhook]` alerts |
| Daily cron executions | 3/day (`notifications`, `prewarm-voc`, `cleanup-temp-charts`) | Vercel → Functions → Cron |
| sweph health check | 200 every 5 min | Uptime monitor |
| Cosmic Passport conversion baseline | Record day-1 numbers | PostHog viral funnel |
| Temp chart cleanup cron | Runs at 03:00 UTC, deletes rows older than 7 days | Vercel cron logs + DB row count |

---

## Phase 6: Rollback Procedures

### Code rollback (fastest — seconds)

1. Open Vercel dashboard → Deployments.
2. Find the last known-good deployment.
3. Click **Promote to Production** (instant, no rebuild).

### Database rollback

1. Open Neon dashboard → Production branch → Point-in-time Restore.
2. Select a timestamp before the deploy.
3. Restore to a new branch first, verify data, then promote.
4. After DB rollback, also roll back the code (see above) to match schema expectations.

### Feature kill-switches

No feature flags framework is active at MVP. Emergency kill-switches available via env vars:

| Env var | Effect |
|---|---|
| Remove `GEMINI_API_KEY` | Avatar generation and AI tarot returns 503 |
| Set `STRIPE_SECRET_KEY` to an invalid value | Checkout sessions fail gracefully (existing Pro users unaffected) |
| Remove `UPSTASH_REDIS_REST_URL` | Rate limiting falls back to permissive default; VOC pre-warming fails silently |

### Payment incident

1. Open Stripe Dashboard → Developers → Webhooks → disable the endpoint.
2. The app will stop receiving subscription events. Existing Pro users keep access (no downgrade until `subscriptionExpiresAt` passes).
3. Fix the issue, re-enable webhook endpoint, replay missed events from Stripe dashboard.

### Sentry-detected crash loop

If error rate spikes above 5%:
1. Check Vercel Function logs for the failing route.
2. Roll back code (see above) if a regression is confirmed.
3. If sweph-specific: check `/api/health/sweph` — if it returns non-200, the native addon may not have loaded. Check Vercel build logs for `linux-x64` binary.

---

## Known Risks / Deferred Work

The items below were identified in audit reports as P2/P3 and intentionally deferred to Phase 2 post-launch.

| Item | Deferred from | Risk |
|---|---|---|
| PII encryption key versioning scheme — no `v1:` prefix means manual re-encryption on rotation | Zone C P1 | Low until first key rotation is needed |
| VOC month endpoint cold-start — ~132K sweph calls, may timeout on first uncached request | Zone A P0-2 | Medium; pre-warming cron mitigates partially |
| DST fall-back ambiguous birth time (CI test skipped) | Zone A P1-3 | Low; affects ~1 hour/year per timezone |
| TOCTOU race in `checkAndIncrementUsage` (synastry 1/day limit can become 2 under race) | Zone D P1-2 | Low; requires exact concurrent requests |
| `subscriptionStatus` defaults to `'active'` for new free users | Zone D P2-1 | Low; `isPremium()` checks tier, not status |
| `unpaid`/`incomplete` Stripe statuses not in DB enum | Zone D P2-2 | Low; maps to `canceled` in practice |
| PostHog `identifyUser()` never called (all sessions anonymous) — fixed by Zone J | Zone 9 Medium | Fixed |
| Support form always shows free-tier UI for Pro users in `(marketing)` layout | Zone V04 WARN-1 | Low cosmetic |
| No CAPTCHA / BotID on anonymous write endpoints | Zone 10 Note | Add Turnstile 4 weeks post-launch if abuse observed |
| Avatar generation returns base64 instead of Vercel Blob URL — >500KB response risk | Zone V02 P1 | Medium; defer until avatar feature goes to production |
| Notification cron is a stub — push notifications not implemented | Zone V02 P1 | Known; push notifications are Phase 2 |
| AAD (additional authenticated data) not set on AES-GCM encryption | Zone C P3 | Low; swap attack requires DB compromise first |
| Cookie consent decision has no 13-month TTL expiry | Zone 10 Medium | GDPR best practice; low enforcement risk at launch |
| `SortIndicator` component defined inside render body (React Compiler warning) | Zone V02 P1 | Performance; no correctness impact |
| CSP `report-uri` not configured — violations are silent | Zone 10 Low | Post-launch hardening |
