# Brand Voice Scorer (Phase 4) Design

> **Sub-project 3 of 3** in the cowork-followup brainstorm series (2026-05-10).
> Sub-project 1 (Stories re-seed) plan landed in commit `1fe4623`.
> Sub-project 2 (Patch 04 apply) plan landed in commit `d6ebcd8`.

## Goal

End-to-end real brand-voice scoring: replace the hardcoded mock at `src/app/api/cron/advertising/retro-weekly/route.ts:270-283` with a real `ClaudeBrandVoiceClient`, persist scores in a new `advertising_brand_voice_scores` table, and update the `/status?include=brand_voice` reader (created in Sub-project 2 Commit A) to return the latest run.

After this sub-project ships and the founder flips `BRAND_VOICE_SCORER_ENABLED=true`, Cowork's `WebFetch /status?include=brand_voice` returns real scores from the most recent weekly retro run.

## Background

At HEAD `1fe4623`:

- **Type:** `BrandVoiceScore` exists at `src/shared/types/advertising/decide.ts:47-56` (immutable contract).
- **Audit orchestrator:** `auditTopCreatives()` exists at `src/modules/advertising/decide/brand-voice-audit.ts:92-128`. Picks top 10 by `spend_usd`, calls injected `ClaudeClientForBrandVoice.brandVoiceScore(adId, copy)` per creative, applies thresholds (`overall < 7.5` OR any dimension `< 6` → `needs_review=true`).
- **Mock:** `buildClaudeForBrandVoice()` at `retro-weekly/route.ts:270-283` returns hardcoded `{ depth: 7, scientific: 7, respectful: 8, no_manipulation: true, overall: 7.6 }` for any input.
- **No persistence:** `BrandVoiceScore[]` flows transiently — `auditTopCreatives` → `retro-weekly` route → `TelegramBot.sendDailyDigest(report.brand_voice_scores?)`. After the cron run completes, the data is gone.
- **`/status?include=brand_voice`:** Sub-project 2 ships this with a `{ status: 'not_implemented' }` stub. Sub-project 3 fills it in.
- **Existing pattern to mirror:** `ClaudeSafetyClient` at `src/modules/advertising/creative-gen/clients/claude-safety-client.ts` (60 lines, raw `fetch` to `api.anthropic.com/v1/messages`, model `claude-haiku-4-5`, deps-injected API key + fetch).
- **Env:** `ANTHROPIC_API_KEY` already in `.env.example:53`. No new infrastructure needed for Component A.

The handoff at `outputs/cowork-handoff-2026-05-10/06-next-claude-code-session.md:326-400` was a stretch-goal stub; this spec supersedes it.

## Architecture

```
weekly retro-cron (Vercel scheduler, cron in vercel.json)
                │
                ▼
src/app/api/cron/advertising/retro-weekly/route.ts
                │
                ├─ buildClaudeForBrandVoice() → ClaudeBrandVoiceClient  (Component A)
                │                                       │
                │                                       ▼
                │                              api.anthropic.com/v1/messages
                │                                       │
                │                                       ▼
                │                              JSON {depth, scientific, respectful, no_manipulation}
                │                              + computeWeightedOverall() in client
                │                                       │
                │                                       ▼
                ▼                              ClaudeClientForBrandVoice contract
auditTopCreatives(creatives, client) → BrandVoiceScore[]
                │
                ▼
       (NEW) saveBrandVoiceScores(scores) → INSERT into
              advertising_brand_voice_scores  (Component B)
                │   ┌──── INSERT one row per creative, all share run_id ─────┐
                │   │                                                         │
                │   ▼                                                         │
                │   advertising_brand_voice_scores
                │   (id, run_id, ad_id, depth, scientific, respectful,
                │    no_manipulation, overall, needs_review,
                │    reviewed_by_claude_at, created_at)
                │
                ▼
       sendDailyDigest(report) — unchanged push channel

                                 ┌── pull channel ──┐
                                 │                  │
                                 ▼                  │
Cowork WebFetch /api/admin/advertising/status?include=brand_voice
                                 │                  │
                                 ▼                  │
                       (NEW) getLatestBrandVoiceRun() — reads scores
                       grouped by run_id where reviewed_by_claude_at = max
                                 │                  │
                                 ▼                  │
                       { status: "ok",              │
                         run_id, reviewed_at,       │
                         scores: [...],             │
                         flagged_count } ─ Component C
```

## Components & commit sequence

Three commits, in order. Components A and B are independent; Component C depends on Sub-project 2 Commit A having landed (because it modifies the `/status` route created there).

```
A. feat(advertising/clients): real ClaudeBrandVoiceClient
   ├─ src/modules/advertising/creative-gen/clients/claude-brand-voice-client.ts (new)
   ├─ src/modules/advertising/creative-gen/clients/__tests__/claude-brand-voice-client.test.ts (new)
   ├─ src/modules/advertising/creative-gen/clients/index.ts (extend export)
   └─ Tests: ~7 cases (system prompt content, happy path, malformed JSON, HTTP errors).

B. feat(advertising/storage): advertising_brand_voice_scores table + helpers
   ├─ src/shared/lib/schema.ts (add advertisingBrandVoiceScores)
   ├─ drizzle/<NNNN>_brand_voice_scores.sql (auto-generated migration)
   ├─ src/modules/advertising/decide/brand-voice-store.ts (new — saveBrandVoiceScores + getLatestBrandVoiceRun)
   ├─ src/modules/advertising/decide/__tests__/brand-voice-store.test.ts (new)
   └─ Tests: ~5 cases (save with run_id grouping, getLatest returns latest run, empty DB returns null, idempotency).

C. feat(advertising/cowork): wire brand voice scorer + /status reader
   ├─ src/app/api/cron/advertising/retro-weekly/route.ts (replace mock + add saveBrandVoiceScores call + env-gate)
   ├─ src/app/api/admin/advertising/status/route.ts (replace not_implemented stub with getLatestBrandVoiceRun read)
   ├─ src/app/api/admin/advertising/status/__tests__/route.test.ts (extend with brand_voice cases)
   ├─ src/app/api/cron/advertising/__tests__/retro-weekly-brand-voice.test.ts (new — env-gate behavior)
   ├─ .env.example (add BRAND_VOICE_SCORER_ENABLED=false)
   └─ Tests: ~6 cases (env-gate on/off, save called, reader returns latest, reader returns no_data when empty).
```

**Why this order:** A is a leaf component (no DB, no orchestrator changes). B adds the schema + helpers — independent of A. C wires both into existing orchestration paths (cron + /status). C can't land first because it imports from A and B. A vs B order is interchangeable but A-first matches the handoff's Step 4.1 framing.

## Component A — `ClaudeBrandVoiceClient`

**File:** `src/modules/advertising/creative-gen/clients/claude-brand-voice-client.ts` (new)

**Pattern:** Mirror `ClaudeSafetyClient` exactly — same constructor shape (deps with `anthropicApiKey` + optional `fetch`), same model (`claude-haiku-4-5`), same error handling (any failure → fail-shut response).

**Public interface (matches `ClaudeClientForBrandVoice` in `brand-voice-audit.ts:28-36`):**

```ts
export interface ClaudeBrandVoiceClientDeps {
  anthropicApiKey: string;
  fetch?: typeof fetch;
}

export class ClaudeBrandVoiceClient implements ClaudeClientForBrandVoice {
  constructor(deps: ClaudeBrandVoiceClientDeps);
  brandVoiceScore(adId: string, copy: string): Promise<{
    depth: number;
    scientific: number;
    respectful: number;
    no_manipulation: boolean;
    overall: number;
  }>;
}
```

**System prompt (final draft — engineer may polish minor wording during implementation):**

```
You are auditing Estrevia advertising copy for Brand Guidelines adherence.

Estrevia is a sidereal astrology PWA (Lahiri ayanamsa) emphasizing precision,
reflection, and education — not horoscopes, fortune-telling, or mysticism.

Score the given ad copy on four dimensions:

1. depth (1-10 integer): Beyond surface clichés.
   1 = fluff phrases ("cosmic dance", "stars whisper", "celestial tapestry").
   10 = concrete, specific, anchored in astronomical or astrological mechanics.

2. scientific (1-10 integer): Rigorous framing.
   1 = mystical/magical claims, predictions, fortune-telling language.
   10 = treats astrology as a reflection tool; precise terms like "sidereal",
        "ayanamsa", "ephemeris" used correctly.

3. respectful (1-10 integer): Treats reader as capable adult.
   1 = patronizing, manipulative, or apologetic ("some believe", "according
       to astrologers", "whether you believe").
   10 = direct, second-person, present-tense, assumes intelligence.

4. no_manipulation (boolean): false if the copy uses urgency, scarcity,
   false personalization, implied predictions, or sun-sign generalizations
   ("Geminis are talkative"). true otherwise.

Hard rules — any violation forces no_manipulation=false:
- NO predictions ("you will...", "this week brings...")
- NO sun-sign claims ("Aries do X", "Geminis are Y")
- NO mocking tropical astrology
- NO apologizing language ("some believe", "whether you believe")
- Title Case sparingly (proper names + start of sentences only)

Respond with JSON only — no preamble, no markdown fences, no trailing text:
{"depth": <int>, "scientific": <int>, "respectful": <int>, "no_manipulation": <bool>}

Do NOT include "overall" — it is computed by the caller.
```

**Request shape (POST to `https://api.anthropic.com/v1/messages`):**

```ts
{
  model: 'claude-haiku-4-5',
  max_tokens: 150,
  system: SYSTEM_PROMPT,           // the block above as a constant
  messages: [{ role: 'user', content: `Ad ${adId} copy:\n\n${copy}` }],
}
```

**Response parsing:**

1. Extract `data.content[0].text`.
2. Regex-match the first `{ ... }` block (defensive against any preamble Claude might add despite "no preamble" instruction).
3. `JSON.parse()` the match.
4. Validate field types: `depth`/`scientific`/`respectful` are numbers in [0, 10], `no_manipulation` is boolean. Any field missing/wrong-typed → fail-shut response.
5. Compute `overall` via `computeWeightedOverall(depth, scientific, respectful, no_manipulation)` imported from `decide/brand-voice-audit.ts`.

**Fail-shut response** (HTTP error, parse error, type error, network error):

```ts
{ depth: 0, scientific: 0, respectful: 0, no_manipulation: false, overall: 0 }
```

Rationale: `auditTopCreatives()` computes `needs_review = (overall < 7.5 || any_dim < 6)`. With all zeros, `needs_review` is forced to `true` — the creative is flagged for founder review. This matches `ClaudeSafetyClient`'s `{ passed: false, reason: 'INVALID_LLM_RESPONSE' }` pattern.

**Tests** (`__tests__/claude-brand-voice-client.test.ts`, ~7 cases):

1. **Request shape — system prompt content.** Stub `fetch`; assert the request body's `system` field contains key tokens: `'cosmic dance'`, `'sidereal'`, `'no_manipulation'`, `'JSON only'`.
2. **Request shape — model + max_tokens.** Assert `model: 'claude-haiku-4-5'`, `max_tokens: 150`.
3. **Happy path — valid JSON.** Stub Claude response with `{depth: 8, scientific: 7, respectful: 9, no_manipulation: true}`. Assert client returns the same plus `overall = 8*0.3 + 7*0.3 + 9*0.3 + 1 = 8.2`.
4. **HTTP error (4xx/5xx).** Stub `response.status: 500`. Assert fail-shut zeros + `overall: 0`.
5. **Malformed JSON.** Stub `data.content[0].text = "totally not json"`. Assert fail-shut.
6. **Missing field.** Stub response with `{depth: 8, scientific: 7}` (missing two). Assert fail-shut.
7. **Network exception.** Stub `fetch` to throw. Assert fail-shut (no propagation).

**Export update:** Add `export { ClaudeBrandVoiceClient } from './claude-brand-voice-client';` to `src/modules/advertising/creative-gen/clients/index.ts`.

## Component B — Storage

**Schema (Drizzle table) added to `src/shared/lib/schema.ts`:**

```ts
export const advertisingBrandVoiceScores = pgTable('advertising_brand_voice_scores', {
  id: text('id').primaryKey(),                       // nanoid
  runId: text('run_id').notNull(),                   // nanoid — groups all rows from one audit run
  adId: text('ad_id').notNull(),
  depth: real('depth').notNull(),
  scientific: real('scientific').notNull(),
  respectful: real('respectful').notNull(),
  noManipulation: boolean('no_manipulation').notNull(),
  overall: real('overall').notNull(),
  needsReview: boolean('needs_review').notNull(),
  reviewedByClaudeAt: timestamp('reviewed_by_claude_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('abv_run_id_idx').on(table.runId),
  index('abv_reviewed_at_idx').on(table.reviewedByClaudeAt),
]);
```

**Migration:** Generated via `npm run db:generate` (Drizzle Kit). Produces `drizzle/<NNNN>_<auto-name>.sql`. Founder applies via `npm run db:migrate` post-deploy.

**Helper module `src/modules/advertising/decide/brand-voice-store.ts` (new):**

```ts
import { nanoid } from 'nanoid';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingBrandVoiceScores } from '@/shared/lib/schema';
import type { BrandVoiceScore } from '@/shared/types/advertising';

export interface BrandVoiceRun {
  run_id: string;
  reviewed_at: Date;
  scores: BrandVoiceScore[];
}

/**
 * Persists a batch of BrandVoiceScore[] as one run.
 *
 * Returns the generated run_id and how many rows were inserted.
 * Empty input is a no-op (no row inserted, run_id still generated for
 * caller logging).
 */
export async function saveBrandVoiceScores(
  scores: BrandVoiceScore[],
): Promise<{ run_id: string; saved_count: number }> {
  const runId = nanoid();
  if (scores.length === 0) return { run_id: runId, saved_count: 0 };
  const rows = scores.map((s) => ({
    id: nanoid(),
    runId,
    adId: s.ad_id,
    depth: s.depth,
    scientific: s.scientific,
    respectful: s.respectful,
    noManipulation: s.no_manipulation,
    overall: s.overall,
    needsReview: s.needs_review,
    reviewedByClaudeAt: s.reviewed_by_claude_at,
  }));
  await getDb().insert(advertisingBrandVoiceScores).values(rows);
  return { run_id: runId, saved_count: rows.length };
}

/**
 * Returns the most recent audit run (all rows sharing the latest run_id),
 * or null if no scores have ever been recorded.
 */
export async function getLatestBrandVoiceRun(): Promise<BrandVoiceRun | null> {
  const db = getDb();
  const latest = await db
    .select({
      runId: advertisingBrandVoiceScores.runId,
      reviewedAt: advertisingBrandVoiceScores.reviewedByClaudeAt,
    })
    .from(advertisingBrandVoiceScores)
    .orderBy(desc(advertisingBrandVoiceScores.reviewedByClaudeAt))
    .limit(1);
  if (latest.length === 0) return null;
  const { runId, reviewedAt } = latest[0];
  const rows = await db
    .select()
    .from(advertisingBrandVoiceScores)
    .where(eq(advertisingBrandVoiceScores.runId, runId));
  return {
    run_id: runId,
    reviewed_at: reviewedAt,
    scores: rows.map((r) => ({
      ad_id: r.adId,
      depth: r.depth,
      scientific: r.scientific,
      respectful: r.respectful,
      no_manipulation: r.noManipulation,
      overall: r.overall,
      needs_review: r.needsReview,
      reviewed_by_claude_at: r.reviewedByClaudeAt,
    })),
  };
}
```

**Tests** (`__tests__/brand-voice-store.test.ts`, ~5 cases):

1. **`saveBrandVoiceScores([])` returns `{ run_id, saved_count: 0 }` and inserts nothing.**
2. **`saveBrandVoiceScores([score1, score2])` inserts 2 rows sharing the same `run_id`.** Mock the DB insert; assert it's called once with 2 rows whose `runId` is identical.
3. **`getLatestBrandVoiceRun()` returns `null` when table is empty.**
4. **`getLatestBrandVoiceRun()` returns all rows for the latest run_id when multiple runs exist.** Mock DB to return one row in step 1 (latest by `reviewedByClaudeAt`), then all rows for that runId in step 2.
5. **Round-trip: `saveBrandVoiceScores` then `getLatestBrandVoiceRun` preserves field shapes.** Uses an in-memory mock that records inserts and returns them on select.

## Component C — Wire-up + reader

### C.1 — Retro-weekly cron: replace mock + add save + env-gate

**File modified:** `src/app/api/cron/advertising/retro-weekly/route.ts`

**Changes:**

1. **Replace `buildClaudeForBrandVoice()` body** (currently `retro-weekly/route.ts:270-283`):

```ts
function buildClaudeForBrandVoice(): ClaudeClientForBrandVoice {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — required for ClaudeBrandVoiceClient');
  }
  return new ClaudeBrandVoiceClient({ anthropicApiKey: apiKey });
}
```

2. **Wrap the audit call with the feature gate**. The exact wire-up location is wherever `auditTopCreatives()` is currently called in this route. Wrap that call:

```ts
let brandVoiceScores: BrandVoiceScore[] = [];
if (process.env.BRAND_VOICE_SCORER_ENABLED === 'true') {
  brandVoiceScores = await auditTopCreatives(topCreatives, buildClaudeForBrandVoice());
  if (brandVoiceScores.length > 0) {
    await saveBrandVoiceScores(brandVoiceScores);
  }
}
// `brandVoiceScores` flows into report.brand_voice_scores as before — empty array when flag off.
```

> **Why throw instead of falling back to mock when API key missing:** With the flag-off branch, `buildClaudeForBrandVoice()` is never called when `BRAND_VOICE_SCORER_ENABLED !== 'true'`. So the throw only fires when the operator explicitly enabled the flag without setting the key — that's a misconfiguration deserving a loud failure, not a silent fallback that seeds zero-score rows into the DB.

### C.2 — `/status?include=brand_voice` reader update

**File modified:** `src/app/api/admin/advertising/status/route.ts` (created by Sub-project 2 Commit A)

**Change:** Replace the `not_implemented` stub block with:

```ts
if (include.brand_voice) {
  const latest = await getLatestBrandVoiceRun();
  if (latest === null) {
    result.brand_voice = {
      status: 'no_data',
      reason:
        process.env.BRAND_VOICE_SCORER_ENABLED === 'true'
          ? 'Scorer enabled but no audit run has completed yet'
          : 'Scorer disabled (set BRAND_VOICE_SCORER_ENABLED=true to start scoring)',
    };
  } else {
    result.brand_voice = {
      status: 'ok',
      run_id: latest.run_id,
      reviewed_at: latest.reviewed_at.toISOString(),
      scores: latest.scores.map((s) => ({
        ad_id: s.ad_id,
        depth: s.depth,
        scientific: s.scientific,
        respectful: s.respectful,
        no_manipulation: s.no_manipulation,
        overall: s.overall,
        needs_review: s.needs_review,
      })),
      flagged_count: latest.scores.filter((s) => s.needs_review).length,
    };
  }
}
```

### C.3 — `.env.example` addition

```
# When true, retro-weekly cron audits top-10 creatives via ClaudeBrandVoiceClient
# and persists scores in advertising_brand_voice_scores. Default false during
# rollout — flip when the migration has been applied and you want to enable
# the audit. Disabled = no Claude API calls, no DB writes, /status returns
# { status: 'no_data', reason: 'Scorer disabled' }.
BRAND_VOICE_SCORER_ENABLED=false
```

### C.4 — Tests

**Extend `src/app/api/admin/advertising/status/__tests__/route.test.ts` (3 new cases):**

1. **`include=brand_voice` returns `no_data` with disabled-reason when scorer is off AND no rows in DB.** Mock `getLatestBrandVoiceRun()` to return `null`; set `process.env.BRAND_VOICE_SCORER_ENABLED` to undefined.
2. **`include=brand_voice` returns `no_data` with enabled-reason when scorer is on AND no rows in DB.** Same null mock; set the env to `'true'`.
3. **`include=brand_voice` returns `ok` with run_id, reviewed_at, scores[], flagged_count when DB has data.** Mock `getLatestBrandVoiceRun()` to return a real run with 2 scores (1 needs_review).

**New file `src/app/api/cron/advertising/__tests__/retro-weekly-brand-voice.test.ts` (3 cases):**

1. **`BRAND_VOICE_SCORER_ENABLED!=='true'` → `auditTopCreatives` is NOT called and `saveBrandVoiceScores` is NOT called.**
2. **`BRAND_VOICE_SCORER_ENABLED==='true'` AND `ANTHROPIC_API_KEY` set → `auditTopCreatives` IS called with a real `ClaudeBrandVoiceClient` instance, and `saveBrandVoiceScores` is called with the returned array.**
3. **`BRAND_VOICE_SCORER_ENABLED==='true'` AND `ANTHROPIC_API_KEY` missing → `buildClaudeForBrandVoice()` throws.** Verify the throw propagates (the cron will fail visibly rather than silently degrading).

> **Test scoping note:** Tests #2 and #3 require partial mocking of the retro-weekly cron route. If full integration is too heavy, the test file can extract `buildClaudeForBrandVoice()` to a named helper and unit-test that helper directly. Final structuring is a plan-stage decision.

## Pre-conditions

Before starting any Sub-project 3 task:

1. **Sub-project 2 Commit A must be merged** (`status/route.ts` exists with the `not_implemented` stub). Otherwise Component C.2 has nothing to modify.
2. **`ANTHROPIC_API_KEY` is set in Vercel production env.** Founder action; not part of this work.
3. **`@vercel/blob` and Drizzle Kit already installed** (no new deps).
4. **Working tree clean on `main`.**
5. **Drizzle migration files in `drizzle/` are coherent** (no half-applied migrations).

## Cost estimate (Claude API)

- Model: `claude-haiku-4-5` — current pricing ~$0.80/MTok input + $4.00/MTok output.
- Per call: system prompt + user copy ≈ 500-700 input tokens; response ≈ 50-100 output tokens.
- Per call cost: ≈ $0.0006 — $0.001.
- Per audit run: 10 creatives → ≈ $0.01.
- Per year (weekly cadence): 52 runs × $0.01 = ≈ $0.52.

Negligible. No rate-limiting or batching needed.

## Halt criteria

Halt the plan and write a checkpoint to `.cowork-meta/brand-voice-scorer-<TIMESTAMP>/` if:

- **Sub-project 2 Commit A is not in `main`.** Cannot wire up Component C.2 without the `/status` route.
- **`BrandVoiceScore` interface has changed** since this spec was written. Tests will fail to compile.
- **`computeWeightedOverall()` signature has changed** (currently takes `depth, scientific, respectful, no_manipulation`). The client uses it — verify before pasting.
- **Drizzle `db:generate` produces a migration that includes unexpected schema changes** beyond the new table. If so, investigate other in-flight schema work before committing.
- **`auditTopCreatives()` returns rows but `saveBrandVoiceScores()` rejects them** due to schema mismatch (e.g., `reviewed_by_claude_at` is null in some path). Investigate the producer-consumer contract.
- **Cron route refactor breaks an existing test in `__tests__/cron-handlers.test.ts`.** Revert changes to retro-weekly; the env-gate should be additive, not restructuring.

## Operational follow-ups (NOT in this sub-project)

1. **Founder applies migration in production**: `npm run db:migrate` (or via Drizzle Kit / Neon dashboard).
2. **Founder verifies `ANTHROPIC_API_KEY` is set** in Vercel production env.
3. **Founder flips `BRAND_VOICE_SCORER_ENABLED=true`** when ready to start the weekly scoring.
4. **(Cowork)** Founder updates Cowork's `/status` query to include `brand_voice` once verified.
5. **(Cowork)** After 4-8 weeks of accumulated scores, founder may request a "drift trends" follow-up that surfaces `flagged_count` over time, or per-dimension averages. Out of scope.

## Out of scope

- **Drift trends API** (e.g., `/status?include=brand_voice_trends&since=30d`). Surfacing time-series requires aggregation across runs; defer until data accumulates.
- **Re-scoring on demand**. `/status?include=brand_voice&recompute=true` is not implemented. The cowork pull is read-only from the latest run.
- **Per-creative score history**. The schema supports it (filter by `adId`), but no API surface is added in this sub-project.
- **Scoring during creative generation** (before upload to Meta). The audit fires post-spend on top performers; pre-upload scoring is a different problem.
- **Refactoring `auditTopCreatives()`**. The interface and behavior are correct; this sub-project only swaps the client and adds persistence.
- **PR creation** — direct-to-main per CLAUDE.md.
- **Migrating existing real scores from elsewhere** — there are none; `BrandVoiceScore` is mock-only at HEAD.
