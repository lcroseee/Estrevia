# Brand Voice Scorer (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire real Anthropic-API-backed brand-voice scoring end-to-end: a Claude client (mirroring `ClaudeSafetyClient`), a `advertising_brand_voice_scores` Drizzle table + helpers, and integration into the weekly retro cron + the `/status?include=brand_voice` reader.

**Architecture:** Three atomic commits, in order — Components A (client) and B (storage) are independent and can land in either order; Component C wires both into existing orchestration paths and depends on Sub-project 2 Commit A having shipped (because it modifies the `/status` route created there). Default-off env gate (`BRAND_VOICE_SCORER_ENABLED=false`) means no Claude API calls or DB writes happen until the founder flips the flag — every diff is safe to ship cold.

**Tech Stack:** TypeScript 6, Anthropic REST API (`claude-haiku-4-5`, raw `fetch` no SDK), Drizzle ORM + Neon Postgres, `nanoid` for IDs, Vitest with `vi.mock()` for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-10-brand-voice-scorer-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/modules/advertising/creative-gen/clients/claude-brand-voice-client.ts` | **Create** | `ClaudeBrandVoiceClient` class. Mirror `ClaudeSafetyClient` pattern. ~120 lines. |
| `src/modules/advertising/creative-gen/clients/__tests__/claude-brand-voice-client.test.ts` | **Create** | 7 unit tests (system prompt, model/max_tokens, happy path, HTTP error, malformed JSON, missing fields, network throw, clamping). |
| `src/modules/advertising/creative-gen/clients/index.ts` | **Modify** | Add `ClaudeBrandVoiceClient` + `ClaudeBrandVoiceClientDeps` to barrel export. |
| `src/shared/lib/schema.ts` | **Modify** | Add `advertisingBrandVoiceScores` pgTable definition. |
| `drizzle/<NNNN>_<name>.sql` | **Create (via `db:generate`)** | Auto-generated migration for the new table. |
| `src/modules/advertising/decide/brand-voice-store.ts` | **Create** | `saveBrandVoiceScores()` + `getLatestBrandVoiceRun()` helpers. ~80 lines. |
| `src/modules/advertising/decide/__tests__/brand-voice-store.test.ts` | **Create** | 5 unit tests (empty save, batch save with shared run_id, getLatest null, getLatest returns latest run, snake_case mapping). |
| `src/app/api/cron/advertising/retro-weekly/route.ts` | **Modify** | Replace `buildClaudeForBrandVoice()` mock body, wrap audit call with env-gate, call `saveBrandVoiceScores()`, export `buildClaudeForBrandVoice` for testability. |
| `src/app/api/admin/advertising/status/route.ts` | **Modify** | Replace `not_implemented` stub for `include.brand_voice` with `getLatestBrandVoiceRun()` query. |
| `src/app/api/admin/advertising/status/__tests__/route.test.ts` | **Modify** | Add 3 brand_voice cases (no_data disabled, no_data enabled-but-empty, ok with scores). |
| `src/app/api/cron/advertising/__tests__/retro-weekly-brand-voice.test.ts` | **Create** | 3 unit tests for `buildClaudeForBrandVoice` (disabled → null, enabled + key → instance, enabled + no key → throws). |
| `.env.example` | **Modify** | Add `BRAND_VOICE_SCORER_ENABLED=false`. |

---

## Pre-conditions (Task 0)

- [ ] **Step 0.1: Verify working tree is clean**

Run: `git status --short`
Expected: empty output. If not empty, stash or commit first.

- [ ] **Step 0.2: Verify Sub-project 2 Commit A has landed (`/status` route exists with brand_voice stub)**

Run:
```bash
test -f src/app/api/admin/advertising/status/route.ts && \
  grep -n "not_implemented" src/app/api/admin/advertising/status/route.ts
```
Expected: file exists AND grep finds a `'not_implemented'` reference (the Patch 04 stub). If not, **HALT** — Sub-project 2's Task 1 (Commit A) must be merged first.

- [ ] **Step 0.3: Verify `BrandVoiceScore` interface and `computeWeightedOverall` are stable**

Run:
```bash
grep -A 8 "export interface BrandVoiceScore" src/shared/types/advertising/decide.ts && \
  grep -A 3 "export function computeWeightedOverall" src/modules/advertising/decide/brand-voice-audit.ts
```
Expected: `BrandVoiceScore` has `ad_id`, `depth`, `scientific`, `respectful`, `no_manipulation`, `overall`, `needs_review`, `reviewed_by_claude_at`. `computeWeightedOverall` signature is `(depth: number, scientific: number, respectful: number, no_manipulation: boolean): number`. If these have drifted, halt and update spec/plan.

- [ ] **Step 0.4: Confirm `ANTHROPIC_API_KEY` is already in `.env.example`**

Run: `grep -n "ANTHROPIC_API_KEY" .env.example`
Expected: line 53 (or thereabouts) shows `ANTHROPIC_API_KEY=`.

- [ ] **Step 0.5: Confirm `nanoid` is already a dependency**

Run: `grep '"nanoid"' package.json`
Expected: a line like `"nanoid": "^5.x"`.

- [ ] **Step 0.6: Baseline advertising test signal**

Run: `npx vitest run src/modules/advertising src/app/api/admin scripts/advertising 2>&1 | tail -10`
Expected: all tests pass (this is the green baseline we'll preserve through Tasks 1-3).

---

## Task 1: Commit A — `ClaudeBrandVoiceClient`

**Files:**
- Create: `src/modules/advertising/creative-gen/clients/claude-brand-voice-client.ts`
- Create: `src/modules/advertising/creative-gen/clients/__tests__/claude-brand-voice-client.test.ts`
- Modify: `src/modules/advertising/creative-gen/clients/index.ts`

- [ ] **Step 1.1: Write the test file**

Create `src/modules/advertising/creative-gen/clients/__tests__/claude-brand-voice-client.test.ts` with these exact contents:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ClaudeBrandVoiceClient } from '../claude-brand-voice-client';

function mockResponse(
  payload: Partial<{ depth: number; scientific: number; respectful: number; no_manipulation: boolean }>,
  status = 200,
): Response {
  return {
    status,
    json: async () => ({ content: [{ text: JSON.stringify(payload) }] }),
  } as unknown as Response;
}

describe('ClaudeBrandVoiceClient', () => {
  it('POSTs to Anthropic /v1/messages with model, max_tokens, and brand-rule system prompt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse({ depth: 8, scientific: 7, respectful: 9, no_manipulation: true }),
    );
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    await client.brandVoiceScore('ad-1', 'sidereal precision copy');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.max_tokens).toBe(150);
    expect(body.system).toMatch(/cosmic dance/);
    expect(body.system).toMatch(/sidereal/);
    expect(body.system).toMatch(/no_manipulation/);
    expect(body.system).toMatch(/JSON only/);
    expect(body.messages[0].content).toMatch(/ad-1/);
    expect(body.messages[0].content).toMatch(/sidereal precision copy/);
  });

  it('parses valid JSON response and computes overall via weighted formula', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse({ depth: 8, scientific: 7, respectful: 9, no_manipulation: true }),
    );
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');

    expect(result.depth).toBe(8);
    expect(result.scientific).toBe(7);
    expect(result.respectful).toBe(9);
    expect(result.no_manipulation).toBe(true);
    // overall = 8*0.3 + 7*0.3 + 9*0.3 + 1 = 8.2
    expect(result.overall).toBeCloseTo(8.2);
  });

  it('returns fail-shut zeros on HTTP 500', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse({}, 500));
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');
    expect(result).toEqual({
      depth: 0, scientific: 0, respectful: 0, no_manipulation: false, overall: 0,
    });
  });

  it('returns fail-shut zeros when response text is not JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ content: [{ text: 'totally not json at all' }] }),
    } as unknown as Response);
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');
    expect(result.overall).toBe(0);
    expect(result.no_manipulation).toBe(false);
  });

  it('returns fail-shut zeros when required fields are missing', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ content: [{ text: JSON.stringify({ depth: 8, scientific: 7 }) }] }),
    } as unknown as Response);
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');
    expect(result.depth).toBe(0);
    expect(result.no_manipulation).toBe(false);
  });

  it('returns fail-shut zeros when fetch throws (network error)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');
    expect(result).toEqual({
      depth: 0, scientific: 0, respectful: 0, no_manipulation: false, overall: 0,
    });
  });

  it('clamps out-of-range scores to [0, 10]', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse({ depth: 15, scientific: -2, respectful: 10, no_manipulation: true }),
    );
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');
    expect(result.depth).toBe(10);
    expect(result.scientific).toBe(0);
    expect(result.respectful).toBe(10);
    expect(result.no_manipulation).toBe(true);
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/claude-brand-voice-client.test.ts`

Expected: All 7 tests fail with `Cannot find module '../claude-brand-voice-client'`. Wiring confirmed.

- [ ] **Step 1.3: Create the client implementation**

Create `src/modules/advertising/creative-gen/clients/claude-brand-voice-client.ts` with these exact contents:

```ts
import type { ClaudeClientForBrandVoice } from '@/modules/advertising/decide/brand-voice-audit';
import { computeWeightedOverall } from '@/modules/advertising/decide/brand-voice-audit';

const SYSTEM_PROMPT = `You are auditing Estrevia advertising copy for Brand Guidelines adherence.

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

Do NOT include "overall" — it is computed by the caller.`;

export interface ClaudeBrandVoiceClientDeps {
  anthropicApiKey: string;
  fetch?: typeof fetch;
}

interface BrandVoiceScoreResult {
  depth: number;
  scientific: number;
  respectful: number;
  no_manipulation: boolean;
  overall: number;
}

function failShut(): BrandVoiceScoreResult {
  return { depth: 0, scientific: 0, respectful: 0, no_manipulation: false, overall: 0 };
}

export class ClaudeBrandVoiceClient implements ClaudeClientForBrandVoice {
  private readonly fetch: typeof fetch;

  constructor(private readonly deps: ClaudeBrandVoiceClientDeps) {
    this.fetch = deps.fetch ?? globalThis.fetch;
  }

  async brandVoiceScore(adId: string, copy: string): Promise<BrandVoiceScoreResult> {
    try {
      const response = await this.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.deps.anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 150,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Ad ${adId} copy:\n\n${copy}` }],
        }),
      });

      if (response.status < 200 || response.status >= 300) {
        return failShut();
      }

      const data = (await response.json()) as { content?: Array<{ text?: string }> };
      const text = data.content?.[0]?.text ?? '';
      const match = text.match(/\{[^{}]*"depth"[^{}]*\}/);
      if (!match) return failShut();

      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      if (
        typeof parsed.depth !== 'number' ||
        typeof parsed.scientific !== 'number' ||
        typeof parsed.respectful !== 'number' ||
        typeof parsed.no_manipulation !== 'boolean'
      ) {
        return failShut();
      }

      const depth = Math.max(0, Math.min(10, parsed.depth));
      const scientific = Math.max(0, Math.min(10, parsed.scientific));
      const respectful = Math.max(0, Math.min(10, parsed.respectful));
      const no_manipulation = parsed.no_manipulation;
      const overall = computeWeightedOverall(depth, scientific, respectful, no_manipulation);
      return { depth, scientific, respectful, no_manipulation, overall };
    } catch {
      return failShut();
    }
  }
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/claude-brand-voice-client.test.ts`

Expected: All 7 tests pass.

- [ ] **Step 1.5: Extend the barrel export**

Replace the contents of `src/modules/advertising/creative-gen/clients/index.ts` with:

```ts
export { GeminiApiClient } from './gemini-api-client';
export type {
  GeminiApiClientDeps,
  GeminiImageOpts,
  GeminiImageResult,
  GeminiVideoOpts,
  GeminiVideoResult,
} from './gemini-api-client';

export { ClaudeSafetyClient } from './claude-safety-client';
export type { ClaudeSafetyClientDeps, ModerationResult } from './claude-safety-client';

export { ClaudeBrandVoiceClient } from './claude-brand-voice-client';
export type { ClaudeBrandVoiceClientDeps } from './claude-brand-voice-client';
```

- [ ] **Step 1.6: Run typecheck**

Run: `npm run typecheck`
Expected: Exits 0.

- [ ] **Step 1.7: Run broader advertising suite**

Run: `npx vitest run src/modules/advertising src/app/api/admin scripts/advertising`
Expected: All tests pass.

- [ ] **Step 1.8: Commit**

```bash
git add src/modules/advertising/creative-gen/clients/claude-brand-voice-client.ts \
        src/modules/advertising/creative-gen/clients/__tests__/claude-brand-voice-client.test.ts \
        src/modules/advertising/creative-gen/clients/index.ts
git commit -m "$(cat <<'EOF'
feat(advertising/clients): real ClaudeBrandVoiceClient

Mirrors ClaudeSafetyClient pattern — raw fetch to
api.anthropic.com/v1/messages, model claude-haiku-4-5, JSON-only
system prompt with Estrevia brand rules ("cosmic dance" is bad,
sidereal precision is good). Fail-shut on any error (HTTP non-2xx,
malformed JSON, missing fields, network throw, out-of-range scores
clamped to [0,10]).

The client computes `overall` via computeWeightedOverall from
brand-voice-audit.ts so callers can trust the returned shape.
Failure mode returns all-zero scores, which auditTopCreatives turns
into needs_review=true via existing thresholds.

7 unit tests cover system prompt content, request shape, happy
path math, all four failure modes, and clamping.

Sub-project 3 / Commit A of the cowork-followup brainstorm series
(2026-05-10). Spec:
docs/superpowers/specs/2026-05-10-brand-voice-scorer-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then: `git push origin main`

---

## Task 2: Commit B — `advertising_brand_voice_scores` table + helpers

**Files:**
- Modify: `src/shared/lib/schema.ts` (add table)
- Create: `drizzle/<NNNN>_<name>.sql` (auto-generated)
- Create: `src/modules/advertising/decide/brand-voice-store.ts`
- Create: `src/modules/advertising/decide/__tests__/brand-voice-store.test.ts`

- [ ] **Step 2.1: Write the store test file**

Create `src/modules/advertising/decide/__tests__/brand-voice-store.test.ts` with these exact contents:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Module mocks ---
const valuesMock = vi.fn().mockResolvedValue(undefined);
const insertMock = vi.fn(() => ({ values: valuesMock }));

const limitMock = vi.fn();
const orderByMock = vi.fn(() => ({ limit: limitMock }));
const whereMock = vi.fn();

let selectCallCount = 0;
const selectMock = vi.fn(() => {
  selectCallCount++;
  if (selectCallCount % 2 === 1) {
    // Odd calls = "find latest" path (select → from → orderBy → limit)
    return { from: () => ({ orderBy: orderByMock }) };
  }
  // Even calls = "fetch by run_id" path (select → from → where)
  return { from: () => ({ where: whereMock }) };
});

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ insert: insertMock, select: selectMock }),
}));

vi.mock('@/shared/lib/schema', () => ({
  advertisingBrandVoiceScores: {
    __tableName: 'advertising_brand_voice_scores',
    runId: { name: 'run_id' },
    reviewedByClaudeAt: { name: 'reviewed_by_claude_at' },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
});

describe('saveBrandVoiceScores', () => {
  it('returns saved_count=0 with a fresh run_id and no insert call when input is empty', async () => {
    const { saveBrandVoiceScores } = await import('../brand-voice-store');
    const result = await saveBrandVoiceScores([]);
    expect(result.run_id).toBeTruthy();
    expect(result.run_id.length).toBeGreaterThan(0);
    expect(result.saved_count).toBe(0);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('inserts all rows under a single shared run_id', async () => {
    const { saveBrandVoiceScores } = await import('../brand-voice-store');
    const scores = [
      { ad_id: 'a1', depth: 8, scientific: 7, respectful: 9, no_manipulation: true,  overall: 8.2, needs_review: false, reviewed_by_claude_at: new Date('2026-05-10T10:00:00Z') },
      { ad_id: 'a2', depth: 5, scientific: 6, respectful: 7, no_manipulation: false, overall: 5.4, needs_review: true,  reviewed_by_claude_at: new Date('2026-05-10T10:00:00Z') },
    ];
    const result = await saveBrandVoiceScores(scores);

    expect(result.saved_count).toBe(2);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const insertedRows = valuesMock.mock.calls[0][0] as Array<{ runId: string; adId: string; depth: number }>;
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0].runId).toBe(result.run_id);
    expect(insertedRows[1].runId).toBe(result.run_id);
    expect(insertedRows[0].adId).toBe('a1');
    expect(insertedRows[1].adId).toBe('a2');
    expect(insertedRows[0].depth).toBe(8);
  });
});

describe('getLatestBrandVoiceRun', () => {
  it('returns null when the table has no rows', async () => {
    limitMock.mockResolvedValueOnce([]);
    const { getLatestBrandVoiceRun } = await import('../brand-voice-store');
    const result = await getLatestBrandVoiceRun();
    expect(result).toBeNull();
  });

  it('returns the run grouped by the latest run_id', async () => {
    limitMock.mockResolvedValueOnce([
      { runId: 'run-latest', reviewedAt: new Date('2026-05-10T10:00:00Z') },
    ]);
    whereMock.mockResolvedValueOnce([
      { id: 'r1', runId: 'run-latest', adId: 'a1', depth: 8, scientific: 7, respectful: 9, noManipulation: true,  overall: 8.2, needsReview: false, reviewedByClaudeAt: new Date('2026-05-10T10:00:00Z'), createdAt: new Date() },
      { id: 'r2', runId: 'run-latest', adId: 'a2', depth: 5, scientific: 6, respectful: 7, noManipulation: false, overall: 5.4, needsReview: true,  reviewedByClaudeAt: new Date('2026-05-10T10:00:00Z'), createdAt: new Date() },
    ]);

    const { getLatestBrandVoiceRun } = await import('../brand-voice-store');
    const result = await getLatestBrandVoiceRun();

    expect(result).not.toBeNull();
    expect(result!.run_id).toBe('run-latest');
    expect(result!.scores).toHaveLength(2);
    expect(result!.scores[0].ad_id).toBe('a1');
    expect(result!.scores[1].ad_id).toBe('a2');
  });

  it('maps DB camelCase columns to snake_case BrandVoiceScore fields', async () => {
    limitMock.mockResolvedValueOnce([
      { runId: 'run-1', reviewedAt: new Date('2026-05-10T10:00:00Z') },
    ]);
    whereMock.mockResolvedValueOnce([
      { id: 'r1', runId: 'run-1', adId: 'a1', depth: 8, scientific: 7, respectful: 9, noManipulation: true, overall: 8.2, needsReview: false, reviewedByClaudeAt: new Date('2026-05-10T10:00:00Z'), createdAt: new Date() },
    ]);

    const { getLatestBrandVoiceRun } = await import('../brand-voice-store');
    const result = await getLatestBrandVoiceRun();
    expect(result!.scores[0]).toMatchObject({
      ad_id: 'a1',
      no_manipulation: true,
      needs_review: false,
      reviewed_by_claude_at: new Date('2026-05-10T10:00:00Z'),
    });
  });
});
```

- [ ] **Step 2.2: Run the store tests to verify they fail**

Run: `npx vitest run src/modules/advertising/decide/__tests__/brand-voice-store.test.ts`

Expected: All 5 tests fail with `Cannot find module '../brand-voice-store'`. Wiring confirmed.

- [ ] **Step 2.3: Add the Drizzle table to `schema.ts`**

Open `src/shared/lib/schema.ts`. Find the `advertisingDecisions` table block (around lines 188-211 at HEAD). Append, IMMEDIATELY AFTER the `advertisingDecisions` closing `]);` (and before the next section header `// --- advertising_creatives` or whatever comes next):

```ts

// ---------------------------------------------------------------------------
// advertising_brand_voice_scores  — weekly Claude audit results, append-only.
// Rows from one audit run share a run_id. /status?include=brand_voice reads
// the most recent run by reviewedByClaudeAt.
// ---------------------------------------------------------------------------
export const advertisingBrandVoiceScores = pgTable('advertising_brand_voice_scores', {
  id: text('id').primaryKey(), // nanoid
  runId: text('run_id').notNull(),
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

> **Verify the imports already present at the top of `schema.ts`** include `pgTable`, `text`, `real`, `boolean`, `timestamp`, `index`. These are all already used by `advertisingDecisions`, so no new imports needed.

- [ ] **Step 2.4: Generate the Drizzle migration**

Run: `npm run db:generate`

Expected: A new file appears under `drizzle/` named `<NNNN>_<auto-name>.sql` (e.g., `0010_<adjective>_<noun>.sql`). It should contain `CREATE TABLE "advertising_brand_voice_scores"` plus two `CREATE INDEX` statements for the run_id and reviewed_at indexes.

Inspect the generated SQL:

```bash
ls -lt drizzle/ | head -3
cat drizzle/<NNNN>_<name>.sql  # replace with the actual filename
```

Expected: ONLY the new table + indexes. If the migration includes unexpected schema changes (renames, drops, additions elsewhere), **HALT** — there's drift between `schema.ts` and the production schema that needs investigation before committing.

- [ ] **Step 2.5: Write the store helper**

Create `src/modules/advertising/decide/brand-voice-store.ts` with these exact contents:

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
 * Persists a batch of BrandVoiceScore[] as one audit run. All rows share a
 * single run_id so the reader can group them. Empty input is a no-op
 * (no INSERT performed; run_id is still generated for caller logging).
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

- [ ] **Step 2.6: Run the store tests to verify they pass**

Run: `npx vitest run src/modules/advertising/decide/__tests__/brand-voice-store.test.ts`

Expected: All 5 tests pass.

- [ ] **Step 2.7: Run typecheck**

Run: `npm run typecheck`
Expected: Exits 0. If errors mention `advertisingBrandVoiceScores` not found in `@/shared/lib/schema`, double-check Step 2.3 inserted the new table correctly.

- [ ] **Step 2.8: Run broader advertising suite**

Run: `npx vitest run src/modules/advertising src/app/api/admin scripts/advertising`
Expected: All tests pass.

- [ ] **Step 2.9: Commit**

```bash
git add src/shared/lib/schema.ts \
        drizzle/ \
        src/modules/advertising/decide/brand-voice-store.ts \
        src/modules/advertising/decide/__tests__/brand-voice-store.test.ts
git commit -m "$(cat <<'EOF'
feat(advertising/storage): advertising_brand_voice_scores table + helpers

New append-only table for weekly Claude brand-voice audit results.
All rows from one audit run share a run_id so getLatestBrandVoiceRun()
can group them in a single read. Two indexes (run_id, reviewed_at)
support the read pattern.

saveBrandVoiceScores(scores[]):
  - empty input → no INSERT, returns fresh run_id for logging
  - non-empty → inserts all rows under one nanoid run_id

getLatestBrandVoiceRun():
  - empty DB → null
  - else → { run_id, reviewed_at, scores: BrandVoiceScore[] }
  - maps DB camelCase columns to BrandVoiceScore snake_case fields

5 unit tests cover both happy paths, empty edges, and column mapping.

Migration file in drizzle/ is the auto-generated CREATE TABLE +
indexes. Founder applies via npm run db:migrate post-deploy.

Sub-project 3 / Commit B of the cowork-followup brainstorm series
(2026-05-10). Spec:
docs/superpowers/specs/2026-05-10-brand-voice-scorer-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then: `git push origin main`

---

## Task 3: Commit C — Wire-up + `/status` reader

**Files:**
- Modify: `src/app/api/cron/advertising/retro-weekly/route.ts` (replace mock; export builder for testability; gate via env; call saveBrandVoiceScores)
- Modify: `src/app/api/admin/advertising/status/route.ts` (replace not_implemented stub for `include.brand_voice`)
- Modify: `src/app/api/admin/advertising/status/__tests__/route.test.ts` (add 3 brand_voice cases)
- Create: `src/app/api/cron/advertising/__tests__/retro-weekly-brand-voice.test.ts`
- Modify: `.env.example` (add `BRAND_VOICE_SCORER_ENABLED=false`)

- [ ] **Step 3.1: Write the retro-weekly builder test file**

Create `src/app/api/cron/advertising/__tests__/retro-weekly-brand-voice.test.ts` with these exact contents:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.BRAND_VOICE_SCORER_ENABLED;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('buildClaudeForBrandVoice (env-gated)', () => {
  it('returns null when BRAND_VOICE_SCORER_ENABLED is unset', async () => {
    const { buildClaudeForBrandVoice } = await import('../retro-weekly/route');
    const result = buildClaudeForBrandVoice();
    expect(result).toBeNull();
  });

  it('returns null when BRAND_VOICE_SCORER_ENABLED is "false"', async () => {
    process.env.BRAND_VOICE_SCORER_ENABLED = 'false';
    const { buildClaudeForBrandVoice } = await import('../retro-weekly/route');
    const result = buildClaudeForBrandVoice();
    expect(result).toBeNull();
  });

  it('returns a ClaudeBrandVoiceClient instance when enabled + API key present', async () => {
    process.env.BRAND_VOICE_SCORER_ENABLED = 'true';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { buildClaudeForBrandVoice } = await import('../retro-weekly/route');
    const { ClaudeBrandVoiceClient } = await import('@/modules/advertising/creative-gen/clients/claude-brand-voice-client');
    const result = buildClaudeForBrandVoice();
    expect(result).toBeInstanceOf(ClaudeBrandVoiceClient);
  });

  it('throws when enabled but ANTHROPIC_API_KEY is missing', async () => {
    process.env.BRAND_VOICE_SCORER_ENABLED = 'true';
    delete process.env.ANTHROPIC_API_KEY;
    const { buildClaudeForBrandVoice } = await import('../retro-weekly/route');
    expect(() => buildClaudeForBrandVoice()).toThrow(/ANTHROPIC_API_KEY/);
  });
});
```

> **Note:** Test count rises to 4 (not 3 as the spec said) — I split the disabled case into "unset" and "false" for robustness, since both should behave identically.

- [ ] **Step 3.2: Extend `/status` route tests**

Open `src/app/api/admin/advertising/status/__tests__/route.test.ts` (created by Sub-project 2 Commit A). Locate the existing `beforeEach` block — confirm it has the line `getReconStateMock.mockResolvedValue(...)`. Above that, add this new mock setup:

```ts
const getLatestBrandVoiceRunMock = vi.fn();

vi.mock('@/modules/advertising/decide/brand-voice-store', () => ({
  getLatestBrandVoiceRun: getLatestBrandVoiceRunMock,
}));
```

Inside `beforeEach()`, after the existing default mock setups, add:

```ts
getLatestBrandVoiceRunMock.mockResolvedValue(null);
```

Then, locate the existing describe block named `'GET /api/admin/advertising/status — brand_voice + reconciler branches'` (the last one in the file). REPLACE the existing test `'include=brand_voice returns not_implemented stub'` with these three new tests:

```ts
  it('include=brand_voice returns no_data with disabled reason when scorer flag unset', async () => {
    delete process.env.BRAND_VOICE_SCORER_ENABLED;
    getLatestBrandVoiceRunMock.mockResolvedValueOnce(null);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=brand_voice', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.brand_voice.status).toBe('no_data');
    expect(body.brand_voice.reason).toMatch(/disabled/);
  });

  it('include=brand_voice returns no_data with enabled-but-empty reason when flag on but DB empty', async () => {
    process.env.BRAND_VOICE_SCORER_ENABLED = 'true';
    getLatestBrandVoiceRunMock.mockResolvedValueOnce(null);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=brand_voice', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.brand_voice.status).toBe('no_data');
    expect(body.brand_voice.reason).toMatch(/enabled but no audit run/);
  });

  it('include=brand_voice returns ok + run_id + scores + flagged_count when DB has data', async () => {
    getLatestBrandVoiceRunMock.mockResolvedValueOnce({
      run_id: 'run-abc',
      reviewed_at: new Date('2026-05-10T10:00:00Z'),
      scores: [
        { ad_id: 'a1', depth: 8, scientific: 7, respectful: 9, no_manipulation: true,  overall: 8.2, needs_review: false, reviewed_by_claude_at: new Date('2026-05-10T10:00:00Z') },
        { ad_id: 'a2', depth: 5, scientific: 6, respectful: 7, no_manipulation: false, overall: 5.4, needs_review: true,  reviewed_by_claude_at: new Date('2026-05-10T10:00:00Z') },
      ],
    });
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=brand_voice', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.brand_voice.status).toBe('ok');
    expect(body.brand_voice.run_id).toBe('run-abc');
    expect(body.brand_voice.reviewed_at).toBe('2026-05-10T10:00:00.000Z');
    expect(body.brand_voice.scores).toHaveLength(2);
    expect(body.brand_voice.flagged_count).toBe(1);
  });
```

- [ ] **Step 3.3: Run the new tests — expect failure**

Run: `npx vitest run src/app/api/cron/advertising/__tests__/retro-weekly-brand-voice.test.ts src/app/api/admin/advertising/status/__tests__/route.test.ts`

Expected:
- `retro-weekly-brand-voice.test.ts`: all 4 tests fail with `buildClaudeForBrandVoice is not exported` or similar.
- `status/route.test.ts`: the 3 new brand_voice tests fail because `getLatestBrandVoiceRun` is not yet called by the route; the old `not_implemented` stub still runs. Pre-existing status tests still pass.

- [ ] **Step 3.4: Modify `retro-weekly/route.ts` — gate, wire, save, export**

Open `src/app/api/cron/advertising/retro-weekly/route.ts`.

(a) Near the top of the file (in the import section), find the existing import of `ClaudeClientForBrandVoice` (currently a type import). REPLACE it with this import + add 3 new imports:

Find the line near the top:
```ts
import { auditTopCreatives } from '@/modules/advertising/decide/brand-voice-audit';
```

Add the following imports IMMEDIATELY AFTER it (or grouped with the other type imports — placement is flexible as long as the imports are at the top of the file):

```ts
import type { ClaudeClientForBrandVoice } from '@/modules/advertising/decide/brand-voice-audit';
import type { BrandVoiceScore } from '@/shared/types/advertising';
import { saveBrandVoiceScores } from '@/modules/advertising/decide/brand-voice-store';
import { ClaudeBrandVoiceClient } from '@/modules/advertising/creative-gen/clients';
```

> If `ClaudeClientForBrandVoice` is already imported from a different module, keep the existing import and only add the three lines that are new.

(b) Locate the existing `buildClaudeForBrandVoice()` function (currently at `retro-weekly/route.ts:270-283`). REPLACE its entire body with:

```ts
export function buildClaudeForBrandVoice(): ClaudeClientForBrandVoice | null {
  if (process.env.BRAND_VOICE_SCORER_ENABLED !== 'true') {
    return null;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — required for ClaudeBrandVoiceClient when BRAND_VOICE_SCORER_ENABLED=true');
  }
  return new ClaudeBrandVoiceClient({ anthropicApiKey: apiKey });
}
```

> Two changes from the existing function: (1) added `export` keyword to make it testable from a separate file; (2) return type is now nullable `| null`.

(c) Locate the audit call (currently at `retro-weekly/route.ts:49` and `:57-58`). The current code is:

```ts
const claudeForBrandVoice = buildClaudeForBrandVoice();
// ... unrelated lines ...
const creatives = await fetchTopCreativesWithSpend(metaApiClient, weekAgo, now);
const brandVoiceScores =
  creatives.length > 0 ? await auditTopCreatives(creatives, claudeForBrandVoice) : [];
```

REPLACE both lines (`const brandVoiceScores = ...`) with:

```ts
let brandVoiceScores: BrandVoiceScore[] = [];
if (claudeForBrandVoice !== null && creatives.length > 0) {
  brandVoiceScores = await auditTopCreatives(creatives, claudeForBrandVoice);
  if (brandVoiceScores.length > 0) {
    await saveBrandVoiceScores(brandVoiceScores);
  }
}
```

The `const claudeForBrandVoice = buildClaudeForBrandVoice();` line stays unchanged — but now it may be `null`, which the new conditional handles.

- [ ] **Step 3.5: Modify `/status/route.ts` — replace brand_voice stub with real reader**

Open `src/app/api/admin/advertising/status/route.ts` (created by Sub-project 2 Commit A).

(a) Near the top of the file, in the import section, add:

```ts
import { getLatestBrandVoiceRun } from '@/modules/advertising/decide/brand-voice-store';
```

(b) Locate the existing `if (include.brand_voice)` block (originally returns the `not_implemented` stub). REPLACE the entire block with:

```ts
  // 5. Brand-voice scorer results
  //
  // Reads the latest weekly Claude audit run from advertising_brand_voice_scores.
  // Status is one of:
  //   - 'no_data'  : table empty (scorer disabled OR enabled but cron not yet run)
  //   - 'ok'       : returns run_id + reviewed_at + scores[] + flagged_count
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

- [ ] **Step 3.6: Add `BRAND_VOICE_SCORER_ENABLED` to `.env.example`**

Append to `.env.example` (after `ADVERTISING_TIER2_VIA_DIGEST` added by Sub-project 2 Commit C):

```

# When true, retro-weekly cron audits top-10 creatives via ClaudeBrandVoiceClient
# and persists scores in advertising_brand_voice_scores. Default false during
# rollout — flip when the migration has been applied and you want to enable
# the audit. Disabled = no Claude API calls, no DB writes, /status returns
# { status: 'no_data', reason: 'Scorer disabled...' }.
BRAND_VOICE_SCORER_ENABLED=false
```

- [ ] **Step 3.7: Run all the changed tests — expect green**

Run: `npx vitest run src/app/api/cron/advertising/__tests__/retro-weekly-brand-voice.test.ts src/app/api/admin/advertising/status/__tests__/route.test.ts`

Expected:
- `retro-weekly-brand-voice.test.ts`: 4/4 pass.
- `status/route.test.ts`: all tests pass (3 new brand_voice + pre-existing auth/shape/aggregate tests).

If pre-existing status tests now fail, the reader refactor broke something — investigate before continuing.

- [ ] **Step 3.8: Run typecheck**

Run: `npm run typecheck`
Expected: Exits 0. If errors mention `claudeForBrandVoice` is `null` where it shouldn't be, double-check the conditional wrap in Step 3.4(c).

- [ ] **Step 3.9: Run broader advertising suite**

Run: `npx vitest run src/modules/advertising src/app/api/admin src/app/api/cron/advertising scripts/advertising`
Expected: All tests pass.

- [ ] **Step 3.10: Commit**

```bash
git add src/app/api/cron/advertising/retro-weekly/route.ts \
        src/app/api/admin/advertising/status/route.ts \
        src/app/api/admin/advertising/status/__tests__/route.test.ts \
        src/app/api/cron/advertising/__tests__/retro-weekly-brand-voice.test.ts \
        .env.example
git commit -m "$(cat <<'EOF'
feat(advertising/cowork): wire brand voice scorer + /status reader

Replaces the retro-weekly mock buildClaudeForBrandVoice() with a real
env-gated factory:
  BRAND_VOICE_SCORER_ENABLED=true + ANTHROPIC_API_KEY → ClaudeBrandVoiceClient
  flag unset/false → null (audit skipped entirely, no Claude calls)
  flag on, key missing → throws (loud failure beats silent mock)

When the gate is open AND auditTopCreatives returns scores, we now
persist via saveBrandVoiceScores. retro-weekly otherwise behaves
exactly as before — brand_voice_scores still flows into the Telegram
digest report.

/status?include=brand_voice replaces the Patch 04 not_implemented
stub with getLatestBrandVoiceRun(). Returns:
  status='no_data' (with disabled or enabled-but-empty reason), OR
  status='ok' with run_id, reviewed_at, scores[], flagged_count.

7 new tests: 4 in retro-weekly-brand-voice.test.ts cover the env-gate
matrix; 3 in status/route.test.ts cover the reader's three states.

Migration from Commit B must be applied in production before the
flag is flipped. Default BRAND_VOICE_SCORER_ENABLED=false means this
commit is safe to ship cold.

Sub-project 3 / Commit C of the cowork-followup brainstorm series
(2026-05-10). Closes Phase 4 deferred work. Spec:
docs/superpowers/specs/2026-05-10-brand-voice-scorer-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then: `git push origin main`

---

## Halt criteria (reference)

Halt the plan and write a checkpoint to `.cowork-meta/brand-voice-scorer-<TIMESTAMP>/` if:

- **Pre-flight Step 0.2 fails** — Sub-project 2 Commit A is not in `main`. Phase 4 wire-up has no `/status` route to modify. Land Sub-project 2 first.
- **Pre-flight Step 0.3 reveals interface drift** — `BrandVoiceScore` or `computeWeightedOverall` signature changed. Update tests/code/spec to match.
- **`db:generate` produces unexpected schema changes** in Step 2.4 (renames, drops, additions elsewhere). Investigate before committing — there may be uncommitted schema work from another branch.
- **`grep -rn '\.sendAlert(' src/`** finds callers that destructure the return value into non-nullable — this is a Sub-project 2 Commit C carry-over check; only relevant if Sub-project 2 Commit C was also recently landed.
- **Pre-existing status test fails after Step 3.5 reader replacement.** The reader change should be additive (replace the stub branch only). If other branches break, investigate before pushing.
- **`buildClaudeForBrandVoice` export breaks** existing imports elsewhere in the codebase. Run `grep -rn 'buildClaudeForBrandVoice' src/` — if external callers exist, update them to handle the nullable return.

In every halt case: write the checkpoint and do NOT push commits without founder review.

---

## Operational follow-ups (NOT in this plan)

After all 3 commits land:

1. **Founder applies migration in production** via `npm run db:migrate` (or Drizzle Kit / Neon dashboard).
2. **Founder verifies `ANTHROPIC_API_KEY` is set** in Vercel production env.
3. **Founder flips `BRAND_VOICE_SCORER_ENABLED=true`** when ready to start scoring.
4. **(Cowork)** Founder updates Cowork's `/status` query to include `brand_voice` once data starts flowing.
5. **(Optional, weeks later)** Drift-trends API as a follow-up sub-project.

---

## Self-review

**1. Spec coverage**

| Spec section | Plan task |
|---|---|
| Goal: end-to-end scoring + reader | Tasks 1-3 cover client, storage, wire-up + reader. ✅ |
| Architecture diagram | Implementations match the data-flow diagram in the spec. ✅ |
| Component A — `ClaudeBrandVoiceClient` | Task 1 with full code + 7 tests. ✅ |
| Component B — Storage table + helpers | Task 2 with schema diff + helper code + migration step + 5 tests. ✅ |
| Component C — Wire-up + reader | Task 3 with retro-weekly diff + /status diff + 4+3=7 tests. ✅ |
| Pre-conditions (including dependency on Sub-project 2 Commit A) | Task 0 Step 0.2. ✅ |
| Halt criteria | Dedicated section + Step 2.4 + Step 3.7 explicit. ✅ |
| Cost estimate | Referenced in spec; not action-required in plan. ✅ |
| System prompt content | Inlined verbatim in Step 1.3. ✅ |
| Fail-shut behavior | Inlined in Step 1.3 (`failShut()` helper). ✅ |
| Env gate semantics | Step 3.4(b) implements the unset/false/true matrix; Step 3.1 tests it. ✅ |
| Storage schema columns | Step 2.3 matches the spec's pgTable definition byte-for-byte. ✅ |
| Reader response shape (no_data with reason, ok with run_id/scores/flagged_count) | Step 3.5(b). ✅ |
| `.env.example` line | Step 3.6. ✅ |

**2. Placeholder scan**

- No "TBD", "TODO", or "implement later".
- No "appropriate error handling" — every error path has concrete behavior (fail-shut, throw, null return).
- No "similar to Task N" — each task contains its full code.
- Step 3.4(a) note about `ClaudeClientForBrandVoice` import location: phrased defensively ("If already imported from a different module, keep") because the engineer reading the file at task time has the authoritative answer. Acceptable.

**3. Type consistency**

- `BrandVoiceScore` — used in Steps 2.1, 2.5, 3.4 (BrandVoiceScore[]), 3.5. Imported from `@/shared/types/advertising` everywhere. ✅
- `ClaudeClientForBrandVoice` — Step 1.3 (implements) + Step 3.4 (return type). Both reference `@/modules/advertising/decide/brand-voice-audit`. ✅
- `BrandVoiceRun` — Step 2.5 (export) + Step 3.5 (read via `getLatestBrandVoiceRun`). Matches. ✅
- `saveBrandVoiceScores(scores: BrandVoiceScore[]): Promise<{ run_id, saved_count }>` — Step 2.5 (impl) + Step 3.4 (call site) + Step 2.1 (test). Matches. ✅
- `getLatestBrandVoiceRun(): Promise<BrandVoiceRun | null>` — Step 2.5 (impl) + Step 3.5 (call site) + Steps 2.1, 3.2 (tests). Matches. ✅
- `buildClaudeForBrandVoice(): ClaudeClientForBrandVoice | null` — Step 3.4 (impl) + Step 3.1 (test). Matches. ✅
- `ClaudeBrandVoiceClient` (class), `ClaudeBrandVoiceClientDeps` (interface) — Step 1.3 (decl) + Step 1.5 (barrel) + Step 3.4 (import). Matches. ✅
- `computeWeightedOverall(depth, scientific, respectful, no_manipulation)` — Step 1.3 (import + call). Signature verified at pre-flight Step 0.3. ✅

**4. Atomicity check**

- Task 1: client file + test file + barrel export → one commit.
- Task 2: schema + migration + store file + test file → one commit.
- Task 3: route diffs + new test file + .env.example → one commit.
- Tasks 1 and 2 are order-independent (no cross-dependencies). Task 3 requires both 1 and 2.

**5. Reversibility**

- Task 1: pure addition — clean revert.
- Task 2: pure addition (new table, new module) — clean revert; the migration would need a separate `npm run db:drop` or DROP TABLE on production if it was already applied. Note this in the commit body. **Plan refinement: added to Task 2 commit body.**
- Task 3: refactor of `buildClaudeForBrandVoice` + reader replacement. Revert restores the mock + the `not_implemented` stub. Clean.
- All 3 commits guarded by `BRAND_VOICE_SCORER_ENABLED=false` default — production behavior is unchanged at flip-flop time, only revert-time cleanliness changes.
