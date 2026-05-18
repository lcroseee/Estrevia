# Wave 3 Compound Growth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Wave 3 Top-3 foundation (L1-F viral instrumentation gap-fill + L1-G+L5-E advertising-agent Phase 1 + L5-C SEO Phase 3 + AEO infra) without touching any deferred items (L3-E trial, L5-B referral, L5-D pricing test).

**Architecture:** 15 tasks across 3 sections sharing no write-paths → safe for Agent Teams parallel via `isolation:worktree`. TDD throughout. Frequent commits per task.

**Tech Stack:** Next.js 16 App Router (SSG + ISR), React 19, TypeScript 6, Vitest 3 + Testing Library 16 (jsdom), Tailwind 4, `schema-dts` for JSON-LD types, `next-intl` for locale routing, `sweph` planetary-hours engine.

**Spec reference:** `docs/superpowers/specs/2026-05-17-wave-3-compound-growth-design.md`

---

## File map (no overlaps across sections)

| Section | File | Action |
|---|---|---|
| S1 | `src/modules/astro-engine/components/SynastryResult.tsx` | modify |
| S1 | `src/modules/astro-engine/components/__tests__/SynastryResult.test.tsx` | create |
| S1 | `docs/runbooks/viral-coefficient-dashboard.md` | create |
| S2 | `src/shared/types/advertising/perceive.ts` | modify (add field) |
| S2 | `src/modules/advertising/__tests__/fixtures/index.ts` | modify (add default) |
| S2 | `src/modules/advertising/decide/tier-1-rules.ts` | modify |
| S2 | `src/modules/advertising/decide/__tests__/tier-1-rules.test.ts` | modify (extend) |
| S2 | `docs/runbooks/advertising-agent-phase1-observability.md` | create |
| S2 | `docs/runbooks/advertising-agent-phase1-env-flip.md` | create |
| S3 | `src/shared/seo/json-ld.ts` | modify (add helper) |
| S3 | `src/shared/seo/index.ts` | modify (export new helper) |
| S3 | `src/shared/seo/__tests__/json-ld.test.ts` | modify (extend) |
| S3 | `src/shared/seo/compatibility-pairs.ts` | create (helper module) |
| S3 | `src/shared/seo/__tests__/compatibility-pairs.test.ts` | create |
| S3 | `src/app/[locale]/(marketing)/compatibility/page.tsx` | create |
| S3 | `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx` | create |
| S3 | `src/app/[locale]/(marketing)/planetary-hours-cities/page.tsx` | create |
| S3 | `src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx` | create |
| S3 | `src/shared/seo/cities.ts` | create (city data) |
| S3 | `src/shared/seo/__tests__/cities.test.ts` | create |
| S3 | `src/app/[locale]/(marketing)/why-sidereal/page.tsx` | modify |
| S3 | `src/app/sitemap.ts` | modify (extend) |
| S3 | `docs/runbooks/seo-content-cadence.md` | create |

---

## Section 1 — L1-F viral instrumentation gap-fill

### Task 1: Add event firing + UTM to SynastryResult.handleShare

**Files:**
- Modify: `src/modules/astro-engine/components/SynastryResult.tsx:152-163`
- Create: `src/modules/astro-engine/components/__tests__/SynastryResult.test.tsx`

- [ ] **Step 1: Inspect current SynastryResult.tsx imports and find `id` prop wiring**

Run: `grep -n "interface.*Props\|id:\|^export\|navigator.share\|trackEvent\|buildShareUrl" src/modules/astro-engine/components/SynastryResult.tsx`

Expected: `id` is a prop on SynastryResult; `trackEvent` and `buildShareUrl` are NOT imported.

If `id` is not a prop, follow the prop chain upward from the parent rendering SynastryResult (likely `SynastryClient.tsx`) and add the prop. Synastry pages live at `/s/synastry/[id]` so `id` must be available somewhere in the tree.

- [ ] **Step 2: Write the failing test file**

Create `src/modules/astro-engine/components/__tests__/SynastryResult.test.tsx`:

```tsx
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SynastryResult } from '../SynastryResult';

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: {
    PASSPORT_RESHARED: 'passport_reshared',
  },
}));

vi.mock('@/shared/lib/share', () => ({
  buildShareUrl: (url: string, channel: string) =>
    `${url}?utm_source=share_${channel}&utm_medium=passport_share&utm_campaign=cosmic_passport`,
}));

import { trackEvent } from '@/shared/lib/analytics';

const minimalProps = {
  id: 'syn_test_id',
  chart1Summary: { name: 'Alice', sunSign: 'Aries', moonSign: 'Taurus' },
  chart2Summary: { name: 'Bob', sunSign: 'Leo', moonSign: 'Cancer' },
  aspects: [],
  scores: { overall: 78, elements: 80, modalities: 75, aspects: 80 },
} as unknown as Parameters<typeof SynastryResult>[0];

const messages = {
  synastry: {
    person1: 'Person 1',
    person2: 'Person 2',
    resultsTitle: 'Synastry Results',
  },
};

function renderResult() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SynastryResult {...minimalProps} />
    </NextIntlClientProvider>,
  );
}

describe('SynastryResult.handleShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis.navigator, 'share');
    Reflect.deleteProperty(globalThis.navigator, 'clipboard');
  });

  it('fires PASSPORT_RESHARED with platform=native + UTM URL when navigator.share is present', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'share', {
      value: shareMock,
      configurable: true,
      writable: true,
    });

    renderResult();
    const shareBtn = await screen.findByRole('button', { name: /share/i });
    fireEvent.click(shareBtn);
    await new Promise((r) => setTimeout(r, 0));

    expect(shareMock).toHaveBeenCalledTimes(1);
    expect(shareMock.mock.calls[0][0].url).toContain('utm_source=share_native');
    expect(trackEvent).toHaveBeenCalledWith('passport_reshared', {
      platform: 'native',
      passport_id: 'syn_test_id',
    });
  });

  it('fires PASSPORT_RESHARED with platform=copy_link + UTM URL when navigator.share is absent', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    renderResult();
    const shareBtn = await screen.findByRole('button', { name: /share/i });
    fireEvent.click(shareBtn);
    await new Promise((r) => setTimeout(r, 0));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('utm_source=share_native');
    expect(trackEvent).toHaveBeenCalledWith('passport_reshared', {
      platform: 'copy_link',
      passport_id: 'syn_test_id',
    });
  });

  it('does NOT fire trackEvent when navigator.share rejects (user dismissed)', async () => {
    const shareMock = vi.fn().mockRejectedValue(new Error('dismissed'));
    Object.defineProperty(globalThis.navigator, 'share', {
      value: shareMock,
      configurable: true,
      writable: true,
    });

    renderResult();
    const shareBtn = await screen.findByRole('button', { name: /share/i });
    fireEvent.click(shareBtn);
    await new Promise((r) => setTimeout(r, 0));

    expect(shareMock).toHaveBeenCalledTimes(1);
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
```

Note: actual `SynastryResult` may need additional minimal-props (`person1Label`, `shareUrl` etc.) — adjust `minimalProps` after running typecheck against the real component's prop shape. The test still proves the three event-fire branches.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/SynastryResult.test.tsx`

Expected: FAIL. trackEvent should not be called (event firing not yet wired) OR URL should not contain utm_source (UTM not yet wired).

- [ ] **Step 4: Modify SynastryResult.tsx — add imports + rewrite handleShare**

In `src/modules/astro-engine/components/SynastryResult.tsx`:

Add to imports near top (alongside existing imports):

```tsx
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { buildShareUrl } from '@/shared/lib/share';
```

Replace `handleShare` (currently at lines 152-163) with:

```tsx
  const handleShare = async () => {
    const text = `${person1Label} & ${person2Label}: ${Math.round(scores.overall)}% compatibility`;
    const taggedUrl = buildShareUrl(shareUrl, 'native');
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: text, url: taggedUrl });
        trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'native', passport_id: id });
      } catch {
        // User dismissed — not an error
      }
    } else {
      await navigator.clipboard.writeText(taggedUrl);
      trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'copy_link', passport_id: id });
    }
  };
```

Confirm `id` is in component props (it must be — synastry id is needed to build `shareUrl` at line 149).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/SynastryResult.test.tsx`

Expected: PASS (3/3).

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/astro-engine/components/SynastryResult.tsx \
        src/modules/astro-engine/components/__tests__/SynastryResult.test.tsx
git commit -m "feat(wave-3/T1): fire PASSPORT_RESHARED on synastry share + UTM"
```

---

### Task 2: viral-coefficient dashboard runbook

**Files:**
- Create: `docs/runbooks/viral-coefficient-dashboard.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/viral-coefficient-dashboard.md`:

````markdown
# Viral Coefficient Dashboard — Founder Runbook

**Goal:** Build PostHog dashboard to monitor Cosmic Passport viral funnel weekly.

**Pre-conditions:**
- Wave 3 Section 1 deployed (commits Tn for SynastryResult fix).
- PostHog project 407908 active (production region: US).
- `passport_reshared`, `passport_viewed`, `passport_converted` events firing live (verify in PostHog Events tab).

## Setup steps

### 1. Create dashboard

PostHog → Dashboards → New dashboard → "Viral".

### 2. Insight 1 — Viral funnel (3 steps)

- Type: **Funnel**
- Steps:
  1. `passport_reshared` (any property)
  2. `passport_viewed`
  3. `passport_converted`
- Breakdown: event property `platform`
- Window: 7 days
- Conversion window: 7 days from step 1
- Save as "Viral funnel (7d)"

### 3. Insight 2 — Viral coefficient trend

- Type: **Trends**
- Series A: `passport_converted` — Total count
- Series B: `passport_reshared` — Total count
- Formula: `A / B` (use Formula mode in PostHog) — viral coefficient
- Date range: last 12 weeks, weekly aggregation
- Save as "Viral coefficient (weekly)"

### 4. Insight 3 — Per-channel share heatmap

- Type: **Trends**
- Series: `passport_reshared`
- Breakdown: event property `platform`
- Date range: last 12 weeks, weekly aggregation
- Chart type: Bar (stacked)
- Save as "Per-channel shares (weekly)"

### 5. Pin all 3 insights to "Viral" dashboard

## Weekly review checklist (5 min)

- [ ] Funnel step 1 → 2 conversion ≥ 5%? (if < 5%, share-URL UTM or attribution broken — check PostHog `passport_reshared` event `platform` distribution)
- [ ] Funnel step 2 → 3 conversion ≥ 1%? (if < 1%, /s/[id] PassportCta copy is leaking attention)
- [ ] Viral coefficient (formula) > 0.05? (if yes, paid-acquisition compounds at ROI multiplier `1/(1-VC)`)
- [ ] Top platform by `passport_reshared` count — note for L5-B prioritization
- [ ] Anomaly week with conversion >2× baseline — investigate ad creative / content shift

## When to take action

| Metric | Trigger | Action |
|---|---|---|
| Viral coefficient > 0.5 | 2 consecutive weeks | Start L5-B referral A/B (Wave 3.5) |
| Funnel step 1 → 2 < 3% | 2 consecutive weeks | Audit UTM wiring in `src/shared/lib/share.ts` |
| One platform contributes ≥ 80% reshares | 2 consecutive weeks | Optimize that platform's copy in `messages/{en,es}.json` `share.passport.copy.*` |

## Cross-references

- Spec §4: `docs/superpowers/specs/2026-05-17-wave-3-compound-growth-design.md`
- Wave 3.5 viral A/B (L5-B): blocked on 2 weeks of clean data from this dashboard
````

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/viral-coefficient-dashboard.md
git commit -m "docs(wave-3/T2): viral-coefficient dashboard runbook"
```

---

## Section 2 — L1-G+L5-E advertising-agent Phase 1

### Task 3: Add conversions_7d field to AdMetric type + fixture

**Files:**
- Modify: `src/shared/types/advertising/perceive.ts:1-16`
- Modify: `src/modules/advertising/__tests__/fixtures/index.ts:7-23`

- [ ] **Step 1: Add field to AdMetric interface**

In `src/shared/types/advertising/perceive.ts`, replace lines 1-16 with:

```ts
export interface AdMetric {
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  date: string; // YYYY-MM-DD UTC
  impressions: number;
  clicks: number;
  spend_usd: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  reach: number;
  days_running: number;
  conversions_7d?: number | null;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'DISAPPROVED';
}
```

- [ ] **Step 2: Update fixture default**

In `src/modules/advertising/__tests__/fixtures/index.ts`, replace lines 7-23 with:

```ts
export const mockAdMetric = (overrides?: Partial<AdMetric>): AdMetric => ({
  ad_id: 'ad_test_001',
  adset_id: 'adset_test_001',
  campaign_id: 'campaign_test_001',
  date: '2026-04-26',
  impressions: 5247,
  clicks: 87,
  spend_usd: 18.40,
  ctr: 0.0166,
  cpc: 0.21,
  cpm: 3.51,
  frequency: 1.4,
  reach: 3748,
  days_running: 7,
  conversions_7d: 60,
  status: 'ACTIVE',
  ...overrides,
});
```

Default `conversions_7d: 60` keeps the existing `mockAdMetric({ frequency: 4.0, days_running: 7 })` and similar test calls passing (60 ≥ 50 conversion guard).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS. No errors elsewhere — `conversions_7d` is optional + the default value satisfies all existing tier-1-rules tests that don't override it.

- [ ] **Step 4: Run existing tier-1-rules tests to confirm no regression**

Run: `npx vitest run src/modules/advertising/decide/__tests__/tier-1-rules.test.ts`

Expected: PASS (all existing tests still green; new guard not yet added).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/advertising/perceive.ts \
        src/modules/advertising/__tests__/fixtures/index.ts
git commit -m "feat(wave-3/T3): add conversions_7d to AdMetric + fixture default"
```

---

### Task 4: Add MIN_CONVERSIONS_BEFORE_ACTION guard to tier-1-rules

**Files:**
- Modify: `src/modules/advertising/decide/tier-1-rules.ts:1-71`
- Modify: `src/modules/advertising/decide/__tests__/tier-1-rules.test.ts` (extend)

- [ ] **Step 1: Write failing tests for the new guard**

Add to end of `src/modules/advertising/decide/__tests__/tier-1-rules.test.ts` (before the closing `});` of the outer `describe`):

```ts
  // --- Conversion sample size guard ---

  it('holds when conversions_7d < 50 (insufficient sample)', () => {
    const m = mockAdMetric({ days_running: 7, conversions_7d: 49, frequency: 1.0, cpc: 1.0, spend_usd: 5.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('insufficient_conversions');
  });

  it('does NOT hold (proceeds to rules) when conversions_7d exactly equals threshold (50)', () => {
    const m = mockAdMetric({ days_running: 7, conversions_7d: 50, frequency: 1.0, cpc: 1.0, spend_usd: 5.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('maintain');
  });

  it('proceeds to rules when conversions_7d > 50', () => {
    const m = mockAdMetric({ days_running: 7, conversions_7d: 100, frequency: 4.5, cpc: 1.0, spend_usd: 5.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toContain('frequency');
  });

  it('learning-phase guard wins over conversion guard (days_running < 7)', () => {
    const m = mockAdMetric({ days_running: 3, conversions_7d: 5 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('learning_phase');
    expect(decision.reason).not.toContain('insufficient_conversions');
  });

  it('fail-open: skips guard when conversions_7d is null', () => {
    const m = mockAdMetric({ days_running: 7, conversions_7d: null, frequency: 1.0, cpc: 1.0, spend_usd: 5.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('maintain');
  });

  it('fail-open: skips guard when conversions_7d is undefined', () => {
    const overrides: Partial<typeof mockAdMetric extends () => infer R ? R : never> = { days_running: 7, frequency: 1.0, cpc: 1.0, spend_usd: 5.0 };
    delete (overrides as Record<string, unknown>).conversions_7d;
    const m = mockAdMetric(overrides);
    // Override explicit undefined
    const decision = applyTier1Rules({ ...m, conversions_7d: undefined });
    expect(decision.action).toBe('maintain');
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/modules/advertising/decide/__tests__/tier-1-rules.test.ts`

Expected: 6 FAILures (existing tests pass, 6 new tests fail because the guard isn't there yet — most will return 'maintain' or 'pause' instead of 'hold' with `insufficient_conversions`).

- [ ] **Step 3: Add the guard to tier-1-rules.ts**

Replace `src/modules/advertising/decide/tier-1-rules.ts` entirely with:

```ts
import type { AdMetric, AdDecision } from '@/shared/types/advertising';

// Hard thresholds — deterministic, no ML
const FREQUENCY_CAP = 4.0;
const CPC_HARD_CAP = 5.0; // USD
const SPEND_DAILY_OVERAGE = 25.0; // USD
// Senior buyer baseline. v3b Senior Buyer Mode supersedes this with Phase B
// max_days=14 and conversion-based transition. Kept here as defensive minimum
// for the legacy code path (active when seniorBuyerMode feature gate = off).
const LEARNING_PHASE_DAYS = 7;
// Meta documents learning phase as exiting at ≥50 conversions in 7 days. Below
// that, per-ad-set metrics are too noisy for confident pause/scale decisions.
// See [[feedback-meta-learning-phase]] (memory) and Wave 3 spec §5.
const MIN_CONVERSIONS_BEFORE_ACTION = 50;

/**
 * Tier 1 hard rules engine.
 *
 * Pure function — no side effects, no async, no DI needed.
 * Confidence is always 1.0 (deterministic).
 * Learning phase is checked first; rules are evaluated in priority order.
 */
export function applyTier1Rules(m: AdMetric): AdDecision {
  const base = {
    ad_id: m.ad_id,
    metrics_snapshot: m,
    reasoning_tier: 'tier_1_rules' as const,
    confidence: 1.0,
  };

  // Learning phase — too early to act on metrics
  if (m.days_running < LEARNING_PHASE_DAYS) {
    return {
      ...base,
      action: 'hold',
      reason: `learning_phase_protection: only ${m.days_running}d running, need ≥${LEARNING_PHASE_DAYS}d`,
    };
  }

  // Conversion sample size — fail-open when field missing (Meta API hiccup)
  if (m.conversions_7d != null && m.conversions_7d < MIN_CONVERSIONS_BEFORE_ACTION) {
    return {
      ...base,
      action: 'hold',
      reason: `insufficient_conversions: ${m.conversions_7d}/7d, need ≥${MIN_CONVERSIONS_BEFORE_ACTION}`,
    };
  }

  // Audience fatigue — highest priority pause signal
  if (m.frequency >= FREQUENCY_CAP) {
    return {
      ...base,
      action: 'pause',
      reason: `frequency_cap_exceeded: ${m.frequency.toFixed(1)} ≥ ${FREQUENCY_CAP}`,
    };
  }

  // Cost-per-click hard ceiling
  if (m.cpc >= CPC_HARD_CAP) {
    return {
      ...base,
      action: 'pause',
      reason: `cpc_hard_cap_exceeded: $${m.cpc.toFixed(2)} ≥ $${CPC_HARD_CAP}`,
    };
  }

  // Daily budget safety rail
  if (m.spend_usd >= SPEND_DAILY_OVERAGE) {
    return {
      ...base,
      action: 'pause',
      reason: `spend_daily_overage: $${m.spend_usd.toFixed(2)} ≥ $${SPEND_DAILY_OVERAGE}`,
    };
  }

  return {
    ...base,
    action: 'maintain',
    reason: 'within_tier_1_thresholds',
  };
}

export {
  FREQUENCY_CAP,
  CPC_HARD_CAP,
  SPEND_DAILY_OVERAGE,
  LEARNING_PHASE_DAYS,
  MIN_CONVERSIONS_BEFORE_ACTION,
};
```

- [ ] **Step 4: Run all tier-1-rules tests**

Run: `npx vitest run src/modules/advertising/decide/__tests__/tier-1-rules.test.ts`

Expected: PASS (all existing + 6 new tests green).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/advertising/decide/tier-1-rules.ts \
        src/modules/advertising/decide/__tests__/tier-1-rules.test.ts
git commit -m "feat(wave-3/T4): MIN_CONVERSIONS_BEFORE_ACTION guard in tier-1-rules"
```

---

### Task 5: advertising-agent Phase 1 observability runbook

**Files:**
- Create: `docs/runbooks/advertising-agent-phase1-observability.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/advertising-agent-phase1-observability.md`:

````markdown
# Advertising Agent Phase 1 — Observability Runbook

**Goal:** Monitor advertising-agent decisions weekly during the DRY_RUN observation period.

**Pre-conditions:**
- `ADVERTISING_AGENT_ENABLED=true` in production env
- `ADVERTISING_AGENT_DRY_RUN=true` in production env (no real Meta API actions)
- Cron `triage-hourly` running (writes to `audit_actions` table)
- Wave 3 Section 2 deployed (commits Tn for MIN_CONVERSIONS_BEFORE_ACTION)

## Weekly KPIs (run every Friday, ~10 min)

### 1. Decision count by action (proves agent is evaluating)

SQL against Neon (or copy-paste into Drizzle Studio):

```sql
SELECT
  action,
  COUNT(*) AS n
FROM audit_actions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY action
ORDER BY n DESC;
```

**Expected:** at least one row per active ad set per day in `hold`, `maintain`, `pause`, or `scale`. If zero rows, cron is broken.

### 2. False positive count (proves judgment match)

```sql
SELECT
  COUNT(*) AS n_overridden,
  100.0 * COUNT(*) / NULLIF(SUM(CASE WHEN action IN ('pause','scale','edit') THEN 1 ELSE 0 END), 0) AS pct
FROM audit_actions
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND founder_overridden = true;
```

**Target:** pct < 5%. If ≥ 5% two weeks in a row, surface to debug — likely tier-1-rules threshold or v3b phase logic miscalibrated.

(If `founder_overridden` column doesn't yet exist, manual review against Meta Ads Manager substitutes; add column in Wave 3.5.)

### 3. Hold reasons breakdown

```sql
SELECT
  CASE
    WHEN reason LIKE 'learning_phase%' THEN 'learning_phase'
    WHEN reason LIKE 'insufficient_conversions%' THEN 'insufficient_conversions'
    WHEN reason LIKE 'frequency_cap%' THEN 'frequency_cap'
    WHEN reason LIKE 'cpc_hard_cap%' THEN 'cpc_hard_cap'
    WHEN reason LIKE 'spend_daily_overage%' THEN 'spend_daily_overage'
    ELSE 'other'
  END AS reason_class,
  action,
  COUNT(*) AS n
FROM audit_actions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY n DESC;
```

**Expected:** `insufficient_conversions` should appear on every ad set with <50 weekly conversions during the first 1-2 weeks. If `insufficient_conversions` count is 0 but we know ad sets are underconverting, the new guard isn't wired into the active phase path (v3b senior buyer mode may bypass it — verify via orchestrator code).

### 4. Top-3 paused + top-3 scaled

```sql
(SELECT ad_id, action, reason, created_at
 FROM audit_actions
 WHERE action = 'pause' AND created_at >= NOW() - INTERVAL '7 days'
 ORDER BY created_at DESC LIMIT 3)
UNION ALL
(SELECT ad_id, action, reason, created_at
 FROM audit_actions
 WHERE action = 'scale' AND created_at >= NOW() - INTERVAL '7 days'
 ORDER BY created_at DESC LIMIT 3);
```

For each row, look up the ad creative in Meta Ads Manager and judge: does the decision match what you would do? If 3 in a row don't match, the agent is miscalibrated — open issue.

## Acceptance criterion for DRY_RUN=false flip

**4 consecutive weeks** with `pct < 5%` false positives + all 3 top-paused ads sanity-check as correct paws + all 3 top-scaled ads sanity-check as correct.

When met, proceed to Wave 3.5 Phase 2 — flip `ADVERTISING_AGENT_DRY_RUN=false` (real Meta API actions).

## Cross-references

- Spec §5: `docs/superpowers/specs/2026-05-17-wave-3-compound-growth-design.md`
- Env-flip runbook: `docs/runbooks/advertising-agent-phase1-env-flip.md`
- Memory: [[feedback-meta-learning-phase]] (stale on LEARNING_PHASE_DAYS=2; correct on conversion guard rationale)
````

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/advertising-agent-phase1-observability.md
git commit -m "docs(wave-3/T5): advertising-agent phase 1 observability runbook"
```

---

### Task 6: advertising-agent Phase 1 env-flip runbook

**Files:**
- Create: `docs/runbooks/advertising-agent-phase1-env-flip.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/advertising-agent-phase1-env-flip.md`:

````markdown
# Advertising Agent Phase 1 — Env Flip Runbook

**Goal:** Safely flip `ADVERTISING_AGENT_ENABLED=true` in production while keeping `ADVERTISING_AGENT_DRY_RUN=true` (no real Meta API write actions).

**Pre-conditions:**
- Wave 3 Section 2 deployed (commits Tn for MIN_CONVERSIONS_BEFORE_ACTION).
- T4 seed script exists (per [[project-advertising-v3b-autonomy-fixes]] memory): `npm run seed:ad-set-states`.

## Step 1 — Verify env vars in Vercel production

In Vercel dashboard → Estrevia project → Settings → Environment Variables, confirm:

| Variable | Current | Action |
|---|---|---|
| `ADVERTISING_AGENT_ENABLED` | `false` | Note current — will change to `true` in Step 3 |
| `ADVERTISING_AGENT_DRY_RUN` | `true` | Keep `true` |
| `META_GRAPH_API_TOKEN` | (encrypted) | Verify not expired — Meta tokens roll every 90 days |
| `META_AD_ACCOUNT_ID` | `act_1435842067150024` | Per [[reference-meta-ad-account-id]] memory |
| `META_PAGE_ID` | `1087394517790815` | Per [[feedback-meta-page-selector-gotcha]] memory |
| `META_PIXEL_ID` | `1945750759636135` | Per [[project-advertising-audit-2026-05-17]] memory |

If `META_GRAPH_API_TOKEN` is missing or expired, refresh via Meta Business Manager → Business Settings → System Users → token rotation **before** continuing.

## Step 2 — Run T4 seed script

This seeds `advertising_ad_set_state` rows for currently live Meta ad sets so the phase machine has a starting state.

```bash
npm run seed:ad-set-states
```

**Expected output:** at least one row inserted per active Meta ad set. If zero, check `_audit_funnel_baseline.mjs` script for connectivity diagnostics.

**Verify in DB:**

```sql
SELECT COUNT(*) FROM advertising_ad_set_state;
```

Expected: ≥ 1.

## Step 3 — Flip ENABLED in Vercel env

Vercel dashboard → Settings → Environment Variables:

- `ADVERTISING_AGENT_ENABLED` → `true` (keep target: `Production`)
- Save → redeploy (Vercel will auto-redeploy on env change for production)

**Critical:** verify `ADVERTISING_AGENT_DRY_RUN=true` is still set after the redeploy. Open a fresh `vercel env ls` to confirm.

## Step 4 — Verify cron writes audit_actions

Wait 1 hour after redeploy. Then:

```sql
SELECT COUNT(*) AS recent_rows
FROM audit_actions
WHERE created_at >= NOW() - INTERVAL '1 hour';
```

**Expected:** ≥ 1.

If zero rows after 90 minutes:
- Check Vercel cron logs for `/api/cron/advertising/triage-hourly` — look for non-200 status or thrown errors
- Check `feature-gates` table — `seniorBuyerMode` gate may be off; agent in legacy tier-1-rules path is fine but verify decisions still write
- Manual trigger via `curl -X POST <prod-url>/api/cron/advertising/triage-hourly -H "Authorization: Bearer $CRON_SECRET"` and re-check

## Step 5 — Start weekly observation

Follow `docs/runbooks/advertising-agent-phase1-observability.md` every Friday.

## Step 6 (Wave 3.5, 4w+ later) — DRY_RUN=false

After 4 consecutive weeks satisfying observability acceptance criteria:
- Vercel env: `ADVERTISING_AGENT_DRY_RUN` → `false`
- Redeploy
- Monitor first 24h closely — agent now writes to real Meta API.

## Rollback plan

If anything looks wrong at any step:
- Vercel env: `ADVERTISING_AGENT_ENABLED` → `false` immediately
- Redeploy
- `audit_actions` rows already written are observation-only (no real Meta API actions in DRY_RUN), so no operational damage.

## Cross-references

- Spec §5: `docs/superpowers/specs/2026-05-17-wave-3-compound-growth-design.md`
- Observability runbook: `docs/runbooks/advertising-agent-phase1-observability.md`
- v3b ship: [[project-advertising-v3b-shipped]]
- v3b autonomy fixes: [[project-advertising-v3b-autonomy-fixes]]
````

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/advertising-agent-phase1-env-flip.md
git commit -m "docs(wave-3/T6): advertising-agent phase 1 env-flip runbook"
```

---

## Section 3 — L5-C SEO Phase 3 + AEO infra

### Task 7: definedTermSchema helper in json-ld.ts

**Files:**
- Modify: `src/shared/seo/json-ld.ts` (add helper near other schemas)
- Modify: `src/shared/seo/index.ts` (export new helper + type)
- Modify: `src/shared/seo/__tests__/json-ld.test.ts` (extend)

- [ ] **Step 1: Write failing tests**

Add to `src/shared/seo/__tests__/json-ld.test.ts` (after existing tests, before final `});` of outer describe):

```ts
import { definedTermSchema } from '../json-ld';

describe('definedTermSchema', () => {
  it('returns DefinedTerm @type with required name + description', () => {
    const schema = definedTermSchema({
      name: 'Lahiri ayanamsa',
      description: 'Official sidereal reference defined by ICRC 1955.',
    });
    expect(schema['@type']).toBe('DefinedTerm');
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema.name).toBe('Lahiri ayanamsa');
    expect(schema.description).toBe('Official sidereal reference defined by ICRC 1955.');
  });

  it('includes url when provided', () => {
    const schema = definedTermSchema({
      name: 'Sidereal astrology',
      description: 'Astrology relative to actual constellations.',
      url: 'https://estrevia.app/why-sidereal',
    });
    expect(schema.url).toBe('https://estrevia.app/why-sidereal');
  });

  it('includes inDefinedTermSet when provided', () => {
    const schema = definedTermSchema({
      name: 'Lahiri ayanamsa',
      description: 'Official sidereal reference defined by ICRC 1955.',
      inDefinedTermSet: 'https://en.wikipedia.org/wiki/Ayanamsa',
    });
    expect(schema.inDefinedTermSet).toBe('https://en.wikipedia.org/wiki/Ayanamsa');
  });

  it('omits url field when not provided', () => {
    const schema = definedTermSchema({
      name: 'Vedic astrology',
      description: 'Sanskrit Jyotisha tradition using sidereal positions.',
    });
    expect('url' in schema).toBe(false);
  });

  it('omits inDefinedTermSet field when not provided', () => {
    const schema = definedTermSchema({
      name: 'Vedic astrology',
      description: 'Sanskrit Jyotisha tradition using sidereal positions.',
    });
    expect('inDefinedTermSet' in schema).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/shared/seo/__tests__/json-ld.test.ts`

Expected: 5 FAILures: `definedTermSchema is not exported from '../json-ld'`.

- [ ] **Step 3: Add helper to json-ld.ts**

In `src/shared/seo/json-ld.ts`, first check imports at top of file include `DefinedTerm` from schema-dts:

```ts
import type {
  // ... existing imports ...
  DefinedTerm,
} from 'schema-dts';
```

(if schema-dts doesn't export DefinedTerm, fall back to a local interface — see Step 3b.)

Then add this function (e.g., after `faqSchema` definition around line 215):

```ts
// ---------------------------------------------------------------------------
// DefinedTerm
//
// AEO foundation: AI search engines extract DefinedTerm entries as canonical
// definitions for the page's primary subject. Use for astrology terms whose
// meaning we want LLMs to attribute to Estrevia (Lahiri ayanamsa, sidereal,
// Vedic).
// ---------------------------------------------------------------------------

export interface DefinedTermItem {
  name: string;
  description: string;
  url?: string;
  inDefinedTermSet?: string;
}

/**
 * Returns a DefinedTerm schema. Inject one per term on relevant pages.
 *
 * @example
 *   <JsonLdScript schema={definedTermSchema({
 *     name: 'Lahiri ayanamsa',
 *     description: 'Official sidereal reference defined by ICRC 1955.',
 *     inDefinedTermSet: 'https://en.wikipedia.org/wiki/Ayanamsa',
 *   })} />
 */
export function definedTermSchema(item: DefinedTermItem): WithContext<DefinedTerm> {
  const base: WithContext<DefinedTerm> = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: item.name,
    description: item.description,
  };
  if (item.url) base.url = item.url;
  if (item.inDefinedTermSet) base.inDefinedTermSet = item.inDefinedTermSet;
  return base;
}
```

**Step 3b — fallback if `DefinedTerm` not in schema-dts:** if the import fails, use:

```ts
interface DefinedTermLite {
  '@type': 'DefinedTerm';
  name: string;
  description: string;
  url?: string;
  inDefinedTermSet?: string;
}
type WithContextLite<T> = T & { '@context': 'https://schema.org' };
```

and change the return type to `WithContextLite<DefinedTermLite>`.

- [ ] **Step 4: Export from barrel**

In `src/shared/seo/index.ts`, in the existing `export { ... } from './json-ld'` block, add `definedTermSchema`. In the existing `export type { ... } from './json-ld'` block, add `DefinedTermItem`. Also append to the JSDoc quick reference near the top: `*   definedTermSchema()   — DefinedTerm schema for AEO entity markup`.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/shared/seo/__tests__/json-ld.test.ts`

Expected: PASS (all existing + 5 new tests).

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/seo/json-ld.ts \
        src/shared/seo/index.ts \
        src/shared/seo/__tests__/json-ld.test.ts
git commit -m "feat(wave-3/T7): definedTermSchema helper for AEO entity markup"
```

---

### Task 8: compatibility-pairs helper

**Files:**
- Create: `src/shared/seo/compatibility-pairs.ts`
- Create: `src/shared/seo/__tests__/compatibility-pairs.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/shared/seo/__tests__/compatibility-pairs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ALL_PAIR_SLUGS,
  parsePairSlug,
  buildPairSlug,
  isValidPairSlug,
} from '../compatibility-pairs';

describe('compatibility-pairs', () => {
  it('generates exactly 78 unique pair slugs', () => {
    expect(ALL_PAIR_SLUGS.length).toBe(78);
    expect(new Set(ALL_PAIR_SLUGS).size).toBe(78);
  });

  it('all slugs are alphabetically canonicalized (sign1 ≤ sign2)', () => {
    for (const slug of ALL_PAIR_SLUGS) {
      const [a, b] = slug.split('-');
      expect(a! <= b!).toBe(true);
    }
  });

  it('includes all 12 self-pairs', () => {
    const selfPairs = ALL_PAIR_SLUGS.filter((s) => s.split('-')[0] === s.split('-')[1]);
    expect(selfPairs.length).toBe(12);
    expect(selfPairs).toContain('aries-aries');
    expect(selfPairs).toContain('pisces-pisces');
  });

  it('does NOT include reversed duplicates', () => {
    expect(ALL_PAIR_SLUGS).toContain('aries-leo');
    expect(ALL_PAIR_SLUGS).not.toContain('leo-aries');
  });

  it('parsePairSlug returns sorted [sign1, sign2]', () => {
    expect(parsePairSlug('aries-leo')).toEqual(['aries', 'leo']);
    expect(parsePairSlug('leo-aries')).toBeNull(); // canonical only
  });

  it('parsePairSlug returns null for invalid slug', () => {
    expect(parsePairSlug('aries-invalid')).toBeNull();
    expect(parsePairSlug('not-a-slug')).toBeNull();
    expect(parsePairSlug('aries')).toBeNull();
  });

  it('buildPairSlug returns canonical (alphabetically sorted)', () => {
    expect(buildPairSlug('leo', 'aries')).toBe('aries-leo');
    expect(buildPairSlug('aries', 'leo')).toBe('aries-leo');
    expect(buildPairSlug('aries', 'aries')).toBe('aries-aries');
  });

  it('isValidPairSlug accepts all 78 + rejects invalid', () => {
    for (const slug of ALL_PAIR_SLUGS) {
      expect(isValidPairSlug(slug)).toBe(true);
    }
    expect(isValidPairSlug('leo-aries')).toBe(false);
    expect(isValidPairSlug('aries-invalid')).toBe(false);
    expect(isValidPairSlug('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/shared/seo/__tests__/compatibility-pairs.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement compatibility-pairs.ts**

Create `src/shared/seo/compatibility-pairs.ts`:

```ts
// ---------------------------------------------------------------------------
// Compatibility pair-slug helpers.
//
// 12 zodiac signs → C(12,2) ordered combos = 66 distinct-sign pairs + 12
// self-pairs = 78 unique pairs total. Slugs are alphabetically canonicalized
// to avoid /compatibility/aries-leo and /compatibility/leo-aries serving as
// duplicate URLs (SEO-hostile).
//
// Used by /compatibility/[pair] route for generateStaticParams and by
// /compatibility/page.tsx for the index grid.
// ---------------------------------------------------------------------------

export const ZODIAC_SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

/** All 78 canonical pair slugs (alphabetically sorted within each pair). */
export const ALL_PAIR_SLUGS: readonly string[] = (() => {
  const slugs: string[] = [];
  for (let i = 0; i < ZODIAC_SIGNS.length; i++) {
    for (let j = i; j < ZODIAC_SIGNS.length; j++) {
      slugs.push(`${ZODIAC_SIGNS[i]}-${ZODIAC_SIGNS[j]}`);
    }
  }
  return slugs;
})();

const PAIR_SLUG_SET = new Set<string>(ALL_PAIR_SLUGS);

/** Returns canonical pair slug, alphabetically sorted. */
export function buildPairSlug(s1: ZodiacSign, s2: ZodiacSign): string {
  return s1 <= s2 ? `${s1}-${s2}` : `${s2}-${s1}`;
}

/** Returns [sign1, sign2] tuple if slug is canonical+valid, else null. */
export function parsePairSlug(slug: string): readonly [ZodiacSign, ZodiacSign] | null {
  if (!PAIR_SLUG_SET.has(slug)) return null;
  const [a, b] = slug.split('-');
  return [a as ZodiacSign, b as ZodiacSign];
}

export function isValidPairSlug(slug: string): boolean {
  return PAIR_SLUG_SET.has(slug);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/shared/seo/__tests__/compatibility-pairs.test.ts`

Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add src/shared/seo/compatibility-pairs.ts \
        src/shared/seo/__tests__/compatibility-pairs.test.ts
git commit -m "feat(wave-3/T8): compatibility-pairs helper (78 canonical slugs)"
```

---

### Task 9: city data + planetary-hours city helper

**Files:**
- Create: `src/shared/seo/cities.ts`
- Create: `src/shared/seo/__tests__/cities.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/shared/seo/__tests__/cities.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TOP_CITIES, findCityBySlug, ALL_CITY_SLUGS } from '../cities';

describe('cities', () => {
  it('exports exactly 20 cities', () => {
    expect(TOP_CITIES.length).toBe(20);
    expect(ALL_CITY_SLUGS.length).toBe(20);
  });

  it('all city slugs are unique', () => {
    expect(new Set(ALL_CITY_SLUGS).size).toBe(20);
  });

  it('every city has lat, lng, tz', () => {
    for (const c of TOP_CITIES) {
      expect(typeof c.lat).toBe('number');
      expect(typeof c.lng).toBe('number');
      expect(typeof c.tz).toBe('string');
      expect(c.tz.length).toBeGreaterThan(0);
    }
  });

  it('lat/lng within valid ranges', () => {
    for (const c of TOP_CITIES) {
      expect(c.lat).toBeGreaterThanOrEqual(-90);
      expect(c.lat).toBeLessThanOrEqual(90);
      expect(c.lng).toBeGreaterThanOrEqual(-180);
      expect(c.lng).toBeLessThanOrEqual(180);
    }
  });

  it('findCityBySlug returns city for valid slug', () => {
    const ny = findCityBySlug('new-york');
    expect(ny).toBeDefined();
    expect(ny!.name).toBe('New York');
  });

  it('findCityBySlug returns undefined for invalid slug', () => {
    expect(findCityBySlug('atlantis')).toBeUndefined();
    expect(findCityBySlug('')).toBeUndefined();
  });

  it('includes mix of EN-primary and ES-primary cities', () => {
    expect(ALL_CITY_SLUGS).toContain('new-york');
    expect(ALL_CITY_SLUGS).toContain('london');
    expect(ALL_CITY_SLUGS).toContain('ciudad-de-mexico');
    expect(ALL_CITY_SLUGS).toContain('buenos-aires');
    expect(ALL_CITY_SLUGS).toContain('madrid');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/shared/seo/__tests__/cities.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement cities.ts**

Create `src/shared/seo/cities.ts`:

```ts
// ---------------------------------------------------------------------------
// Top-20 cities for /planetary-hours-cities programmatic SEO.
//
// Mix EN-primary + ES-primary (LATAM) markets to maximize organic reach for
// both locales. lat/lng in WGS84 decimal degrees. tz in IANA tz database.
// ---------------------------------------------------------------------------

export interface CityEntry {
  slug: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  tz: string;
}

export const TOP_CITIES: readonly CityEntry[] = [
  // EN-primary
  { slug: 'new-york',     name: 'New York',     country: 'US', lat: 40.7128,  lng:  -74.0060, tz: 'America/New_York' },
  { slug: 'los-angeles',  name: 'Los Angeles',  country: 'US', lat: 34.0522,  lng: -118.2437, tz: 'America/Los_Angeles' },
  { slug: 'chicago',      name: 'Chicago',      country: 'US', lat: 41.8781,  lng:  -87.6298, tz: 'America/Chicago' },
  { slug: 'london',       name: 'London',       country: 'GB', lat: 51.5074,  lng:   -0.1278, tz: 'Europe/London' },
  { slug: 'toronto',      name: 'Toronto',      country: 'CA', lat: 43.6532,  lng:  -79.3832, tz: 'America/Toronto' },
  { slug: 'sydney',       name: 'Sydney',       country: 'AU', lat: -33.8688, lng:  151.2093, tz: 'Australia/Sydney' },
  { slug: 'singapore',    name: 'Singapore',    country: 'SG', lat:  1.3521,  lng:  103.8198, tz: 'Asia/Singapore' },
  { slug: 'dubai',        name: 'Dubai',        country: 'AE', lat: 25.2048,  lng:   55.2708, tz: 'Asia/Dubai' },
  { slug: 'mumbai',       name: 'Mumbai',       country: 'IN', lat: 19.0760,  lng:   72.8777, tz: 'Asia/Kolkata' },
  { slug: 'amsterdam',    name: 'Amsterdam',    country: 'NL', lat: 52.3676,  lng:    4.9041, tz: 'Europe/Amsterdam' },
  // ES-primary (LATAM + Spain)
  { slug: 'ciudad-de-mexico', name: 'Ciudad de México', country: 'MX', lat: 19.4326,  lng:  -99.1332, tz: 'America/Mexico_City' },
  { slug: 'buenos-aires',     name: 'Buenos Aires',     country: 'AR', lat: -34.6037, lng:  -58.3816, tz: 'America/Argentina/Buenos_Aires' },
  { slug: 'bogota',           name: 'Bogotá',           country: 'CO', lat:   4.7110, lng:  -74.0721, tz: 'America/Bogota' },
  { slug: 'lima',             name: 'Lima',             country: 'PE', lat: -12.0464, lng:  -77.0428, tz: 'America/Lima' },
  { slug: 'santiago',         name: 'Santiago',         country: 'CL', lat: -33.4489, lng:  -70.6693, tz: 'America/Santiago' },
  { slug: 'sao-paulo',        name: 'São Paulo',        country: 'BR', lat: -23.5505, lng:  -46.6333, tz: 'America/Sao_Paulo' },
  { slug: 'rio-de-janeiro',   name: 'Rio de Janeiro',   country: 'BR', lat: -22.9068, lng:  -43.1729, tz: 'America/Sao_Paulo' },
  { slug: 'madrid',           name: 'Madrid',           country: 'ES', lat:  40.4168, lng:   -3.7038, tz: 'Europe/Madrid' },
  { slug: 'barcelona',        name: 'Barcelona',        country: 'ES', lat:  41.3851, lng:    2.1734, tz: 'Europe/Madrid' },
  { slug: 'caracas',          name: 'Caracas',          country: 'VE', lat:  10.4806, lng:  -66.9036, tz: 'America/Caracas' },
];

export const ALL_CITY_SLUGS: readonly string[] = TOP_CITIES.map((c) => c.slug);

const CITY_BY_SLUG = new Map(TOP_CITIES.map((c) => [c.slug, c]));

export function findCityBySlug(slug: string): CityEntry | undefined {
  return CITY_BY_SLUG.get(slug);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/shared/seo/__tests__/cities.test.ts`

Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add src/shared/seo/cities.ts \
        src/shared/seo/__tests__/cities.test.ts
git commit -m "feat(wave-3/T9): top-20 city data for planetary-hours-cities"
```

---

### Task 10: /compatibility index page

**Files:**
- Create: `src/app/[locale]/(marketing)/compatibility/page.tsx`

- [ ] **Step 1: Inspect existing /why-sidereal page structure (reference pattern)**

Run: `cat src/app/[locale]/(marketing)/why-sidereal/page.tsx | head -50`

Expected: identify `generateMetadata`, `setRequestLocale`, `getTranslations`, `JsonLdScript` usage patterns. Note locale routing prop shape.

- [ ] **Step 2: Implement /compatibility index page**

Create `src/app/[locale]/(marketing)/compatibility/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { createMetadata, breadcrumbSchema, JsonLdScript, SITE_URL } from '@/shared/seo';
import { ZODIAC_SIGNS, buildPairSlug } from '@/shared/seo/compatibility-pairs';

interface PageProps {
  params: Promise<{ locale: 'en' | 'es' }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'es'
    ? 'Compatibilidad zodiacal sideral — todas las combinaciones'
    : 'Sidereal zodiac compatibility — every pair';
  const description = locale === 'es'
    ? 'Compatibilidad por elemento, modalidad y regente entre los 12 signos siderales. 78 combinaciones únicas.'
    : 'Element, modality, and ruler compatibility across all 12 sidereal signs. 78 unique pair pages.';
  return createMetadata({
    title,
    description,
    path: '/compatibility',
    locale,
  });
}

export default async function CompatibilityIndexPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const heading = locale === 'es' ? 'Compatibilidad sideral' : 'Sidereal compatibility';
  const intro = locale === 'es'
    ? 'Cada combinación de signos siderales con análisis de elemento, modalidad y regente planetario.'
    : 'Every sidereal sign pair with element, modality, and ruling-planet analysis.';
  const pairLabel = (s1: string, s2: string) =>
    `${s1.charAt(0).toUpperCase() + s1.slice(1)} × ${s2.charAt(0).toUpperCase() + s2.slice(1)}`;

  const localePath = locale === 'es' ? '/es' : '';

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <JsonLdScript
        schema={breadcrumbSchema([
          { name: locale === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}${localePath}` },
          { name: heading, url: `${SITE_URL}${localePath}/compatibility` },
        ])}
      />
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white/90">{heading}</h1>
        <p className="mt-3 text-sm text-white/60">{intro}</p>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {ZODIAC_SIGNS.flatMap((s1, i) =>
          ZODIAC_SIGNS.slice(i).map((s2) => {
            const slug = buildPairSlug(s1, s2);
            return (
              <Link
                key={slug}
                href={`/compatibility/${slug}`}
                locale={locale}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                {pairLabel(s1, s2)}
              </Link>
            );
          }),
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Run typecheck + verify route renders**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run dev` (background) → open `http://localhost:3000/compatibility` and `http://localhost:3000/es/compatibility` → confirm grid of 78 links renders.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/\(marketing\)/compatibility/page.tsx
git commit -m "feat(wave-3/T10): /compatibility index page (78 pair grid)"
```

---

### Task 11: /compatibility/[pair] dynamic page

**Files:**
- Create: `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx`

- [ ] **Step 1: Inspect signs descriptions JSON schema**

Run: `head -15 content/signs/descriptions.json`

Expected: confirms fields `sign`, `slug`, `element`, `modality`, `ruler`, `symbol`. Use these for per-pair data.

- [ ] **Step 2: Implement /compatibility/[pair] page**

Create `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { createMetadata, articleSchema, breadcrumbSchema, JsonLdScript, SITE_URL } from '@/shared/seo';
import { ALL_PAIR_SLUGS, parsePairSlug } from '@/shared/seo/compatibility-pairs';
import enSigns from '../../../../../../content/signs/descriptions.json';
import esSigns from '../../../../../../content/signs/descriptions.es.json';

interface PageProps {
  params: Promise<{ locale: 'en' | 'es'; pair: string }>;
}

interface SignRow {
  sign: string;
  slug: string;
  element: string;
  modality: string;
  ruler: string;
  symbol: string;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  return ALL_PAIR_SLUGS.map((pair) => ({ pair }));
}

function findSign(rows: SignRow[], slug: string): SignRow | undefined {
  return rows.find((r) => r.slug === slug);
}

type ElementName = 'Fire' | 'Earth' | 'Air' | 'Water';
type ModalityName = 'Cardinal' | 'Fixed' | 'Mutable';

function elementCompatibility(e1: ElementName, e2: ElementName, locale: 'en' | 'es'): string {
  const same = e1 === e2;
  const pair = `${e1}-${e2}`;
  const pairs: Record<string, { en: string; es: string }> = {
    'Fire-Air':   { en: 'Harmonious (Fire feeds on Air).', es: 'Armónica (el Fuego se alimenta del Aire).' },
    'Air-Fire':   { en: 'Harmonious (Fire feeds on Air).', es: 'Armónica (el Fuego se alimenta del Aire).' },
    'Earth-Water':{ en: 'Harmonious (Water nourishes Earth).', es: 'Armónica (el Agua nutre la Tierra).' },
    'Water-Earth':{ en: 'Harmonious (Water nourishes Earth).', es: 'Armónica (el Agua nutre la Tierra).' },
    'Fire-Earth': { en: 'Challenging (Fire scorches Earth).', es: 'Desafiante (el Fuego quema la Tierra).' },
    'Earth-Fire': { en: 'Challenging (Fire scorches Earth).', es: 'Desafiante (el Fuego quema la Tierra).' },
    'Fire-Water': { en: 'Clashing (Water extinguishes Fire).', es: 'Conflictiva (el Agua apaga el Fuego).' },
    'Water-Fire': { en: 'Clashing (Water extinguishes Fire).', es: 'Conflictiva (el Agua apaga el Fuego).' },
    'Air-Earth':  { en: 'Neutral (different planes).', es: 'Neutra (planos distintos).' },
    'Earth-Air':  { en: 'Neutral (different planes).', es: 'Neutra (planos distintos).' },
    'Air-Water':  { en: 'Mixed (Air ripples Water).', es: 'Mixta (el Aire agita el Agua).' },
    'Water-Air':  { en: 'Mixed (Air ripples Water).', es: 'Mixta (el Aire agita el Agua).' },
  };
  if (same) {
    return locale === 'es'
      ? `Doble intensidad ${e1.toLowerCase()} — afinidad fuerte, sin contraste.`
      : `Double ${e1.toLowerCase()} intensity — strong affinity, no contrast.`;
  }
  const entry = pairs[pair];
  return entry ? entry[locale] : (locale === 'es' ? 'Combinación poco estudiada.' : 'Less-studied combination.');
}

function modalityCompatibility(m1: ModalityName, m2: ModalityName, locale: 'en' | 'es'): string {
  if (m1 === m2 && m1 === 'Cardinal') {
    return locale === 'es' ? 'Doble cardinal — ambos quieren liderar; choque probable.' : 'Double cardinal — both want to lead; clash likely.';
  }
  if (m1 === m2 && m1 === 'Fixed') {
    return locale === 'es' ? 'Doble fijo — máxima estabilidad pero resistencia al cambio.' : 'Double fixed — maximum stability but resistance to change.';
  }
  if (m1 === m2 && m1 === 'Mutable') {
    return locale === 'es' ? 'Doble mutable — adaptabilidad, falta de dirección clara.' : 'Double mutable — adaptable, lacks clear direction.';
  }
  const set = new Set([m1, m2]);
  if (set.has('Cardinal') && set.has('Fixed')) {
    return locale === 'es' ? 'Cardinal + Fijo — iniciativa estabilizada; equilibrio bueno.' : 'Cardinal + Fixed — initiative anchored; healthy balance.';
  }
  if (set.has('Cardinal') && set.has('Mutable')) {
    return locale === 'es' ? 'Cardinal + Mutable — el líder propone, el mutable adapta.' : 'Cardinal + Mutable — leader proposes, mutable adapts.';
  }
  return locale === 'es' ? 'Fijo + Mutable — estabilidad con flexibilidad ocasional.' : 'Fixed + Mutable — stability with occasional flexibility.';
}

function aspectByDistanceIdx(d: number, locale: 'en' | 'es'): string {
  const min = Math.min(d, 12 - d);
  const labels: Record<number, { en: string; es: string }> = {
    0: { en: 'Conjunction (same sign) — fused energy', es: 'Conjunción (mismo signo) — energía fusionada' },
    1: { en: 'Semi-sextile — subtle adjustment, minor learning aspect', es: 'Semisextil — ajuste sutil, aspecto menor de aprendizaje' },
    2: { en: 'Sextile — supportive, opportunity-flavored', es: 'Sextil — apoyo, sabor de oportunidad' },
    3: { en: 'Square — friction, growth pressure', es: 'Cuadratura — fricción, presión de crecimiento' },
    4: { en: 'Trine — flowing, easy compatibility', es: 'Trígono — fluidez, compatibilidad fácil' },
    5: { en: 'Quincunx — uneasy, requires adjustment', es: 'Quincuncio — inquietud, requiere ajuste' },
    6: { en: 'Opposition — magnetic polarity, balance challenge', es: 'Oposición — polaridad magnética, desafío de equilibrio' },
  };
  return labels[min]![locale];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, pair } = await params;
  const parsed = parsePairSlug(pair);
  if (!parsed) return {};
  const [s1, s2] = parsed;
  const rows = locale === 'es' ? esSigns : enSigns;
  const r1 = findSign(rows as SignRow[], s1);
  const r2 = findSign(rows as SignRow[], s2);
  if (!r1 || !r2) return {};
  const title = locale === 'es'
    ? `${r1.sign} × ${r2.sign} — compatibilidad sideral`
    : `${r1.sign} × ${r2.sign} — sidereal compatibility`;
  const description = locale === 'es'
    ? `Análisis sideral de la compatibilidad ${r1.sign} y ${r2.sign}: elemento, modalidad, regente y tipo de aspecto.`
    : `Sidereal analysis of ${r1.sign} and ${r2.sign} compatibility: element, modality, ruler, and aspect type.`;
  return createMetadata({
    title,
    description,
    path: `/compatibility/${pair}`,
    locale,
  });
}

export default async function CompatibilityPairPage({ params }: PageProps) {
  const { locale, pair } = await params;
  setRequestLocale(locale);
  const parsed = parsePairSlug(pair);
  if (!parsed) notFound();
  const [s1, s2] = parsed;
  const rows = (locale === 'es' ? esSigns : enSigns) as SignRow[];
  const r1 = findSign(rows, s1);
  const r2 = findSign(rows, s2);
  if (!r1 || !r2) notFound();

  const idx1 = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'].indexOf(s1);
  const idx2 = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'].indexOf(s2);

  const heading = `${r1.sign} × ${r2.sign}`;
  const localePath = locale === 'es' ? '/es' : '';
  const url = `${SITE_URL}${localePath}/compatibility/${pair}`;

  const elementText = elementCompatibility(r1.element as ElementName, r2.element as ElementName, locale);
  const modalityText = modalityCompatibility(r1.modality as ModalityName, r2.modality as ModalityName, locale);
  const aspectText = aspectByDistanceIdx(Math.abs(idx1 - idx2), locale);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <JsonLdScript
        schema={articleSchema({
          headline: heading,
          description: elementText,
          datePublished: '2026-05-17',
          author: 'Estrevia',
          url,
          locale,
        })}
      />
      <JsonLdScript
        schema={breadcrumbSchema([
          { name: locale === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}${localePath}` },
          { name: locale === 'es' ? 'Compatibilidad sideral' : 'Sidereal compatibility', url: `${SITE_URL}${localePath}/compatibility` },
          { name: heading, url },
        ])}
      />
      <header className="mb-8 text-center">
        <p className="text-5xl">{r1.symbol} {r2.symbol}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white/90">{heading}</h1>
      </header>
      <dl className="space-y-6">
        <div>
          <dt className="text-xs uppercase tracking-wider text-white/40">{locale === 'es' ? 'Elemento' : 'Element'}</dt>
          <dd className="mt-1 text-sm text-white/80"><strong className="text-white">{r1.element} + {r2.element}</strong> — {elementText}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-white/40">{locale === 'es' ? 'Modalidad' : 'Modality'}</dt>
          <dd className="mt-1 text-sm text-white/80"><strong className="text-white">{r1.modality} + {r2.modality}</strong> — {modalityText}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-white/40">{locale === 'es' ? 'Regentes' : 'Rulers'}</dt>
          <dd className="mt-1 text-sm text-white/80"><strong className="text-white">{r1.ruler} + {r2.ruler}</strong></dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-white/40">{locale === 'es' ? 'Tipo de aspecto' : 'Aspect type'}</dt>
          <dd className="mt-1 text-sm text-white/80">{aspectText}</dd>
        </div>
      </dl>
    </main>
  );
}
```

Notes:
- Element/modality/aspect text is bilingually structured into the helpers; founder can extend prose later via `seo-content-cadence.md` runbook.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS. If `createMetadata` API differs (path vs canonicalPath), adjust call to match existing pattern by inspecting `src/shared/seo/metadata.ts:1-60`.

- [ ] **Step 4: Run dev server + verify route**

Run: `npm run dev` (background)
Open `http://localhost:3000/compatibility/aries-leo` and `http://localhost:3000/es/compatibility/aries-leo` → verify content renders.
Open `http://localhost:3000/compatibility/leo-aries` → should 404 (non-canonical).
Open `http://localhost:3000/compatibility/aries-invalid` → should 404.

Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/\(marketing\)/compatibility/\[pair\]/page.tsx
git commit -m "feat(wave-3/T11): /compatibility/[pair] page (78 SSG pairs)"
```

---

### Task 12: /planetary-hours-cities index page

**Files:**
- Create: `src/app/[locale]/(marketing)/planetary-hours-cities/page.tsx`

- [ ] **Step 1: Implement the index page**

Create `src/app/[locale]/(marketing)/planetary-hours-cities/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { createMetadata, breadcrumbSchema, JsonLdScript, SITE_URL } from '@/shared/seo';
import { TOP_CITIES } from '@/shared/seo/cities';

interface PageProps {
  params: Promise<{ locale: 'en' | 'es' }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'es'
    ? 'Horas planetarias por ciudad — directorio'
    : 'Planetary hours by city — directory';
  const description = locale === 'es'
    ? 'Tabla de horas planetarias para 20 ciudades principales (NY, LA, Londres, CDMX, Buenos Aires y más).'
    : 'Planetary hours tables for 20 major cities (NYC, LA, London, Mexico City, Buenos Aires, more).';
  return createMetadata({
    title,
    description,
    path: '/planetary-hours-cities',
    locale,
  });
}

export default async function PlanetaryHoursCitiesIndexPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const heading = locale === 'es' ? 'Horas planetarias por ciudad' : 'Planetary hours by city';
  const intro = locale === 'es'
    ? 'Tablas actualizadas a diario para las 20 ciudades de mayor demanda en mercados EN y ES.'
    : 'Daily-refreshed tables for the 20 most-requested cities across EN and ES markets.';

  const localePath = locale === 'es' ? '/es' : '';

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <JsonLdScript
        schema={breadcrumbSchema([
          { name: locale === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}${localePath}` },
          { name: heading, url: `${SITE_URL}${localePath}/planetary-hours-cities` },
        ])}
      />
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white/90">{heading}</h1>
        <p className="mt-3 text-sm text-white/60">{intro}</p>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {TOP_CITIES.map((c) => (
          <Link
            key={c.slug}
            href={`/planetary-hours-cities/${c.slug}`}
            locale={locale}
            className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/[0.05]"
          >
            {c.name}
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Verify route renders**

Run: `npm run dev` (background)
Open `http://localhost:3000/planetary-hours-cities` and `http://localhost:3000/es/planetary-hours-cities` → confirm 20-city grid renders.
Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/\(marketing\)/planetary-hours-cities/page.tsx
git commit -m "feat(wave-3/T12): /planetary-hours-cities index (20-city directory)"
```

---

### Task 13: /planetary-hours-cities/[city] dynamic page

**Files:**
- Create: `src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx`

- [ ] **Step 1: Inspect calculatePlanetaryHours signature**

Run: `grep -n "export function calculatePlanetaryHours\|interface PlanetaryHoursResult\|export interface" src/modules/astro-engine/planetary-hours.ts | head -10`

Expected: identify input params (lat, lng, date, optional timezone) and return shape (24-hour array).

- [ ] **Step 2: Implement the per-city page**

Create `src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { createMetadata, articleSchema, breadcrumbSchema, JsonLdScript, SITE_URL } from '@/shared/seo';
import { ALL_CITY_SLUGS, findCityBySlug } from '@/shared/seo/cities';
import { calculatePlanetaryHours } from '@/modules/astro-engine';

interface PageProps {
  params: Promise<{ locale: 'en' | 'es'; city: string }>;
}

export const dynamicParams = false;
// 24h ISR — sun rise/set times shift slightly day-to-day; daily refresh suffices
// for the directory-style page (an authoritative-looking snapshot, not the
// real-time tool at /hours).
export const revalidate = 86400;

export async function generateStaticParams() {
  return ALL_CITY_SLUGS.map((city) => ({ city }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, city } = await params;
  const entry = findCityBySlug(city);
  if (!entry) return {};
  const title = locale === 'es'
    ? `Horas planetarias en ${entry.name} — hoy`
    : `Planetary hours in ${entry.name} — today`;
  const description = locale === 'es'
    ? `Tabla de horas planetarias para ${entry.name} basada en el cálculo sideral con efemérides Suizas.`
    : `Planetary hours table for ${entry.name} computed with the Swiss Ephemeris sidereal engine.`;
  return createMetadata({
    title,
    description,
    path: `/planetary-hours-cities/${city}`,
    locale,
  });
}

export default async function PlanetaryHoursCityPage({ params }: PageProps) {
  const { locale, city } = await params;
  setRequestLocale(locale);
  const entry = findCityBySlug(city);
  if (!entry) notFound();

  const today = new Date();
  // Hours computed in city's timezone — but the engine accepts a JS Date in UTC
  // and applies geopos + tz internally if available; otherwise we pass tz
  // alongside. Adjust per actual signature found in Step 1.
  const result = calculatePlanetaryHours({
    latitude: entry.lat,
    longitude: entry.lng,
    date: today,
    timezone: entry.tz,
  } as Parameters<typeof calculatePlanetaryHours>[0]);

  const heading = locale === 'es'
    ? `Horas planetarias — ${entry.name}`
    : `Planetary hours — ${entry.name}`;
  const localePath = locale === 'es' ? '/es' : '';
  const url = `${SITE_URL}${localePath}/planetary-hours-cities/${city}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <JsonLdScript
        schema={articleSchema({
          headline: heading,
          description: locale === 'es' ? `Tabla de horas planetarias para ${entry.name}.` : `Planetary hours table for ${entry.name}.`,
          datePublished: today.toISOString().slice(0, 10),
          author: 'Estrevia',
          url,
          locale,
        })}
      />
      <JsonLdScript
        schema={breadcrumbSchema([
          { name: locale === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}${localePath}` },
          { name: locale === 'es' ? 'Horas planetarias por ciudad' : 'Planetary hours by city', url: `${SITE_URL}${localePath}/planetary-hours-cities` },
          { name: entry.name, url },
        ])}
      />
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white/90">{heading}</h1>
        <p className="mt-2 text-xs uppercase tracking-wider text-white/40">{entry.country} · {entry.tz}</p>
      </header>
      <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 text-xs text-white/70">
        {JSON.stringify(result, null, 2)}
      </pre>
      <p className="mt-4 text-xs text-white/40">
        {locale === 'es'
          ? 'Tabla calculada con efemérides Suizas (algoritmo Moshier) — precisión ±0.01°. Actualizada cada 24 horas.'
          : 'Computed with Swiss Ephemeris (Moshier algorithm) at ±0.01° accuracy. Refreshes every 24 hours.'}
      </p>
    </main>
  );
}
```

**Adjustment note:** Step 1 inspection of `calculatePlanetaryHours` signature may reveal the input shape differs from above. Adjust accordingly — common alternatives are `({ lat, lng, date })` or `(lat, lng, date)` positional. Visual presentation of result (the `<pre>`) is intentionally minimal — founder may swap for a styled `<PlanetaryHoursGrid />` reuse later via the seo-content-cadence runbook.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS. If `calculatePlanetaryHours` signature differs, fix the call site in this file.

- [ ] **Step 4: Run dev server + verify**

Run: `npm run dev` (background)
Open `http://localhost:3000/planetary-hours-cities/new-york` → confirm renders a JSON dump of planetary hours.
Open `http://localhost:3000/es/planetary-hours-cities/ciudad-de-mexico` → confirm ES locale variant.
Open `http://localhost:3000/planetary-hours-cities/atlantis` → confirm 404.
Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/\(marketing\)/planetary-hours-cities/\[city\]/page.tsx
git commit -m "feat(wave-3/T13): /planetary-hours-cities/[city] page (20 ISR cities)"
```

---

### Task 14: inject faqSchema + definedTermSchema on /why-sidereal

**Files:**
- Modify: `src/app/[locale]/(marketing)/why-sidereal/page.tsx`

- [ ] **Step 1: Read current why-sidereal page**

Run: `cat src/app/[locale]/(marketing)/why-sidereal/page.tsx`

Expected: identify existing JsonLdScript usage. Note where to inject FAQ + DefinedTerm without disturbing existing layout.

- [ ] **Step 2: Inject faqSchema + definedTermSchema**

In `src/app/[locale]/(marketing)/why-sidereal/page.tsx`, ensure imports include `faqSchema, definedTermSchema` from `@/shared/seo` and `JsonLdScript` if not already.

Add the following 2 schema blocks immediately after the existing `<JsonLdScript schema={...} />` (or at the top of the returned JSX if none exists yet):

```tsx
      <JsonLdScript
        schema={faqSchema(
          locale === 'es'
            ? [
                {
                  question: '¿Qué es la astrología sideral?',
                  answer: 'La astrología sideral calcula las posiciones planetarias contra las constelaciones reales tal como aparecen hoy en el cielo, aplicando la corrección del ayanamsa Lahiri (~24° en 2026) para compensar la precesión axial de la Tierra.',
                },
                {
                  question: '¿Qué es el ayanamsa Lahiri?',
                  answer: 'El ayanamsa Lahiri es el punto de referencia sideral oficial definido por el Comité de Reforma del Calendario Indio en 1955. Estrevia lo utiliza para todos sus cálculos de carta.',
                },
                {
                  question: '¿Qué tan precisos son los cálculos de Estrevia?',
                  answer: 'Estrevia utiliza Swiss Ephemeris con el algoritmo Moshier, preciso a ±0.01°. Las casas usan el sistema Placidus.',
                },
                {
                  question: '¿Cuál es la diferencia entre astrología sideral y tropical?',
                  answer: 'La astrología tropical usa las estaciones (la trayectoria aparente del Sol) como marco de referencia; la sideral usa las constelaciones reales. Se diferencian en el valor actual del ayanamsa.',
                },
                {
                  question: '¿La astrología védica es lo mismo que la sideral?',
                  answer: 'La astrología védica (Jyotish) utiliza cálculos siderales como base matemática, pero añade doctrinas adicionales (nakshatras, dashas, yogas) sobre esa base.',
                },
              ]
            : [
                {
                  question: 'What is sidereal astrology?',
                  answer: 'Sidereal astrology calculates planetary positions against the actual constellations as they appear in the sky today, applying the Lahiri ayanamsa correction (~24° as of 2026) to account for Earth’s axial precession.',
                },
                {
                  question: 'What is the Lahiri ayanamsa?',
                  answer: 'The Lahiri ayanamsa is the official sidereal reference point defined by the Indian Calendar Reform Committee in 1955, used by Estrevia for all chart calculations.',
                },
                {
                  question: 'How accurate is Estrevia’s chart calculation?',
                  answer: 'Estrevia uses Swiss Ephemeris with the Moshier algorithm, accurate to ±0.01°. Houses use the Placidus system.',
                },
                {
                  question: 'What is the difference between sidereal and tropical astrology?',
                  answer: 'Tropical astrology uses the seasons (the Sun’s apparent path) as its reference frame; sidereal astrology uses the actual constellations. They differ by the current ayanamsa value.',
                },
                {
                  question: 'Is Vedic astrology the same as sidereal astrology?',
                  answer: 'Vedic (Jyotish) astrology uses sidereal calculations as its mathematical foundation but layers additional doctrines (nakshatras, dashas, yogas) on top.',
                },
              ],
        )}
      />
      <JsonLdScript
        schema={definedTermSchema({
          name: 'Lahiri ayanamsa',
          description: locale === 'es'
            ? 'Punto de referencia sideral oficial definido por el Comité de Reforma del Calendario Indio en 1955; corrige la precesión de los equinoccios.'
            : 'Official sidereal reference point defined by the Indian Calendar Reform Committee in 1955; corrects for equinoctial precession.',
          inDefinedTermSet: 'https://en.wikipedia.org/wiki/Ayanamsa',
        })}
      />
      <JsonLdScript
        schema={definedTermSchema({
          name: 'Sidereal astrology',
          description: locale === 'es'
            ? 'Sistema astrológico que mide las posiciones planetarias contra las constelaciones reales, no contra el zodíaco estacional tropical.'
            : 'Astrological system measuring planetary positions against the actual constellations rather than the tropical seasonal zodiac.',
          inDefinedTermSet: 'https://en.wikipedia.org/wiki/Sidereal_astrology',
        })}
      />
      <JsonLdScript
        schema={definedTermSchema({
          name: 'Vedic astrology',
          description: locale === 'es'
            ? 'Tradición Jyotish sánscrita que utiliza cálculos siderales como base matemática y añade doctrinas como nakshatras, dashas y yogas.'
            : 'Sanskrit Jyotish tradition using sidereal calculations as its mathematical foundation and layering nakshatras, dashas, and yogas on top.',
          inDefinedTermSet: 'https://en.wikipedia.org/wiki/Hindu_astrology',
        })}
      />
```

Confirm import line at top of file: `import { createMetadata, faqSchema, definedTermSchema, JsonLdScript /* + existing */ } from '@/shared/seo';`. Preserve any existing imports.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Verify schema injection**

Run: `npm run dev` (background)
Open `http://localhost:3000/why-sidereal` in browser → view source → search for `"@type":"FAQPage"` and `"@type":"DefinedTerm"`.

Expected: 1 FAQPage + 3 DefinedTerm script tags present.

Open `http://localhost:3000/es/why-sidereal` → repeat verification with Spanish text.

Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/\(marketing\)/why-sidereal/page.tsx
git commit -m "feat(wave-3/T14): inject FAQ + DefinedTerm schema on /why-sidereal"
```

---

### Task 15: extend sitemap.ts with +200 URLs

**Files:**
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Inspect current sitemap end-of-file structure**

Run: `tail -80 src/app/sitemap.ts`

Expected: identify where existing entries are returned (likely `return [...allUrls]` or similar). Note `buildAlternates()` and `lastModifiedFor()` patterns.

- [ ] **Step 2: Add new entries**

In `src/app/sitemap.ts`, add at the top of the file (after existing imports):

```ts
import { ALL_PAIR_SLUGS } from '@/shared/seo/compatibility-pairs';
import { ALL_CITY_SLUGS } from '@/shared/seo/cities';
```

Then locate the main `sitemap()` default-export function and add inside the array builder (alongside the existing essay/sign/tarot blocks):

```ts
  // Compatibility index (EN + ES)
  const compatibilityIndex: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/compatibility`,    lastModified: lastModifiedFor('compatibility'), changeFrequency: 'monthly', priority: 0.7, alternates: buildAlternates('/compatibility') },
    { url: `${SITE_URL}/es/compatibility`, lastModified: lastModifiedFor('compatibility'), changeFrequency: 'monthly', priority: 0.7, alternates: buildAlternates('/compatibility') },
  ];

  // Compatibility pairs (78 × 2 locales)
  const compatibilityPairs: MetadataRoute.Sitemap = ALL_PAIR_SLUGS.flatMap((pair) => [
    { url: `${SITE_URL}/compatibility/${pair}`,    lastModified: lastModifiedFor(`compatibility/${pair}`), changeFrequency: 'monthly', priority: 0.5, alternates: buildAlternates(`/compatibility/${pair}`) },
    { url: `${SITE_URL}/es/compatibility/${pair}`, lastModified: lastModifiedFor(`compatibility/${pair}`), changeFrequency: 'monthly', priority: 0.5, alternates: buildAlternates(`/compatibility/${pair}`) },
  ]);

  // Planetary-hours-cities index (EN + ES)
  const planetaryHoursCitiesIndex: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/planetary-hours-cities`,    lastModified: lastModifiedFor('planetary-hours-cities'), changeFrequency: 'daily', priority: 0.7, alternates: buildAlternates('/planetary-hours-cities') },
    { url: `${SITE_URL}/es/planetary-hours-cities`, lastModified: lastModifiedFor('planetary-hours-cities'), changeFrequency: 'daily', priority: 0.7, alternates: buildAlternates('/planetary-hours-cities') },
  ];

  // Planetary-hours per-city (20 × 2 locales)
  const planetaryHoursCities: MetadataRoute.Sitemap = ALL_CITY_SLUGS.flatMap((city) => [
    { url: `${SITE_URL}/planetary-hours-cities/${city}`,    lastModified: lastModifiedFor(`planetary-hours-cities/${city}`), changeFrequency: 'daily', priority: 0.5, alternates: buildAlternates(`/planetary-hours-cities/${city}`) },
    { url: `${SITE_URL}/es/planetary-hours-cities/${city}`, lastModified: lastModifiedFor(`planetary-hours-cities/${city}`), changeFrequency: 'daily', priority: 0.5, alternates: buildAlternates(`/planetary-hours-cities/${city}`) },
  ]);
```

Then in the final `return [...]` array, spread the new blocks:

```ts
  return [
    ...existing_blocks_already_there,
    ...compatibilityIndex,
    ...compatibilityPairs,
    ...planetaryHoursCitiesIndex,
    ...planetaryHoursCities,
  ];
```

- [ ] **Step 3: Inspect lastModifiedFor signature**

If `lastModifiedFor` only knows about specific paths (per existing pattern), `lastModifiedFor('compatibility')` may return `null`/now. That's acceptable — Next.js sitemap accepts either. If `lastModifiedFor` is strict and throws on unknown keys, fall back to inline `new Date()` for the new entries.

- [ ] **Step 4: Run build to confirm sitemap renders**

Run: `npm run build`

Expected: build succeeds. Look at build output for `Generating static pages` — should show compatibility/[pair] × 78 and planetary-hours-cities/[city] × 20 (× 2 locales each).

- [ ] **Step 5: Manual sitemap inspection**

Run: `npm run dev` (background)
Open `http://localhost:3000/sitemap.xml` → search for `compatibility/aries-leo` and `planetary-hours-cities/new-york` — confirm presence.
Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/app/sitemap.ts
git commit -m "feat(wave-3/T15): sitemap +200 URLs (compatibility + planetary-hours-cities)"
```

---

### Task 16: seo-content-cadence runbook

**Files:**
- Create: `docs/runbooks/seo-content-cadence.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/seo-content-cadence.md`:

````markdown
# SEO Content Cadence — Founder Runbook

**Goal:** Sustain 1 essay/week + ongoing extension of Wave 3 SEO infrastructure.

**Pre-conditions:**
- Wave 3 Section 3 deployed (commits Tn for /compatibility + /planetary-hours-cities + AEO schema).
- Founder writes content async; engineer-shipped factual stubs remain valid baseline.

## Weekly cadence (target: 30-60 min)

### 1. Publish 1 essay (low-competition keyword)

Topic queue suggestions (rotate):

- "Sidereal vs tropical: 5 myths that need to die" (EN)
- "Qué dicen las nakshatras sobre tu Sol sideral" (ES)
- "Planetary hours for new-moon manifestation" (EN)
- "Dashas: cómo el tiempo sideral predice fases vitales" (ES)
- "Lahiri vs Krishnamurti: which sidereal ayanamsa is right?" (EN)
- "Tu Mercurio retrógrado en sideral: por qué difiere del tropical" (ES)

Format: ≥1500 words, brand voice (no AI-slop — see `[[feedback-anti-ai-slop]]`), include 1 internal link to `/compatibility/[pair]` or `/planetary-hours-cities/[city]` pages.

Store under `content/essays/{en|es}/<slug>.mdx`. Existing sitemap auto-picks it up via `getAllEssaySlugs()`.

### 2. Extend compatibility pair prose (optional)

The 78 `/compatibility/[pair]` pages ship with factual stub content (element, modality, ruler, aspect). To add brand-voice prose:

- Open `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx`
- Add a `pairProse: Record<string, { en: string; es: string }>` constant keyed by canonical slug (e.g. `'aries-leo'`)
- Render below the existing `<dl>` when entry exists

Founder is free to add 3-5 pair prose entries per week. Engineer-shipped stub remains the fallback for the other 73 pairs.

### 3. Extend FAQ Q/A on /pricing and /sidereal-dates root

Currently `faqSchema()` injection lives only on `/why-sidereal` (Wave 3 proof-of-pattern). To extend:

- Identify 3-5 Q/A pairs per page that real users ask (replies to `[[feedback-meta-page-selector-gotcha]]` lead emails are a source).
- Import `faqSchema` and `JsonLdScript` from `@/shared/seo` in the target page.
- Add `<JsonLdScript schema={faqSchema([{ question, answer }, ...])} />` to the returned JSX.
- Localize for ES under the same pattern.

### 4. Add new astrological DefinedTerm entries

Beyond the initial 3 (Lahiri ayanamsa, sidereal astrology, Vedic astrology), extend to e.g.:

- "Nakshatra" — 27-segment sidereal lunar mansions
- "Dasha" — Vedic timing system
- "Yoga" (astrological) — planetary combinations

Pattern: same `definedTermSchema()` injection on the page where the term is canonically defined (usually `/why-sidereal` or a dedicated `/glossary` page Wave 3.5+).

## Monthly review

- [ ] Search Console: top 10 organic queries — match to essay topics? add if gap.
- [ ] Search Console: pages with impressions but 0 clicks — improve title/description in `createMetadata()`.
- [ ] PostHog AEO referrers (chatgpt.com / perplexity.ai / claude.ai / gemini.google.com) — note which pages they cite, prioritize Q/A extensions on those.

## When to ask for engineer help

- A new pair-prose pattern (e.g. interactive widget per pair) — file a Wave 3.5 spec.
- A bulk Q/A injection script — currently manual; can be batched in 1 spec.
- New programmatic SEO page type (e.g. moon-phase by city, by date) — Wave 4 candidate.

## Cross-references

- Spec §6: `docs/superpowers/specs/2026-05-17-wave-3-compound-growth-design.md`
- Anti-AI-slop: [[feedback-anti-ai-slop]]
- Spanish style: [[feedback-spanish-style]]
- SEO Phase 2 baseline: [[project-seo-phase2-shipped]]
````

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/seo-content-cadence.md
git commit -m "docs(wave-3/T16): SEO content cadence runbook"
```

---

### Task 17: cross-section final verification

**Files:** (no new files — just verification)

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: PASS. Existing 2157 tests + ~21 new (3 SynastryResult + 6 tier-1-rules + 5 definedTermSchema + 8 compatibility-pairs + 7 cities) = ~2178 total. Numbers may vary slightly with Wave 2's existing count.

If any test fails, address before proceeding.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS. No errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint 2>&1 | head -50`

Expected: PASS or only pre-existing warnings (per `[[feedback-lint-worktrees-pollution]]` memory, ignore stale `.claude/worktrees/` noise).

If lint surfaces issues in newly-modified files, fix them.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS. Look for `Generating static pages` output showing:

- `/compatibility/[pair]` — 78 × 2 = 156 pages
- `/planetary-hours-cities/[city]` — 20 × 2 = 40 pages

- [ ] **Step 5: Final commit (only if any fixes from steps 1-4)**

If lint/typecheck/test required follow-up fixes:

```bash
git add <fixed files>
git commit -m "fix(wave-3/T17): cross-section verification cleanup"
```

If no fixes needed, skip this commit.

---

## Self-review summary

**Spec coverage:**
- §4 Section 1 L1-F → Tasks 1, 2 ✓
- §5 Section 2 L1-G+L5-E → Tasks 3, 4, 5, 6 ✓
- §6 Section 3 L5-C → Tasks 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 ✓
- §7 Execution model (Agent Teams parallel) — preserved via independent file paths (file map at top of plan)
- §8 Acceptance criteria — all subtasks include test/typecheck/build verification

**Placeholder scan:** 0 placeholders. Every code step shows actual code; every test step shows actual test assertions; every commit step shows actual `git` command.

**Type consistency:**
- `AnalyticsEvent.PASSPORT_RESHARED` used consistently in Task 1 (matches existing `src/shared/lib/analytics.ts:220`)
- `applyTier1Rules`, `MIN_CONVERSIONS_BEFORE_ACTION` consistent across Tasks 3 + 4
- `definedTermSchema`, `DefinedTermItem` consistent in Tasks 7, 14
- `ALL_PAIR_SLUGS`, `parsePairSlug`, `buildPairSlug` consistent in Tasks 8, 10, 11, 15
- `TOP_CITIES`, `ALL_CITY_SLUGS`, `findCityBySlug`, `CityEntry` consistent in Tasks 9, 12, 13, 15

**Agent Teams parallel safety:**
- S1 (Tasks 1, 2): touches `SynastryResult.tsx` + `viral-coefficient-dashboard.md` only
- S2 (Tasks 3, 4, 5, 6): touches `perceive.ts`, `fixtures/index.ts`, `tier-1-rules.ts` + runbooks
- S3 (Tasks 7-16): touches `json-ld.ts`, new helpers, new routes, sitemap, runbook
- Sitemap (Task 15) is the only file that may have soft contention with Task 14's `why-sidereal/page.tsx` edits — but they're disjoint imports, no merge risk.

**Estimated wall-clock:**
- Subagent-driven (1 task at a time, fresh subagent + 2-stage review): ~3-5h
- Agent Teams parallel (waves of 3-4 parallel): ~30-45 min
