# Advertising Agent — Pre-flight Blockers (v3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-03-advertising-pre-flight-blockers-design.md`

**Goal:** Land all 9 pre-flight infrastructure fixes that gate the autonomous advertising agent's exit from `ADVERTISING_AGENT_DRY_RUN=true`. Without these the agent acts on stub audiences, missing safety checks, dangerous defaults, and attribution that disagrees across Meta/PostHog/Stripe.

**Architecture:** Eleven independent fix-tracks executed by 10 parallel agents in 3 waves plus a coordinator-run migration step. Wave 0 ships 6 surgical edits in parallel (no inter-fix deps). Wave 1 ships the 3 larger features (audience-refresh real impls, reconciler suspend, retro-weekly real metrics) once Wave 0 has merged. Wave 2 finalises operational tooling, then the coordinator runs the one-shot frequency-cap migration against the 2 production ad sets with founder confirmation.

**Tech Stack:** TypeScript strict, Drizzle ORM (Neon Postgres), Vercel Cron + Fluid Compute, posthog-node HogQL, Stripe Node SDK, Meta Marketing API v22.0, Google Generative AI (Gemini 2.5 Flash for vision), Vitest, Sentry, Telegram Bot API, Next.js 16 App Router for the new admin sub-page.

---

## File structure

```
src/modules/advertising/decide/tier-1-rules.ts                                    [MODIFY] (Track 1)
src/modules/advertising/decide/__tests__/tier-1-rules.test.ts                     [MODIFY] (Track 1)

src/modules/advertising/meta-graph-api/ad-client.ts                               [MODIFY] (Track 2)
src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts                [MODIFY] (Track 2)
scripts/advertising/setup-meta-campaign.ts                                        [MODIFY] (Track 2)
scripts/advertising/__tests__/setup-meta-campaign.test.ts                         [MODIFY] (Track 2)
scripts/advertising/migrate-frequency-caps.ts                                     [NEW]    (Track 2)

src/modules/advertising/perceive/meta-insights.ts                                 [MODIFY] (Track 3)
src/modules/advertising/perceive/__tests__/meta-insights.test.ts                  [MODIFY] (Track 3)

src/modules/advertising/posthog/funnel-client.ts                                  [MODIFY] (Track 4)
src/modules/advertising/posthog/__tests__/funnel-client.test.ts                   [MODIFY] (Track 4)

src/modules/advertising/perceive/stripe-attribution.ts                            [MODIFY] (Track 5)
src/modules/advertising/perceive/__tests__/stripe-attribution.test.ts             [MODIFY] (Track 5)

src/modules/advertising/creative-gen/safety/vision-checker.ts                     [NEW]    (Track 6)
src/modules/advertising/creative-gen/safety/checks.ts                             [MODIFY] (Track 6)
src/modules/advertising/creative-gen/safety/__tests__/vision-checker.test.ts      [NEW]    (Track 6)
src/modules/advertising/creative-gen/safety/__tests__/checks.test.ts              [MODIFY] (Track 6)

src/modules/advertising/audiences/stripe-client.ts                                [NEW]    (Track 7)
src/modules/advertising/audiences/posthog-emails.ts                               [NEW]    (Track 7)
src/modules/advertising/audiences/meta-custom-audiences.ts                        [NEW]    (Track 7)
src/modules/advertising/audiences/audience-row-store.ts                           [NEW]    (Track 7)
src/modules/advertising/audiences/__tests__/stripe-client.test.ts                 [NEW]    (Track 7)
src/modules/advertising/audiences/__tests__/posthog-emails.test.ts                [NEW]    (Track 7)
src/modules/advertising/audiences/__tests__/meta-custom-audiences.test.ts         [NEW]    (Track 7)
src/modules/advertising/audiences/__tests__/audience-row-store.test.ts            [NEW]    (Track 7)
src/app/api/cron/advertising/audience-refresh/route.ts                            [MODIFY] (Track 7)
src/app/api/cron/advertising/__tests__/audience-refresh.test.ts                   [MODIFY] (Track 7)

src/shared/lib/schema.ts                                                          [MODIFY] (Track 8)
drizzle/<timestamp>_advertising_recon_state.sql                                   [NEW]    (Track 8)
src/modules/advertising/perceive/recon-state-store.ts                             [NEW]    (Track 8)
src/modules/advertising/perceive/__tests__/recon-state-store.test.ts              [NEW]    (Track 8)
src/modules/advertising/perceive/reconciler.ts                                    [MODIFY] (Track 8)
src/modules/advertising/perceive/__tests__/reconciler.test.ts                     [MODIFY] (Track 8)
src/modules/advertising/decide/orchestrator.ts                                    [MODIFY] (Track 8)
src/modules/advertising/decide/__tests__/orchestrator.test.ts                     [MODIFY] (Track 8)
src/app/api/cron/advertising/triage-daily/route.ts                                [MODIFY] (Track 8)
src/app/api/cron/advertising/__tests__/cron-handlers.test.ts                      [MODIFY] (Track 8)
src/app/admin/advertising/recon-state/page.tsx                                    [NEW]    (Track 8)
src/app/admin/advertising/recon-state/actions.ts                                  [NEW]    (Track 8)
src/app/admin/advertising/layout.tsx                                              [MODIFY] (Track 8)

src/app/api/cron/advertising/retro-weekly/route.ts                                [MODIFY] (Track 9)
src/app/api/cron/advertising/__tests__/cron-handlers.test.ts                      [MODIFY] (Track 9)

scripts/advertising/pre-launch-check.ts                                           [MODIFY] (Track 10)
scripts/advertising/verify-prod-state.ts                                          [NEW]    (Track 10)
scripts/advertising/__tests__/verify-prod-state.test.ts                           [NEW]    (Track 10)
package.json                                                                      [MODIFY] (Track 10)
docs/advertising/attribution-windows.md                                           [NEW]    (Track 10 — also Track 4 contributes content)
docs/advertising/deploy-runbook.md                                                [NEW]    (Track 10)

(operational — coordinator only, no code change)                                  (Track 11)
```

~32 files touched. Approx. 1500 lines added, 80 removed.

---

## Parallel execution model — 10 agents in 3 waves + 1 coordinator step

```
Wave 0  (6 agents, fully parallel — start now):
  ┌─ Track 1: LEARNING_PHASE_DAYS 2 → 7 + tests              [tiny, ~30 min]
  ├─ Track 2: frequency_control_specs end-to-end             [~1 h, 5 files]
  ├─ Track 3: meta-insights attribution_windows              [~45 min]
  ├─ Track 4: posthog-funnel attribution_window_days         [~1.5 h]
  ├─ Track 5: stripe-attribution 14d window                  [~45 min]
  └─ Track 6: vision-checker + brand + symbol checks         [~3-4 h]

Wave 1  (3 agents, fully parallel — start after Wave 0 merges):
  ┌─ Track 7: audience-refresh real impls (4 modules)        [~6-8 h, depends T4]
  ├─ Track 8: reconciler global suspend (DB + UI + gate)     [~4-5 h]
  └─ Track 9: retro-weekly real total_impressions/days_running [~1 h]

Wave 2  (1 agent, plus operational step — start after Wave 1 merges):
  └─ Track 10: pre-launch-check + verify-prod-state + runbook [~1.5 h]

Coordinator (after Wave 2 merges, founder-confirmed):
  └─ Track 11: migrate-frequency-caps.ts execution            [~10 min, 2 ad sets]
```

**Parallelism budget per wave:** ≤10 agents (per `.claude/settings.json` — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, `teammateMode=tmux`).

**Critical path:** Track 4 → Track 7 (~9-10 h serially). Other tracks all complete inside the critical-path window.

**Wall-clock estimate:** ~9-12 h from Wave 0 kickoff to Track 11 completion, assuming healthy worktree merges and no test flakes.

---

## Conventions for ALL agents

**Worktree isolation.** Each agent runs with `isolation: "worktree"`. Coordinator merges worktrees into `main` after a wave completes (Wave 0 first, then Wave 1, then Wave 2). Direct-to-main is the project workflow per `CLAUDE.md`, but parallel execution requires per-agent worktrees so commits don't race.

**TDD cycle.** Every track: write failing test → run to confirm fail → write minimum implementation → run to confirm pass → commit. Do NOT skip the verify-fail step.

**Commit format.** Conventional-style scopes already used in the repo. Examples for v3a:
- `fix(advertising/tier-1): raise LEARNING_PHASE_DAYS 2 → 7 (defensive)`
- `feat(advertising/meta-graph-api): support frequency_control_specs in createAdSet`
- `feat(advertising/perceive): hybrid attribution windows (Meta 7d_click / PostHog 14d / Stripe 14d)`
- `feat(advertising/safety): integrate Gemini Vision for brand + symbol checks`
- `feat(advertising/audiences): real Stripe / PostHog / Meta CA implementations`
- `feat(advertising/perceive): reconciler global suspend with 24h auto-resume`
- `fix(advertising/retro-weekly): use real Meta total_impressions / days_running`
- `chore(advertising/scripts): pre-launch-check + verify-prod-state + deploy-runbook`

**Test framework.** Vitest. Single file: `npx vitest run path/to/file.test.ts`. Full advertising scope: `npx vitest run src/modules/advertising src/app/api/cron/advertising scripts/advertising`.

**Typecheck:** `NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck`.

**Lint:** `npm run lint`. Pre-existing baseline ≈785 errors; do NOT add new errors in advertising scope. Verify scoped: `npm run lint -- src/modules/advertising src/app/api/cron/advertising scripts/advertising`.

**Mocking patterns.** Reuse what already works in this repo:
- **Drizzle DB mocks** (Track 7, Track 8 store, Track 9): wrap mock chain in `vi.hoisted(() => ({ mockDrizzleDb: ... }))` so Vitest's hoisting of `vi.mock(...)` factories doesn't reference an undeclared const. Pattern proven in `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`.
- **fetch mocks** (Tracks 4, 6, 7): inject `fetchImpl` via constructor option (PosthogFunnelClient pattern at `src/modules/advertising/posthog/funnel-client.ts:60-65`). Test passes `vi.fn().mockResolvedValue({ ok: true, json: async () => ({...}) })`.
- **Telegram bot mocks** (Track 8): existing `MockTelegramBot` at `src/modules/advertising/__tests__/mocks/telegram.ts`.
- **Sentry mocks** (all tracks with cron error paths): `vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))`.

**No PII in logs / DB / events.** Email addresses passed to Meta CA are SHA-256 hashed at the boundary (`audiences/meta-custom-audiences.ts`). No raw email anywhere downstream of the source SDKs. Don't log decrypted PII; don't log Stripe customer emails — only hashed versions or domain-only.

**Sentry tags.** Every cron `Sentry.captureException` call carries `tags: { cron: true, route: '/api/cron/...', subsystem: '...' }`. Extend per-fix tags as specified in the spec (`{ subsystem: 'audiences' | 'creative-gen-safety' | 'reconciler' }`).

**Fail-safe defaults.** External API failures (Meta, PostHog, Stripe, Gemini) are caught, logged with warn, fall through to safe defaults. Vision symbol-check failure is the ONE exception — it returns `passed=false` because Meta policy violations are real consequences (rejected ads = wasted impressions). Brand check failure soft-passes with a warning.

**Worktree handoff.** When a track completes, the agent reports: branch name, commit SHAs, test/lint/typecheck status. Coordinator cherry-picks or fast-forwards into `main` in the dependency order specified in this plan. Do NOT push to `origin/main` from inside a worktree.

---

# Track 1 — Raise LEARNING_PHASE_DAYS to 7 (defensive baseline)

**Owner:** Wave 0, agent 1
**Blockers:** none
**Blocks:** none (independent of all other tracks)
**Files:**
- Modify: `src/modules/advertising/decide/tier-1-rules.ts:7`
- Modify: `src/modules/advertising/decide/__tests__/tier-1-rules.test.ts:8-23`

This is the smallest fix. Single constant change + 2 boundary-case test updates. Senior media buyer never touches a fresh ad set in its first 7 days; the existing default of 2 was "nervous beginner". v3b Senior Buyer Mode replaces this entire path, but the constant remains live behind `seniorBuyerMode='off'` rollback — keep it safe.

- [ ] **Step 1: Read the current state of `tier-1-rules.ts:7` and the test file head**

```bash
sed -n '1,30p' src/modules/advertising/decide/tier-1-rules.ts
sed -n '1,30p' src/modules/advertising/decide/__tests__/tier-1-rules.test.ts
```

Confirm: line 7 reads `const LEARNING_PHASE_DAYS = 2;` and tests reference `days_running: 1` and `days_running: 2` boundary.

- [ ] **Step 2: Update the failing tests FIRST (TDD-style — fail because expected boundaries are now 7)**

In `src/modules/advertising/decide/__tests__/tier-1-rules.test.ts`, edit the three impacted cases:

```ts
  // --- Learning phase ---

  it('holds during learning phase (days_running < 7)', () => {
    const m = mockAdMetric({ days_running: 6, frequency: 5.0, cpc: 6.00 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('learning_phase');
  });

  it('holds when days_running = 0', () => {
    const m = mockAdMetric({ days_running: 0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('hold');
  });

  it('does NOT hold when days_running exactly equals threshold (7)', () => {
    // days_running=7 means threshold cleared, rules apply
    const m = mockAdMetric({ days_running: 7, frequency: 1.0, cpc: 1.0, spend_usd: 5.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('maintain');
  });
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npx vitest run src/modules/advertising/decide/__tests__/tier-1-rules.test.ts`
Expected: 2 of the 3 updated cases FAIL — `days_running: 6` no longer holds because current `LEARNING_PHASE_DAYS=2` lets it through; `days_running: 7` already passed before. The boundary case is the failing one to confirm.

- [ ] **Step 4: Apply the constant change**

In `src/modules/advertising/decide/tier-1-rules.ts:7`, replace the constant with the senior-buyer baseline:

```ts
- const LEARNING_PHASE_DAYS = 2;
+ // Senior buyer baseline. v3b Senior Buyer Mode supersedes this with Phase B
+ // max_days=14 and conversion-based transition. Kept here as defensive minimum
+ // for the legacy code path (active when seniorBuyerMode feature gate = off).
+ const LEARNING_PHASE_DAYS = 7;
```

The exported re-export at line 67 (`export { ..., LEARNING_PHASE_DAYS };`) needs no change.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/modules/advertising/decide/__tests__/tier-1-rules.test.ts`
Expected: PASS — all three updated cases green.

- [ ] **Step 6: Run typecheck and lint**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/decide
```

Expected: PASS / no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/advertising/decide/tier-1-rules.ts \
        src/modules/advertising/decide/__tests__/tier-1-rules.test.ts
git commit -m "fix(advertising/tier-1): raise LEARNING_PHASE_DAYS 2 → 7 (defensive baseline)"
```

- [ ] **Step 8: Notify coordinator** — Wave 0 / Track 1 complete.

---

# Track 2 — Frequency control specs (ad-client + setup script + migration)

**Owner:** Wave 0, agent 2
**Blockers:** none
**Blocks:** Track 11 (operational migration uses the script written here)
**Files:**
- Modify: `src/modules/advertising/meta-graph-api/ad-client.ts:200-260`
- Modify: `src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts`
- Modify: `scripts/advertising/setup-meta-campaign.ts:57-77`
- Modify: `scripts/advertising/__tests__/setup-meta-campaign.test.ts`
- Create: `scripts/advertising/migrate-frequency-caps.ts`

Tier-1 currently pauses at aggregate `frequency >= 4.0`, but aggregate hides per-user variance. Some users may see the ad 8-10× before average reaches 4. Fix the root cause at the ad-set level: configure `frequency_control_specs` so Meta itself caps per-user impressions.

- [ ] **Step 1: Extend `CreateAdSetOpts` in `ad-client.ts`**

Read first: `sed -n '170,210p' src/modules/advertising/meta-graph-api/ad-client.ts`. Find the `CreateAdSetOpts` interface (around line 170-200) and add the optional field:

```ts
export interface CreateAdSetOpts {
  campaignId: string;
  name: string;
  locale: 'en' | 'es';
  dailyBudgetCents: number;
  targeting: {
    countries: string[];
    ageMin: number;
    ageMax: number;
    interests?: string[];
  };
  optimizationGoal: 'LANDING_PAGE_VIEWS' | 'CONVERSIONS' | 'LINK_CLICKS' | 'REACH';
  billingEvent: 'IMPRESSIONS' | 'LINK_CLICKS';
  status: 'PAUSED' | 'ACTIVE';
  /**
   * Per-user impression cap enforced by Meta auction (not post-fact agent pause).
   * MVP value: { event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 }.
   * Maps to Meta's `frequency_control_specs` array on POST /{adAccountId}/adsets.
   */
  frequencyControlSpecs?: Array<{
    event: 'IMPRESSIONS' | 'REACH';
    interval_days: number;
    max_frequency: number;
  }>;
}
```

- [ ] **Step 2: Pass through in the request body inside `createAdSet`**

Find the request-body construction inside `createAdSet` (around line 215-240). Add a conditional copy:

```ts
  async createAdSet(opts: CreateAdSetOpts): Promise<{ adset_id: string }> {
    const targeting = {
      geo_locations: { countries: opts.targeting.countries },
      age_min: opts.targeting.ageMin,
      age_max: opts.targeting.ageMax,
      ...(opts.targeting.interests
        ? { flexible_spec: [{ interests: opts.targeting.interests.map((i) => ({ id: i, name: i })) }] }
        : {}),
    };

    const body: Record<string, unknown> = {
      name: opts.name,
      campaign_id: opts.campaignId,
      daily_budget: opts.dailyBudgetCents,
      optimization_goal: opts.optimizationGoal,
      billing_event: opts.billingEvent,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting,
      status: opts.status,
    };

    if (opts.frequencyControlSpecs && opts.frequencyControlSpecs.length > 0) {
      body.frequency_control_specs = opts.frequencyControlSpecs;
    }

    const res = await this.request<MetaIdResponse>(
      'POST',
      `/${this.adAccountId}/adsets`,
      body,
    );
    return { adset_id: res.id };
  }
```

- [ ] **Step 3: Add `updateAdSet` method on the same class (used by Track 11 migration)**

Search for any existing `updateAdSet` / `updateAdSetBudget`. If only `updateAdSetBudget` exists (likely), add a sibling general-purpose `updateAdSet`:

```ts
  /**
   * Generic ad-set update — used to retrofit `frequency_control_specs` onto
   * existing ad sets (Track 11 migration). Pass only the fields you want changed.
   */
  async updateAdSet(adsetId: string, patch: {
    frequencyControlSpecs?: CreateAdSetOpts['frequencyControlSpecs'];
    dailyBudgetCents?: number;
    status?: 'PAUSED' | 'ACTIVE';
  }): Promise<{ id: string; success: true }> {
    const body: Record<string, unknown> = {};
    if (patch.frequencyControlSpecs) body.frequency_control_specs = patch.frequencyControlSpecs;
    if (patch.dailyBudgetCents !== undefined) body.daily_budget = patch.dailyBudgetCents;
    if (patch.status) body.status = patch.status;

    if (Object.keys(body).length === 0) {
      throw new Error('updateAdSet: empty patch');
    }

    await this.request<MetaIdResponse>('POST', `/${adsetId}`, body);
    return { id: adsetId, success: true };
  }
```

- [ ] **Step 4: Write failing tests for both methods**

In `src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts`, add:

```ts
  describe('createAdSet — frequency_control_specs', () => {
    it('omits frequency_control_specs when not provided', async () => {
      const client = new MetaAdManagementClient({ accessToken: 't', adAccountId: 'act_1', fetchImpl });
      fetchImpl.mockResolvedValueOnce(jsonOk({ id: 'as_001' }));
      await client.createAdSet({
        campaignId: 'cmp_1',
        name: 'no-cap',
        locale: 'en',
        dailyBudgetCents: 1400,
        targeting: { countries: ['US'], ageMin: 18, ageMax: 65 },
        optimizationGoal: 'LANDING_PAGE_VIEWS',
        billingEvent: 'IMPRESSIONS',
        status: 'PAUSED',
      });
      const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body).not.toHaveProperty('frequency_control_specs');
    });

    it('passes frequency_control_specs to the API when provided', async () => {
      const client = new MetaAdManagementClient({ accessToken: 't', adAccountId: 'act_1', fetchImpl });
      fetchImpl.mockResolvedValueOnce(jsonOk({ id: 'as_002' }));
      await client.createAdSet({
        campaignId: 'cmp_1',
        name: 'capped',
        locale: 'en',
        dailyBudgetCents: 1400,
        targeting: { countries: ['US'], ageMin: 18, ageMax: 65 },
        optimizationGoal: 'LANDING_PAGE_VIEWS',
        billingEvent: 'IMPRESSIONS',
        status: 'PAUSED',
        frequencyControlSpecs: [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 }],
      });
      const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body.frequency_control_specs).toEqual([
        { event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 },
      ]);
    });
  });

  describe('updateAdSet', () => {
    it('throws on empty patch', async () => {
      const client = new MetaAdManagementClient({ accessToken: 't', adAccountId: 'act_1', fetchImpl });
      await expect(client.updateAdSet('as_x', {})).rejects.toThrow(/empty patch/);
    });

    it('sends frequency_control_specs in POST body when patching cap', async () => {
      const client = new MetaAdManagementClient({ accessToken: 't', adAccountId: 'act_1', fetchImpl });
      fetchImpl.mockResolvedValueOnce(jsonOk({ id: 'as_001' }));
      const result = await client.updateAdSet('as_001', {
        frequencyControlSpecs: [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 }],
      });
      expect(result).toEqual({ id: 'as_001', success: true });
      const url = fetchImpl.mock.calls[0][0] as string;
      expect(url).toMatch(/\/as_001$/);
      const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body.frequency_control_specs).toEqual([
        { event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 },
      ]);
    });
  });
```

(Reuse the file's existing `fetchImpl` / `jsonOk` helper. If not present, copy from `__tests__/upload-client.test.ts`.)

- [ ] **Step 5: Run tests to verify failure**

Run: `npx vitest run src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts`
Expected: FAIL — `frequencyControlSpecs` not yet in `CreateAdSetOpts` (TS compile error) OR `updateAdSet` undefined. Apply Steps 1-3, re-run. Expected: PASS.

- [ ] **Step 6: Wire `frequency_control_specs` into both `createAdSet` calls in `setup-meta-campaign.ts`**

In `scripts/advertising/setup-meta-campaign.ts:57-77`, both `createAdSet` invocations need the cap. Edit both:

```ts
  const en = await adClient.createAdSet({
    campaignId: campaign_id,
    name: 'EN — Launch — Sidereal interest',
    locale: 'en',
    dailyBudgetCents: opts.dailyBudgetCentsEn,
    targeting: { countries: EN_COUNTRIES, ageMin, ageMax },
    optimizationGoal: 'LANDING_PAGE_VIEWS',
    billingEvent: 'IMPRESSIONS',
    status: 'PAUSED',
    // MVP per-user impression cap: ~1.4 imp/user/day across 7-day window.
    // Comfortable for astrology niche; lets Meta accumulate learning signal.
    frequencyControlSpecs: [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 }],
  });

  const es = await adClient.createAdSet({
    campaignId: campaign_id,
    name: 'ES — Launch — Astrología sidérea',
    locale: 'es',
    dailyBudgetCents: opts.dailyBudgetCentsEs,
    targeting: { countries: ES_COUNTRIES, ageMin, ageMax },
    optimizationGoal: 'LANDING_PAGE_VIEWS',
    billingEvent: 'IMPRESSIONS',
    status: 'PAUSED',
    frequencyControlSpecs: [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 }],
  });
```

Update `scripts/advertising/__tests__/setup-meta-campaign.test.ts` to assert both calls receive the cap. If the test file uses a `mockAdClient.createAdSet` spy:

```ts
expect(mockAdClient.createAdSet).toHaveBeenNthCalledWith(1, expect.objectContaining({
  frequencyControlSpecs: [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 }],
}));
expect(mockAdClient.createAdSet).toHaveBeenNthCalledWith(2, expect.objectContaining({
  frequencyControlSpecs: [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 }],
}));
```

Run: `npx vitest run scripts/advertising/__tests__/setup-meta-campaign.test.ts`. Expected: PASS.

- [ ] **Step 7: Create the one-shot migration script**

Create `scripts/advertising/migrate-frequency-caps.ts`:

```ts
/**
 * One-shot migration: retrofit frequency_control_specs on the 2 production ad
 * sets that were created BEFORE Track 2's createAdSet patch.
 *
 * Safe to re-run: Meta accepts the same frequency_control_specs payload
 * idempotently (no learning reset since this isn't a budget/creative/audience edit).
 *
 * Usage:
 *   ENVIRONMENT=production npx tsx scripts/advertising/migrate-frequency-caps.ts
 *   ENVIRONMENT=production DRY_RUN=true npx tsx scripts/advertising/migrate-frequency-caps.ts
 */

import 'dotenv/config';
import { MetaAdManagementClient } from '@/modules/advertising/meta-graph-api/ad-client';

const FREQUENCY_CAP = [
  { event: 'IMPRESSIONS' as const, interval_days: 7, max_frequency: 10 },
];

async function main() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const adsetEn = process.env.META_LAUNCH_ADSET_ID_EN;
  const adsetEs = process.env.META_LAUNCH_ADSET_ID_ES;
  const dryRun = process.env.DRY_RUN === 'true';

  if (!accessToken || !adAccountId) throw new Error('Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID');
  if (!adsetEn || !adsetEs) throw new Error('Missing META_LAUNCH_ADSET_ID_EN or META_LAUNCH_ADSET_ID_ES');

  const client = new MetaAdManagementClient({ accessToken, adAccountId });

  console.log('Migrating frequency_control_specs on:');
  console.log(`  EN ad set: ${adsetEn}`);
  console.log(`  ES ad set: ${adsetEs}`);
  console.log(`  Cap: ${JSON.stringify(FREQUENCY_CAP)}`);
  console.log(`  Dry-run: ${dryRun}`);
  console.log('');

  if (dryRun) {
    console.log('Dry-run — no API calls made. Exiting.');
    return;
  }

  for (const [label, adsetId] of [['EN', adsetEn], ['ES', adsetEs]] as const) {
    try {
      const result = await client.updateAdSet(adsetId, { frequencyControlSpecs: FREQUENCY_CAP });
      console.log(`  ✓ ${label} (${adsetId}): ${result.success ? 'OK' : 'FAIL'}`);
    } catch (err) {
      console.error(`  ✗ ${label} (${adsetId}): ${err instanceof Error ? err.message : err}`);
      throw err; // bubble — fail loud, half-migration is bad
    }
  }

  console.log('');
  console.log('Migration complete. Verify in Meta Ads Manager UI: Ad Set → Frequency Cap = 10/7 days.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Add a script entry to `package.json`:

```json
"advertising:migrate-frequency-caps": "tsx scripts/advertising/migrate-frequency-caps.ts",
```

(Insert next to the existing `"advertising:pre-launch-check"` entry.)

- [ ] **Step 8: Verify the migration script type-checks (smoke; no execution in this track)**

Run: `npx tsx scripts/advertising/migrate-frequency-caps.ts --help` — expected behaviour: dies on missing env vars. That's the success signal (script loads + executes).

Optionally, smoke-test under `DRY_RUN=true` with stub env vars:
```bash
DRY_RUN=true \
META_ACCESS_TOKEN=test \
META_AD_ACCOUNT_ID=act_test \
META_LAUNCH_ADSET_ID_EN=as_en_test \
META_LAUNCH_ADSET_ID_ES=as_es_test \
npx tsx scripts/advertising/migrate-frequency-caps.ts
```
Expected: prints the migration plan, exits 0 without API calls.

- [ ] **Step 9: Run typecheck and lint scoped**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/meta-graph-api scripts/advertising
```

Expected: PASS / no new errors.

- [ ] **Step 10: Commit**

```bash
git add src/modules/advertising/meta-graph-api/ad-client.ts \
        src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts \
        scripts/advertising/setup-meta-campaign.ts \
        scripts/advertising/__tests__/setup-meta-campaign.test.ts \
        scripts/advertising/migrate-frequency-caps.ts \
        package.json
git commit -m "feat(advertising/meta-graph-api): support frequency_control_specs in createAdSet + migration"
```

- [ ] **Step 11: Notify coordinator** — Wave 0 / Track 2 complete. Track 11 (operational migration) is unblocked once Wave 2 ships.

---

# Track 3 — Meta-insights `action_attribution_windows`

**Owner:** Wave 0, agent 3
**Blockers:** none
**Blocks:** none (Track 7 reads attribution windows but does not depend on this track's API shape)
**Files:**
- Modify: `src/modules/advertising/perceive/meta-insights.ts`
- Modify: `src/modules/advertising/perceive/__tests__/meta-insights.test.ts`

Meta defaults to `7d_click + 1d_view`. View-attribution inflates conversion counts. Per Q4 hybrid-by-purpose, Meta data drives phase-detection; we want a single clean window: `7d_click`.

- [ ] **Step 1: Read the current `MetaInsightsApi` interface and `fetchMetaInsights` body**

```bash
sed -n '1,80p' src/modules/advertising/perceive/meta-insights.ts
```

Confirm: `MetaInsightsApi.getInsights` accepts `{ time_range, level, fields }`. We extend it with an optional `action_attribution_windows`.

- [ ] **Step 2: Extend the API interface**

```ts
export interface MetaInsightsApi {
  getInsights(opts: {
    time_range: { since: string; until: string };
    level: string;
    fields: string[];
    /**
     * Per Q4 (hybrid by purpose): Meta is the source for phase detection.
     * 7d_click only — no view attribution (inflates conversions on awareness creatives).
     * Pass-through to Meta Marketing API param of the same name.
     */
    action_attribution_windows?: Array<'1d_click' | '7d_click' | '1d_view' | '7d_view' | '28d_click'>;
  }): Promise<AdMetric[]>;
}
```

- [ ] **Step 3: Pass `['7d_click']` from `fetchMetaInsights`**

Locate the query construction in `fetchMetaInsights`. Add `action_attribution_windows: ['7d_click']` to the `query` object:

```ts
  const query = {
    time_range: { since: dateFrom, until: dateTo },
    level: 'ad' as const,
    fields: [...META_FIELDS],
    action_attribution_windows: ['7d_click' as const],
  };
```

- [ ] **Step 4: Write failing test**

In `src/modules/advertising/perceive/__tests__/meta-insights.test.ts`, add (or update existing) test:

```ts
  it('passes action_attribution_windows=["7d_click"] to the Meta API', async () => {
    const apiClient = {
      getInsights: vi.fn().mockResolvedValue([]),
    };
    await fetchMetaInsights({
      apiClient,
      dateFrom: '2026-04-26',
      dateTo: '2026-05-03',
    });
    expect(apiClient.getInsights).toHaveBeenCalledWith(
      expect.objectContaining({
        action_attribution_windows: ['7d_click'],
      }),
    );
  });
```

- [ ] **Step 5: Run failing test**

Run: `npx vitest run src/modules/advertising/perceive/__tests__/meta-insights.test.ts -t "action_attribution_windows"`
Expected: FAIL — current `fetchMetaInsights` doesn't pass the field.

- [ ] **Step 6: Apply Steps 2-3, re-run**

Expected: PASS.

- [ ] **Step 7: Verify no regression on existing meta-insights tests**

Run: `npx vitest run src/modules/advertising/perceive/__tests__/meta-insights.test.ts`
Expected: PASS — all existing rate-limit/retry/field tests still green.

- [ ] **Step 8: Typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/perceive
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/advertising/perceive/meta-insights.ts \
        src/modules/advertising/perceive/__tests__/meta-insights.test.ts
git commit -m "feat(advertising/perceive): meta-insights uses 7d_click attribution window"
```

- [ ] **Step 10: Notify coordinator** — Wave 0 / Track 3 complete.

---

# Track 4 — PostHog funnel `attribution_window_days` (HogQL extension)

**Owner:** Wave 0, agent 4
**Blockers:** none
**Blocks:** Track 7 (audience-refresh `posthog-emails.ts` reuses the HogQL pattern established here)
**Files:**
- Modify: `src/modules/advertising/posthog/funnel-client.ts`
- Modify: `src/modules/advertising/posthog/__tests__/funnel-client.test.ts`

PostHog defaults to session-based attribution. Astrology vertical has 30-50% delayed conversions in days 7-14. Per Q4 hybrid: PostHog drives ROAS / CPA / drop detection with 14-day window. The reconciler queries PostHog at 7-day window to compare apples-to-apples with Meta.

- [ ] **Step 1: Extend `getFunnel` signature with `attribution_window_days`**

In `src/modules/advertising/posthog/funnel-client.ts`, find the `getFunnel(opts: {...})` method (around line 71-85). Extend the opts type:

```ts
  async getFunnel(opts: {
    date_from: string;
    date_to: string;
    filters?: { utm_source?: string; ad_id?: string };
    /**
     * Q4 hybrid attribution. Default 14 days for ROAS/CPA decisions.
     * Reconciler callsite passes 7 to align with Meta's 7d_click window.
     * Only applies when filters.ad_id is set — we restrict events to those
     * whose distinct_id had an ad-click event within the window.
     */
    attribution_window_days?: number;
  }): Promise<FunnelSnapshot> {
```

- [ ] **Step 2: Update HogQL query to apply the window when `ad_id` filter is set**

The current query treats every event in the date range as attributable. Wrap the `where` clause when `attribution_window_days` is meaningful:

```ts
    const eventList = FUNNEL_EVENTS_REAL.map((e) => `'${e}'`).join(', ');
    const windowDays = opts.attribution_window_days ?? 14;

    let where = `timestamp >= toDateTime('${opts.date_from}') AND timestamp < toDateTime('${opts.date_to}') AND event IN (${eventList})`;
    if (opts.filters?.utm_source) {
      where += ` AND properties.utm_source = '${this.escapeSql(opts.filters.utm_source)}'`;
    }

    let query: string;
    if (opts.filters?.ad_id) {
      // ad-id-attributed query: restrict to distinct_ids whose first event with
      // utm_content=ad_id is within `windowDays` of the event we're counting.
      const adId = this.escapeSql(opts.filters.ad_id);
      query = `
        WITH click_times AS (
          SELECT distinct_id, min(timestamp) AS click_ts
          FROM events
          WHERE properties.utm_content = '${adId}'
          GROUP BY distinct_id
        )
        SELECT e.event, count() AS c, count(DISTINCT e.distinct_id) AS u
        FROM events e
        INNER JOIN click_times ct ON e.distinct_id = ct.distinct_id
        WHERE ${where}
          AND e.timestamp >= ct.click_ts
          AND e.timestamp <= ct.click_ts + INTERVAL ${windowDays} DAY
        GROUP BY e.event
      `.replace(/\s+/g, ' ').trim();
    } else {
      query = `SELECT event, count() AS c, count(DISTINCT distinct_id) AS u FROM events WHERE ${where} GROUP BY event`;
    }
```

(The `INTERVAL N DAY` syntax is HogQL — see PostHog HogQL docs. If their parser objects, fall back to `+ N * 86400000` ms arithmetic.)

- [ ] **Step 3: Write failing tests**

In `src/modules/advertising/posthog/__tests__/funnel-client.test.ts`, add:

```ts
  describe('getFunnel — attribution window', () => {
    it('defaults to 14d window when filters.ad_id is set', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });
      const client = new PosthogFunnelClient({
        projectId: 'p1',
        apiKey: 'k1',
        host: 'https://eu.posthog.com',
        fetchImpl,
      });
      await client.getFunnel({
        date_from: '2026-04-01',
        date_to: '2026-05-01',
        filters: { ad_id: 'AD_ABC' },
      });
      const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
      expect(body.query.query).toContain('INTERVAL 14 DAY');
      expect(body.query.query).toContain("properties.utm_content = 'AD_ABC'");
    });

    it('honours explicit attribution_window_days=7 (reconciler use case)', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });
      const client = new PosthogFunnelClient({
        projectId: 'p1',
        apiKey: 'k1',
        host: 'https://eu.posthog.com',
        fetchImpl,
      });
      await client.getFunnel({
        date_from: '2026-04-01',
        date_to: '2026-05-01',
        filters: { ad_id: 'AD_ABC' },
        attribution_window_days: 7,
      });
      const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
      expect(body.query.query).toContain('INTERVAL 7 DAY');
    });

    it('does NOT apply attribution window when no ad_id filter is set', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });
      const client = new PosthogFunnelClient({
        projectId: 'p1',
        apiKey: 'k1',
        host: 'https://eu.posthog.com',
        fetchImpl,
      });
      await client.getFunnel({
        date_from: '2026-04-01',
        date_to: '2026-05-01',
      });
      const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
      expect(body.query.query).not.toContain('INTERVAL');
      expect(body.query.query).not.toContain('click_times');
    });
  });
```

- [ ] **Step 4: Run failing tests, then implement, then re-run**

```bash
npx vitest run src/modules/advertising/posthog/__tests__/funnel-client.test.ts -t "attribution window"
```

Expected: 3 FAIL → apply Steps 1-2 → 3 PASS.

- [ ] **Step 5: Verify no regression on existing funnel-client tests**

Run: `npx vitest run src/modules/advertising/posthog/__tests__/funnel-client.test.ts`
Expected: PASS — all existing tests green.

- [ ] **Step 6: Update reconciler callsite to pass `attribution_window_days: 7`**

In `src/modules/advertising/perceive/reconciler.ts` (or wherever `getFunnel` is called for reconciliation — likely in `triage-daily/route.ts`), find the existing reconciler-relevant `getFunnel` call. Wherever it is, pass `attribution_window_days: 7`. Check via:

```bash
grep -rn "getFunnel\|fetchFunnelSnapshot" src/app/api/cron/advertising/ src/modules/advertising/perceive/ src/modules/advertising/posthog/ | grep -v __tests__
```

For each callsite that feeds reconciliation, ensure `attribution_window_days: 7` is passed. For ad-set-level funnel calls (Track 7's audience-refresh), do not pass the param — defaults to 14.

- [ ] **Step 7: Typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/posthog src/modules/advertising/perceive src/app/api/cron/advertising
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/advertising/posthog/funnel-client.ts \
        src/modules/advertising/posthog/__tests__/funnel-client.test.ts \
        src/modules/advertising/perceive/reconciler.ts \
        src/app/api/cron/advertising/triage-daily/route.ts
git commit -m "feat(advertising/posthog): hybrid attribution_window_days (default 14, reconciler 7)"
```

- [ ] **Step 9: Notify coordinator** — Wave 0 / Track 4 complete. Track 7 may begin.

---

# Track 5 — Stripe attribution 14-day window

**Owner:** Wave 0, agent 5
**Blockers:** none
**Blocks:** none
**Files:**
- Modify: `src/modules/advertising/perceive/stripe-attribution.ts`
- Modify: `src/modules/advertising/perceive/__tests__/stripe-attribution.test.ts`

Stripe attribution today returns whatever the SDK returns within the date window; UTM metadata is read directly from `subscription.metadata`. We need to additionally filter to subs whose `metadata.utm_click_timestamp` is within 14 days of `subscription.created_at`. Subs without `utm_click_timestamp` (legacy) fall back to `created_at` timing.

- [ ] **Step 1: Extend `FetchStripeAttributionOptions` with `attributionWindowDays`**

```ts
export interface FetchStripeAttributionOptions {
  apiClient: MockStripe | StripeAttributionApi;
  windowStart: Date;
  windowEnd: Date;
  /** Optional ad_id filter — only return attributions matching utm_content */
  adId?: string;
  /**
   * Q4 hybrid: Stripe revenue uses 14-day window from utm_click_timestamp.
   * Defaults to 14 if unspecified. Reconciler may override to align with Meta.
   */
  attributionWindowDays?: number;
}
```

- [ ] **Step 2: Apply the window filter inside `fetchStripeAttribution`**

```ts
export async function fetchStripeAttribution(
  opts: FetchStripeAttributionOptions,
): Promise<StripeAttribution[]> {
  const { apiClient, windowStart, windowEnd, adId, attributionWindowDays = 14 } = opts;

  const records: StripeAttribution[] = await apiClient.listSubscriptionsCreatedBetween({
    created_gte: windowStart,
    created_lt: windowEnd,
  });

  const windowMs = attributionWindowDays * 24 * 60 * 60 * 1000;

  const filtered = records.filter((r) => {
    if (!r.utm_click_timestamp) {
      // Legacy sub without click timestamp metadata — accept on created_at timing
      // (already within [windowStart, windowEnd] by Stripe's own filter).
      return true;
    }
    const clickTs = new Date(r.utm_click_timestamp).getTime();
    const subTs = new Date(r.created_at).getTime();
    return subTs - clickTs <= windowMs && subTs >= clickTs;
  });

  if (adId !== undefined) {
    return filtered.filter((r) => r.utm_content === adId);
  }
  return filtered;
}
```

(If `StripeAttribution` type doesn't yet have `utm_click_timestamp`, add it as `utm_click_timestamp?: string` in `src/shared/types/advertising.ts`.)

- [ ] **Step 3: Write failing tests**

```ts
  describe('fetchStripeAttribution — attribution window', () => {
    it('drops subs whose subscription is older than attributionWindowDays from utm_click_timestamp', async () => {
      const apiClient = {
        listSubscriptionsCreatedBetween: vi.fn().mockResolvedValue([
          {
            subscription_id: 'sub_in',
            customer_id: 'cus_1',
            amount_usd: 4.99,
            currency: 'usd',
            created_at: '2026-04-21T12:00:00Z', // 5 days after click
            utm_source: 'meta',
            utm_content: 'AD_X',
            utm_click_timestamp: '2026-04-16T12:00:00Z',
          },
          {
            subscription_id: 'sub_out',
            customer_id: 'cus_2',
            amount_usd: 4.99,
            currency: 'usd',
            created_at: '2026-04-30T12:00:00Z', // 30 days after click — out of 14d window
            utm_source: 'meta',
            utm_content: 'AD_X',
            utm_click_timestamp: '2026-03-31T12:00:00Z',
          },
        ]),
      };
      const result = await fetchStripeAttribution({
        apiClient,
        windowStart: new Date('2026-04-01'),
        windowEnd: new Date('2026-05-01'),
      });
      expect(result.map((r) => r.subscription_id)).toEqual(['sub_in']);
    });

    it('keeps legacy subs without utm_click_timestamp', async () => {
      const apiClient = {
        listSubscriptionsCreatedBetween: vi.fn().mockResolvedValue([
          {
            subscription_id: 'sub_legacy',
            customer_id: 'cus_3',
            amount_usd: 4.99,
            currency: 'usd',
            created_at: '2026-04-21T12:00:00Z',
            utm_source: 'meta',
            utm_content: 'AD_Y',
            // no utm_click_timestamp
          },
        ]),
      };
      const result = await fetchStripeAttribution({
        apiClient,
        windowStart: new Date('2026-04-01'),
        windowEnd: new Date('2026-05-01'),
      });
      expect(result.map((r) => r.subscription_id)).toEqual(['sub_legacy']);
    });

    it('honours custom attributionWindowDays', async () => {
      const apiClient = {
        listSubscriptionsCreatedBetween: vi.fn().mockResolvedValue([
          {
            subscription_id: 'sub_8d',
            customer_id: 'cus_1',
            amount_usd: 4.99,
            currency: 'usd',
            created_at: '2026-04-21T12:00:00Z',
            utm_source: 'meta',
            utm_content: 'AD_X',
            utm_click_timestamp: '2026-04-13T12:00:00Z', // 8 days before
          },
        ]),
      };
      const within14 = await fetchStripeAttribution({
        apiClient,
        windowStart: new Date('2026-04-01'),
        windowEnd: new Date('2026-05-01'),
        attributionWindowDays: 14,
      });
      expect(within14).toHaveLength(1);

      apiClient.listSubscriptionsCreatedBetween.mockResolvedValueOnce([
        {
          subscription_id: 'sub_8d',
          customer_id: 'cus_1',
          amount_usd: 4.99,
          currency: 'usd',
          created_at: '2026-04-21T12:00:00Z',
          utm_source: 'meta',
          utm_content: 'AD_X',
          utm_click_timestamp: '2026-04-13T12:00:00Z',
        },
      ]);
      const within7 = await fetchStripeAttribution({
        apiClient,
        windowStart: new Date('2026-04-01'),
        windowEnd: new Date('2026-05-01'),
        attributionWindowDays: 7,
      });
      expect(within7).toHaveLength(0);
    });
  });
```

- [ ] **Step 4: Run failing tests, implement, re-run**

```bash
npx vitest run src/modules/advertising/perceive/__tests__/stripe-attribution.test.ts -t "attribution window"
```

Expected: 3 FAIL → apply Steps 1-2 (and the type extension) → 3 PASS.

- [ ] **Step 5: Verify checkout creation sets `utm_click_timestamp`**

The new attribution depends on the checkout session storing this metadata. Search for Stripe checkout session creation:

```bash
grep -rn "stripe.checkout.sessions.create\|metadata.*utm" src/app/api src/modules/billing 2>/dev/null
```

If `metadata.utm_click_timestamp` is NOT yet being set during checkout, file a follow-up note in the PR description for the founder. (Do NOT fix in this track — checkout-session shape is out of scope. Fix is documented for v3a/v3b transition.)

- [ ] **Step 6: Typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/perceive src/shared/types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/advertising/perceive/stripe-attribution.ts \
        src/modules/advertising/perceive/__tests__/stripe-attribution.test.ts \
        src/shared/types/advertising.ts
git commit -m "feat(advertising/perceive): stripe-attribution 14-day window from utm_click_timestamp"
```

- [ ] **Step 8: Notify coordinator** — Wave 0 / Track 5 complete. Open follow-up note: verify checkout-session metadata sets `utm_click_timestamp`.

---

# Track 6 — Vision-checker module + brand + symbol checks

**Owner:** Wave 0, agent 6
**Blockers:** none
**Blocks:** none
**Files:**
- Create: `src/modules/advertising/creative-gen/safety/vision-checker.ts`
- Modify: `src/modules/advertising/creative-gen/safety/checks.ts:122-163`
- Create: `src/modules/advertising/creative-gen/safety/__tests__/vision-checker.test.ts`
- Modify: `src/modules/advertising/creative-gen/safety/__tests__/checks.test.ts`

Both `brandConsistencyCheck` and `controversialSymbolCheck` are currently stubs returning `passed: true`. Replace with Gemini Vision calls, asymmetric error handling: brand-fail → soft-pass with warning; symbol-fail → fail (Meta policy violation = wasted spend).

- [ ] **Step 1: Confirm `@google/generative-ai` is in `package.json`**

Run: `node -e "require('@google/generative-ai')"`. If it errors with "Cannot find module", install it:
```bash
npm install @google/generative-ai
```
The spec assumes this is already present (used in the avatar pipeline). Verify before proceeding.

- [ ] **Step 2: Write failing test for the new vision-checker module**

Create `src/modules/advertising/creative-gen/safety/__tests__/vision-checker.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel: mockGetGenerativeModel })),
}));

import { GeminiVisionClient, createGeminiVisionClient } from '../vision-checker';

describe('GeminiVisionClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('analyzeImage fetches the image, base64-encodes, and sends to Gemini', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
      { headers: { 'content-type': 'image/png' }, status: 200 },
    ));
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => '{"passed": true, "dominantColors": ["#FFD700"], "reason": "matches gold"}' },
    });

    const client = new GeminiVisionClient({ apiKey: 'test-key' });
    const result = await client.analyzeImage('https://example.com/img.png', 'BRAND PROMPT');

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/img.png');
    expect(mockGenerateContent).toHaveBeenCalledOnce();
    const args = mockGenerateContent.mock.calls[0][0];
    expect(args).toEqual([
      { inlineData: { data: expect.any(String), mimeType: 'image/png' } },
      expect.stringContaining('BRAND PROMPT'),
    ]);
    expect(result.json).toEqual({ passed: true, dominantColors: ['#FFD700'], reason: 'matches gold' });
    expect(result.cost_usd).toBe(0.0002);

    fetchSpy.mockRestore();
  });

  it('throws if the image fetch fails', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(null, { status: 404 }));
    const client = new GeminiVisionClient({ apiKey: 'test-key' });
    await expect(client.analyzeImage('https://example.com/missing.png', 'PROMPT'))
      .rejects.toThrow(/Image fetch failed: 404/);
    fetchSpy.mockRestore();
  });

  it('throws on invalid JSON from Gemini', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
      { headers: { 'content-type': 'image/png' }, status: 200 },
    ));
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'not json' },
    });
    const client = new GeminiVisionClient({ apiKey: 'test-key' });
    await expect(client.analyzeImage('https://example.com/img.png', 'PROMPT'))
      .rejects.toThrow(/JSON|Unexpected token/);
    fetchSpy.mockRestore();
  });
});

describe('createGeminiVisionClient', () => {
  it('throws if GEMINI_API_KEY is unset', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => createGeminiVisionClient()).toThrow(/GEMINI_API_KEY/);
  });

  it('returns a GeminiVisionClient when the key is set', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const client = createGeminiVisionClient();
    expect(client).toBeDefined();
  });
});
```

Run: `npx vitest run src/modules/advertising/creative-gen/safety/__tests__/vision-checker.test.ts`. Expected: FAIL with "Cannot find module '../vision-checker'".

- [ ] **Step 3: Implement `vision-checker.ts`**

Create `src/modules/advertising/creative-gen/safety/vision-checker.ts`:

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface VisionAnalysisResult {
  json: Record<string, unknown>;
  cost_usd: number;
}

export interface VisionClient {
  analyzeImage(imageUrl: string, prompt: string): Promise<VisionAnalysisResult>;
}

export interface GeminiVisionClientOptions {
  apiKey: string;
  /** Defaults to 'gemini-2.5-flash'. */
  model?: string;
}

export class GeminiVisionClient implements VisionClient {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(opts: GeminiVisionClientOptions) {
    this.genAI = new GoogleGenerativeAI(opts.apiKey);
    this.model = opts.model ?? 'gemini-2.5-flash';
  }

  async analyzeImage(imageUrl: string, prompt: string): Promise<VisionAnalysisResult> {
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Image fetch failed: ${imageRes.status} ${imageRes.statusText}`);
    }
    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = imageRes.headers.get('content-type') ?? 'image/jpeg';

    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      `${prompt}\nRespond ONLY with valid JSON, no other text, no markdown fences.`,
    ]);
    const text = result.response.text();
    // Strip markdown code fences if Gemini ignores the instruction
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const json = JSON.parse(cleaned);
    return { json, cost_usd: 0.0002 };
  }
}

export function createGeminiVisionClient(): VisionClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set — required for advertising vision checks');
  return new GeminiVisionClient({ apiKey });
}
```

Run the test again. Expected: PASS.

- [ ] **Step 4: Replace stubs in `checks.ts:122-163`**

Read the existing `brandConsistencyCheck` and `controversialSymbolCheck` signatures + the `SafetyDeps` / `CreativeBundle` / `SafetyCheckResult` types they use. Then replace both functions:

```ts
import type { VisionClient } from './vision-checker';

const BRAND_PALETTE = ['#FFD700', '#C0C0C0', '#9B8EC4', '#0A0A0F'] as const;

const BRAND_PROMPT = `Does this image use the Estrevia astrology app brand palette? \
Approved colors: gold (${BRAND_PALETTE[0]}), silver (${BRAND_PALETTE[1]}), \
deep purple (${BRAND_PALETTE[2]}), dark navy (${BRAND_PALETTE[3]}). \
The dominant 3-4 colors of the image should match within reasonable tolerance \
(CIE76 ΔE ≤ 25 — generous for AI-generated variations). \
Respond JSON: {"passed": boolean, "dominantColors": ["#hex", ...], "reason": "..."}.`;

const SYMBOL_PROMPT = `Identify any of the following in this image: \
pentagrams (5-pointed star inscribed in circle), inverted crosses, swastikas, \
religious crosses or crescents or stars-of-david, occult/satanic symbols. \
Innocuous astrological symbols (planet glyphs ☉☽♀♂♃, zodiac signs ♈♉♊, \
traditional astrology imagery) are ALLOWED — do not flag those. \
Respond JSON: {"found": boolean, "items": ["item1", ...], "reason": "..."}.`;

export async function brandConsistencyCheck(
  creative: CreativeBundle,
  deps?: { visionClient?: VisionClient },
): Promise<SafetyCheckResult> {
  if (!deps?.visionClient) {
    return {
      check_name: 'brand_consistency',
      passed: true,
      severity: 'info',
      reason: 'Vision client not configured — check skipped',
    };
  }
  try {
    const result = await deps.visionClient.analyzeImage(creative.asset.url, BRAND_PROMPT);
    const json = result.json as { passed: boolean; dominantColors?: string[]; reason?: string };
    return {
      check_name: 'brand_consistency',
      passed: json.passed,
      severity: json.passed ? 'info' : 'warning',
      reason: json.reason ?? `dominant colors: ${json.dominantColors?.join(', ') ?? 'unknown'}`,
    };
  } catch (err) {
    return {
      check_name: 'brand_consistency',
      passed: true,  // soft-pass — off-brand is bad but not blocking
      severity: 'warning',
      reason: `Vision check failed (degraded): ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

export async function controversialSymbolCheck(
  imageUrl: string,
  deps?: { visionClient?: VisionClient },
): Promise<SafetyCheckResult> {
  if (!deps?.visionClient) {
    return {
      check_name: 'controversial_symbol',
      passed: true,
      severity: 'info',
      reason: 'Vision client not configured — check skipped',
    };
  }
  try {
    const result = await deps.visionClient.analyzeImage(imageUrl, SYMBOL_PROMPT);
    const json = result.json as { found: boolean; items?: string[]; reason?: string };
    return {
      check_name: 'controversial_symbol',
      passed: !json.found,
      severity: json.found ? 'block' : 'info',
      reason: json.found
        ? `Detected: ${json.items?.join(', ') ?? 'unspecified'} — ${json.reason ?? ''}`
        : undefined,
    };
  } catch (err) {
    // Symbol check failure → fail-closed (warning, NOT block — manual review).
    return {
      check_name: 'controversial_symbol',
      passed: false,
      severity: 'warning',
      reason: `Vision check failed — manual review recommended: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}
```

- [ ] **Step 5: Update existing `checks.test.ts` to inject a mock vision client**

In `src/modules/advertising/creative-gen/safety/__tests__/checks.test.ts`, replace the existing stub-based tests for `brandConsistencyCheck` and `controversialSymbolCheck` with mocked-vision-client cases:

```ts
import type { VisionClient } from '../vision-checker';

const makeVision = (json: Record<string, unknown>): VisionClient => ({
  analyzeImage: vi.fn().mockResolvedValue({ json, cost_usd: 0.0002 }),
});

const makeVisionError = (msg: string): VisionClient => ({
  analyzeImage: vi.fn().mockRejectedValue(new Error(msg)),
});

describe('brandConsistencyCheck', () => {
  const creative = { asset: { url: 'https://example.com/c.png' } } as CreativeBundle;

  it('skips with info severity when no visionClient is provided', async () => {
    const r = await brandConsistencyCheck(creative);
    expect(r.passed).toBe(true);
    expect(r.severity).toBe('info');
    expect(r.reason).toMatch(/skipped/i);
  });

  it('passes when Gemini returns passed=true', async () => {
    const r = await brandConsistencyCheck(creative, {
      visionClient: makeVision({ passed: true, dominantColors: ['#FFD700'], reason: 'gold dominant' }),
    });
    expect(r).toEqual({
      check_name: 'brand_consistency',
      passed: true,
      severity: 'info',
      reason: 'gold dominant',
    });
  });

  it('warns (passed=false, severity=warning) when Gemini returns passed=false', async () => {
    const r = await brandConsistencyCheck(creative, {
      visionClient: makeVision({ passed: false, dominantColors: ['#FF00FF'], reason: 'magenta off-brand' }),
    });
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('warning');
  });

  it('soft-passes with warning when vision call throws', async () => {
    const r = await brandConsistencyCheck(creative, {
      visionClient: makeVisionError('rate limit'),
    });
    expect(r.passed).toBe(true);
    expect(r.severity).toBe('warning');
    expect(r.reason).toMatch(/Vision check failed/);
  });
});

describe('controversialSymbolCheck', () => {
  it('skips with info severity when no visionClient is provided', async () => {
    const r = await controversialSymbolCheck('https://example.com/img.png');
    expect(r.passed).toBe(true);
    expect(r.severity).toBe('info');
  });

  it('passes when no symbols found', async () => {
    const r = await controversialSymbolCheck('https://example.com/img.png', {
      visionClient: makeVision({ found: false }),
    });
    expect(r).toEqual({
      check_name: 'controversial_symbol',
      passed: true,
      severity: 'info',
      reason: undefined,
    });
  });

  it('blocks when controversial symbols found', async () => {
    const r = await controversialSymbolCheck('https://example.com/img.png', {
      visionClient: makeVision({ found: true, items: ['pentagram'], reason: 'inverted star' }),
    });
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('block');
    expect(r.reason).toContain('pentagram');
  });

  it('fails (passed=false, severity=warning) when vision throws — fail-closed', async () => {
    const r = await controversialSymbolCheck('https://example.com/img.png', {
      visionClient: makeVisionError('quota exceeded'),
    });
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('warning');
    expect(r.reason).toMatch(/manual review/);
  });
});
```

Run: `npx vitest run src/modules/advertising/creative-gen/safety/__tests__/checks.test.ts`. Expected: PASS.

- [ ] **Step 6: Wire `visionClient` into the call chain (creative-gen orchestrator)**

Identify where `brandConsistencyCheck` / `controversialSymbolCheck` are called from production code:
```bash
grep -rn "brandConsistencyCheck\|controversialSymbolCheck" src/modules/advertising | grep -v __tests__
```
At each callsite, ensure the orchestrator passes a real vision client built via `createGeminiVisionClient()`. Wrap construction in `try/catch`: if `GEMINI_API_KEY` is unset, log a warning once and pass no `visionClient` (functions degrade gracefully).

Example wiring pattern (in the creative-gen orchestrator file):

```ts
import { createGeminiVisionClient } from './safety/vision-checker';

let visionClient: VisionClient | undefined;
try {
  visionClient = createGeminiVisionClient();
} catch (err) {
  console.warn('[creative-gen] GEMINI_API_KEY not set — vision checks will be skipped');
}

// ... in the safety-check loop:
const brand = await brandConsistencyCheck(creative, { visionClient });
const symbol = await controversialSymbolCheck(creative.asset.url, { visionClient });
```

- [ ] **Step 7: Cost-monitoring stub for retro-weekly digest**

Add to `src/modules/advertising/creative-gen/safety/checks.ts` an exported helper:

```ts
export interface VisionCostAccumulator {
  total_usd: number;
  call_count: number;
}

export function newVisionCostAccumulator(): VisionCostAccumulator {
  return { total_usd: 0, call_count: 0 };
}

export function recordVisionCall(acc: VisionCostAccumulator, result: { cost_usd: number } | undefined) {
  if (!result) return;
  acc.total_usd += result.cost_usd;
  acc.call_count += 1;
}
```

Track 9 (retro-weekly) will read this if available. For now, add a basic test that confirms the accumulator math:

```ts
describe('VisionCostAccumulator', () => {
  it('accumulates cost across multiple calls', () => {
    const acc = newVisionCostAccumulator();
    recordVisionCall(acc, { cost_usd: 0.0002 });
    recordVisionCall(acc, { cost_usd: 0.0002 });
    recordVisionCall(acc, undefined);
    expect(acc.total_usd).toBeCloseTo(0.0004, 5);
    expect(acc.call_count).toBe(2);
  });
});
```

- [ ] **Step 8: Typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/creative-gen
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/advertising/creative-gen/safety
git commit -m "feat(advertising/safety): integrate Gemini Vision for brand + symbol checks"
```

- [ ] **Step 10: Notify coordinator** — Wave 0 / Track 6 complete.

---

# Track 7 — Audience-refresh real implementations (4 modules)

**Owner:** Wave 1, agent 7
**Blockers:** Track 4 (HogQL pattern in `funnel-client.ts` is referenced when writing `posthog-emails.ts`)
**Blocks:** none
**Files:**
- Create: `src/modules/advertising/audiences/stripe-client.ts` + test
- Create: `src/modules/advertising/audiences/posthog-emails.ts` + test
- Create: `src/modules/advertising/audiences/meta-custom-audiences.ts` + test
- Create: `src/modules/advertising/audiences/audience-row-store.ts` + test
- Modify: `src/app/api/cron/advertising/audience-refresh/route.ts` (lines 79-114)
- Modify: `src/app/api/cron/advertising/__tests__/audience-refresh.test.ts`

The current cron runs daily, succeeds, but creates zero audiences (all 7 deps are stubs). This is the largest track in v3a.

- [ ] **Step 1: Implement `stripe-client.ts` with TDD**

Create `src/modules/advertising/audiences/__tests__/stripe-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubscriptionsList = vi.fn();

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({
    subscriptions: { list: mockSubscriptionsList },
  }),
}));

import { listActiveCustomers } from '../stripe-client';

describe('listActiveCustomers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns deduplicated, lowercased emails from active subscriptions', async () => {
    mockSubscriptionsList.mockResolvedValueOnce({
      data: [
        { id: 's_1', customer: { email: 'Alice@Example.com' } },
        { id: 's_2', customer: { email: 'bob@example.com' } },
        { id: 's_3', customer: { email: 'alice@example.com' } }, // dup
        { id: 's_4', customer: { email: null } },                // skip
      ],
      has_more: false,
    });
    const out = await listActiveCustomers();
    expect(out).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('paginates via starting_after when has_more is true', async () => {
    mockSubscriptionsList.mockResolvedValueOnce({
      data: [{ id: 's_a', customer: { email: 'a@x.com' } }],
      has_more: true,
    });
    mockSubscriptionsList.mockResolvedValueOnce({
      data: [{ id: 's_b', customer: { email: 'b@x.com' } }],
      has_more: false,
    });
    const out = await listActiveCustomers();
    expect(out.sort()).toEqual(['a@x.com', 'b@x.com']);
    expect(mockSubscriptionsList).toHaveBeenCalledTimes(2);
    expect(mockSubscriptionsList.mock.calls[1][0]).toMatchObject({ starting_after: 's_a' });
  });
});
```

Implement `src/modules/advertising/audiences/stripe-client.ts`:

```ts
import { getStripe } from '@/shared/lib/stripe';
import type Stripe from 'stripe';

/**
 * Returns the deduplicated, lowercased email list of all currently-active
 * Stripe subscriptions. Used to build Meta Custom Audience exclusion list
 * (we don't want to retarget paying users with acquisition ads).
 */
export async function listActiveCustomers(): Promise<string[]> {
  const stripe = getStripe();
  const emails = new Set<string>();
  let starting_after: string | undefined;

  while (true) {
    const subs: Stripe.ApiList<Stripe.Subscription> = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after,
      expand: ['data.customer'],
    });

    for (const sub of subs.data) {
      const cust = sub.customer as Stripe.Customer | null;
      if (cust?.email) emails.add(normalizeEmail(cust.email));
    }

    if (!subs.has_more) break;
    const last = subs.data[subs.data.length - 1];
    if (!last) break;
    starting_after = last.id;
  }

  return [...emails];
}

function normalizeEmail(e: string): string {
  return e.toLowerCase().trim();
}
```

Run: `npx vitest run src/modules/advertising/audiences/__tests__/stripe-client.test.ts`. Expected: PASS.

- [ ] **Step 2: Implement `posthog-emails.ts` with TDD**

Create `src/modules/advertising/audiences/__tests__/posthog-emails.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();

vi.mock('../posthog-emails', async () => {
  const actual = await vi.importActual<typeof import('../posthog-emails')>('../posthog-emails');
  return actual;
});

import {
  getRecentlyRegisteredEmails,
  getCalcNoRegisterEmails,
  getRegisterNoPaidEmails,
} from '../posthog-emails';

describe('posthog-emails HogQL queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.POSTHOG_PROJECT_ID = 'p1';
    process.env.POSTHOG_PERSONAL_API_KEY = 'k1';
    process.env.POSTHOG_HOST = 'https://eu.posthog.com';
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [['user@x.com'], ['other@x.com']] }),
    });
  });

  it('getRecentlyRegisteredEmails issues a HogQL query filtering on user_registered + sinceDate', async () => {
    const out = await getRecentlyRegisteredEmails(new Date('2026-04-26T00:00:00Z'));
    expect(out).toEqual(['user@x.com', 'other@x.com']);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.query.query).toMatch(/event = 'user_registered'/);
    expect(body.query.query).toMatch(/2026-04-26/);
  });

  it('getCalcNoRegisterEmails excludes distinct_ids that registered', async () => {
    await getCalcNoRegisterEmails(7);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.query.query).toMatch(/event = 'chart_calculated'/);
    expect(body.query.query).toMatch(/NOT IN/);
    expect(body.query.query).toMatch(/event = 'user_registered'/);
  });

  it('getRegisterNoPaidEmails excludes distinct_ids that subscribed', async () => {
    await getRegisterNoPaidEmails(14);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.query.query).toMatch(/event = 'user_registered'/);
    expect(body.query.query).toMatch(/event = 'subscription_started'/);
  });
});
```

Implement `src/modules/advertising/audiences/posthog-emails.ts`:

```ts
/**
 * HogQL queries used by audience-refresh to build retargeting + re-engagement
 * lists. All return deduplicated normalized email strings.
 *
 * Reuses the auth pattern from `src/modules/advertising/posthog/funnel-client.ts:71-79`.
 */

interface HogQLResponse {
  results?: Array<Array<unknown>>;
}

async function runHogQL(query: string): Promise<string[]> {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const host = (process.env.POSTHOG_HOST ?? 'https://eu.posthog.com').replace(/\/$/, '');
  if (!projectId || !apiKey) throw new Error('POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY missing');

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PostHog query failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as HogQLResponse;
  const rows = json.results ?? [];
  const emails = rows
    .map((r) => String(r[0] ?? '').toLowerCase().trim())
    .filter((e) => e.length > 0 && e.includes('@'));
  return [...new Set(emails)];
}

export async function getRecentlyRegisteredEmails(sinceDate: Date): Promise<string[]> {
  const sinceIso = sinceDate.toISOString().slice(0, 10);
  const query = `SELECT DISTINCT properties.email AS email
                 FROM events
                 WHERE event = 'user_registered'
                   AND timestamp >= toDateTime('${sinceIso}')
                   AND properties.email IS NOT NULL`;
  return runHogQL(query);
}

export async function getCalcNoRegisterEmails(windowDays: number): Promise<string[]> {
  const sinceIso = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const query = `SELECT DISTINCT properties.email AS email
                 FROM events
                 WHERE event = 'chart_calculated'
                   AND timestamp >= toDateTime('${sinceIso}')
                   AND properties.email IS NOT NULL
                   AND distinct_id NOT IN (
                     SELECT DISTINCT distinct_id FROM events
                     WHERE event = 'user_registered'
                       AND timestamp >= toDateTime('${sinceIso}')
                   )`;
  return runHogQL(query);
}

export async function getRegisterNoPaidEmails(windowDays: number): Promise<string[]> {
  const sinceIso = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const query = `SELECT DISTINCT properties.email AS email
                 FROM events
                 WHERE event = 'user_registered'
                   AND timestamp >= toDateTime('${sinceIso}')
                   AND properties.email IS NOT NULL
                   AND distinct_id NOT IN (
                     SELECT DISTINCT distinct_id FROM events
                     WHERE event = 'subscription_started'
                       AND timestamp >= toDateTime('${sinceIso}')
                   )`;
  return runHogQL(query);
}
```

Run the test. Expected: PASS.

- [ ] **Step 3: Implement `meta-custom-audiences.ts` with TDD**

Create `src/modules/advertising/audiences/__tests__/meta-custom-audiences.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertCustomAudience } from '../meta-custom-audiences';
import crypto from 'crypto';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.META_ACCESS_TOKEN = 'tok';
  process.env.META_AD_ACCOUNT_ID = 'act_999';
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('upsertCustomAudience', () => {
  it('creates a new audience when meta_audience_id is not provided', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'aud_111' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ num_received: 2 }) });

    const out = await upsertCustomAudience({
      name: 'Estrevia: Active subscribers (exclusion)',
      description: 'Daily-rebuilt exclusion list of active Stripe subscribers.',
      emails: ['alice@example.com', 'bob@example.com'],
    });

    expect(out).toEqual({ audience_id: 'aud_111', size: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Create call
    const createUrl = mockFetch.mock.calls[0][0] as string;
    expect(createUrl).toMatch(/\/act_999\/customaudiences/);
    const createBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(createBody).toMatchObject({
      name: 'Estrevia: Active subscribers (exclusion)',
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
      access_token: 'tok',
    });
    // Users upload call
    const usersUrl = mockFetch.mock.calls[1][0] as string;
    expect(usersUrl).toMatch(/\/aud_111\/users/);
    const usersBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(usersBody.payload.schema).toEqual(['EMAIL']);
    expect(usersBody.payload.data).toEqual([
      [sha256('alice@example.com')],
      [sha256('bob@example.com')],
    ]);
  });

  it('skips creation when meta_audience_id is provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ num_received: 1 }) });
    const out = await upsertCustomAudience({
      name: 'reused',
      description: 'd',
      emails: ['c@x.com'],
      meta_audience_id: 'aud_existing',
    });
    expect(out.audience_id).toBe('aud_existing');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toMatch(/\/aud_existing\/users/);
  });

  it('throws on Meta API failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'oops' });
    await expect(upsertCustomAudience({
      name: 'x',
      description: 'd',
      emails: ['z@x.com'],
    })).rejects.toThrow(/Meta createCustomAudience failed/);
  });
});
```

Implement `src/modules/advertising/audiences/meta-custom-audiences.ts`:

```ts
import crypto from 'crypto';

const GRAPH_API_VERSION = 'v22.0';

export interface UpsertCustomAudienceOpts {
  name: string;
  description: string;
  /** Already normalized lowercase + trimmed; this module is responsible for SHA-256 hashing. */
  emails: string[];
  /** If present, skip creation and replace contents on this audience. */
  meta_audience_id?: string;
}

export async function upsertCustomAudience(
  opts: UpsertCustomAudienceOpts,
): Promise<{ audience_id: string; size: number }> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    throw new Error('META_ACCESS_TOKEN / META_AD_ACCOUNT_ID missing');
  }

  let audienceId = opts.meta_audience_id;

  if (!audienceId) {
    const createRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/customaudiences`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: opts.name,
          description: opts.description,
          subtype: 'CUSTOM',
          customer_file_source: 'USER_PROVIDED_ONLY',
          access_token: accessToken,
        }),
      },
    );
    if (!createRes.ok) {
      throw new Error(
        `Meta createCustomAudience failed: ${createRes.status} ${await createRes.text()}`,
      );
    }
    audienceId = ((await createRes.json()) as { id: string }).id;
  }

  // PII hashing — Meta requires SHA-256 lowercase-trim emails
  const hashedEmails = opts.emails.map((e) => sha256Hex(e));

  const replaceRes = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${audienceId}/users`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          schema: ['EMAIL'],
          data: hashedEmails.map((h) => [h]),
        },
        session: {
          session_id: Date.now(),
          batch_seq: 1,
          last_batch_flag: true,
        },
        access_token: accessToken,
      }),
    },
  );
  if (!replaceRes.ok) {
    throw new Error(
      `Meta upsertAudience users failed: ${replaceRes.status} ${await replaceRes.text()}`,
    );
  }

  const result = (await replaceRes.json()) as { num_received?: number };
  return { audience_id: audienceId, size: result.num_received ?? opts.emails.length };
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
```

Run the test. Expected: PASS.

- [ ] **Step 4: Implement `audience-row-store.ts` with TDD (Drizzle CRUD)**

Create `src/modules/advertising/audiences/__tests__/audience-row-store.test.ts` using the proven `vi.hoisted` pattern from `cron-handlers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => Promise.resolve());
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  return { mockDb: chain };
});

vi.mock('@/shared/lib/db', () => ({
  getDb: () => mockDb,
}));

vi.mock('nanoid', () => ({ nanoid: () => 'nano_001' }));

import { upsertAudienceRow } from '../audience-row-store';

beforeEach(() => {
  Object.values(mockDb).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.());
  // Re-set chain returns after clear
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockImplementation(() => mockDb);
  mockDb.values.mockResolvedValue(undefined);
  mockDb.update.mockImplementation(() => mockDb);
  mockDb.set.mockImplementation(() => mockDb);
});

describe('upsertAudienceRow', () => {
  it('inserts new row when none exists for kind', async () => {
    const result = await upsertAudienceRow({
      kind: 'exclusion',
      metaAudienceId: 'aud_111',
      size: 5,
      sourceQuery: 'stripe.subscriptions.active',
    });
    expect(result).toEqual({ id: 'nano_001' });
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({
      id: 'nano_001',
      kind: 'exclusion',
      metaAudienceId: 'aud_111',
      size: 5,
      sourceQuery: 'stripe.subscriptions.active',
    }));
  });

  it('updates existing row when one exists for kind', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'existing_001' }]);
    const result = await upsertAudienceRow({
      kind: 'exclusion',
      metaAudienceId: 'aud_222',
      size: 7,
      sourceQuery: 'stripe.subscriptions.active',
    });
    expect(result).toEqual({ id: 'existing_001' });
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
      metaAudienceId: 'aud_222',
      size: 7,
    }));
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
```

Implement `src/modules/advertising/audiences/audience-row-store.ts`:

```ts
import { getDb } from '@/shared/lib/db';
import { advertisingAudiences } from '@/shared/lib/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type AudienceKind =
  | 'exclusion'
  | 'retargeting_calc_no_register'
  | 'retargeting_register_no_paid'
  | 'lookalike_seed';

export interface UpsertAudienceRowInput {
  kind: AudienceKind;
  metaAudienceId: string | null;
  size: number;
  sourceQuery: string;
}

export async function upsertAudienceRow(row: UpsertAudienceRowInput): Promise<{ id: string }> {
  const db = getDb();

  const existing = await db
    .select({ id: advertisingAudiences.id })
    .from(advertisingAudiences)
    .where(eq(advertisingAudiences.kind, row.kind))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(advertisingAudiences)
      .set({
        metaAudienceId: row.metaAudienceId,
        size: row.size,
        lastRefreshedAt: new Date(),
        sourceQuery: row.sourceQuery,
      })
      .where(eq(advertisingAudiences.id, existing[0].id));
    return { id: existing[0].id };
  }

  const id = nanoid();
  await db.insert(advertisingAudiences).values({
    id,
    kind: row.kind,
    metaAudienceId: row.metaAudienceId,
    size: row.size,
    lastRefreshedAt: new Date(),
    sourceQuery: row.sourceQuery,
    activeInCampaigns: [],
  });
  return { id };
}
```

Run the test. Expected: PASS.

- [ ] **Step 5: Wire the four modules into `audience-refresh/route.ts:79-114`**

Replace `buildExclusionsDeps` and `buildRetargetingDeps`:

```ts
import * as stripeClient from '@/modules/advertising/audiences/stripe-client';
import * as posthogEmails from '@/modules/advertising/audiences/posthog-emails';
import * as metaCustomAudiences from '@/modules/advertising/audiences/meta-custom-audiences';
import * as audienceRowStore from '@/modules/advertising/audiences/audience-row-store';

function buildExclusionsDeps(): ExclusionsDeps {
  return {
    stripe: { listActiveCustomers: stripeClient.listActiveCustomers },
    posthog: { getRecentlyRegisteredEmails: posthogEmails.getRecentlyRegisteredEmails },
    metaApi: { upsertCustomAudience: metaCustomAudiences.upsertCustomAudience },
    db: { upsertAudienceRow: audienceRowStore.upsertAudienceRow },
  };
}

function buildRetargetingDeps(): RetargetingDeps {
  return {
    posthog: {
      getCalcNoRegisterEmails: (days) => posthogEmails.getCalcNoRegisterEmails(days),
      getRegisterNoPaidEmails: (days) => posthogEmails.getRegisterNoPaidEmails(days),
    },
    metaApi: { upsertCustomAudience: metaCustomAudiences.upsertCustomAudience },
    db: {
      upsertAudienceRow: audienceRowStore.upsertAudienceRow,
      // Keep existing feature-gate impl from current code if any; otherwise stub:
      getFeatureGateMode: async (_featureId: string) => null,
      activateFeatureGate: async (_featureId: string) => undefined,
    },
  };
}
```

(For `getFeatureGateMode` / `activateFeatureGate`, if there's an existing `feature-gates` module in scope, use it. Otherwise the existing in-route stub stays — gate flipping is out of scope for v3a.)

- [ ] **Step 6: Update the cron integration test to assert the wired path**

In `src/app/api/cron/advertising/__tests__/audience-refresh.test.ts` (create if missing — model after `cron-handlers.test.ts` Track 9 pattern with the `vi.hoisted` Drizzle mock):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockFetch, mockStripeList } = vi.hoisted(() => {
  const dbChain: Record<string, ReturnType<typeof vi.fn>> = {};
  dbChain.select = vi.fn(() => dbChain);
  dbChain.from = vi.fn(() => dbChain);
  dbChain.where = vi.fn(() => dbChain);
  dbChain.limit = vi.fn(() => Promise.resolve([]));
  dbChain.insert = vi.fn(() => dbChain);
  dbChain.values = vi.fn(() => Promise.resolve());
  dbChain.update = vi.fn(() => dbChain);
  dbChain.set = vi.fn(() => dbChain);
  return {
    mockDb: dbChain,
    mockFetch: vi.fn(),
    mockStripeList: vi.fn(),
  };
});

vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDb }));
vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({ subscriptions: { list: mockStripeList } }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test_secret';
  process.env.META_ACCESS_TOKEN = 'tok';
  process.env.META_AD_ACCOUNT_ID = 'act_999';
  process.env.POSTHOG_PROJECT_ID = 'p1';
  process.env.POSTHOG_PERSONAL_API_KEY = 'k1';
  global.fetch = mockFetch as unknown as typeof fetch;
  // Default: empty audiences from all sources
  mockStripeList.mockResolvedValue({ data: [], has_more: false });
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('posthog.com')) {
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
    if (url.includes('graph.facebook.com')) {
      if (url.endsWith('/customaudiences')) {
        return new Response(JSON.stringify({ id: 'aud_xxx' }), { status: 200 });
      }
      return new Response(JSON.stringify({ num_received: 0 }), { status: 200 });
    }
    return new Response('not-found', { status: 404 });
  });
});

describe('audience-refresh route — real wiring', () => {
  it('returns success and exercises stripe + posthog + meta + db calls (smoke)', async () => {
    const { GET } = await import('../audience-refresh/route');
    const req = new Request('http://localhost/api/cron/advertising/audience-refresh', {
      headers: { authorization: 'Bearer test_secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
    expect(mockStripeList).toHaveBeenCalled();
    // Each audience kind triggers PostHog/Meta calls; ensure at least one of each fired
    const posthogCalls = mockFetch.mock.calls.filter((c) => (c[0] as string).includes('posthog.com'));
    expect(posthogCalls.length).toBeGreaterThan(0);
  });
});
```

Run: `npx vitest run src/app/api/cron/advertising/__tests__/audience-refresh.test.ts`. Expected: PASS.

- [ ] **Step 7: Sentry per-source tags in the route**

In `audience-refresh/route.ts`, around any `Sentry.captureException` call inside the per-audience-kind try/catch (existing in `refresh-cycle.ts`), ensure tags include `subsystem: 'audiences'`, `kind: <audienceKind>`, `source: 'stripe' | 'posthog' | 'meta'` per spec lines 395-397. If the existing code doesn't pass tags, extend it.

- [ ] **Step 8: Telegram warning when failed_audiences > 0**

The existing route's summary likely tracks `failed_audiences`. Add a Telegram alert at the bottom of the route handler if `summary.failed_audiences > 0`:

```ts
if (summary.failed_audiences > 0 && telegramBot) {
  try {
    await telegramBot.sendAlert(
      'warning',
      `⚠️ audience-refresh: ${summary.failed_audiences} audience(s) failed. Review Sentry for details.`,
    );
  } catch (alertErr) {
    console.error('[audience-refresh] Telegram alert failed:', alertErr);
  }
}
```

(If the existing route doesn't yet build a `telegramBot`, skip this in scope and leave a TODO comment for v3c stale-audience-health-check.)

- [ ] **Step 9: Typecheck + lint + full audience scope test**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/audiences src/app/api/cron/advertising
npx vitest run src/modules/advertising/audiences src/app/api/cron/advertising
```

Expected: PASS / no new errors.

- [ ] **Step 10: Commit**

```bash
git add src/modules/advertising/audiences \
        src/app/api/cron/advertising/audience-refresh \
        src/app/api/cron/advertising/__tests__/audience-refresh.test.ts
git commit -m "feat(advertising/audiences): real Stripe / PostHog / Meta CA implementations"
```

- [ ] **Step 11: Notify coordinator** — Wave 1 / Track 7 complete.

---

# Track 8 — Reconciler global suspend (DB + state-store + reconciler + orchestrator gate + admin UI)

**Owner:** Wave 1, agent 8
**Blockers:** none (independent of Track 7 / Track 9)
**Blocks:** none
**Files:**
- Modify: `src/shared/lib/schema.ts` — add `advertising_recon_state` table
- Create: `drizzle/<timestamp>_advertising_recon_state.sql` — migration (via `npm run db:generate`)
- Create: `src/modules/advertising/perceive/recon-state-store.ts` + test
- Modify: `src/modules/advertising/perceive/reconciler.ts` — call `suspend()` on critical_drift
- Modify: `src/modules/advertising/perceive/__tests__/reconciler.test.ts`
- Modify: `src/modules/advertising/decide/orchestrator.ts` — gate decisions when suspended
- Modify: `src/modules/advertising/decide/__tests__/orchestrator.test.ts`
- Modify: `src/app/api/cron/advertising/triage-daily/route.ts` — call `checkAutoResume()` at start
- Modify: `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`
- Create: `src/app/admin/advertising/recon-state/page.tsx`
- Create: `src/app/admin/advertising/recon-state/actions.ts`
- Modify: `src/app/admin/advertising/layout.tsx` — add nav link

When Meta vs PostHog drift > 25%, current behaviour: alert + agent continues acting on drifted data. New behaviour: agent suspends all non-emergency decisions, auto-resumes after 24h, founder can override via admin UI.

- [ ] **Step 1: Add `advertising_recon_state` table to `schema.ts`**

In `src/shared/lib/schema.ts`, add (placement — after `advertisingShadowComparisons` block):

```ts
// ---------------------------------------------------------------------------
// advertising_recon_state  — singleton row tracking reconciler suspend state
// ---------------------------------------------------------------------------
export const advertisingReconState = pgTable('advertising_recon_state', {
  id: text('id').primaryKey().default('singleton'),
  suspended: boolean('suspended').notNull().default(false),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  suspendReason: text('suspend_reason'),
  autoResumeAt: timestamp('auto_resume_at', { withTimezone: true }),
  lastDriftPct: real('last_drift_pct'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AdvertisingReconState = typeof advertisingReconState.$inferSelect;
```

Ensure the imports at the top of the file include `real` and `boolean` from `drizzle-orm/pg-core` (likely already present).

- [ ] **Step 2: Generate the Drizzle migration**

```bash
npm run db:generate
```

This emits `drizzle/<timestamp>_advertising_recon_state.sql` (or appends to the latest). Inspect the generated SQL — it should include the `CREATE TABLE` statement. Add an `INSERT` to seed the singleton row:

```sql
INSERT INTO "advertising_recon_state" ("id", "suspended") VALUES ('singleton', false)
ON CONFLICT ("id") DO NOTHING;
```

Append this `INSERT` to the generated migration (or to a fresh `<timestamp>_seed_recon_state_singleton.sql`).

- [ ] **Step 3: Implement `recon-state-store.ts` with TDD**

Create `src/modules/advertising/perceive/__tests__/recon-state-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => Promise.resolve());
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  return { mockDb: chain };
});

vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDb }));

import { getReconState, suspend, resume, checkAutoResume } from '../recon-state-store';

beforeEach(() => {
  Object.values(mockDb).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.());
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockImplementation(() => mockDb);
  mockDb.values.mockResolvedValue(undefined);
  mockDb.update.mockImplementation(() => mockDb);
  mockDb.set.mockImplementation(() => mockDb);
});

describe('recon-state-store', () => {
  it('getReconState bootstraps singleton row when missing', async () => {
    mockDb.limit.mockResolvedValueOnce([]); // first call: no row
    const state = await getReconState();
    expect(mockDb.insert).toHaveBeenCalled();
    expect(state).toEqual({
      suspended: false,
      suspendedAt: null,
      suspendReason: null,
      autoResumeAt: null,
      lastDriftPct: null,
    });
  });

  it('getReconState returns the row when present', async () => {
    const row = {
      suspended: true,
      suspendedAt: new Date('2026-05-03T12:00:00Z'),
      suspendReason: 'critical_drift',
      autoResumeAt: new Date('2026-05-04T12:00:00Z'),
      lastDriftPct: 0.42,
    };
    mockDb.limit.mockResolvedValueOnce([row]);
    const state = await getReconState();
    expect(state).toEqual(row);
  });

  it('suspend writes suspended=true with computed autoResumeAt 24h out by default', async () => {
    const before = Date.now();
    await suspend('critical_drift: m=100 ph=50', 0.5);
    const setArg = mockDb.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.suspended).toBe(true);
    expect(setArg.suspendReason).toBe('critical_drift: m=100 ph=50');
    expect(setArg.lastDriftPct).toBe(0.5);
    const autoResumeMs = (setArg.autoResumeAt as Date).getTime();
    const expected = before + 24 * 3600 * 1000;
    expect(Math.abs(autoResumeMs - expected)).toBeLessThan(2000);
  });

  it('resume clears suspended state', async () => {
    await resume('founder_manual_override');
    const setArg = mockDb.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.suspended).toBe(false);
    expect(setArg.suspendedAt).toBeNull();
    expect(setArg.suspendReason).toBeNull();
    expect(setArg.autoResumeAt).toBeNull();
  });

  it('checkAutoResume calls resume() when 24h elapsed', async () => {
    const past = new Date(Date.now() - 25 * 3600 * 1000);
    mockDb.limit.mockResolvedValueOnce([{
      suspended: true,
      suspendedAt: past,
      suspendReason: 'critical_drift',
      autoResumeAt: past,
      lastDriftPct: 0.3,
    }]);
    const result = await checkAutoResume();
    expect(result.resumed).toBe(true);
    expect(result.reason).toBe('auto_resume_24h_elapsed');
  });

  it('checkAutoResume returns resumed=false when not suspended', async () => {
    mockDb.limit.mockResolvedValueOnce([{
      suspended: false,
      suspendedAt: null,
      suspendReason: null,
      autoResumeAt: null,
      lastDriftPct: null,
    }]);
    const result = await checkAutoResume();
    expect(result).toEqual({ resumed: false });
  });

  it('checkAutoResume returns resumed=false when suspended but autoResumeAt in future', async () => {
    const future = new Date(Date.now() + 12 * 3600 * 1000);
    mockDb.limit.mockResolvedValueOnce([{
      suspended: true,
      suspendedAt: new Date(),
      suspendReason: 'critical_drift',
      autoResumeAt: future,
      lastDriftPct: 0.3,
    }]);
    const result = await checkAutoResume();
    expect(result.resumed).toBe(false);
  });
});
```

Implement `src/modules/advertising/perceive/recon-state-store.ts`:

```ts
import { getDb } from '@/shared/lib/db';
import { advertisingReconState } from '@/shared/lib/schema';
import { eq } from 'drizzle-orm';

export interface ReconState {
  suspended: boolean;
  suspendedAt: Date | null;
  suspendReason: string | null;
  autoResumeAt: Date | null;
  lastDriftPct: number | null;
}

export async function getReconState(): Promise<ReconState> {
  const db = getDb();
  const rows = await db
    .select()
    .from(advertisingReconState)
    .where(eq(advertisingReconState.id, 'singleton'))
    .limit(1);

  if (rows.length === 0) {
    await db.insert(advertisingReconState).values({ id: 'singleton', suspended: false });
    return {
      suspended: false,
      suspendedAt: null,
      suspendReason: null,
      autoResumeAt: null,
      lastDriftPct: null,
    };
  }

  const r = rows[0];
  return {
    suspended: r.suspended,
    suspendedAt: r.suspendedAt,
    suspendReason: r.suspendReason,
    autoResumeAt: r.autoResumeAt,
    lastDriftPct: r.lastDriftPct,
  };
}

export async function suspend(
  reason: string,
  driftPct: number,
  autoResumeHours = 24,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(advertisingReconState)
    .set({
      suspended: true,
      suspendedAt: now,
      suspendReason: reason,
      autoResumeAt: new Date(now.getTime() + autoResumeHours * 3600 * 1000),
      lastDriftPct: driftPct,
      updatedAt: now,
    })
    .where(eq(advertisingReconState.id, 'singleton'));
}

export async function resume(_reason: string): Promise<void> {
  const db = getDb();
  await db
    .update(advertisingReconState)
    .set({
      suspended: false,
      suspendedAt: null,
      suspendReason: null,
      autoResumeAt: null,
      updatedAt: new Date(),
    })
    .where(eq(advertisingReconState.id, 'singleton'));
}

export async function checkAutoResume(): Promise<{ resumed: boolean; reason?: string }> {
  const state = await getReconState();
  if (!state.suspended || !state.autoResumeAt) return { resumed: false };
  if (Date.now() < state.autoResumeAt.getTime()) return { resumed: false };
  await resume('auto_resume_24h_elapsed');
  return { resumed: true, reason: 'auto_resume_24h_elapsed' };
}
```

Run the test. Expected: PASS.

- [ ] **Step 4: Modify `reconciler.ts` to call `suspend()` on critical_drift**

In `src/modules/advertising/perceive/reconciler.ts`, find the `if (status === 'critical_drift' && opts.alertBot) { ... }` block. Replace with:

```ts
import { suspend } from './recon-state-store';

// ... inside reconcile():

  if (status === 'critical_drift') {
    if (opts.alertBot) {
      await opts.alertBot.sendMessage(
        `[perceive/reconciler] critical_drift detected — ` +
          `meta_clicks=${metaClicks}, posthog_landings=${phLandings}, ` +
          `delta_pct=${(delta_pct * 100).toFixed(1)}%`,
      );
    }

    // NEW: trigger global suspend, auto-resume in 24h
    await suspend(
      `critical_drift: meta=${metaClicks}, posthog=${phLandings}, delta=${(delta_pct * 100).toFixed(1)}%`,
      delta_pct,
      24,
    );

    if (opts.alertBot) {
      await opts.alertBot.sendMessage(
        `🚨 ADVERTISING AGENT SUSPENDED — reconciler critical_drift. ` +
          `All non-emergency decisions paused for 24h auto-resume. ` +
          `Investigate Pixel/PostHog drift. Founder unblock: /admin/advertising/recon-state`,
      );
    }
  }
```

Update `src/modules/advertising/perceive/__tests__/reconciler.test.ts` to assert `suspend()` is called and TWO Telegram messages fire on critical_drift:

```ts
import { suspend } from '../recon-state-store';
vi.mock('../recon-state-store', () => ({
  suspend: vi.fn().mockResolvedValue(undefined),
  getReconState: vi.fn().mockResolvedValue({ suspended: false, suspendedAt: null, suspendReason: null, autoResumeAt: null, lastDriftPct: null }),
  resume: vi.fn().mockResolvedValue(undefined),
  checkAutoResume: vi.fn().mockResolvedValue({ resumed: false }),
}));

// existing test for critical_drift, extended:
  it('triggers global suspend on critical_drift and emits two Telegram messages', async () => {
    const alertBot = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const meta: AdMetric[] = [/* ...metaClicks summing to 100 */];
    const funnel: FunnelSnapshot = { steps: [{ event_name: 'landing_view', count: 50, unique_users: 50, conversion_from_previous: 0 }], date_from: '', date_to: '' };
    const result = await reconcile(meta, funnel, { alertBot });
    expect(result.status).toBe('critical_drift');
    expect(suspend).toHaveBeenCalledWith(
      expect.stringContaining('critical_drift'),
      expect.any(Number),
      24,
    );
    expect(alertBot.sendMessage).toHaveBeenCalledTimes(2);
    expect((alertBot.sendMessage.mock.calls[1][0] as string)).toMatch(/SUSPENDED/);
  });
```

Run: `npx vitest run src/modules/advertising/perceive/__tests__/reconciler.test.ts`. Expected: PASS.

- [ ] **Step 5: Gate `decide/orchestrator.ts` on `reconState.suspended`**

In `src/modules/advertising/decide/orchestrator.ts`, at the top of the `decide` function:

```ts
import { getReconState } from '@/modules/advertising/perceive/recon-state-store';

export async function decide(metrics: AdMetric[], gates: FeatureGate[], deps: DecideDeps) {
  const reconState = await getReconState();
  if (reconState.suspended) {
    // Allow only DISAPPROVED-status emergency pauses through.
    const emergencyMetrics = metrics.filter((m) => m.status === 'DISAPPROVED');
    if (emergencyMetrics.length === 0) {
      console.info('[decide] reconciler suspended — no emergency metrics, returning empty');
      return { decisions: [], shadowLog: [] };
    }
    metrics = emergencyMetrics;
  }
  // ... existing decide logic
}
```

Update `src/modules/advertising/decide/__tests__/orchestrator.test.ts`:

```ts
vi.mock('@/modules/advertising/perceive/recon-state-store', () => ({
  getReconState: vi.fn(),
}));
import { getReconState } from '@/modules/advertising/perceive/recon-state-store';

  it('returns empty decisions when reconciler is suspended and no DISAPPROVED ads', async () => {
    (getReconState as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      suspended: true,
      suspendedAt: new Date(),
      suspendReason: 'critical_drift',
      autoResumeAt: new Date(),
      lastDriftPct: 0.5,
    });
    const result = await decide([mockAdMetric({ status: 'ACTIVE', frequency: 5.0 })], [], {});
    expect(result.decisions).toEqual([]);
  });

  it('still pauses DISAPPROVED ads when reconciler is suspended', async () => {
    (getReconState as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      suspended: true,
      suspendedAt: new Date(),
      suspendReason: 'critical_drift',
      autoResumeAt: new Date(),
      lastDriftPct: 0.5,
    });
    const result = await decide([mockAdMetric({ status: 'DISAPPROVED' })], [], {});
    expect(result.decisions.length).toBeGreaterThan(0);
    expect(result.decisions[0].action).toBe('pause');
  });

  it('runs normal logic when reconciler is NOT suspended', async () => {
    (getReconState as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      suspended: false,
      suspendedAt: null,
      suspendReason: null,
      autoResumeAt: null,
      lastDriftPct: null,
    });
    // assert tier-1 path runs as before
  });
```

Run: `npx vitest run src/modules/advertising/decide/__tests__/orchestrator.test.ts`. Expected: PASS.

- [ ] **Step 6: Add auto-resume check to `triage-daily/route.ts`**

At the top of the route handler (after kill-switch check, before reconcile):

```ts
import { checkAutoResume } from '@/modules/advertising/perceive/recon-state-store';

// ... in the GET handler, near the start:
  const resumeResult = await checkAutoResume();
  if (resumeResult.resumed) {
    console.info('[triage-daily] reconciler auto-resumed after 24h');
    if (telegramBot) {
      try {
        await telegramBot.sendAlert(
          'info',
          `ℹ️ Advertising agent reconciler auto-resumed after 24h. Next reconcile() will re-suspend if drift persists.`,
        );
      } catch (alertErr) {
        console.error('[triage-daily] auto-resume alert failed:', alertErr);
      }
    }
  }
```

Add a test in `cron-handlers.test.ts` confirming the call (mocking `checkAutoResume`).

- [ ] **Step 7: Build the founder-unblock admin UI**

Create `src/app/admin/advertising/recon-state/actions.ts`:

```ts
'use server';

import { resume } from '@/modules/advertising/perceive/recon-state-store';
import { revalidatePath } from 'next/cache';

export async function resumeNowAction(): Promise<{ ok: true }> {
  await resume('founder_manual_override');
  revalidatePath('/admin/advertising/recon-state');
  return { ok: true };
}
```

Create `src/app/admin/advertising/recon-state/page.tsx`:

```tsx
import { getReconState } from '@/modules/advertising/perceive/recon-state-store';
import { resumeNowAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function ReconStatePage() {
  const state = await getReconState();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Reconciler State</h1>
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-neutral-500">Suspended</dt>
        <dd>{state.suspended ? 'YES' : 'No'}</dd>
        <dt className="text-neutral-500">Suspended at</dt>
        <dd>{state.suspendedAt?.toISOString() ?? '—'}</dd>
        <dt className="text-neutral-500">Reason</dt>
        <dd className="font-mono text-xs">{state.suspendReason ?? '—'}</dd>
        <dt className="text-neutral-500">Auto-resume at</dt>
        <dd>{state.autoResumeAt?.toISOString() ?? '—'}</dd>
        <dt className="text-neutral-500">Last drift %</dt>
        <dd>{state.lastDriftPct !== null ? `${(state.lastDriftPct * 100).toFixed(1)}%` : '—'}</dd>
      </dl>

      {state.suspended ? (
        <form action={resumeNowAction} className="mt-6">
          <button
            type="submit"
            className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400"
          >
            Resume Now (founder override)
          </button>
        </form>
      ) : (
        <p className="mt-6 text-sm text-emerald-500">Agent decisioning is active.</p>
      )}
    </main>
  );
}
```

Add nav link in `src/app/admin/advertising/layout.tsx` (find the nav block and add):

```tsx
<Link href="/admin/advertising/recon-state">Reconciler</Link>
```

(Use the existing nav-link pattern from the layout — likely a styled `<Link>` from `next/link`.)

- [ ] **Step 8: Apply the migration locally**

```bash
npm run db:migrate
```

Verify the table exists by inspecting `npm run db:studio` or running a quick query through the Drizzle test helper.

- [ ] **Step 9: Typecheck + lint + scoped tests**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/perceive src/modules/advertising/decide src/app/admin/advertising/recon-state src/app/api/cron/advertising
npx vitest run src/modules/advertising/perceive src/modules/advertising/decide src/app/api/cron/advertising
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/shared/lib/schema.ts \
        drizzle/ \
        src/modules/advertising/perceive/recon-state-store.ts \
        src/modules/advertising/perceive/__tests__/recon-state-store.test.ts \
        src/modules/advertising/perceive/reconciler.ts \
        src/modules/advertising/perceive/__tests__/reconciler.test.ts \
        src/modules/advertising/decide/orchestrator.ts \
        src/modules/advertising/decide/__tests__/orchestrator.test.ts \
        src/app/api/cron/advertising/triage-daily/route.ts \
        src/app/api/cron/advertising/__tests__/cron-handlers.test.ts \
        src/app/admin/advertising/recon-state \
        src/app/admin/advertising/layout.tsx
git commit -m "feat(advertising/perceive): reconciler global suspend with 24h auto-resume + admin UI"
```

- [ ] **Step 11: Notify coordinator** — Wave 1 / Track 8 complete.

---

# Track 9 — Retro-weekly real `total_impressions` / `days_running`

**Owner:** Wave 1, agent 9
**Blockers:** none
**Blocks:** none
**Files:**
- Modify: `src/app/api/cron/advertising/retro-weekly/route.ts:74-77` and `:158-164`
- Modify: `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`

`evaluateGates` is called with `{ total_impressions: 0, days_running: 0 }` placeholders. Gate criteria require `≥5000 impressions` and `≥14 days`, so gates can never auto-mature. Replace with real Meta-Insights aggregates over the past week.

- [ ] **Step 1: Read the current retro-weekly route**

```bash
sed -n '60,170p' src/app/api/cron/advertising/retro-weekly/route.ts
```

Confirm:
- Line ~74-77: `evaluateGates({ total_impressions: 0, days_running: 0 }, gatesDb)` placeholder
- Line ~158-164: `buildMetaApiClient` returns stub `{ getInsights: async () => [] }`

- [ ] **Step 2: Replace `buildMetaApiClient` with the real client wrapper**

```ts
import { MetaInsightsAdapter } from '@/modules/advertising/meta-graph-api/insights-adapter';
// (or whatever adapter Track 9-equivalent in the funnel-and-db-fixes plan introduced)

function buildMetaApiClient(): MetaInsightsApi {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    console.warn('[retro-weekly] META credentials missing — using stub client (gates will not mature)');
    return { getInsights: async () => [] };
  }
  return new MetaInsightsAdapter({ accessToken, adAccountId });
}
```

(If the project does NOT yet have a `MetaInsightsAdapter`, this track adds one. Inspect `src/modules/advertising/meta-graph-api/` and reuse whatever similar adapter exists for triage-daily / triage-hourly. The integration pattern was established in earlier funnel-and-db-fixes work — copy it.)

- [ ] **Step 3: Replace placeholder values with real aggregates**

```ts
import { fetchMetaInsights } from '@/modules/advertising/perceive/meta-insights';

// ... in the route handler:

const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
const weeklyMetrics = await fetchMetaInsights({
  apiClient: metaApiClient,
  dateFrom: weekAgo.toISOString().slice(0, 10),
  dateTo: now.toISOString().slice(0, 10),
});

const total_impressions = weeklyMetrics.reduce((sum, m) => sum + (m.impressions ?? 0), 0);

const daysRunningSorted = weeklyMetrics
  .map((m) => m.days_running ?? 0)
  .filter((d) => d > 0)
  .sort((a, b) => a - b);
const days_running = daysRunningSorted.length > 0
  ? daysRunningSorted[Math.floor(daysRunningSorted.length / 2)]
  : 0;

const updatedGates = await evaluateGates(
  { total_impressions, days_running },
  gatesDb,
);
```

- [ ] **Step 4: Add a test in `cron-handlers.test.ts` for the retro-weekly path**

Add a case asserting that `evaluateGates` is called with non-zero values when the Meta mock returns realistic insights:

```ts
  it('retro-weekly passes real total_impressions and median days_running to evaluateGates', async () => {
    // Mock fetchMetaInsights via vi.mock if not already; or mock the underlying apiClient
    // ... setup that buildMetaApiClient returns insights with impressions=10000 + days_running=21
    // ... assert evaluateGates was called with { total_impressions: 10000, days_running: 21 }
  });
```

(If `evaluateGates` is currently mocked wholesale in `cron-handlers.test.ts`, expand the spy to capture call args.)

- [ ] **Step 5: Sentry tag — extend the existing retro-weekly catch block**

Already covers `subsystem` per Track 9 funnel-and-db-fixes pattern. Confirm tags include `cron: true, route: '/api/cron/advertising/retro-weekly'`. No change needed if already correct.

- [ ] **Step 6: Run tests, typecheck, lint**

```bash
npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts -t "retro-weekly"
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/app/api/cron/advertising
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/advertising/retro-weekly/route.ts \
        src/app/api/cron/advertising/__tests__/cron-handlers.test.ts
git commit -m "fix(advertising/retro-weekly): use real Meta total_impressions and median days_running"
```

- [ ] **Step 8: Notify coordinator** — Wave 1 / Track 9 complete.

---

# Track 10 — Pre-launch-check + verify-prod-state + deploy runbook

**Owner:** Wave 2, agent 10
**Blockers:** Tracks 1-9 (operational tooling validates everything else)
**Blocks:** Track 11 (operational migration runs after this lands)
**Files:**
- Modify: `scripts/advertising/pre-launch-check.ts`
- Create: `scripts/advertising/verify-prod-state.ts`
- Create: `scripts/advertising/__tests__/verify-prod-state.test.ts`
- Modify: `package.json` — add `advertising:verify-prod-state` script
- Create: `docs/advertising/attribution-windows.md`
- Create: `docs/advertising/deploy-runbook.md`

- [ ] **Step 1: Extend `pre-launch-check.ts` with new env vars**

In `scripts/advertising/pre-launch-check.ts`, find the env-vars check block (around lines 670-720). Add entries:

```ts
// In the `requiredVars` array (or equivalent — match the existing shape):
  { name: 'NEXT_PUBLIC_META_PIXEL_ID' },        // public — Pixel <head> injection (Stage 0 of v3b)
  { name: 'ADVERTISING_AGENT_ENABLED' },        // 'true' = cron logic runs; 'false' = early-return
  { name: 'ADVERTISING_AGENT_DRY_RUN' },        // 'true' = no Meta API mutations from act layer
  { name: 'ADMIN_ALLOWED_EMAILS' },             // /admin/* auth allowlist
```

If `pre-launch-check` validates *expected values* per var, also encode:
- `ADVERTISING_AGENT_ENABLED` ∈ `{'true', 'false'}` — currently `'true'` in prod
- `ADVERTISING_AGENT_DRY_RUN` ∈ `{'true', 'false'}` — currently `'true'` in prod
- `ADMIN_ALLOWED_EMAILS`: comma-separated, each containing `@`

- [ ] **Step 2: Implement `verify-prod-state.ts`**

Create `scripts/advertising/verify-prod-state.ts`:

```ts
/**
 * Operational tool: verify the current production environment state for the
 * advertising agent. Reads `.env.production` from disk (operator must run
 * `vercel env pull --environment=production` first to refresh).
 *
 * Exit 0 if all required vars present + valid; exit 1 otherwise.
 *
 * Safety: this script does NOT spawn child processes. It does not call vercel
 * CLI itself — operator runs `vercel env pull` separately, this script only
 * reads the resulting file.
 *
 * Usage:
 *   vercel env pull --environment=production
 *   npm run advertising:verify-prod-state
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

type Stage = 'pre-flight' | 'autonomous' | 'all';

interface CheckSpec {
  name: string;
  expected?: string;
  expectedNotEmpty?: boolean;
  validate?: (v: string) => boolean;
  forStage: Stage;
  purpose: string;
}

const REQUIRED: CheckSpec[] = [
  { name: 'ADVERTISING_AGENT_ENABLED', expected: 'true', forStage: 'all',
    purpose: 'kill switch — true = cron logic runs, false = early-return' },
  { name: 'ADVERTISING_AGENT_DRY_RUN', expectedNotEmpty: true, forStage: 'all',
    purpose: 'act-layer short-circuit — true = no Meta API mutations' },
  { name: 'ADMIN_ALLOWED_EMAILS', expectedNotEmpty: true, forStage: 'all',
    validate: (v) => v.split(',').every((e) => e.includes('@')),
    purpose: '/admin/* auth allowlist (Clerk + email check)' },
  { name: 'META_ACCESS_TOKEN', expectedNotEmpty: true, forStage: 'all',
    purpose: 'Meta Graph API credential' },
  { name: 'META_AD_ACCOUNT_ID', expectedNotEmpty: true, forStage: 'all',
    purpose: 'Meta ad account scope' },
  { name: 'META_PIXEL_ID', expectedNotEmpty: true, forStage: 'all',
    purpose: 'server-side Pixel reference' },
  { name: 'GEMINI_API_KEY', expectedNotEmpty: true, forStage: 'all',
    purpose: 'vision-checker (brand + symbol checks)' },
  { name: 'NEXT_PUBLIC_META_PIXEL_ID', expectedNotEmpty: true, forStage: 'autonomous',
    purpose: 'browser-side Pixel script (Stage 0 of v3b)' },
  { name: 'META_CAPI_TOKEN', expectedNotEmpty: true, forStage: 'autonomous',
    purpose: 'CAPI auth (Stage 0 of v3b)' },
];

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

async function main() {
  console.log('=== Production env state for advertising agent ===\n');
  console.log('Source: .env.production (run `vercel env pull --environment=production` first to refresh)\n');

  const envPath = join(process.cwd(), '.env.production');
  if (!existsSync(envPath)) {
    console.error('ERROR: .env.production not found in project root.');
    console.error('Run: vercel env pull --environment=production');
    process.exit(1);
  }

  const env = loadEnvFile(envPath);
  let errors = 0;
  let warnings = 0;

  for (const spec of REQUIRED) {
    const value = env[spec.name];
    const set = value !== undefined && value !== '';

    if (!set) {
      console.log(`✗ ${spec.name} MISSING — ${spec.purpose} (stage: ${spec.forStage})`);
      if (spec.forStage === 'all' || spec.forStage === 'pre-flight') errors++;
      else warnings++;
      continue;
    }

    if (spec.expected && value !== spec.expected) {
      console.log(`⚠ ${spec.name}=${value} (expected ${spec.expected}) — ${spec.purpose}`);
      warnings++;
      continue;
    }

    if (spec.validate && !spec.validate(value)) {
      console.log(`✗ ${spec.name} invalid format — ${spec.purpose}`);
      errors++;
      continue;
    }

    console.log(`✓ ${spec.name} (${spec.forStage}) — ${spec.purpose}`);
  }

  console.log(`\n${errors} error(s), ${warnings} warning(s)`);
  process.exit(errors > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { loadEnvFile, REQUIRED };
```

- [ ] **Step 3: Test `verify-prod-state.ts`**

Create `scripts/advertising/__tests__/verify-prod-state.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadEnvFile, REQUIRED } from '../verify-prod-state';

describe('verify-prod-state', () => {
  it('REQUIRED is non-empty and entries have name + purpose', () => {
    expect(REQUIRED.length).toBeGreaterThan(0);
    for (const r of REQUIRED) {
      expect(r.name).toMatch(/^[A-Z_][A-Z0-9_]*$/);
      expect(r.purpose).toBeTruthy();
    }
  });

  it('loadEnvFile parses KEY=VALUE pairs and strips surrounding quotes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'envt-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'A=1\nB="two"\nC=\n# comment\n');
    expect(loadEnvFile(file)).toEqual({ A: '1', B: 'two', C: '' });
  });

  it('loadEnvFile returns {} for missing file', () => {
    expect(loadEnvFile('/nonexistent/path/.env.fake')).toEqual({});
  });
});
```

Run: `npx vitest run scripts/advertising/__tests__/verify-prod-state.test.ts`. Expected: PASS.

- [ ] **Step 4: Add npm scripts**

In `package.json`:

```json
"advertising:verify-prod-state": "tsx scripts/advertising/verify-prod-state.ts",
```

(Insert near `"advertising:pre-launch-check"`.)

- [ ] **Step 5: Write `docs/advertising/attribution-windows.md`**

```markdown
# Attribution Windows — Hybrid by Purpose (v3a)

**Date:** 2026-05-03
**Status:** active
**Spec source:** `docs/superpowers/specs/2026-05-03-advertising-pre-flight-blockers-design.md` Q4

## Why hybrid

Meta, PostHog, and Stripe each disagree about what "attributed conversion"
means. The astrology vertical has a 30-50% delayed conversion tail in days
7-14 post-click. A single window choice optimises for one purpose at the
expense of others.

## Per-source windows

| Source | Window | Used for |
|---|---|---|
| Meta Insights | `7d_click` only (no view) | Phase detection (learning maturity, scale-eligibility) |
| PostHog HogQL | 14 days from first ad-click event per distinct_id | ROAS / CPA / drop detection |
| Stripe attribution | 14 days from `metadata.utm_click_timestamp` | Revenue + ROAS denominator |
| Reconciler comparison | 7 days everywhere — apples-to-apples | Detect Meta-vs-PostHog drift |

## Implementation references

- `src/modules/advertising/perceive/meta-insights.ts` — `action_attribution_windows: ['7d_click']`
- `src/modules/advertising/posthog/funnel-client.ts` — `attribution_window_days` parameter (default 14, reconciler 7)
- `src/modules/advertising/perceive/stripe-attribution.ts` — `attributionWindowDays` parameter (default 14)

## Recalibration

Re-evaluate after 3-6 months of production data. The 14-day default for
PostHog/Stripe assumes the astrology vertical's delayed-conversion tail
matches our prior. If we observe most conversions inside 3-7 days, tighten;
if more reach 21+ days, widen.

## Rationale for excluding view attribution from Meta

View-attribution counts impressions (not clicks) as conversion sources.
Awareness creatives inflate counts artificially under view-attribution,
which distorts phase-detection logic. Click-only attribution is more
conservative and matches the senior-buyer mental model: "did this ad cause
the conversion or just appear nearby?"
```

- [ ] **Step 6: Write `docs/advertising/deploy-runbook.md`**

```markdown
# Advertising Agent — Deploy Runbook

**Date:** 2026-05-03
**Audience:** founder + on-call

This runbook covers the three deployment stages: v3a pre-flight, v3b Stage 0
(Pixel + CAPI), and v3b autonomous flip. Run each stage's checks in order
and do NOT proceed until all green.

---

## Stage 1 — v3a Pre-flight (this spec)

**Pre-deploy:**

```bash
# 1. Clean local state
git status                                   # working tree clean on main
git pull --ff-only origin main

# 2. Local verification
npm install
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint
npx vitest run src/modules/advertising src/app/api/cron/advertising scripts/advertising

# 3. Pre-launch script
npm run advertising:pre-launch-check
# Expect: 0 errors

# 4. Production env audit (must run vercel env pull first)
vercel env pull --environment=production
npm run advertising:verify-prod-state
# Expect: 0 errors. ADVERTISING_AGENT_DRY_RUN=true is REQUIRED for this stage.
```

**Deploy:**

```bash
git push origin main          # Vercel auto-deploys
```

**Post-deploy verification (T+15min):**

```bash
# Force-trigger each cron and inspect logs
vercel crons run /api/cron/advertising/triage-hourly
vercel crons run /api/cron/advertising/triage-daily
vercel crons run /api/cron/advertising/audience-refresh
vercel crons run /api/cron/advertising/retro-weekly
```

Verify in Vercel runtime logs:
- `audience-refresh`: summary shows non-zero `total_audiences` and zero `failed_audiences`
- `triage-daily`: reconciler did not suspend (or suspended deliberately if drift exists)
- `retro-weekly`: feature gate evaluation receives non-zero `total_impressions` / `days_running`
- No "Vision check failed" / "GEMINI_API_KEY not set" warnings

**Coordinator-only operational step (Track 11):**

```bash
# Verify the migration script runs in dry-run first
DRY_RUN=true vercel env pull --environment=production
DRY_RUN=true ENVIRONMENT=production npm run advertising:migrate-frequency-caps

# Founder confirms — then live run
npm run advertising:migrate-frequency-caps
```

Verify in Meta Ads Manager UI: Ad Set → Frequency Cap = 10/7 days for both EN and ES ad sets.

---

## Stage 2 — v3b Stage 0 (Pixel + CAPI)

**Hard prerequisite:** Stage 1 fully shipped + verified stable for 48h.

(Detailed checklist lives in v3b plan — this section is a placeholder
pointing to that runbook section.)

---

## Stage 3 — v3b Autonomous flip

**Hard prerequisite:** Stage 2 verified stable for 48h. Founder reviews
`/admin/advertising/ad-set-state` page — sanity check phase distribution.

(Detailed checklist lives in v3b plan.)
```

- [ ] **Step 7: Typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- scripts/advertising
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/advertising/pre-launch-check.ts \
        scripts/advertising/verify-prod-state.ts \
        scripts/advertising/__tests__/verify-prod-state.test.ts \
        package.json \
        docs/advertising/attribution-windows.md \
        docs/advertising/deploy-runbook.md
git commit -m "chore(advertising/scripts): pre-launch-check + verify-prod-state + deploy-runbook"
```

- [ ] **Step 9: Notify coordinator** — Wave 2 / Track 10 complete.

---

# Track 11 — Migration script execution (operational, founder-confirmed)

**Owner:** Coordinator
**Blockers:** Tracks 2 + 10 merged into `main` and deployed to production
**Blocks:** none

This is NOT a code-writing track. It's a one-shot operational run of the
script created in Track 2 against the 2 production ad sets.

- [ ] **Step 1: Verify Tracks 2 + 10 are deployed**

```bash
# Confirm npm scripts present in deployed bundle
npm run advertising:migrate-frequency-caps -- --help 2>&1 | head -5
# Should print the dry-run guidance from the script
```

- [ ] **Step 2: Founder approval gate**

Send Telegram message to founder:
> "About to retrofit `frequency_control_specs={IMPRESSIONS, 7d, 10}` on
> META_LAUNCH_ADSET_ID_EN and META_LAUNCH_ADSET_ID_ES. This is an
> idempotent edit (no learning reset, no budget change). Confirm to
> proceed."

WAIT for explicit founder confirmation before continuing.

- [ ] **Step 3: Dry-run first**

```bash
vercel env pull --environment=production    # ensures latest creds locally
DRY_RUN=true npm run advertising:migrate-frequency-caps
```

Expected output:
```
Migrating frequency_control_specs on:
  EN ad set: <META_LAUNCH_ADSET_ID_EN>
  ES ad set: <META_LAUNCH_ADSET_ID_ES>
  Cap: [{"event":"IMPRESSIONS","interval_days":7,"max_frequency":10}]
  Dry-run: true

Dry-run — no API calls made. Exiting.
```

- [ ] **Step 4: Live run**

```bash
npm run advertising:migrate-frequency-caps
```

Expected: two `✓ EN (...)` and `✓ ES (...)` log lines, exit 0.

- [ ] **Step 5: Visual verification in Meta Ads Manager**

Open https://business.facebook.com/adsmanager/manage/adsets → both ad
sets → "Frequency Cap" = "10 impressions per 7 days".

- [ ] **Step 6: Notify founder** — Migration complete, all 9 fixes shipped, agent ready for v3b spec implementation.

- [ ] **Step 7: Memory update — append to MEMORY.md**

```
- [v3a Pre-flight Blockers shipped](project_advertising_v3a_shipped.md) — 2026-05-XX 9 fixes deployed (LEARNING_PHASE_DAYS=7, audience-refresh real impls, frequency caps, vision checks, reconciler suspend, hybrid attribution, retro-weekly real values). Agent infrastructure ready for v3b Senior Buyer Mode.
```

---

# Aggregator — final verification + deploy gate

**Owner:** Coordinator (after all 11 tracks complete)

The 10 worktrees from Waves 0-2 merge into `main` in dependency order:

```
Wave 0 first (any order):
  Track 1, Track 2, Track 3, Track 4, Track 5, Track 6
Wave 1 next (any order, requires Wave 0 merged):
  Track 7 (depends Track 4), Track 8, Track 9
Wave 2 next:
  Track 10
Operational:
  Track 11 (after Track 10 deploys to prod)
```

- [ ] **Step 1: Pre-deploy gate**

Run all in parallel (or sequentially if any fail):

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint
npx vitest run src/modules/advertising src/app/api/cron/advertising scripts/advertising
npm run advertising:pre-launch-check
```

Expected:
- `typecheck`: clean (no new errors)
- `lint`: 785 pre-existing baseline. Verify no NEW errors in `src/modules/advertising`, `src/app/api/cron/advertising`, `scripts/advertising`, or `src/app/admin/advertising`.
- vitest: all advertising / cron / scripts tests passing.
- pre-launch-check: 0 errors.

- [ ] **Step 2: DB migration apply (local then prod)**

```bash
# Local
npm run db:migrate

# Production — Vercel runs migrations automatically on deploy if drizzle is wired into the build.
# If not, manually run after deploy:
DATABASE_URL=$PRODUCTION_DATABASE_URL npm run db:migrate
```

Verify the `advertising_recon_state` table exists with the singleton row.

- [ ] **Step 3: Deploy to prod**

```bash
git push origin main
# Vercel auto-deploys
```

- [ ] **Step 4: Post-deploy verification (T+15min)**

```bash
# Force-trigger each cron and inspect Vercel runtime logs
vercel crons run /api/cron/advertising/triage-hourly
vercel crons run /api/cron/advertising/triage-daily
vercel crons run /api/cron/advertising/audience-refresh
vercel crons run /api/cron/advertising/retro-weekly
```

Confirm:
- `audience-refresh` summary: `total_audiences ≥ 3`, `failed_audiences = 0`
- `triage-daily`: reconciler ran, did not suspend (or suspended deliberately)
- `retro-weekly`: gate evaluator receives non-zero values
- Telegram digest shows expected per-source pixel-vs-PostHog-vs-Stripe metric counts
- No new Sentry alerts in `subsystem: 'audiences'` / `subsystem: 'creative-gen-safety'` / `subsystem: 'reconciler'`

- [ ] **Step 5: Operational migration (Track 11)**

Run the operational steps in Track 11. Coordinator-led, founder-confirmed.

- [ ] **Step 6: Update memory**

After 24h of clean cron runs, append to `~/.claude/projects/-Users-kirillkovalenko-Documents-Projects-Estrevia/memory/MEMORY.md`:

```markdown
- [v3a Pre-flight Blockers shipped](project_advertising_v3a_shipped.md) — 2026-05-XX 9 fixes deployed (LEARNING_PHASE_DAYS=7, audience-refresh real impls, frequency caps via Meta, vision checks via Gemini, reconciler global suspend, hybrid attribution, retro-weekly real values). Agent infrastructure ready for v3b Senior Buyer Mode.
```

---

## Out of scope (per spec — do NOT touch in this plan)

- LCA 1/5/10% lookalike audiences (v3c backlog item #1)
- Creative testing matrix / factorial A/B (v3c #2)
- Real-time Tier 2/3 disagreement alerts (v3c #3)
- Persistent DropOffStore (Drizzle-backed) (v3c #4)
- Stale-audience health check (v3c #5 — depends on this spec's #2 first)
- Decision-log CSV/JSON export (v3c #6)
- Admin UI shadow-log replay (v3c #7)
- All v3b Senior Buyer Mode work (decide-layer rewrite, Pixel + CAPI integration, auto-calibrator, data-maturity classifier) — separate spec + plan
- Per-phase dynamic frequency caps (v3b can adjust if data validates)
- Multi-creative-per-ad-set logic (single creative MVP assumption)
- Calendar / seasonality awareness (v3b out-of-MVP)
- Auto-iteration on creative generation (CLAUDE.md gate ~month 3+)
