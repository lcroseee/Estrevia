# Cowork Visibility Layer Apply — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the revised Patch 04 (`outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`) as 3 atomic commits to land `/api/admin/advertising/status`, `/api/admin/advertising/digest`, a shared digest builder + renderers, and a backward-compatible `sendAlert` tier extension.

**Architecture:** Three commits land sequentially (B before C — both edit `telegram-bot.ts`). Each commit follows component-level TDD: write all tests for the component → run, see fail → paste implementation (from patch by line range, or inline diff for small edits) → run, see green → typecheck → broader advertising suite → commit. Default `ADVERTISING_TIER2_VIA_DIGEST=false` means Telegram behavior is unchanged after the refactor; the env flag is flipped later by the founder once the Cowork digest is verified.

**Tech Stack:** Next.js 16 App Router (route handlers), TypeScript 6, Drizzle ORM, Vitest (with `vi.mock()` for module-level mocks), `@vercel/og` (unchanged), `telegram-bot.ts` existing fetch-fn pattern.

**Spec:** `docs/superpowers/specs/2026-05-10-cowork-visibility-apply-design.md`

**Patch (paste source):** `outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app/api/admin/advertising/status/route.ts` | **Create** | GET /status route handler. Bearer auth, 7 include branches, aggregateSpend + aggregateFatigued helpers. |
| `src/app/api/admin/advertising/status/__tests__/route.test.ts` | **Create** | 9 test cases per spec. Uses `vi.mock()` for db / meta / recon mocks. |
| `src/modules/advertising/alerts/digest-builder.ts` | **Create** | Pure `buildDigestData()` — Meta + decisions fetch. |
| `src/modules/advertising/alerts/digest-renderers.ts` | **Create** | Pure `formatTelegram()` + `formatMarkdown()`. |
| `src/modules/advertising/alerts/__tests__/digest-builder.test.ts` | **Create** | 3 test cases for the builder. |
| `src/modules/advertising/alerts/__tests__/digest-renderers.test.ts` | **Create** | 4 test cases for the renderers (regression-anchor on legacy Telegram output). |
| `src/app/api/admin/advertising/digest/route.ts` | **Create** | GET /digest route handler. Same Bearer auth. Calls builder + formatMarkdown. |
| `src/app/api/admin/advertising/digest/__tests__/route.test.ts` | **Create** | 4 test cases (401, 200 daily, 501 weekly, 400 invalid). |
| `src/modules/advertising/alerts/telegram-bot.ts` | **Modify** | Commit B: refactor `sendDailyDigest` to call builder + formatTelegram. Commit C: extend `sendAlert` signature with `opts.tier`. |
| `src/modules/advertising/alerts/__tests__/telegram-bot.test.ts` | **Modify (twice)** | Commit B: add 3 cases for refactored `sendDailyDigest`. Commit C: add 3 cases for `sendAlert` tier behavior. |
| `.env.example` | **Modify (twice)** | Commit A: `ADVERTISING_STATUS_BEARER` line. Commit C: `ADVERTISING_TIER2_VIA_DIGEST` line. |

---

## Pre-conditions (Task 0)

Run these checks once before starting Task 1. Halt if any fail.

- [ ] **Step 0.1: Verify working tree is clean**

Run: `git status --short`
Expected: empty output (no `M`, `??`, or staged changes).

- [ ] **Step 0.2: Verify HEAD includes the patch document**

Run: `git log --oneline -5`
Expected first line includes `1fe4623` (or descendant). If you don't see `dc80a45` in recent history, halt — the patch document may be missing.

- [ ] **Step 0.3: Confirm `outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md` exists**

Run: `ls -la outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`
Expected: file exists, ~30 KB.

- [ ] **Step 0.4: Verify the file the patch will modify still matches the cited line numbers**

Run: `sed -n '112p;163p' src/modules/advertising/alerts/telegram-bot.ts`
Expected:
```
  async sendDailyDigest(report: DailyDigestReport): Promise<TelegramMessage> {
  async sendAlert(severity: AlertSeverity, message: string): Promise<TelegramMessage> {
```
If line numbers have shifted (e.g., the methods are now at different lines), halt — the patch's diff blocks may not apply cleanly. Investigate before continuing.

- [ ] **Step 0.5: Baseline test signal**

Run: `npx vitest run src/modules/advertising scripts/advertising 2>&1 | tail -20`
Expected: All tests pass (current advertising baseline is fully green per `.cowork-meta/phase1-verification-20260510T221911Z/01-summary.md`).

> The full-suite `npm test` has 2 pre-existing P2 failures (`tests/middleware-auth.test.ts`, `tests/baselines/fe-baseline.spec.ts`). We will NOT run full-suite per-task; scope to advertising. Founder runs full-suite separately if desired.

---

## Task 1: Commit A — `/status` read-only endpoint

**Files:**
- Create: `src/app/api/admin/advertising/status/route.ts`
- Create: `src/app/api/admin/advertising/status/__tests__/route.test.ts`
- Modify: `.env.example` (add `ADVERTISING_STATUS_BEARER` line)

### TDD cycle: red → green → commit

- [ ] **Step 1.1: Create the test directory and file**

```bash
mkdir -p src/app/api/admin/advertising/status/__tests__
```

Create `src/app/api/admin/advertising/status/__tests__/route.test.ts` with these exact contents:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Module mocks (hoisted by vitest before imports) ---
const fetchMetaInsightsMock = vi.fn();
const getReconStateMock = vi.fn();
const createMetaAdClientMock = vi.fn(() => ({ /* MetaInsightsApi shape — opaque */ }));

const dbLimitMock = vi.fn();
const dbOrderByMock = vi.fn(() => ({ limit: dbLimitMock }));
const dbWhereMock = vi.fn(() => ({ orderBy: dbOrderByMock }));
const dbFromMock = vi.fn(() => ({ where: dbWhereMock }));
const dbSelectMock = vi.fn(() => ({ from: dbFromMock }));

vi.mock('@/modules/advertising/perceive', () => ({
  fetchMetaInsights: fetchMetaInsightsMock,
}));

vi.mock('@/modules/advertising/perceive/recon-state-store', () => ({
  getReconState: getReconStateMock,
}));

vi.mock('@/modules/advertising/meta-graph-api', () => ({
  createMetaAdClient: createMetaAdClientMock,
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ select: dbSelectMock }),
}));

vi.mock('@/shared/lib/schema', () => ({
  advertisingDecisions: { __tableName: 'advertising_decisions', timestamp: 'timestamp' },
}));

// --- Fixtures ---
function makeAdMetric(overrides: Partial<{
  ad_id: string; impressions: number; clicks: number; spend_usd: number;
  reach: number; frequency: number; days_running: number;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'DISAPPROVED';
}> = {}) {
  return {
    ad_id: 'ad-1',
    adset_id: 'as-1',
    campaign_id: 'c-1',
    date: '2026-05-10',
    impressions: 1000,
    clicks: 50,
    spend_usd: 10,
    ctr: 0.05,
    cpc: 0.2,
    cpm: 10,
    frequency: 1.25,
    reach: 800,
    days_running: 5,
    status: 'ACTIVE' as const,
    ...overrides,
  };
}

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.ADVERTISING_STATUS_BEARER = 'test-bearer';
  fetchMetaInsightsMock.mockResolvedValue([]);
  dbLimitMock.mockResolvedValue([]);
  getReconStateMock.mockResolvedValue({
    suspended: false,
    suspendedAt: null,
    suspendReason: null,
    autoResumeAt: null,
    lastDriftPct: null,
  });
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe('GET /api/admin/advertising/status — auth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('returns 401 when Authorization header is malformed', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status', {
      headers: { Authorization: 'Token test-bearer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when Bearer token does not match', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/advertising/status — shape and includes', () => {
  it('returns 200 with ts + since + spend when include=spend', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=spend', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('ts');
    expect(body).toHaveProperty('since');
    expect(body).toHaveProperty('spend');
    expect(body.spend).toMatchObject({ spend_usd: 0, impressions: 0, ad_count: 0 });
  });

  it('respects include filter — non-requested branches are absent', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=spend', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.decisions).toBeUndefined();
    expect(body.fatigued).toBeUndefined();
    expect(body.reconciler).toBeUndefined();
    expect(body.brand_voice).toBeUndefined();
  });

  it('respects since filter — decisions query is bounded via where()', async () => {
    const sinceIso = '2026-05-01T00:00:00.000Z';
    const { GET } = await import('../route');
    const req = new Request(`http://localhost/api/admin/advertising/status?include=decisions&since=${sinceIso}`, {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    await GET(req);
    expect(dbWhereMock).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/admin/advertising/status — aggregateSpend', () => {
  it('computes weighted ctr / cpc_usd / cpm_usd / frequency_avg + ad_count', async () => {
    fetchMetaInsightsMock.mockResolvedValueOnce([
      makeAdMetric({ ad_id: 'a1', spend_usd: 10, impressions: 1000, clicks: 50, reach: 800, frequency: 2 }),
      makeAdMetric({ ad_id: 'a2', spend_usd: 20, impressions: 2000, clicks: 80, reach: 1500, frequency: 3 }),
    ]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=spend', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.spend.spend_usd).toBe(30);
    expect(body.spend.impressions).toBe(3000);
    expect(body.spend.clicks).toBe(130);
    expect(body.spend.ad_count).toBe(2);
    expect(body.spend.ctr).toBeCloseTo(130 / 3000);
    expect(body.spend.cpc_usd).toBeCloseTo(30 / 130);
    expect(body.spend.cpm_usd).toBeCloseTo((30 / 3000) * 1000);
    // Weighted frequency = (2*1000 + 3*2000) / 3000 = 8000/3000 ≈ 2.667
    expect(body.spend.frequency_avg).toBeCloseTo(8000 / 3000);
  });
});

describe('GET /api/admin/advertising/status — aggregateFatigued', () => {
  it('surfaces only ads with weighted-mean frequency > 2.5 and assigns recommendation buckets', async () => {
    fetchMetaInsightsMock.mockResolvedValueOnce([
      makeAdMetric({ ad_id: 'ad-low',     impressions: 1000, frequency: 2.0 }),
      makeAdMetric({ ad_id: 'ad-monitor', impressions: 1000, frequency: 2.8 }),
      makeAdMetric({ ad_id: 'ad-refresh', impressions: 1000, frequency: 3.2 }),
      makeAdMetric({ ad_id: 'ad-pause',   impressions: 1000, frequency: 4.0 }),
    ]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=fatigued', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.fatigued).toHaveLength(3);
    const byId = Object.fromEntries(body.fatigued.map((f: { ad_id: string }) => [f.ad_id, f]));
    expect(byId['ad-low']).toBeUndefined();
    expect(byId['ad-monitor'].recommendation).toBe('monitor');
    expect(byId['ad-refresh'].recommendation).toBe('refresh_creative');
    expect(byId['ad-pause'].recommendation).toBe('pause_now');
    // Descending frequency order
    expect(body.fatigued.map((f: { ad_id: string }) => f.ad_id)).toEqual(['ad-pause', 'ad-refresh', 'ad-monitor']);
  });
});

describe('GET /api/admin/advertising/status — brand_voice + reconciler branches', () => {
  it('include=brand_voice returns not_implemented stub', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=brand_voice', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.brand_voice).toEqual({
      status: 'not_implemented',
      reason: 'Phase 4 dependency (real ClaudeBrandVoiceClient + new advertising_audits table)',
    });
  });

  it('include=reconciler exposes suspended/suspended_at/last_drift_pct (no last_run)', async () => {
    getReconStateMock.mockResolvedValueOnce({
      suspended: true,
      suspendedAt: new Date('2026-05-09T12:00:00Z'),
      suspendReason: 'drift',
      autoResumeAt: new Date('2026-05-11T12:00:00Z'),
      lastDriftPct: 35,
    });
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=reconciler', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.reconciler).toMatchObject({
      suspended: true,
      suspend_reason: 'drift',
      last_drift_pct: 35,
      status: 'warning', // 25 ≤ 35 < 50
    });
    expect(body.reconciler).not.toHaveProperty('last_run');
  });
});
```

- [ ] **Step 1.2: Run the test file — expect failure**

Run: `npx vitest run src/app/api/admin/advertising/status/__tests__/route.test.ts`

Expected: All test cases fail with `Cannot find module '../route'` or similar (the route file doesn't exist yet). This confirms the test wiring is correct.

- [ ] **Step 1.3: Create the route directory and file from the patch**

```bash
mkdir -p src/app/api/admin/advertising/status
```

Create `src/app/api/admin/advertising/status/route.ts` by copying the entire `ts` code block under §Component 1 of `outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md` (approximately patch lines 78-407, between the ` ```ts ` and closing ` ``` `).

> **What you should see at the top after pasting:**
> ```ts
> /**
>  * GET /api/admin/advertising/status
>  *
>  * Read-only snapshot of advertising agent state for Cowork visibility.
> ```
>
> **What you should see at the bottom:**
> ```ts
>   return NextResponse.json(result, {
>     headers: {
>       'Cache-Control': 'no-store',
>       'X-Robots-Tag': 'noindex',
>     },
>   });
> }
> ```

- [ ] **Step 1.4: Run the test file — expect green**

Run: `npx vitest run src/app/api/admin/advertising/status/__tests__/route.test.ts`

Expected: All 9 test cases pass. Output ends with `Tests  9 passed (9)` or similar.

If any test fails, read the error message. Common causes:
- Drizzle import name drift — verify `gte`, `desc` are imported correctly.
- Mock-path mismatch — verify the mock paths exactly match the route's import paths.
- AdMetric field name mismatch — `cpc` vs `cpc_usd`, etc. (My fixture uses `cpc` / `cpm` to match `AdMetric` at HEAD).

Do NOT proceed until 9/9 green.

- [ ] **Step 1.5: Add `ADVERTISING_STATUS_BEARER` to `.env.example`**

Locate the end of the advertising-related section in `.env.example` (after `ADVERTISING_AGENT_DRY_RUN=true`). Append:

```
# Bearer token for Cowork to read /api/admin/advertising/status + /digest.
# Generate via: openssl rand -hex 32
# Add to Vercel `production` env. Rotate quarterly.
ADVERTISING_STATUS_BEARER=
```

- [ ] **Step 1.6: Run typecheck**

Run: `npm run typecheck`

Expected: Exits 0 with no errors. If errors, fix them in `route.ts` or the test file before continuing — the patch's code was verified at HEAD `81aba89` but real types may have drifted in minor ways.

- [ ] **Step 1.7: Run broader advertising suite**

Run: `npx vitest run src/modules/advertising src/app/api/admin scripts/advertising`

Expected: All tests pass. No regressions in adjacent advertising tests.

- [ ] **Step 1.8: Commit**

```bash
git add src/app/api/admin/advertising/status/route.ts \
        src/app/api/admin/advertising/status/__tests__/route.test.ts \
        .env.example
git commit -m "$(cat <<'EOF'
feat(advertising/cowork): /status read-only endpoint

GET /api/admin/advertising/status — Bearer-auth snapshot of agent state
for Cowork's WebFetch. 7 include branches (spend, decisions, fatigued,
brand_voice, reconciler, account_health, audiences); aggregateSpend +
aggregateFatigued compute weighted-mean ctr / cpc / frequency client-
side because fetchMetaInsights returns per-ad-per-day rows.

brand_voice and audiences return not_implemented stubs pending Phase 4
(ClaudeBrandVoiceClient + audience-row-store read API).

9 unit tests pass: auth (3), shape + includes (3), aggregateSpend math
(1), aggregateFatigued math + buckets (1), brand_voice + reconciler
shapes (1).

Sub-project 2 / Commit A of the cowork-followup brainstorm series
(2026-05-10). Spec:
docs/superpowers/specs/2026-05-10-cowork-visibility-apply-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then: `git push origin main`

---

## Task 2: Commit B — `/digest` endpoint + digest-builder/renderer refactor

**Files:**
- Create: `src/modules/advertising/alerts/digest-builder.ts`
- Create: `src/modules/advertising/alerts/digest-renderers.ts`
- Create: `src/modules/advertising/alerts/__tests__/digest-builder.test.ts`
- Create: `src/modules/advertising/alerts/__tests__/digest-renderers.test.ts`
- Create: `src/app/api/admin/advertising/digest/route.ts`
- Create: `src/app/api/admin/advertising/digest/__tests__/route.test.ts`
- Modify: `src/modules/advertising/alerts/telegram-bot.ts` (refactor `sendDailyDigest`)
- Modify: `src/modules/advertising/alerts/__tests__/telegram-bot.test.ts` (extend with 3 new cases)

### TDD cycle: red → green → commit

- [ ] **Step 2.1: Write `digest-builder.test.ts`**

Create `src/modules/advertising/alerts/__tests__/digest-builder.test.ts` with these exact contents:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMetaInsightsMock = vi.fn();
const createMetaAdClientMock = vi.fn(() => ({}));

const dbLimitMock = vi.fn();
const dbOrderByMock = vi.fn(() => ({ limit: dbLimitMock }));
const dbWhereMock = vi.fn(() => ({ orderBy: dbOrderByMock }));
const dbFromMock = vi.fn(() => ({ where: dbWhereMock }));
const dbSelectMock = vi.fn(() => ({ from: dbFromMock }));

vi.mock('@/modules/advertising/perceive', () => ({
  fetchMetaInsights: fetchMetaInsightsMock,
}));

vi.mock('@/modules/advertising/meta-graph-api', () => ({
  createMetaAdClient: createMetaAdClientMock,
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ select: dbSelectMock }),
}));

vi.mock('@/shared/lib/schema', () => ({
  advertisingDecisions: { __tableName: 'advertising_decisions', timestamp: 'timestamp' },
}));

beforeEach(() => {
  vi.clearAllMocks();
  fetchMetaInsightsMock.mockResolvedValue([]);
  dbLimitMock.mockResolvedValue([]);
});

describe('buildDigestData', () => {
  it('returns spend_total_usd=0 and decisions=[] with date="YYYY-MM-DD" when no data', async () => {
    const { buildDigestData } = await import('../digest-builder');
    const report = await buildDigestData({ date: new Date('2026-05-10T12:00:00Z') });
    expect(report.spend_total_usd).toBe(0);
    expect(report.impressions_total).toBe(0);
    expect(report.decisions).toEqual([]);
    expect(report.date).toBe('2026-05-10');
  });

  it('maps DB rows: adId→ad_id, reasoningTier→reasoning_tier, deltaBudgetUsd→delta_budget_usd', async () => {
    dbLimitMock.mockResolvedValueOnce([
      {
        id: 'd1',
        adId: 'ad-42',
        action: 'pause',
        reason: 'fatigue',
        reasoningTier: 'tier_1_rules',
        confidence: 0.95,
        deltaBudgetUsd: null,
        metricsSnapshot: {},
        timestamp: new Date('2026-05-10T10:00:00Z'),
        applied: true,
        appliedAt: new Date('2026-05-10T10:01:00Z'),
      },
    ]);
    const { buildDigestData } = await import('../digest-builder');
    const report = await buildDigestData({ date: new Date('2026-05-10T12:00:00Z') });
    expect(report.decisions).toHaveLength(1);
    expect(report.decisions[0]).toMatchObject({
      ad_id: 'ad-42',
      action: 'pause',
      reason: 'fatigue',
      reasoning_tier: 'tier_1_rules',
      confidence: 0.95,
    });
    expect(report.decisions[0].delta_budget_usd).toBeUndefined();
  });

  it('aggregates spend and impressions across per-ad-per-day metrics', async () => {
    fetchMetaInsightsMock.mockResolvedValueOnce([
      { ad_id: 'a1', adset_id: 'as-1', campaign_id: 'c-1', date: '2026-05-10', spend_usd: 5,  impressions: 500,  clicks: 25, ctr: 0.05,  cpc: 0.2,  cpm: 10, reach: 400,  frequency: 1.25, days_running: 3, status: 'ACTIVE' },
      { ad_id: 'a2', adset_id: 'as-1', campaign_id: 'c-1', date: '2026-05-10', spend_usd: 15, impressions: 1500, clicks: 50, ctr: 0.033, cpc: 0.3,  cpm: 10, reach: 1100, frequency: 1.36, days_running: 5, status: 'ACTIVE' },
    ]);
    const { buildDigestData } = await import('../digest-builder');
    const report = await buildDigestData({ date: new Date('2026-05-10T12:00:00Z') });
    expect(report.spend_total_usd).toBe(20);
    expect(report.impressions_total).toBe(2000);
  });
});
```

- [ ] **Step 2.2: Write `digest-renderers.test.ts`**

Create `src/modules/advertising/alerts/__tests__/digest-renderers.test.ts` with these exact contents:

```ts
import { describe, it, expect } from 'vitest';
import { formatTelegram, formatMarkdown } from '../digest-renderers';
import type { DailyDigestReport } from '../telegram-bot';

const emptyReport: DailyDigestReport = {
  date: '2026-05-10',
  decisions: [],
  spend_total_usd: 0,
  impressions_total: 0,
};

const reportWithDecisions: DailyDigestReport = {
  date: '2026-05-10',
  decisions: [
    {
      ad_id: 'ad-42',
      action: 'pause',
      reason: 'fatigue',
      reasoning_tier: 'tier_1_rules',
      confidence: 0.95,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metrics_snapshot: {} as any,
    },
    {
      ad_id: 'ad-99',
      action: 'scale_up',
      reason: 'high ROAS',
      reasoning_tier: 'tier_2_bayesian',
      confidence: 0.78,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metrics_snapshot: {} as any,
    },
  ],
  spend_total_usd: 42.5,
  impressions_total: 12345,
};

describe('formatTelegram', () => {
  it('renders empty-decisions report as the legacy byte-anchored string', () => {
    const out = formatTelegram(emptyReport);
    const expected = [
      '📊 *Advertising Daily Digest — 2026-05-10*',
      '',
      '💰 Spend: $0.00 | 👁 Impressions: 0',
      '',
      '_No decisions taken today._',
      '',
    ].join('\n');
    expect(out).toBe(expected);
  });

  it('renders decisions with emoji icons, backtick ad_ids, and bold "Decisions taken" header', () => {
    const out = formatTelegram(reportWithDecisions);
    expect(out).toContain('*Decisions taken:*');
    expect(out).toContain('⏸ `ad-42` — pause (fatigue)');
    expect(out).toContain('📈 `ad-99` — scale_up (high ROAS)');
  });

  it('renders founder_action_required with 🚨 prefix when present, omits section when absent', () => {
    const withAction = formatTelegram({ ...emptyReport, founder_action_required: 'Review approval queue' });
    expect(withAction).toContain('🚨 *Action required:* Review approval queue');
    expect(formatTelegram(emptyReport)).not.toContain('Action required');
  });

  it('renders shadow_log_summary block when present', () => {
    const out = formatTelegram({ ...emptyReport, shadow_log_summary: 'Shadow log: 3 entries' });
    expect(out).toContain('*Shadow mode log:*');
    expect(out).toContain('Shadow log: 3 entries');
  });
});

describe('formatMarkdown', () => {
  it('renders CommonMark heading, ## sections, and **double-asterisk** bold', () => {
    const out = formatMarkdown(reportWithDecisions);
    expect(out).toContain('# Estrevia advertising — daily digest 2026-05-10');
    expect(out).toContain('## Spend');
    expect(out).toContain('## Agent decisions');
    expect(out).toContain('## Action required');
    expect(out).toContain('**pause**');
    expect(out).toContain('**scale_up**');
  });

  it('renders "Action required\\nNone." when founder_action_required absent', () => {
    const out = formatMarkdown(emptyReport);
    expect(out).toContain('## Action required\nNone.');
  });
});
```

- [ ] **Step 2.3: Write `digest/__tests__/route.test.ts`**

```bash
mkdir -p src/app/api/admin/advertising/digest/__tests__
```

Create `src/app/api/admin/advertising/digest/__tests__/route.test.ts` with these exact contents:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const buildDigestDataMock = vi.fn();
const formatMarkdownMock = vi.fn();

vi.mock('@/modules/advertising/alerts/digest-builder', () => ({
  buildDigestData: buildDigestDataMock,
}));

vi.mock('@/modules/advertising/alerts/digest-renderers', () => ({
  formatMarkdown: formatMarkdownMock,
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.ADVERTISING_STATUS_BEARER = 'test-bearer';
  buildDigestDataMock.mockResolvedValue({
    date: '2026-05-10',
    decisions: [],
    spend_total_usd: 0,
    impressions_total: 0,
  });
  formatMarkdownMock.mockReturnValue('# Estrevia advertising — daily digest 2026-05-10\n\n## Spend\n- Today: $0.00');
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe('GET /api/admin/advertising/digest', () => {
  it('returns 401 when Bearer header missing', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/digest');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 + text/markdown for default type=daily when authed', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/digest', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    const body = await res.text();
    expect(body).toContain('# Estrevia advertising — daily digest');
    expect(buildDigestDataMock).toHaveBeenCalledTimes(1);
    expect(formatMarkdownMock).toHaveBeenCalledTimes(1);
  });

  it('returns 501 NOT_IMPLEMENTED when type=weekly', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/digest?type=weekly', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe('NOT_IMPLEMENTED');
    expect(buildDigestDataMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_TYPE when type is unknown', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/digest?type=monthly', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_TYPE');
  });
});
```

- [ ] **Step 2.4: Extend `telegram-bot.test.ts` with sendDailyDigest refactor cases**

Open `src/modules/advertising/alerts/__tests__/telegram-bot.test.ts`. After the existing top-level mock declarations and helpers, find the last `describe(...)` block in the file. Append this new describe block **after** the last existing block:

```ts
// ---------------------------------------------------------------------------
// sendDailyDigest after refactor — uses buildDigestData + formatTelegram
// ---------------------------------------------------------------------------

import { buildDigestData as _buildDigestDataReal } from '../digest-builder';
import { formatTelegram as _formatTelegramReal } from '../digest-renderers';

vi.mock('../digest-builder', () => ({
  buildDigestData: vi.fn(),
}));

vi.mock('../digest-renderers', () => ({
  formatTelegram: vi.fn(),
}));

describe('TelegramBot.sendDailyDigest (refactored)', () => {
  const builderMock = vi.mocked(_buildDigestDataReal);
  const formatMock = vi.mocked(_formatTelegramReal);

  beforeEach(() => {
    builderMock.mockReset();
    formatMock.mockReset();
  });

  it('with no arg, calls buildDigestData() then formatTelegram()', async () => {
    const fakeReport: DailyDigestReport = { date: '2026-05-10', decisions: [], spend_total_usd: 0, impressions_total: 0 };
    builderMock.mockResolvedValueOnce(fakeReport);
    formatMock.mockReturnValueOnce('rendered text');

    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    await bot.sendDailyDigest();

    expect(builderMock).toHaveBeenCalledTimes(1);
    expect(formatMock).toHaveBeenCalledWith(fakeReport);
  });

  it('with explicit report arg, bypasses buildDigestData()', async () => {
    const fakeReport: DailyDigestReport = { date: '2026-05-10', decisions: [], spend_total_usd: 0, impressions_total: 0 };
    formatMock.mockReturnValueOnce('rendered text');

    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    await bot.sendDailyDigest(fakeReport);

    expect(builderMock).not.toHaveBeenCalled();
    expect(formatMock).toHaveBeenCalledWith(fakeReport);
  });

  it('passes formatted text to sendMessage with Markdown parse_mode', async () => {
    formatMock.mockReturnValueOnce('rendered text');
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    await bot.sendDailyDigest({ date: '2026-05-10', decisions: [], spend_total_usd: 0, impressions_total: 0 });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    // The body sent to Telegram includes the parse_mode and the rendered text.
    const lastCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(lastCall[1].body as string);
    expect(body.parse_mode).toBe('Markdown');
    expect(body.text).toBe('rendered text');
  });
});
```

- [ ] **Step 2.5: Run all new + extended tests — expect failure**

Run: `npx vitest run src/modules/advertising/alerts/__tests__/digest-builder.test.ts src/modules/advertising/alerts/__tests__/digest-renderers.test.ts src/app/api/admin/advertising/digest/__tests__/route.test.ts src/modules/advertising/alerts/__tests__/telegram-bot.test.ts`

Expected: digest-builder, digest-renderers, digest/route tests all fail with `Cannot find module '../digest-builder'` etc. telegram-bot.test.ts new cases fail with similar import errors. All failures confirm test wiring is correct.

- [ ] **Step 2.6: Create `digest-builder.ts` from the patch**

Create `src/modules/advertising/alerts/digest-builder.ts` by copying the entire `ts` code block under §2a of the patch document (`outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`, approximately patch lines 434-517, between ` ```ts ` and closing ` ``` `).

> **What you should see at the top after pasting:**
> ```ts
> /**
>  * Daily-digest data builder — pure data fetch, no rendering.
> ```
>
> **What you should see at the bottom:**
> ```ts
>   };
> }
> ```

- [ ] **Step 2.7: Create `digest-renderers.ts` from the patch**

Create `src/modules/advertising/alerts/digest-renderers.ts` by copying the entire `ts` code block under §2b of the patch document (approximately patch lines 523-623).

> **What you should see at the top:**
> ```ts
> /**
>  * Pure renderers — DailyDigestReport → string.
> ```
>
> **What you should see at the bottom:**
> ```ts
>   return lines.join('\n');
> }
> ```

- [ ] **Step 2.8: Create `digest/route.ts` from the patch**

```bash
mkdir -p src/app/api/admin/advertising/digest
```

Create `src/app/api/admin/advertising/digest/route.ts` by copying the entire `ts` code block under §2c of the patch document (approximately patch lines 629-688).

> **What you should see at the top:**
> ```ts
> /**
>  * GET /api/admin/advertising/digest?type=daily
> ```
>
> **What you should see at the bottom:**
> ```ts
>   });
> }
> ```

- [ ] **Step 2.9: Refactor `sendDailyDigest()` in telegram-bot.ts**

Open `src/modules/advertising/alerts/telegram-bot.ts`.

(a) At the top of the file, in the import section (around line 1-10), add two new import lines after the existing imports:

```ts
import { buildDigestData } from './digest-builder';
import { formatTelegram } from './digest-renderers';
```

(b) Replace the existing `sendDailyDigest()` method (currently lines 108-158, the JSDoc + entire method body) with this new implementation:

```ts
  /**
   * Sends a formatted daily digest to the founder.
   *
   * If `report` is omitted, builds it from current state via
   * `buildDigestData()`. Callers that need to attach optional
   * `brand_voice_scores` / `shadow_log_summary` / `founder_action_required`
   * fields should pre-build the report and pass it in.
   *
   * Rendering is delegated to `formatTelegram()` — the same shape is
   * exposed at GET /api/admin/advertising/digest via `formatMarkdown()`,
   * so the Telegram push and the Cowork pull never drift.
   */
  async sendDailyDigest(report?: DailyDigestReport): Promise<TelegramMessage> {
    const data = report ?? (await buildDigestData());
    const text = formatTelegram(data);
    return this.sendMessage(text, { parse_mode: 'Markdown' });
  }
```

- [ ] **Step 2.10: Run all the tests changed in Task 2 — expect green**

Run: `npx vitest run src/modules/advertising/alerts/__tests__/digest-builder.test.ts src/modules/advertising/alerts/__tests__/digest-renderers.test.ts src/app/api/admin/advertising/digest/__tests__/route.test.ts src/modules/advertising/alerts/__tests__/telegram-bot.test.ts`

Expected: All four files pass. ~14 new cases green, all existing telegram-bot tests still green.

If `telegram-bot.test.ts` has failures in pre-existing tests, the refactor broke something — investigate before continuing.

- [ ] **Step 2.11: Run typecheck**

Run: `npm run typecheck`

Expected: Exits 0.

- [ ] **Step 2.12: Run broader advertising suite**

Run: `npx vitest run src/modules/advertising src/app/api/admin scripts/advertising`

Expected: All tests pass.

- [ ] **Step 2.13: Commit**

```bash
git add src/modules/advertising/alerts/digest-builder.ts \
        src/modules/advertising/alerts/digest-renderers.ts \
        src/modules/advertising/alerts/telegram-bot.ts \
        src/modules/advertising/alerts/__tests__/digest-builder.test.ts \
        src/modules/advertising/alerts/__tests__/digest-renderers.test.ts \
        src/modules/advertising/alerts/__tests__/telegram-bot.test.ts \
        src/app/api/admin/advertising/digest/route.ts \
        src/app/api/admin/advertising/digest/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(advertising/cowork): digest endpoint + builder/renderer refactor

Extracts the daily-digest payload from TelegramBot.sendDailyDigest()
into two pure modules:

  - digest-builder.ts: buildDigestData() — Meta + decisions fetch.
  - digest-renderers.ts: formatTelegram() + formatMarkdown() — both
    render the same DailyDigestReport.

GET /api/admin/advertising/digest?type=daily exposes the markdown
output for Cowork's WebFetch. TelegramBot.sendDailyDigest() now
delegates to the same builder + Telegram-flavored renderer, so the
push and pull channels never drift. The legacy inline byte-pattern is
anchored in digest-renderers.test.ts so future renderer edits cannot
silently change Telegram output.

14 new test cases: digest-builder (3), digest-renderers (4),
digest/route (4), telegram-bot sendDailyDigest refactor (3).

Sub-project 2 / Commit B of the cowork-followup brainstorm series
(2026-05-10). Spec:
docs/superpowers/specs/2026-05-10-cowork-visibility-apply-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then: `git push origin main`

---

## Task 3: Commit C — `sendAlert` tier extension

**Files:**
- Modify: `src/modules/advertising/alerts/telegram-bot.ts` (extend `sendAlert` signature)
- Modify: `src/modules/advertising/alerts/__tests__/telegram-bot.test.ts` (3 new cases)
- Modify: `.env.example` (add `ADVERTISING_TIER2_VIA_DIGEST` line)

### TDD cycle: red → green → commit

- [ ] **Step 3.1: Extend `telegram-bot.test.ts` with sendAlert tier cases**

Append this new describe block to `src/modules/advertising/alerts/__tests__/telegram-bot.test.ts` (after the `sendDailyDigest (refactored)` block added in Task 2):

```ts
// ---------------------------------------------------------------------------
// sendAlert tier classification (Patch 04 Component 4)
// ---------------------------------------------------------------------------

describe('TelegramBot.sendAlert tier gating', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('two-arg call defaults to tier 1 and always sends regardless of flag', async () => {
    process.env.ADVERTISING_TIER2_VIA_DIGEST = 'true'; // even with flag on
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    const result = await bot.sendAlert('warning', 'rolling baseline crossed');
    expect(result).not.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('three-arg with tier=2 returns null when ADVERTISING_TIER2_VIA_DIGEST=true', async () => {
    process.env.ADVERTISING_TIER2_VIA_DIGEST = 'true';
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    const result = await bot.sendAlert('info', 'minor drift', { tier: 2 });
    expect(result).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('three-arg with tier=2 sends when ADVERTISING_TIER2_VIA_DIGEST is unset or "false"', async () => {
    delete process.env.ADVERTISING_TIER2_VIA_DIGEST;
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    const result = await bot.sendAlert('info', 'minor drift', { tier: 2 });
    expect(result).not.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    process.env.ADVERTISING_TIER2_VIA_DIGEST = 'false';
    const fetchFn2 = makeFetchFn([sendMessageOk()]);
    const bot2 = makeBot(fetchFn2);
    const result2 = await bot2.sendAlert('info', 'minor drift', { tier: 2 });
    expect(result2).not.toBeNull();
    expect(fetchFn2).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3.2: Run telegram-bot tests — expect failure**

Run: `npx vitest run src/modules/advertising/alerts/__tests__/telegram-bot.test.ts`

Expected: 3 new sendAlert tests fail. Most likely:
- `await bot.sendAlert('info', 'msg', { tier: 2 })` fails with TypeScript error or runtime error because the current signature doesn't accept a third argument.

Other (pre-existing + Task 2) tests still pass.

- [ ] **Step 3.3: Refactor `sendAlert()` in `telegram-bot.ts`**

Open `src/modules/advertising/alerts/telegram-bot.ts`.

Locate the existing `sendAlert()` method (around line 160-171 after Task 2's edits). Replace the entire method including its JSDoc with this new implementation:

```ts
  /**
   * Sends a severity-labelled alert message to the founder.
   *
   * Tier gating (added in Patch 04):
   *   tier 1 (default) — always sends, regardless of env flag.
   *   tier 2           — suppressed when ADVERTISING_TIER2_VIA_DIGEST=true.
   *                      Returns null so callers can handle the no-op case.
   *
   * Default `tier=1` preserves existing behavior for every caller that
   * does not pass the third arg. Migrate call sites incrementally as
   * documented in the Tier 2 table in the Patch 04 spec.
   */
  async sendAlert(
    severity: AlertSeverity,
    message: string,
    opts: { tier?: 1 | 2 } = {},
  ): Promise<TelegramMessage | null> {
    const tier = opts.tier ?? 1;
    if (tier === 2 && process.env.ADVERTISING_TIER2_VIA_DIGEST === 'true') {
      return null;
    }
    const icons: Record<AlertSeverity, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🚨',
    };
    const text = `${icons[severity]} *[${severity.toUpperCase()}]* ${message}`;
    return this.sendMessage(text, { parse_mode: 'Markdown' });
  }
```

- [ ] **Step 3.4: Add `ADVERTISING_TIER2_VIA_DIGEST` to `.env.example`**

Append to `.env.example` immediately after the `ADVERTISING_STATUS_BEARER=` line added in Task 1:

```

# When true, tier-2 alerts (sendAlert(..., { tier: 2 })) are suppressed
# from Telegram and surfaced only via the daily Cowork digest. Default
# false preserves pre-Patch-04 behavior. Flip after Cowork digest verified.
ADVERTISING_TIER2_VIA_DIGEST=false
```

- [ ] **Step 3.5: Run telegram-bot tests — expect green**

Run: `npx vitest run src/modules/advertising/alerts/__tests__/telegram-bot.test.ts`

Expected: All tests pass — pre-existing + Task 2 sendDailyDigest + Task 3 sendAlert tier cases.

- [ ] **Step 3.6: Run typecheck**

Run: `npm run typecheck`

Expected: Exits 0. If errors, the most likely cause is an existing call site that destructures the `sendAlert` result and now fails on `TelegramMessage | null`. Investigate with:

```bash
grep -rn '\.sendAlert(' src/ --include='*.ts'
```

Most callers ignore the return value. If a caller chains off the result, update it to handle `null`.

- [ ] **Step 3.7: Run broader advertising suite**

Run: `npx vitest run src/modules/advertising src/app/api/admin scripts/advertising`

Expected: All tests pass.

- [ ] **Step 3.8: Commit**

```bash
git add src/modules/advertising/alerts/telegram-bot.ts \
        src/modules/advertising/alerts/__tests__/telegram-bot.test.ts \
        .env.example
git commit -m "$(cat <<'EOF'
feat(advertising/cowork): sendAlert tier extension

Backward-compatible signature change:

  sendAlert(severity, message)              → unchanged behavior (tier 1)
  sendAlert(severity, message, { tier: 1 }) → unchanged behavior
  sendAlert(severity, message, { tier: 2 }) → suppressed when
                                              ADVERTISING_TIER2_VIA_DIGEST=true,
                                              returns null

Default tier=1 preserves every existing caller's behavior. Return
type changes from TelegramMessage → TelegramMessage | null; callers
that ignored the return value are unaffected (all such verified via
grep). 3 new test cases cover the matrix.

ADVERTISING_TIER2_VIA_DIGEST defaults to false. After 1-2 weeks of
Cowork digest verification, founder marks tier-2 call sites with
{ tier: 2 } and flips the env flag — both are operational steps,
not part of this commit.

Sub-project 2 / Commit C of the cowork-followup brainstorm series
(2026-05-10). Spec:
docs/superpowers/specs/2026-05-10-cowork-visibility-apply-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then: `git push origin main`

---

## Halt criteria (reference)

Halt the plan and write a checkpoint to `.cowork-meta/cowork-visibility-apply-<TIMESTAMP>/` if:

- **Pre-flight Step 0.4 fails** — line numbers in `telegram-bot.ts` no longer match patch citations. The patch's diff blocks won't apply cleanly. Investigate via `git log -p src/modules/advertising/alerts/telegram-bot.ts` for recent changes.
- **Schema column drift** — `advertisingDecisions.timestamp` / `.adId` / `.reasoningTier` renamed. Tests will fail at the DB layer.
- **Test mock wiring fails** — `vi.mock()` cannot resolve a target module path (e.g., `@/modules/advertising/perceive`). Verify the module exists at the cited path.
- **Type error in patch's pasted code** — TypeScript flags an issue. Read the message; if it's a true type bug in the patch, fix inline and note in commit body. If it's a project-config issue, do NOT proceed.
- **Pre-existing tests fail unexpectedly** — for example, `telegram-bot.test.ts` had 5/5 green at baseline but only 4/5 after the refactor. The refactor broke something. Revert local changes, investigate, repeat.
- **`grep -rn '\.sendAlert(' src/`** reveals a caller that destructures the return value into a non-nullable variable. Update the caller in the same commit (Task 3 Step 3.6) before committing.

In every halt case: write the checkpoint and do NOT push commits without founder review.

---

## Operational follow-ups (NOT part of this plan)

After all 3 commits land:

1. **Founder generates the Bearer token**: `openssl rand -hex 32` → Vercel `production` env (`ADVERTISING_STATUS_BEARER`).
2. **Founder mirrors the token to Cowork** (CLAUDE.md or scheduled-task memory).
3. **Founder smoke-tests** both endpoints via `curl` from a workstation.
4. **(Later)** Mark existing tier-2 call sites with `{ tier: 2 }`. Separate apply-session.
5. **(Later)** Flip `ADVERTISING_TIER2_VIA_DIGEST=true` in Vercel production env. One-line change.
6. **(Later)** Configure Cowork scheduled task to fetch `/digest` at 9:00 daily.

All six are explicit founder/operational tasks documented in the spec §"Operational follow-ups (out of scope for this apply session)".

---

## Self-review

**1. Spec coverage**

| Spec section | Plan task |
|---|---|
| Goal | Plan goal mirrors spec goal. ✅ |
| Architecture diagram | Files in File Structure section + Component-level TDD discipline. ✅ |
| Components table | Tasks 1-3 cover all 7 patch components. ✅ |
| Commit sequence (3 commits, B before C) | Tasks 1-3 are strictly sequential. Pre-flight Step 0.4 verifies line numbers before Tasks 2+3. ✅ |
| TDD strategy (component-level red→green) | Each Task has Steps "write tests → see fail → paste impl → see green". ✅ |
| Auth pattern (same Bearer for /status + /digest) | Steps 1.1 and 2.3 use identical Bearer auth in test fixtures. ✅ |
| Mock strategy (vi.mock pattern, makeFetchFn for telegram-bot) | Test code follows established patterns from existing tests. ✅ |
| Type-import structure (DailyDigestReport stays in telegram-bot) | Patch code (referenced in Steps 2.6, 2.7) uses `import type` — no plan deviation. ✅ |
| Test cases per component (~26 total: 9+14+3) | Steps 1.1, 2.1-2.4, 3.1 contain the full test code matching the counts. ✅ |
| Pre-conditions | Task 0 has 5 pre-flight checks. ✅ |
| Halt criteria | Dedicated section at end. ✅ |

**2. Placeholder scan**

- No "TBD", "TODO", "implement later" anywhere.
- No "Add appropriate X" — every step has a concrete command or code block.
- No "Similar to Task N" — Tasks 1, 2, 3 each spell out their full code (test code inlined; implementation code referenced by exact patch line range).
- "Write tests for the above" — none. Each test step contains the full test file body.

Implementation code is referenced by patch file + line range. This is intentional, not a placeholder: the patch is a single canonical source committed in the repo at `outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`. Inlining ~600 lines of duplicate code in the plan would create a drift risk. The reference is concrete and reproducible. The smaller telegram-bot.ts edits (Steps 2.9, 3.3) ARE inlined because they're small enough to not warrant the reference indirection.

**3. Type consistency**

- `DailyDigestReport` — used in Tasks 2.2 (digest-renderers test), 2.4 (telegram-bot test extension), 3 (sendDailyDigest signature). Imported from `'./telegram-bot'` everywhere except inside `telegram-bot.ts` itself. ✅
- `AdDecision.reasoning_tier` value `'tier_1_rules'` — matches `DecisionTier` at `src/shared/types/advertising/decide.ts:9` (verified). ✅
- `AdMetric` field names `cpc`, `cpm` (not `cpc_usd`, `cpm_usd`) — matches `src/shared/types/advertising/perceive.ts:1-16` (verified). Test fixtures use the correct field names. ✅
- `sendAlert(..., opts?: { tier?: 1 | 2 })` — same shape in Steps 3.1 (test) and 3.3 (impl). Return type `TelegramMessage | null` consistent. ✅
- `formatTelegram(report)` / `formatMarkdown(report)` / `buildDigestData(opts?)` — function names and signatures used consistently across Steps 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, 2.9. ✅

**4. Atomicity check**

- Task 1 stages: route + test + .env. One commit. ✅
- Task 2 stages: 3 new modules + 3 new test files + telegram-bot refactor + telegram-bot test extension. One commit. ✅
- Task 3 stages: telegram-bot edit + telegram-bot test extension + .env. One commit. ✅
- Task 2 and Task 3 both edit `telegram-bot.ts` and `telegram-bot.test.ts` — Task 3 starts AFTER Task 2 commits, so no merge conflict. ✅

**5. Reversibility**

- Each commit can be reverted independently via `git revert`. Task 1 (status route) is purely additive — clean revert. Task 2 (digest refactor) requires reverting the `sendDailyDigest` body too, but the revert produces the pre-Patch-04 state. Task 3 (sendAlert tier) is a single-method change — clean revert.
- `.env.example` additions are also append-only; reverting removes the lines cleanly.
