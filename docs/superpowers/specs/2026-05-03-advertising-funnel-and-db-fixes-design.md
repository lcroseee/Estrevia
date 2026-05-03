# Advertising agent — funnel instrumentation + null DB fixes

**Date:** 2026-05-03
**Author:** brainstorming session (founder + assistant)
**Scope:** two related fixes for the autonomous advertising agent live in prod (commit `6c49493`).
**Status:** approved for plan-writing.

---

## Context

The autonomous advertising agent (`src/modules/advertising/`) shipped to production on 2026-05-03 with `ADVERTISING_AGENT_ENABLED=true`, `ADVERTISING_AGENT_DRY_RUN=false`. First successful boevoi cron run at `16:18:34Z` returned `metrics_fetched=21, decisions_made=21, pause_decisions=0`. Two known issues remain that this spec addresses:

### Problem 1 — PostHog funnel events not instrumented

`src/modules/advertising/posthog/funnel-client.ts:20-27` queries 6 events:
`landing_view, chart_calculated, passport_shared, user_registered, paywall_view, subscription_started`.

Audit of the codebase shows:

| Agent expectation | Actually fired in code |
|---|---|
| `landing_view` | nowhere |
| `chart_calculated` | `BirthDataForm.tsx:125` ✓ |
| `passport_shared` | `PASSPORT_RESHARED` fires on every share (`ShareButton.tsx:74,95,207,226,245`) — semantically 1:1 but different name |
| `user_registered` | `USER_SIGNED_UP` defined in `analytics.ts:145` enum but never called anywhere in code |
| `paywall_view` | `PAYWALL_OPENED` (`PaywallModal.tsx:48`) — semantically 1:1 |
| `subscription_started` | nowhere |

Result: `triage-daily/route.ts:90` calls `reconcile(metrics, funnelSnapshot, { alertBot })`, which compares Meta clicks vs PostHog `landing_view` count. Since landings is always 0, `delta_pct=100%` triggers `critical_drift` Telegram alert on every daily cron run. Funnel digest shows 5 zeroes.

### Problem 2 — null DB clients crash spend-cap and decision-log

DI factories return `null as any`:

- `triage-hourly/route.ts:154-165` — `buildDecisionDb()`, `buildSpendCapDb()`
- `triage-daily/route.ts:263-273` — same
- `retro-weekly/route.ts:251-266` — `buildGatesDb()` returns no-op stub

When `pause()`/`scale()`/`duplicate()` runs, `spend-cap.ts:104` calls `await deps.db.select().from(table).where(...)` → `TypeError: Cannot read properties of null (reading 'select')`. Same for `audit/decision-log.ts` writing to `decisionDb`. Tests pass because they `vi.mock` the entire pause/scale/duplicate functions.

Currently latent — Tier 1 thresholds did not trigger pause on day-1 fresh creatives. First Tier-1 pause attempt will crash the cron.

---

## Goals

1. Eliminate the `critical_drift` Telegram alert by populating real funnel data.
2. Wire real Drizzle DB clients into the cron pipeline so spend-cap enforcement and decision audit log write actual rows.

## Non-goals

- Refactoring webhook handlers beyond the minimal hooks needed for event firing.
- Building a DAO abstraction layer over Drizzle (deferred — direct injection is sufficient now).
- Fixing the pre-existing `triggeredHalt` regression in `spend-cap.ts:122-138` (see Known Issues).
- E2E tests for funnel events end-to-end through PostHog (covered by manual verification post-deploy).

---

## Architecture

```
┌─ Fix #1: Funnel events ──────────────────────────────┐
│  Marketing landing page  ─trackEvent('landing_view')──┐
│  Clerk webhook user.created  ─trackServerEvent('user_registered')─┤
│  Stripe webhook subscription.created ─trackServerEvent('subscription_started')─┤
│                                                       ▼
│  PostHog cloud  ◀─────────────────────────────────────┐
│       │ HogQL query                                   │
│       ▼                                               │
│  funnel-client.ts (canonical-name mapping for         │
│   passport_shared/paywall_view → real names)          │
│       │                                               │
│       ▼                                               │
│  triage-daily → reconcile() → daily digest            │
└───────────────────────────────────────────────────────┘

┌─ Fix #2: DB wiring ──────────────────────────────────┐
│  src/shared/lib/db.ts → getDb() (existing)            │
│       │                                               │
│       ▼                                               │
│  triage-hourly → buildSpendCapDb()/buildDecisionDb() → getDb()
│  triage-daily  → same                                 │
│  retro-weekly  → buildGatesDb() → getDb()             │
│                                                       │
│  spend-cap.ts:104  → deps.db.select(...) works        │
│  decision-log.ts   → deps.db.insert(...) works        │
│  feature-gates.ts  → real reads/writes                │
└───────────────────────────────────────────────────────┘
```

No new modules. All changes are inline in existing files.

---

## Components

### Fix #1: Funnel events (Variant D — instrument missing 3, map existing 2)

| # | File | Change |
|---|---|---|
| 1.1 | `src/shared/lib/analytics.ts` | Add to `AnalyticsEvent` enum: `LANDING_VIEW = 'landing_view'`, `USER_REGISTERED = 'user_registered'`, `SUBSCRIPTION_STARTED = 'subscription_started'`. |
| 1.2 | `src/app/[locale]/(marketing)/page.tsx` (+ new `<LandingViewTracker>` Client Component) | New tracker component with `useEffect(() => trackEvent('landing_view', { locale }), [])`. Imported into marketing landing page. Fires once per mount. |
| 1.3 | `src/app/api/webhooks/clerk/route.ts` (handler around line 81 `if (eventType === 'user.created')`) | After successful `users` table insert: `trackServerEvent(userId, 'user_registered', { source: 'clerk_webhook', email_domain })`. Idempotency via PostHog `$insert_id = userId + ':user_registered'`. Wrap in try/catch — never block 200 response. |
| 1.4 | `src/app/api/webhooks/stripe/route.ts` (handler around line 165 `customer.subscription.created` / `checkout.session.completed` with `mode === 'subscription'`) | After successful `users.tier='pro'` update: `trackServerEvent(userId, 'subscription_started', { plan, amount_usd, currency, utm_source, utm_content, utm_campaign })`. Idempotency via `$insert_id = subscription.id + ':subscription_started'`. Wrap in try/catch. |
| 1.5 | `src/modules/advertising/posthog/funnel-client.ts:20-27` | Replace flat `FUNNEL_EVENTS` array with mapping `{ canonical_name, query_name }`. HogQL queries the real names; result post-processing emits canonical names in `FunnelSnapshot.steps[].event_name`. Mapping: `passport_shared → passport_reshared`, `paywall_view → paywall_opened`. Other 4 are 1:1. |

### Fix #2: DB wiring

| # | File | Change |
|---|---|---|
| 2.1 | `src/app/api/cron/advertising/triage-hourly/route.ts:154-165` | Import `getDb` from `@/shared/lib/db`. Both `buildDecisionDb()` and `buildSpendCapDb()` → `return getDb()`. Remove `null as any` and eslint-disable comments. |
| 2.2 | `src/app/api/cron/advertising/triage-daily/route.ts:263-273` | Same as 2.1. |
| 2.3 | `src/app/api/cron/advertising/retro-weekly/route.ts:251-266` | Import `getDb`. `buildGatesDb()` → `return getDb()`. Remove no-op stub. |

---

## Data flow

### `landing_view` (Fix #1.2)
Browser loads `/` or `/es/` → React mounts → `<LandingViewTracker>` `useEffect` → `posthog.capture('landing_view', { locale })`. PostHog SDK respects cookie consent (no consent → no event, GDPR-compliant).

**Edge — SSR:** marketing page is a Server Component. `trackEvent` early-returns server-side (`typeof window === 'undefined'`). Tracker must be `'use client'` Client Component imported into the SC page. Standard Next.js App Router pattern.

### `user_registered` (Fix #1.3)
Clerk dispatches `user.created` → POST `/api/webhooks/clerk` → `verifyWebhook` → handler inserts into `users` table → conditional: if insert created a new row (new user) → `trackServerEvent(userId, 'user_registered', {...})` → posthog-node `capture()` + `waitUntil(shutdown())`.

**Edge — webhook retries:** Clerk retries on non-200. Idempotency via PostHog `$insert_id` prop (deterministic hash of `userId + event_name`) — PostHog dedupes server-side. Plus: fire only if DB insert created new row (check via `result.rowCount === 1` or equivalent return shape). If existing handler doesn't expose this cleanly, rely on `$insert_id` dedup alone.

### `subscription_started` (Fix #1.4)
Stripe webhook `customer.subscription.created` (or `checkout.session.completed` with `mode === 'subscription'`) → handler reads `subscription.metadata.user_id`, `metadata.utm_*` → after successful `users.tier='pro'` update (only on real `free → pro` transition) → `trackServerEvent(userId, 'subscription_started', { plan, amount_usd, currency, utm_source, utm_content, utm_campaign })`.

**Edge — Stripe retries:** same `$insert_id = subscription.id + ':subscription_started'` dedup.

### `passport_shared` / `paywall_view` (Fix #1.5)
Not new firings. Query mapping in funnel-client. HogQL collects array of real names; result mapped back to canonical names in `FunnelSnapshot.steps[].event_name`. Reconciler operates on canonical names — unchanged downstream.

### Spend cap DB (Fix #2.1, 2.2)
Cron triggered → `buildSpendCapDb() → getDb()` (lazy singleton, Neon connection initialized on first use in invocation) → `pause()` calls `checkSpendCap(plannedDelta, deps)` → `deps.db.select().from(advertisingSpendDaily).where(eq(table.date, today))` → real Neon query → `dbSpentUsd = row?.spentUsd ?? 0` → upsert spend → if cap exceeded → Telegram alert → return `{ allowed: false }`.

**Edge — cold start latency:** `getDb()` lazy-init adds ~50-200ms on first Neon connection per invocation. Acceptable for cron (out of user path). No timeout changes needed.

### Decision log (Fix #2.1, 2.2)
After Meta API call (success or failure) → `logDecision(decision, applied, { metaResponse, error, db: deps.decisionDb })` → `deps.db.insert(advertisingDecisions).values({...})` with nanoid id, snapshot, applied flag. Append-only audit trail.

### Feature gates (Fix #2.3)
`retro-weekly/route.ts:48` → `buildGatesDb() → getDb()` → `evaluateGates(metrics, db)` reads `advertisingFeatureGates` → checks `activation_criteria` → updates `mode` field. Currently no-op (returns `[]`); after fix performs real reads/writes. Empty table on first run is safe — `evaluateGates` returns `[]` on no rows (verified in `feature-gates.ts:215`).

---

## Error handling

### Fix #1
All three new firings are non-blocking. Principle: PostHog upset → log warn, do not propagate.

| Site | On PostHog error |
|---|---|
| `LandingViewTracker` (client) | `posthog-js.capture()` swallows errors internally. No throw. |
| Clerk webhook (server) | `try { trackServerEvent(...) } catch (err) { console.warn(...); Sentry.captureException(err, { tags: { posthog: 'degraded' } }) }`. Webhook returns 200 regardless (Clerk retries on non-200 → would dupe). |
| Stripe webhook (server) | Same. |

**Idempotency:** PostHog `$insert_id` set on every server-side firing. Dedup happens server-side at PostHog. No coordination needed.

### Fix #1.5
If HogQL returns a real-name event not in the canonical map → fallback to real name + warn log. Defensive against future regressions.

### Fix #2
| Scenario | Behavior |
|---|---|
| `getDb()` called without `DATABASE_URL` | `neon()` throws → `pause()`/`scale()` catches → triage-hourly returns 500, triage-daily catches per-decision. Sentry. |
| Neon connection timeout | Drizzle throws → same path. Cron retries on next schedule (hourly = fast recovery). |
| `advertisingSpendDaily` row absent on date | `dbRows[0]?.spentUsd ?? 0` → normal path. Upsert creates row. |
| Concurrent cron invocations (manual + scheduled overlap) | Drizzle `onConflictDoUpdate` — atomic. Last-write-wins on spentUsd. Acceptable: spend monotonically increases within day; <1 cron tick of skew. |
| `advertisingDecisions` insert primary key collision | nanoid → near-zero collision probability. If ever hit, Drizzle throws unique constraint → caught by pause() → Sentry. Very rare. |

**Sentry tags:** add `db_layer: 'drizzle'` and `cron_route: '<route>'` to all `pause`/`scale`/`duplicate` Sentry captures. Existing tags `cron: true, route: ...` remain.

---

## Testing strategy

### Fix #1
- **1.1 enum changes:** no test (3 string constants).
- **1.2 `<LandingViewTracker>`:** RTL test — render with `<IntlProvider locale="en">` and `locale="es"`, verify `trackEvent` called once with correct args.
- **1.3 Clerk webhook:** add test case in `src/app/api/webhooks/clerk/__tests__/` (create file if absent) — `user.created` event → `trackServerEvent` mock called once with `user_registered`. Idempotency case: existing user → `trackServerEvent` not called (or PostHog `$insert_id` set correctly — depending on guard chosen).
- **1.4 Stripe webhook:** same approach. Test cases: new subscription → fires; existing subscription update → does not fire; UTM fields propagate correctly.
- **1.5 funnel-client mapping:** extend `src/modules/advertising/posthog/__tests__/funnel-client.test.ts` — mock HogQL response with real-name events (`passport_reshared`, `paywall_opened`), assert `FunnelSnapshot.steps` uses canonical names (`passport_shared`, `paywall_view`) with correct counts.

### Fix #2
- **2.1 / 2.2 / 2.3 cron route factories:** existing `cron-handlers.test.ts` mocks `pause/scale/duplicate` wholesale, so DB never actually called → tests pass without modification.
- **NEW integration test in `cron-handlers.test.ts`:** one case that does NOT mock `pause()` but mocks `@/shared/lib/db` (`vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDrizzleDb }))`). Verify `checkSpendCap` calls `mockDrizzleDb.select(...)` and `.insert(...)`. This is the missing test that would have caught the null-DB bug. Critical — root cause.

### E2E — none
After deploy, manual `vercel crons run /api/cron/advertising/triage-hourly` + log inspection. Already-proven workflow.

### Pre-deploy gate
- `npm run typecheck` — clean
- `npx vitest run src/modules/advertising src/app/api/cron/advertising src/app/api/webhooks` — all passing
- `npm run lint` — no new errors in advertising scope (785 pre-existing baseline)

---

## Known issues (out of scope)

- **`spend-cap.ts:122-138` triggeredHalt regression:** upsert unconditionally sets `triggeredHalt: !allowed`. If cap was triggered earlier in the day (`triggeredHalt=true`), a later allowed=true call resets it to `false`, losing the daily-halt signal. Separate semantic bug — fix in follow-up.
- **`USER_SIGNED_UP` in `analytics.ts:145` enum but never fired:** legacy artifact. Not removing in this spec to minimize blast radius. Can be cleaned up later.
- **Funnel `chart_calculated` is the only event currently meeting reconciler expectations:** after this fix, all 6 will populate. Reconciler `THRESHOLD_CRITICAL = 0.25` may need re-tuning once real data arrives — out of scope here.

---

## File-by-file change list (final)

```
M  src/shared/lib/analytics.ts                                               (3 enum entries)
M  src/app/[locale]/(marketing)/page.tsx                                    (import + render LandingViewTracker)
A  src/app/[locale]/(marketing)/LandingViewTracker.tsx                       (new client component)
M  src/app/api/webhooks/clerk/route.ts                                       (trackServerEvent on user.created)
M  src/app/api/webhooks/stripe/route.ts                                      (trackServerEvent on subscription.created)
M  src/modules/advertising/posthog/funnel-client.ts                          (canonical mapping)
M  src/modules/advertising/posthog/__tests__/funnel-client.test.ts           (mapping test)
A  src/app/api/webhooks/clerk/__tests__/route.test.ts                        (if absent — minimal new tests)
M  src/app/api/webhooks/stripe/__tests__/route.test.ts                       (extend if exists)
M  src/app/api/cron/advertising/triage-hourly/route.ts                       (getDb in factories)
M  src/app/api/cron/advertising/triage-daily/route.ts                        (getDb in factories)
M  src/app/api/cron/advertising/retro-weekly/route.ts                        (getDb in factory)
M  src/app/api/cron/advertising/__tests__/cron-handlers.test.ts              (new integration test)
```

13 files. ~200 lines added, ~30 removed.

---

## Approval

Approved by founder via brainstorming session 2026-05-03. Sections 1-5 (architecture, components, data flow, error handling, testing) approved sequentially. Ready for plan-writing.
