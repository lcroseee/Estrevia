# Creative Batch Generation — Design

**Date:** 2026-04-27
**Status:** Approved (pending implementation)
**Owner:** Advertising agent — creative-gen pipeline
**Related plan:** `docs/superpowers/plans/2026-04-26-advertising-agent.md`
**Related runbook:** `docs/advertising/launch-runbook.md`

## Goal

Build the missing concrete pieces that make `npm run advertising:generate-launch-batch` (referenced by the launch runbook) actually work. The existing `generateLaunchBatch()` library function is fully tested with mocks; this spec covers the production adapters and CLI wrapper that wire it to real Gemini Imagen 4, Anthropic Claude, Vercel Blob, and Drizzle/Neon.

## Non-goals

- Refactoring the existing `src/app/api/v1/avatar/generate/route.ts` to share the new client (deferred — separate scope).
- Implementing video generation via Veo 3.1 Lite (deferred — first batch is image-only per cost analysis below).
- Implementing OCR text accuracy check (already deferred in `safety/checks.ts`).
- Implementing brand consistency / controversial-symbol vision checks (already deferred).
- Adding CLI flags / argparse — first version uses hardcoded params.

## Constraints discovered during brainstorming

| Constraint | Source | Implication |
|---|---|---|
| All 36 hook templates have `duration_sec` set | `creative-gen/templates/hooks-{en,es}.ts` | `generateLaunchBatch` would default to video for every slot. CLI must clone templates with `duration_sec: undefined` to force image path. |
| Runbook estimates batch cost ~$2-5 | `docs/advertising/launch-runbook.md` | True only for image-only. Video would be $16+. First batch is image-only. |
| Library function persists to DB unconditionally | `creative-gen/batch/generate-launch-set.ts` | Both `pending_review` and `rejected` rows are written. Acceptable — admin UI filters by status. |
| Library function has no per-slot try/catch | Same | One failure aborts the whole batch. Workaround: CLI calls library 6× with `count_per_locale=1` to isolate failures. Library hardening deferred. |
| `@anthropic-ai/sdk`, `@google/genai`, `@vercel/blob` not installed | `package.json` | Use raw `fetch` for Gemini + Anthropic (matches existing `pre-launch-check.ts` and `avatar/generate/route.ts` pattern). Install `@vercel/blob` for upload (typed SDK, official). |

## Architecture

### High-level flow

```
[CLI: scripts/advertising/generate-launch-batch.ts]
    │ load .env, validate vars
    │ build concrete clients
    │ load templates, force image-only
    │ for slot in [en×3, es×3]:
    │     generateLaunchBatch(deps, {count_per_locale: 1, locales: [locale]})
    │         → ImagenFast.generate
    │             → GeminiApiClient.generateImage
    │                 → POST Gemini Imagen 4 Fast API
    │                 → put() to Vercel Blob
    │                 → return {url, w, h, cost_usd}
    │         → runAllChecks (5 parallel)
    │             → ClaudeSafetyClient.moderationCheck (Claude Haiku 4.5)
    │         → DB insert via Drizzle/Neon
    │ aggregate summary
    │ print URLs + cost + counts
```

### File layout

New files:

```
src/modules/advertising/creative-gen/clients/
├── gemini-api-client.ts        (~120 lines)  concrete `apiClient` adapter
├── claude-safety-client.ts     (~60 lines)   concrete `ClaudeClient` adapter
├── index.ts                    barrel
└── __tests__/
    ├── gemini-api-client.test.ts
    └── claude-safety-client.test.ts

scripts/advertising/
├── generate-launch-batch.ts    (~100 lines)  CLI entry
└── __tests__/
    └── generate-launch-batch.test.ts
```

Modified files:

- `package.json`: add script `advertising:generate-launch-batch` and dependency `@vercel/blob`.

### Components

#### `GeminiApiClient`

Implements the `apiClient` interface expected by `ImagenFast` / `ImagenUltra` / `VeoLite` / `NanoBanana2`:

```typescript
interface GeminiApiClient {
  generateImage(opts: {
    prompt: string;
    model: string;        // 'imagen-4-fast' | 'imagen-4-ultra'
    aspect: string;       // '9:16' | '1:1' | '4:5'
  }): Promise<{ url: string; width: number; height: number; cost_usd: number }>;

  generateVideo(opts: {
    prompt: string;
    model: string;
    aspect: string;
    duration_sec: number;
    resolution: '720p' | '1080p';
    with_audio?: boolean;
  }): Promise<{ url: string; width: number; height: number; duration_sec: number; cost_usd: number }>;
}
```

**`generateImage` algorithm:**

1. Map `model` → Gemini endpoint. **Exact model identifiers must be verified against current Gemini API docs at implementation time** (preview model names rotate). Expected values circa 2026:
   - `imagen-4-fast` → `models/imagen-4.0-fast-generate-001:predict` (verify)
   - `imagen-4-ultra` → `models/imagen-4.0-ultra-generate-001:predict` (verify)
   - Reference fallback: existing `avatar/generate/route.ts` uses `imagen-3.0-generate-002` and is known-working.
2. POST to `https://generativelanguage.googleapis.com/v1beta/{endpoint}?key={GEMINI_API_KEY}` with body:
   ```json
   {
     "instances": [{"prompt": "..."}],
     "parameters": {"sampleCount": 1, "aspectRatio": "9:16", "safetyFilterLevel": "block_some"}
   }
   ```
3. Read `response.predictions[0].bytesBase64Encoded`. Throw `GEMINI_NO_IMAGE` if empty (likely safety filter triggered).
4. Decode base64 → `Buffer`.
5. Upload to Vercel Blob via `put()`:
   - Path: `creatives/launch/{nanoid()}.png`
   - Options: `{ access: 'public', contentType: 'image/png', addRandomSuffix: false, token: BLOB_READ_WRITE_TOKEN }`
6. Return `{ url: blob.url, width, height, cost_usd }`:
   - `cost_usd`: 0.02 (fast) or 0.06 (ultra), hardcoded constants.
   - `width`/`height`: prefer values from API response if Imagen returns them (some endpoints include dimensions in `predictions[0]`); otherwise fall back to a per-aspect lookup table (9:16 → 1080×1920, 1:1 → 1024×1024, 4:5 → 1024×1280). Implementation must check actual response shape during smoke test and adjust.

**`generateVideo`:** throws `VIDEO_NOT_IMPLEMENTED` for first iteration. Veo 3.1 wiring deferred to a separate spec when first video batch is needed.

**Retry policy:**

- 5xx responses: retry up to 3 times with exponential backoff (1s, 2s, 4s).
- 4xx responses (auth, quota, bad request): no retry, throw immediately.
- Timeout (>60s): one retry, then throw `GEMINI_TIMEOUT`.

**Dependency injection:**

```typescript
constructor(deps: {
  geminiApiKey: string;
  blobToken: string;
  fetch?: typeof fetch;       // default: globalThis.fetch
  blobPut?: typeof put;       // default: @vercel/blob `put`
});
```

#### `ClaudeSafetyClient`

Implements the `ClaudeClient` interface expected by `safety/checks.ts`:

```typescript
interface ClaudeClient {
  moderationCheck(input: string): Promise<{ passed: boolean; reason?: string }>;
}
```

**Algorithm:**

1. POST to `https://api.anthropic.com/v1/messages` with:
   - Headers: `x-api-key: $ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`, `content-type: application/json`.
   - Body: `{ model: 'claude-haiku-4-5', max_tokens: 200, messages: [{ role: 'user', content: input }] }`.
2. Read `response.content[0].text`.
3. Extract first JSON object substring matching `\{[^{}]*"passed"[^{}]*\}`.
4. Parse JSON. Validate `passed` is boolean. If valid → return `{ passed, reason }`.
5. **Fail-safe:** any error (non-2xx, no JSON, invalid shape, timeout, network) → return `{ passed: false, reason: 'INVALID_LLM_RESPONSE' }`.

**Why fail-safe block:** if Claude is unavailable or returns garbage, the safer default for an autonomous advertising pipeline is to reject the creative rather than let it through unchecked.

**Dependency injection:**

```typescript
constructor(deps: {
  anthropicApiKey: string;
  fetch?: typeof fetch;
});
```

#### CLI: `scripts/advertising/generate-launch-batch.ts`

Top-level structure (single file, `runBatch` exported alongside `main()` for testability):

```typescript
import 'dotenv/config';

export async function runBatch(opts?: BatchOpts): Promise<Summary> { /* ... */ }

async function main() {
  const summary = await runBatch();
  printSummary(summary);
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
```

Exported `runBatch(opts?)` function structure (testable):

1. **Validate env:** assert presence of `GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `ANTHROPIC_API_KEY`, `DATABASE_URL`. Exit 1 with clear error if any missing.
2. **Build clients:** `GeminiApiClient`, `ClaudeSafetyClient`, `ImagenFast`, stub `videoGen` (always-throwing — should never be called since image-only).
3. **Load templates:** `import { allHooks } from '@/modules/advertising/creative-gen/templates'`. Map to `imageOnlyHooks = allHooks.map(t => ({ ...t, duration_sec: undefined }))`.
4. **Acquire DB:** `getDb()` from `@/shared/lib/db`.
5. **Loop with isolation:**
   ```typescript
   const aggregate = { generated: 0, rejected: 0, total_cost_usd: 0, creatives: [], failures: [] };
   for (const locale of ['en', 'es']) {
     for (let i = 0; i < 3; i++) {
       try {
         const r = await generateLaunchBatch(deps, { count_per_locale: 1, locales: [locale] });
         aggregate.generated += r.generated;
         aggregate.rejected += r.rejected;
         aggregate.total_cost_usd += r.total_cost_usd;
         aggregate.creatives.push(...r.creatives);
       } catch (err) {
         aggregate.failures.push({ locale, slot: i, error: String(err) });
       }
     }
   }
   return aggregate;
   ```
6. **Print summary:** human-formatted text + JSON-formatted dump.

### Data flow per creative

Sequence diagram (single creative):

1. CLI picks template `en-identity-reveal-1` (slot 0, locale en).
2. CLI calls `generateLaunchBatch(deps, {count_per_locale: 1, locales: ['en']})`.
3. Library calls `pickTemplate(imageOnlyHooks, 'en', 0)` → returns the template (without `duration_sec`).
4. Library calls `imageGen.generate(template.visual_mood, IMAGE_OPTS)`.
5. `ImagenFast.generate` → `GeminiApiClient.generateImage({prompt: visual_mood, model: 'imagen-4-fast', aspect: '9:16'})`.
6. `GeminiApiClient`:
   - POST → Imagen 4 Fast endpoint.
   - Receives `bytesBase64Encoded` (~1-3 MB encoded).
   - Decodes → 0.5-2 MB PNG buffer.
   - `put('creatives/launch/abc123.png', buffer, {...})` → returns Blob URL.
   - Returns `{url, width: 1080, height: 1920, cost_usd: 0.02}`.
7. Library wraps as `GeneratedAsset`, attaches to `CreativeBundle` with `status: 'pending_review'`.
8. Library calls `runAllChecks(bundle, {claudeClient})`:
   - `personalClaimCheck(copy)` — regex, sync.
   - `metaAdPolicyCheck(creative, deps)` → `ClaudeSafetyClient.moderationCheck(prompt)` → POST Anthropic → JSON → `{passed, reason}`.
   - `ocrTextAccuracyCheck` — skipped (no ocrClient).
   - `brandConsistencyCheck` — stub pass.
   - `controversialSymbolCheck` — stub pass.
9. Library calls `isBlocked(checks)`. If any `severity: 'block'`:
   - Insert row with `status: 'rejected'`.
10. Otherwise:
    - Insert row with `status: 'pending_review'`.
11. Library returns `{generated: 0|1, rejected: 0|1, total_cost_usd: 0.02, creatives: [...]}`.

## Error handling

See "Section 3" of brainstorming — captured here as the canonical table:

| Layer | Error | Behavior |
|---|---|---|
| CLI bootstrap | Missing env var | Print error, exit 1, before any API call. |
| Gemini 401/403/429 | auth/quota | Throw, no retry. |
| Gemini 5xx | server error | Retry 3× with backoff (1s, 2s, 4s). |
| Gemini hang (no response) | indefinite | **Deferred**: AbortController-based 60s timeout enforcement is out-of-scope for this iteration (CLI is run interactively, ctrl+C is acceptable mitigation). Add in production hardening pass. |
| Gemini empty response | safety filter | Throw `GEMINI_NO_IMAGE`. CLI catches per-slot, continues. |
| Blob upload fail | API error | One retry, then throw. |
| Claude 4xx/5xx, non-JSON, timeout | any failure | Fail-safe: return `{passed: false, reason: 'INVALID_LLM_RESPONSE'}`. Creative gets `status: 'rejected'`. |
| DB write fail | Neon down, schema mismatch | Throw. CLI logs URL to stderr for manual recovery, continues to next slot. |
| Per-slot CLI loop | any error from `generateLaunchBatch` | Catch, append to `failures`, continue. |

## Testing strategy

### Unit tests

**`gemini-api-client.test.ts`** — 7 cases (timeout deferred — see Out-of-scope):

1. Calls Imagen 4 Fast endpoint with API key in query string + correct POST body + base64 → Blob upload → return shape (single happy-path test covering all four).
2. Returns `cost_usd: 0.06` and uses ultra endpoint for `imagen-4-ultra`.
3. Throws `GEMINI_AUTH` on 401 without retry.
4. Retries 3× on 503 with exponential backoff (success on attempt 3).
5. Throws `GEMINI_5XX` after 3 failed retries.
6. Throws `GEMINI_NO_IMAGE` on empty `predictions`.
7. `generateVideo()` throws `VIDEO_NOT_IMPLEMENTED` (first batch is image-only).

**`claude-safety-client.test.ts`** — 5 cases:

1. Sends correct headers + model + body to Anthropic.
2. Parses `{passed: true, reason: ""}` from valid Claude JSON.
3. Returns `{passed: false, reason: 'INVALID_LLM_RESPONSE'}` on non-JSON output.
4. Returns fail-safe block on 5xx.
5. Returns fail-safe block on timeout.

### Integration tests

**`scripts/advertising/__tests__/generate-launch-batch.test.ts`** — 5 cases:

1. Strips `duration_sec` from all loaded templates before passing to library.
2. Persists generated creatives to DB with `status: 'pending_review'`.
3. Persists rejected creatives with `status: 'rejected'` when safety blocks.
4. Continues to next slot if one slot throws (`failures[]` populated, others succeed).
5. Returns aggregated summary with cost + counts + failures.

All tests inject mocked `fetch`, mocked `put`, mocked DB chain.

### Smoke test (manual)

After unit/integration are green:

```bash
npm run advertising:generate-launch-batch
```

Expected output:

- 6 lines (or fewer if rejected) of `[locale-template-id] https://...vercel-storage.com/creatives/launch/<nanoid>.png`.
- Summary: `Generated: N, Rejected: M, Failed: K, Total cost: $X.YY`.
- All URLs are publicly fetchable (200 OK, valid PNG).
- DB has N+M rows in `advertising_creatives` (status pending_review or rejected respectively).
- Total cost ≤ $0.20.

## Cost & rollback

**Expected cost per first run:** 6 × $0.02 = $0.12 (Gemini) + ~6 × Claude Haiku tokens (~$0.001) + Blob storage (negligible) = **~$0.13**.

**Rollback:** if first batch produces bad creatives, no Meta upload happens (creatives sit in DB as `pending_review`). Cleanup options:

1. Manual SQL: `DELETE FROM advertising_creatives WHERE status IN ('pending_review', 'rejected') AND created_at > '<run timestamp>'`.
2. Admin UI bulk reject (when `/admin/advertising/creatives/review` is operational).
3. Just leave them — they don't go to Meta until human approves them.

## Out-of-scope (deferred)

| Item | Reason | When |
|---|---|---|
| Veo 3.1 Lite video generation | First batch image-only per cost analysis | When image creatives validated and want video variant |
| Imagen 4 Ultra | Use Fast for first iteration (3× cheaper, fast iteration loop) | When promo CTR validates and want hero-quality |
| Nano Banana 2 (style consistency) | Need ≥10 ads in series before brand consistency matters | After first 22 creatives confirmed good |
| OCR text accuracy check | No `ocrClient` in spec; deferred in `safety/checks.ts` | Phase 2 |
| Brand consistency colour check | Stub, deferred | Phase 2 |
| Controversial symbol vision check | Stub, deferred | Phase 2 |
| Refactor `avatar/generate/route.ts` to use shared client | Scope creep | Separate cleanup PR after first launch |
| Per-iteration error handling inside `generateLaunchBatch` library | CLI workaround acceptable for first batch | Phase 2 production hardening |
| CLI argv parsing (yargs) | Hardcoded params for first run | When second use case requires different counts |
| Sentry instrumentation | CLI runs locally, terminal output is enough | Production cron jobs |
| Gemini hang/timeout enforcement (AbortController + fake-timers tests) | Interactive CLI, ctrl+C is acceptable mitigation | Production cron jobs (where unattended hang = silent failure) |

## Acceptance

This spec is complete when implemented and the smoke test produces:

- 0 type errors (`npm run typecheck`).
- All new unit + integration tests pass (`npm test`).
- `npm run advertising:generate-launch-batch` produces ≥1 successfully generated creative end-to-end with a publicly fetchable Blob URL and a DB row.
- Total cost of first run ≤ $0.20.
- No production code path uses the Anthropic / Gemini API key for anything other than the explicit creative generation flow.
