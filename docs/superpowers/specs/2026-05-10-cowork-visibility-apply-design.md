# Cowork Visibility Layer — Apply Session Design

> **Sub-project 2 of 3** in the cowork-followup brainstorm series (2026-05-10).
> Sub-project 1 (Stories re-seed) plan landed in commit `1fe4623`.
> Sub-project 3 (Phase 4 `ClaudeBrandVoiceClient`) follows.
>
> **Status:** Brainstorming complete. Implementation plan to be written via `superpowers:writing-plans` after spec approval.

## Goal

Apply the revised Patch 04 (`outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`, 991 lines) to land the cowork visibility layer: a read-only `/api/admin/advertising/status` endpoint, a `/api/admin/advertising/digest` endpoint, a shared digest builder + renderer pair, and a backward-compatible tier extension on `sendAlert()`. The patch is already verified line-by-line against current HEAD `1fe4623` (no code commits since the verification at HEAD `81aba89` — only docs/spec/plan).

The design itself is fixed in the patch document. This spec is the **apply-session strategy** — how to land the 991-line patch safely as 3 atomic commits with component-level TDD.

## Background

The cowork-followup session on 2026-05-10 produced `04-cowork-visibility-layer-revised.md` after parallel `Explore` sub-agents corrected every signature against HEAD `81aba89`. The document was committed at `dc80a45` but never applied. Three subsequent commits are docs-only (`7080d7d`, `1fe4623`, plus `dc80a45` itself), so the patch's `file:line` citations are still accurate at HEAD `1fe4623`.

## Architecture

```
Cowork (WebFetch, server-to-server)
                │
                ▼
          Bearer auth via ADVERTISING_STATUS_BEARER
                │
       ┌────────┴────────┐
       ▼                 ▼
GET /status         GET /digest?type=daily
       │                 │
       │                 ▼
       │     buildDigestData() (pure)
       │                 │
       │                 ▼
       │     formatMarkdown(report) → text/markdown
       │
       ▼
fetchMetaInsights + getReconState +
SELECT advertisingDecisions → JSON

                       ▲
                       │ shares the builder
                       │
            TelegramBot.sendDailyDigest()
            (push channel)
                       │
                       ▼
            formatTelegram(report) → Markdown
            sendAlert(..., { tier: 2 }) → suppressed
              when ADVERTISING_TIER2_VIA_DIGEST=true
```

## Components (transcribed from patch)

| # | Files | Lines (patch) | What lands |
|---|-------|--------------|-----------|
| 1 | `src/app/api/admin/advertising/status/route.ts` (new) | patch §Component 1, lines 60-417 | GET /status with 7 include branches; Bearer auth; aggregateSpend + aggregateFatigued helpers. |
| 2a | `src/modules/advertising/alerts/digest-builder.ts` (new) | patch §2a, lines 431-518 | Pure `buildDigestData()` — fetches Meta + decisions for today. |
| 2b | `src/modules/advertising/alerts/digest-renderers.ts` (new) | patch §2b, lines 520-624 | Pure `formatTelegram()` + `formatMarkdown()`. |
| 2c | `src/app/api/admin/advertising/digest/route.ts` (new) | patch §2c, lines 626-689 | GET /digest?type=daily. |
| 2d | `src/modules/advertising/alerts/telegram-bot.ts` (modify) | patch §2d, lines 691-768 | `sendDailyDigest()` calls builder + formatTelegram instead of inline markdown. Signature changes from `(report)` → `(report?)`. |
| 4  | `src/modules/advertising/alerts/telegram-bot.ts` (modify) | patch §Component 4, lines 808-885 | `sendAlert(severity, message)` → `sendAlert(severity, message, opts?: { tier?: 1\|2 })`. Returns `null` when `tier=2 && ADVERTISING_TIER2_VIA_DIGEST=true`. |
| env | `.env.example` (modify) | patch §Env additions, lines 888-907 | Add `ADVERTISING_STATUS_BEARER` + `ADVERTISING_TIER2_VIA_DIGEST=false`. |

## Commit sequence

**Three commits**, in strict order (B before C — both touch `telegram-bot.ts`):

```
A. feat(advertising/cowork): /status read-only endpoint
   ├─ src/app/api/admin/advertising/status/route.ts (new, ~280 lines)
   ├─ src/app/api/admin/advertising/status/__tests__/route.test.ts (new)
   ├─ .env.example (+ ADVERTISING_STATUS_BEARER line)
   └─ Tests: 9 cases (see TDD section).

B. feat(advertising/cowork): digest endpoint + builder/renderer refactor
   ├─ src/modules/advertising/alerts/digest-builder.ts (new)
   ├─ src/modules/advertising/alerts/digest-renderers.ts (new)
   ├─ src/app/api/admin/advertising/digest/route.ts (new)
   ├─ src/modules/advertising/alerts/telegram-bot.ts (sendDailyDigest refactor)
   ├─ src/modules/advertising/alerts/__tests__/digest-builder.test.ts (new)
   ├─ src/modules/advertising/alerts/__tests__/digest-renderers.test.ts (new)
   ├─ src/app/api/admin/advertising/digest/__tests__/route.test.ts (new)
   ├─ src/modules/advertising/alerts/__tests__/telegram-bot.test.ts (extend existing)
   └─ Tests: ~13 cases across 4 files.

C. feat(advertising/cowork): sendAlert tier extension
   ├─ src/modules/advertising/alerts/telegram-bot.ts (sendAlert refactor)
   ├─ src/modules/advertising/alerts/__tests__/telegram-bot.test.ts (extend existing)
   ├─ .env.example (+ ADVERTISING_TIER2_VIA_DIGEST line)
   └─ Tests: 3 cases.
```

**Why this order:** Component A is purely additive — no existing code touched, so it's the safest first ship. Component B refactors `sendDailyDigest()` at `telegram-bot.ts:112-158`. Component C refactors `sendAlert()` at `telegram-bot.ts:163-171`. C must follow B because the patch's line citations for C assume B has not yet shifted them; landing C first would force re-citation work for B.

## TDD strategy (component-level)

For each of the 3 commits, the cycle is:

1. **Write all tests for the component** in the dedicated test files (per patch §Tests).
2. **Run tests** — expect failures (functions/routes do not exist or signatures don't match new contract). This proves test wiring + mocks are correct.
3. **Paste implementation** verbatim from the patch.
4. **Run tests** — expect all pass.
5. **Run full advertising suite** — expect baseline-green (pre-existing 2 failures in `tests/middleware-auth.test.ts` + `tests/baselines/fe-baseline.spec.ts` are P2, unrelated).
6. **Run `npm run typecheck`** — expect 0 errors.
7. **Commit** with conventional scope `feat(advertising/cowork):`.

This is **one red→green cycle per commit**, not per test. Per the patch, the implementation is paste-ready — we're not iterating on the impl, we're transcribing it. The red→green at component level catches:
- Mock wiring errors (mocks not resolving the right module path)
- Schema column drift since patch authoring (mitigated by the patch's verification, but still worth catching)
- Type errors in the test file itself (e.g., wrong import path)

## Auth pattern

Both new endpoints (`/status`, `/digest`) use **identical Bearer-token auth** against `ADVERTISING_STATUS_BEARER`. The auth block is a 5-line preamble that's copy-pasted between the two route handlers — by design, per the patch. This is consistent with the project's existing pattern of admin endpoints; a shared helper is YAGNI until there's a third Bearer-auth endpoint.

Auth failure response shape:
```json
{ "error": "UNAUTHORIZED" }
```
with status 401, headers `Cache-Control: no-store, X-Robots-Tag: noindex`.

## Mock strategy

Both endpoints depend on `createMetaAdClient()` (reads `META_ACCESS_TOKEN`, network call to Meta Graph API). Tests must mock this entire module to keep tests offline.

Pattern matches existing tests in `scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts:8-14`:

```ts
vi.mock('@/modules/advertising/meta-graph-api', () => ({
  createMetaAdClient: vi.fn().mockReturnValue({ /* MetaInsightsApi shape */ }),
}));

vi.mock('@/modules/advertising/perceive', () => ({
  fetchMetaInsights: vi.fn().mockResolvedValue([] /* or fixture AdMetric[] */),
}));
```

DB tests mock `@/shared/lib/db` + `@/shared/lib/schema` per the established pattern.

## Type-import structure

`DailyDigestReport` stays in `telegram-bot.ts` (already exported there at line 43-51). Both new modules use `import type` to avoid runtime circular dependencies:

- `digest-builder.ts`: `import type { DailyDigestReport } from './telegram-bot';`
- `digest-renderers.ts`: `import type { DailyDigestReport } from './telegram-bot';`
- `telegram-bot.ts`: `import { buildDigestData } from './digest-builder';` + `import { formatTelegram } from './digest-renderers';`

The runtime dependency graph is one-way: `telegram-bot` depends on `digest-builder` + `digest-renderers`. Type-only imports in the reverse direction are erased by TypeScript's `verbatimModuleSyntax` and don't form a runtime cycle.

> **Out of scope:** Relocating `DailyDigestReport` to a dedicated `digest-types.ts` file. The current pattern works; moving it is cosmetic. Defer.

## Test cases (per component)

**Component A — `status.test.ts` (~9 cases):**
1. 401 when `Authorization` header missing.
2. 401 when header is malformed (`"Token xyz"` not `"Bearer xyz"`).
3. 401 when token doesn't match `ADVERTISING_STATUS_BEARER`.
4. 200 + correct top-level shape (`ts`, `since`) when authed with `include=spend`.
5. `include` filter — only requested branches populated.
6. `since` filter — `gte(timestamp, since)` bounds the decisions query.
7. `aggregateSpend()` correctness: empty input → zeros; weighted ctr/cpc/frequency math.
8. `aggregateFatigued()` correctness: only ads with weighted-mean freq > 2.5 surface; recommendation buckets at 3.0/3.5.
9. `include=brand_voice` returns the `not_implemented` stub; `include=reconciler` exposes `suspended`, `suspended_at`, `last_drift_pct` (no `last_run`).

**Component B — across 4 files (~14 cases):**

`digest-builder.test.ts` (3 cases):
1. Builds report with empty metrics — `spend_total_usd: 0`, `decisions: []`.
2. Decisions populated from DB rows mapped via `adId → ad_id`, `reasoningTier → reasoning_tier`.
3. `metricsSnapshot` correctly typed back into `AdMetric`.

`digest-renderers.test.ts` (4 cases):
1. `formatTelegram` regression-anchor: empty-decisions report renders the legacy "📊 *Advertising Daily Digest — date*" + "_No decisions taken today._" pattern.
2. `formatTelegram` with decisions: emoji icons, `\`{ad_id}\`` formatting, `*bold*`.
3. `formatMarkdown` produces CommonMark — `# heading`, `**bold**`, fenced lists.
4. Edge case: `founder_action_required` present/absent renders correctly in both flavors.

`digest/__tests__/route.test.ts` (4 cases — thin orchestration):
1. 401 when Bearer missing/wrong (same shape as /status auth tests).
2. 200 + `Content-Type: text/markdown; charset=utf-8` + body starts with `# Estrevia advertising — daily digest` when authed and `type=daily` (or default).
3. 501 + `NOT_IMPLEMENTED` JSON when `type=weekly`.
4. 400 + `INVALID_TYPE` JSON when `type=anything-else`.

`telegram-bot.test.ts` (3 new cases):
1. `sendDailyDigest()` (no-arg) calls `buildDigestData()` then `formatTelegram()`.
2. `sendDailyDigest(report)` (with arg) bypasses the builder.
3. Output of pre-built-report path matches `formatTelegram(report)` byte-for-byte.

**Component C — `telegram-bot.test.ts` (~3 new cases):**
1. `sendAlert(severity, message)` (two-arg) still works — defaults to tier 1, always sends.
2. `sendAlert(severity, message, { tier: 2 })` returns `null` when `process.env.ADVERTISING_TIER2_VIA_DIGEST === 'true'`.
3. `sendAlert(severity, message, { tier: 2 })` sends when the flag is unset or `'false'`.

## Pre-conditions

Before starting Commit A, verify:

1. **Working tree clean** on `main` (no uncommitted work).
2. **HEAD is `1fe4623`** or descendant (no force-pushes happened mid-session).
3. **Baseline test signal**: `npm test` produces the same 2 known failures from `.cowork-meta/phase1-verification-20260510T221911Z/01-summary.md` and nothing else.
4. **No concurrent edits** to `src/modules/advertising/alerts/telegram-bot.ts` — Components B and C both modify it; any concurrent change creates merge conflicts.
5. **`@vercel/blob` and other deps already installed** (no new deps in this patch).

## Operational follow-ups (out of scope for this apply session)

Per the patch's "Phasing recommendation" — these are NOT part of the apply session, they happen later:

1. **Generate the Bearer token** via `openssl rand -hex 32`, add to Vercel `production` env, mirror to Cowork's CLAUDE.md or scheduled-task memory. Founder action.
2. **Mark existing tier-2 alert call sites** with `{ tier: 2 }` — `grep -rn ".sendAlert(" src/modules/advertising/` reveals candidates per the patch §Component 4 Tier-2 table. Separate code-review session.
3. **Flip `ADVERTISING_TIER2_VIA_DIGEST=true`** in production env after 1-2 weeks of dual-channel verification.
4. **Cowork scheduled task** to fetch the daily digest at 9:00. Configured Cowork-side, not Estrevia-side.

All four are explicit founder/operational tasks. The apply session lands the **infrastructure** that makes them possible.

## Error handling (transcribed from patch)

| Failure | Detection | Response |
|---|---|---|
| Bearer token missing/wrong | Auth preamble in both routes | 401 JSON with `Cache-Control: no-store` |
| Meta API call fails inside `fetchMetaInsights` | Existing error path in `perceive/meta-insights.ts` | Propagates — route returns 500 (Next.js default). Acceptable; this is the existing behavior for any cron path that calls Meta. |
| Recon state read fails | Inside `getReconState()` | Propagates — same as above. |
| DB query fails | Inside Drizzle | Propagates — same as above. |
| `type=weekly` requested on `/digest` | Explicit check in route | 501 JSON `NOT_IMPLEMENTED` |
| `type` is neither daily nor weekly | Explicit check | 400 JSON `INVALID_TYPE` |
| Caller passes `tier: 2` but `ADVERTISING_TIER2_VIA_DIGEST=true` | Inside `sendAlert` | Returns `null` instead of `TelegramMessage`. Callers that ignore return value are unaffected. |

## Halt criteria

Halt the plan and write a checkpoint under `.cowork-meta/cowork-visibility-apply-<TIMESTAMP>/` if:

- **Schema drift discovered**: A column or function the patch references no longer exists at HEAD (e.g., `advertisingDecisions.timestamp` renamed). Likely cause: an unmentioned commit landed since `1fe4623`. Re-verify and update the spec.
- **Test mock wiring fails**: `vi.mock()` cannot resolve a target module (path renamed, default export removed). Investigate the import path before pasting implementation.
- **New full-test-suite failures beyond the known P2 baseline** (`middleware-auth.test.ts` + `baselines/fe-baseline.spec.ts`). Likely cause: our code introduced a regression; revert the failing component's commit and fix.
- **Type error in patch's pasted code**: TypeScript catches a contract mismatch the patch missed. Likely cause: an untyped-`any` slipped through manual verification. Fix inline and note in commit body.
- **`createMetaAdClient()` signature has changed** since verification. Stops all 3 components — the mock setup is shared.

## Risk + effort

- **Component A** (status route): ~3h. New endpoint, no refactor of existing code. Lowest risk.
- **Component B** (digest refactor): ~3h. Adds 3 files + refactors `sendDailyDigest()`. Risk = the regression-anchor test (`formatTelegram` byte-for-byte match against the legacy inline output). If that test fails, the renderer extraction broke a Telegram surface.
- **Component C** (sendAlert tier): ~1h. Backward-compatible by design; default `tier=1` preserves all existing callers.
- **Total**: ~7h wall-clock for code + tests.

Risk profile: low.
- Both endpoints are pure reads — no DB writes, no Meta mutations.
- Default `ADVERTISING_TIER2_VIA_DIGEST=false` means Telegram behavior is unchanged after Commit C.
- Bearer token is unset by default until the founder generates one; routes return 401 to every request until then.

## Out of scope

- **Mutations via the new endpoints.** Cowork is read-only per the patch.
- **Stripe / PostHog attribution wiring** for the `conversions / cpl_blended_usd` fields. Noted in patch comment but deferred.
- **Account-status pull endpoint.** Patch uses `AdMetric.status` as a proxy.
- **Audience read API.** Patch surfaces `not_implemented` stub.
- **Brand-voice persistence.** Sub-project 3 (Phase 4 `ClaudeBrandVoiceClient`).
- **Cowork scheduled task** — Cowork-side configuration, not Estrevia-side.
- **Marking tier-2 call sites or flipping the env flag** — operational, post-apply.
- **PR creation** — repo uses direct-to-main per CLAUDE.md.
