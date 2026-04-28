# Creative Batch Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the missing concrete adapters and CLI wrapper that make `npm run advertising:generate-launch-batch` produce 6 real image creatives end-to-end (Gemini Imagen 4 → Vercel Blob → Drizzle/Neon DB) with Claude-based safety screening.

**Architecture:** Two adapter classes (`GeminiApiClient`, `ClaudeSafetyClient`) implementing the `apiClient` and `ClaudeClient` interfaces already expected by `creative-gen/generators/imagen.ts` and `creative-gen/safety/checks.ts`. A CLI script wires them with the existing `generateLaunchBatch` library function and Drizzle DB. Image-only first batch (6 creatives, ~$0.13).

**Tech Stack:** TypeScript (strict), Vitest, raw `fetch` to Gemini & Anthropic APIs, `@vercel/blob` for storage, Drizzle ORM + `@neondatabase/serverless` for persistence, `nanoid` for IDs, `tsx` for script execution.

**Spec:** `docs/superpowers/specs/2026-04-27-creative-batch-generation-design.md`

---

## Task 1: Setup — install package & register script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install `@vercel/blob` as a runtime dependency**

```bash
npm install @vercel/blob
```

Expected: package added to `dependencies` in `package.json`, `package-lock.json` updated.

- [ ] **Step 2: Add the launch-batch script to `package.json`**

In the `"scripts"` block of `package.json`, add this line after `"advertising:pre-launch-check"`:

```json
    "advertising:generate-launch-batch": "tsx scripts/advertising/generate-launch-batch.ts"
```

- [ ] **Step 3: Verify install + script registration**

Run: `npm run advertising:generate-launch-batch --help 2>&1 | head -5 || echo "expected: script exists but file missing"`

Expected: an error along the lines of `tsx: cannot find scripts/advertising/generate-launch-batch.ts` (the file doesn't exist yet — that's what the next tasks will build). Just confirms the script is wired in `package.json`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(advertising): add @vercel/blob dep and generate-launch-batch script"
```

---

## Task 2: `GeminiApiClient` — happy-path image generation

**Files:**
- Create: `src/modules/advertising/creative-gen/clients/gemini-api-client.ts`
- Create: `src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`

- [ ] **Step 1: Write failing test for happy-path image generation**

Create `src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GeminiApiClient } from '../gemini-api-client';

function makeOkResponse(base64: string): Response {
  return new Response(
    JSON.stringify({ predictions: [{ bytesBase64Encoded: base64 }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('GeminiApiClient.generateImage', () => {
  it('calls Imagen 4 Fast endpoint, uploads to Blob, returns URL with cost 0.02', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse('aGVsbG8='));
    const blobPutMock = vi.fn().mockResolvedValue({
      url: 'https://test.public.blob.vercel-storage.com/creatives/launch/abc.png',
      pathname: 'creatives/launch/abc.png',
    });

    const client = new GeminiApiClient({
      geminiApiKey: 'gemini-key',
      blobToken: 'blob-token',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
    });

    const result = await client.generateImage({
      prompt: 'dark cosmic gradient',
      model: 'imagen-4-fast',
      aspect: '9:16',
    });

    // Endpoint check
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('imagen-4.0-fast-generate-001:predict');
    expect(url).toContain('key=gemini-key');
    expect(init.method).toBe('POST');

    // POST body check
    const body = JSON.parse(init.body as string);
    expect(body.instances[0].prompt).toBe('dark cosmic gradient');
    expect(body.parameters.aspectRatio).toBe('9:16');
    expect(body.parameters.sampleCount).toBe(1);

    // Blob upload check
    expect(blobPutMock).toHaveBeenCalledTimes(1);
    const [blobPath, blobBuffer, blobOpts] = blobPutMock.mock.calls[0];
    expect(blobPath).toMatch(/^creatives\/launch\/[A-Za-z0-9_-]+\.png$/);
    expect(blobBuffer).toBeInstanceOf(Buffer);
    expect(blobOpts.access).toBe('public');
    expect(blobOpts.contentType).toBe('image/png');
    expect(blobOpts.token).toBe('blob-token');

    // Return shape
    expect(result.url).toBe('https://test.public.blob.vercel-storage.com/creatives/launch/abc.png');
    expect(result.cost_usd).toBe(0.02);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`

Expected: FAIL with "Cannot find module '../gemini-api-client'".

- [ ] **Step 3: Create the minimal `GeminiApiClient` implementation**

Create `src/modules/advertising/creative-gen/clients/gemini-api-client.ts`:

```typescript
import { nanoid } from 'nanoid';
import { put as defaultBlobPut } from '@vercel/blob';

export interface GeminiImageOpts {
  prompt: string;
  model: 'imagen-4-fast' | 'imagen-4-ultra';
  aspect: '9:16' | '1:1' | '4:5';
}

export interface GeminiImageResult {
  url: string;
  width: number;
  height: number;
  cost_usd: number;
}

export interface GeminiVideoOpts {
  prompt: string;
  model: string;
  aspect: string;
  duration_sec: number;
  resolution: '720p' | '1080p';
  with_audio?: boolean;
}

export interface GeminiVideoResult {
  url: string;
  width: number;
  height: number;
  duration_sec: number;
  cost_usd: number;
}

export interface GeminiApiClientDeps {
  geminiApiKey: string;
  blobToken: string;
  fetch?: typeof fetch;
  blobPut?: typeof defaultBlobPut;
}

const MODEL_ENDPOINT: Record<GeminiImageOpts['model'], string> = {
  'imagen-4-fast': 'imagen-4.0-fast-generate-001:predict',
  'imagen-4-ultra': 'imagen-4.0-ultra-generate-001:predict',
};

const MODEL_COST: Record<GeminiImageOpts['model'], number> = {
  'imagen-4-fast': 0.02,
  'imagen-4-ultra': 0.06,
};

const ASPECT_DIMENSIONS: Record<GeminiImageOpts['aspect'], { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1024, height: 1024 },
  '4:5': { width: 1024, height: 1280 },
};

export class GeminiApiClient {
  private readonly fetch: typeof fetch;
  private readonly blobPut: typeof defaultBlobPut;

  constructor(private readonly deps: GeminiApiClientDeps) {
    this.fetch = deps.fetch ?? globalThis.fetch;
    this.blobPut = deps.blobPut ?? defaultBlobPut;
  }

  async generateImage(opts: GeminiImageOpts): Promise<GeminiImageResult> {
    const endpoint = MODEL_ENDPOINT[opts.model];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${endpoint}?key=${this.deps.geminiApiKey}`;

    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: opts.prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: opts.aspect,
          safetyFilterLevel: 'block_some',
        },
      }),
    });

    const data = (await response.json()) as { predictions?: Array<{ bytesBase64Encoded?: string }> };
    const base64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!base64) {
      throw new Error('GEMINI_NO_IMAGE');
    }

    const buffer = Buffer.from(base64, 'base64');
    const blob = await this.blobPut(`creatives/launch/${nanoid()}.png`, buffer, {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
      token: this.deps.blobToken,
    });

    const dims = ASPECT_DIMENSIONS[opts.aspect];
    return {
      url: blob.url,
      width: dims.width,
      height: dims.height,
      cost_usd: MODEL_COST[opts.model],
    };
  }

  async generateVideo(_opts: GeminiVideoOpts): Promise<GeminiVideoResult> {
    throw new Error('VIDEO_NOT_IMPLEMENTED');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`

Expected: 1 test passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/advertising/creative-gen/clients/gemini-api-client.ts \
        src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts
git commit -m "feat(advertising/creative-gen): GeminiApiClient happy-path image gen"
```

---

## Task 3: `GeminiApiClient` — Imagen 4 Ultra cost variant

**Files:**
- Modify: `src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`

- [ ] **Step 1: Add failing test for ultra cost**

Inside the existing `describe('GeminiApiClient.generateImage', ...)` block, append:

```typescript
  it('returns cost 0.06 for imagen-4-ultra and uses ultra endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse('aGVsbG8='));
    const blobPutMock = vi.fn().mockResolvedValue({
      url: 'https://test.public.blob.vercel-storage.com/creatives/launch/u.png',
      pathname: 'creatives/launch/u.png',
    });

    const client = new GeminiApiClient({
      geminiApiKey: 'k',
      blobToken: 't',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
    });

    const result = await client.generateImage({
      prompt: 'p',
      model: 'imagen-4-ultra',
      aspect: '1:1',
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('imagen-4.0-ultra-generate-001:predict');
    expect(result.cost_usd).toBe(0.06);
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
  });
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`

Expected: 2 tests passing (the existing impl already covers this — no code changes needed because the `MODEL_*` lookups are already wired).

- [ ] **Step 3: Commit**

```bash
git add src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts
git commit -m "test(advertising/creative-gen): cover Imagen 4 Ultra variant"
```

---

## Task 4: `GeminiApiClient` — fail-fast on 401 auth

**Files:**
- Modify: `src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`
- Modify: `src/modules/advertising/creative-gen/clients/gemini-api-client.ts`

- [ ] **Step 1: Add failing test for 401 fail-fast**

Append to the same `describe` block:

```typescript
  it('throws on 401 without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"error":{"code":401,"message":"unauth"}}', { status: 401 }),
    );
    const blobPutMock = vi.fn();

    const client = new GeminiApiClient({
      geminiApiKey: 'bad',
      blobToken: 't',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
    });

    await expect(
      client.generateImage({ prompt: 'p', model: 'imagen-4-fast', aspect: '9:16' }),
    ).rejects.toThrow(/GEMINI_AUTH/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(blobPutMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts -t "throws on 401"`

Expected: FAIL — current impl tries to read JSON regardless of status, will throw `GEMINI_NO_IMAGE` not `GEMINI_AUTH`.

- [ ] **Step 3: Add status check before JSON parse**

In `gemini-api-client.ts`, after `const response = await this.fetch(...)` line, before `const data = ...`, add:

```typescript
    if (response.status === 401 || response.status === 403) {
      throw new Error(`GEMINI_AUTH: HTTP ${response.status}`);
    }
    if (response.status === 429) {
      throw new Error(`GEMINI_QUOTA: HTTP 429`);
    }
    if (response.status >= 400 && response.status < 500) {
      throw new Error(`GEMINI_BAD_REQUEST: HTTP ${response.status}`);
    }
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`

Expected: all 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/advertising/creative-gen/clients/gemini-api-client.ts \
        src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts
git commit -m "feat(advertising/creative-gen): GeminiApiClient fail-fast on 4xx"
```

---

## Task 5: `GeminiApiClient` — retry on 5xx with exponential backoff

**Files:**
- Modify: `src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`
- Modify: `src/modules/advertising/creative-gen/clients/gemini-api-client.ts`

- [ ] **Step 1: Add failing test for 5xx retry**

Append to the same `describe` block:

```typescript
  it('retries 3 times on 503 then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('upstream', { status: 503 }))
      .mockResolvedValueOnce(new Response('upstream', { status: 503 }))
      .mockResolvedValueOnce(makeOkResponse('aGk='));
    const blobPutMock = vi.fn().mockResolvedValue({
      url: 'https://test.public.blob.vercel-storage.com/x.png',
      pathname: 'x.png',
    });

    const client = new GeminiApiClient({
      geminiApiKey: 'k',
      blobToken: 't',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
      sleepMs: () => Promise.resolve(), // disable real backoff for test speed
    });

    const result = await client.generateImage({
      prompt: 'p',
      model: 'imagen-4-fast',
      aspect: '9:16',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.url).toBe('https://test.public.blob.vercel-storage.com/x.png');
  });

  it('throws after 3 failed retries on 503', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('upstream', { status: 503 }));
    const blobPutMock = vi.fn();

    const client = new GeminiApiClient({
      geminiApiKey: 'k',
      blobToken: 't',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
      sleepMs: () => Promise.resolve(),
    });

    await expect(
      client.generateImage({ prompt: 'p', model: 'imagen-4-fast', aspect: '9:16' }),
    ).rejects.toThrow(/GEMINI_5XX/);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(blobPutMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts -t "retries 3 times"`

Expected: FAIL — current impl doesn't retry, returns first response.

- [ ] **Step 3: Add retry loop with backoff + `sleepMs` injection**

Update `GeminiApiClientDeps` interface to add `sleepMs?: (ms: number) => Promise<void>`.

In the constructor, add `this.sleepMs = deps.sleepMs ?? ((ms) => new Promise(r => setTimeout(r, ms)));`

Refactor `generateImage` method body so the fetch + status-handling block is wrapped in a 3-attempt loop. Replace the existing fetch+status section with:

```typescript
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${endpoint}?key=${this.deps.geminiApiKey}`;
    const requestInit: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: opts.prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: opts.aspect,
          safetyFilterLevel: 'block_some',
        },
      }),
    };

    const MAX_ATTEMPTS = 3;
    let response: Response | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      response = await this.fetch(url, requestInit);
      if (response.status >= 200 && response.status < 300) break;
      if (response.status === 401 || response.status === 403) {
        throw new Error(`GEMINI_AUTH: HTTP ${response.status}`);
      }
      if (response.status === 429) {
        throw new Error(`GEMINI_QUOTA: HTTP 429`);
      }
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`GEMINI_BAD_REQUEST: HTTP ${response.status}`);
      }
      // 5xx — retry with exponential backoff
      if (attempt < MAX_ATTEMPTS) {
        await this.sleepMs(2 ** (attempt - 1) * 1000);
      }
    }
    if (!response || response.status >= 500) {
      throw new Error(`GEMINI_5XX: HTTP ${response?.status ?? 'unknown'} after ${MAX_ATTEMPTS} attempts`);
    }
```

The class field `private readonly sleepMs: (ms: number) => Promise<void>;` must be declared and assigned in the constructor.

- [ ] **Step 4: Run all tests, verify pass**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`

Expected: all 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/advertising/creative-gen/clients/gemini-api-client.ts \
        src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts
git commit -m "feat(advertising/creative-gen): GeminiApiClient retry on 5xx with backoff"
```

---

## Task 6: `GeminiApiClient` — empty predictions throws GEMINI_NO_IMAGE

**Files:**
- Modify: `src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`

- [ ] **Step 1: Add test for empty predictions**

Append to the same `describe` block:

```typescript
  it('throws GEMINI_NO_IMAGE when predictions array is empty (safety filter)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ predictions: [] }), { status: 200 }),
    );
    const blobPutMock = vi.fn();

    const client = new GeminiApiClient({
      geminiApiKey: 'k',
      blobToken: 't',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
    });

    await expect(
      client.generateImage({ prompt: 'p', model: 'imagen-4-fast', aspect: '9:16' }),
    ).rejects.toThrow(/GEMINI_NO_IMAGE/);

    expect(blobPutMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test, verify it passes immediately**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`

Expected: 6 tests passing (existing impl already throws `GEMINI_NO_IMAGE` when `bytesBase64Encoded` is undefined).

- [ ] **Step 3: Commit**

```bash
git add src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts
git commit -m "test(advertising/creative-gen): cover empty Gemini predictions"
```

---

## Task 7: `GeminiApiClient` — generateVideo throws VIDEO_NOT_IMPLEMENTED

**Files:**
- Modify: `src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`

- [ ] **Step 1: Add test**

Append to the test file (separate `describe`):

```typescript
describe('GeminiApiClient.generateVideo', () => {
  it('throws VIDEO_NOT_IMPLEMENTED — first batch is image-only', async () => {
    const client = new GeminiApiClient({
      geminiApiKey: 'k',
      blobToken: 't',
      fetch: vi.fn() as unknown as typeof fetch,
      blobPut: vi.fn(),
    });

    await expect(
      client.generateVideo({
        prompt: 'p',
        model: 'veo-3-1-lite',
        aspect: '9:16',
        duration_sec: 15,
        resolution: '720p',
      }),
    ).rejects.toThrow(/VIDEO_NOT_IMPLEMENTED/);
  });
});
```

- [ ] **Step 2: Run, verify pass**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts`

Expected: 7 tests passing.

- [ ] **Step 3: Commit**

```bash
git add src/modules/advertising/creative-gen/clients/__tests__/gemini-api-client.test.ts
git commit -m "test(advertising/creative-gen): cover generateVideo not-implemented"
```

---

## Task 8: `ClaudeSafetyClient` — happy-path moderation

**Files:**
- Create: `src/modules/advertising/creative-gen/clients/claude-safety-client.ts`
- Create: `src/modules/advertising/creative-gen/clients/__tests__/claude-safety-client.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/modules/advertising/creative-gen/clients/__tests__/claude-safety-client.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ClaudeSafetyClient } from '../claude-safety-client';

function makeClaudeOkResponse(text: string): Response {
  return new Response(
    JSON.stringify({ content: [{ type: 'text', text }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('ClaudeSafetyClient.moderationCheck', () => {
  it('parses passed=true from valid JSON in Claude response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeClaudeOkResponse('Sure, here is my answer: {"passed": true, "reason": ""}'),
    );

    const client = new ClaudeSafetyClient({
      anthropicApiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.moderationCheck('Calculate your sidereal sun.');

    expect(result.passed).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.messages[0].content).toContain('Calculate your sidereal sun.');
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/claude-safety-client.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Create the implementation**

Create `src/modules/advertising/creative-gen/clients/claude-safety-client.ts`:

```typescript
export interface ClaudeSafetyClientDeps {
  anthropicApiKey: string;
  fetch?: typeof fetch;
}

export interface ModerationResult {
  passed: boolean;
  reason?: string;
}

export class ClaudeSafetyClient {
  private readonly fetch: typeof fetch;

  constructor(private readonly deps: ClaudeSafetyClientDeps) {
    this.fetch = deps.fetch ?? globalThis.fetch;
  }

  async moderationCheck(input: string): Promise<ModerationResult> {
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
          max_tokens: 200,
          messages: [{ role: 'user', content: input }],
        }),
      });

      if (response.status < 200 || response.status >= 300) {
        return { passed: false, reason: 'INVALID_LLM_RESPONSE' };
      }

      const data = (await response.json()) as { content?: Array<{ text?: string }> };
      const text = data.content?.[0]?.text ?? '';

      const match = text.match(/\{[^{}]*"passed"[^{}]*\}/);
      if (!match) {
        return { passed: false, reason: 'INVALID_LLM_RESPONSE' };
      }

      const parsed = JSON.parse(match[0]) as { passed?: unknown; reason?: unknown };
      if (typeof parsed.passed !== 'boolean') {
        return { passed: false, reason: 'INVALID_LLM_RESPONSE' };
      }

      return {
        passed: parsed.passed,
        reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      };
    } catch {
      return { passed: false, reason: 'INVALID_LLM_RESPONSE' };
    }
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/claude-safety-client.test.ts`

Expected: 1 test passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/advertising/creative-gen/clients/claude-safety-client.ts \
        src/modules/advertising/creative-gen/clients/__tests__/claude-safety-client.test.ts
git commit -m "feat(advertising/creative-gen): ClaudeSafetyClient happy-path moderation"
```

---

## Task 9: `ClaudeSafetyClient` — fail-safe on non-JSON output

**Files:**
- Modify: `src/modules/advertising/creative-gen/clients/__tests__/claude-safety-client.test.ts`

- [ ] **Step 1: Add test**

Append to the same `describe` block:

```typescript
  it('returns fail-safe block on non-JSON output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeClaudeOkResponse('I cannot determine without more context'),
    );
    const client = new ClaudeSafetyClient({
      anthropicApiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.moderationCheck('any input');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('INVALID_LLM_RESPONSE');
  });

  it('returns fail-safe block when "passed" is missing from JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeClaudeOkResponse('{"reason": "no idea"}'),
    );
    const client = new ClaudeSafetyClient({
      anthropicApiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.moderationCheck('any input');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('INVALID_LLM_RESPONSE');
  });
```

- [ ] **Step 2: Run, verify pass**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/claude-safety-client.test.ts`

Expected: 3 tests passing (impl already covers).

- [ ] **Step 3: Commit**

```bash
git add src/modules/advertising/creative-gen/clients/__tests__/claude-safety-client.test.ts
git commit -m "test(advertising/creative-gen): cover Claude non-JSON fail-safe"
```

---

## Task 10: `ClaudeSafetyClient` — fail-safe on 5xx and network errors

**Files:**
- Modify: `src/modules/advertising/creative-gen/clients/__tests__/claude-safety-client.test.ts`

- [ ] **Step 1: Add tests**

Append:

```typescript
  it('returns fail-safe block on 503 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('upstream', { status: 503 }),
    );
    const client = new ClaudeSafetyClient({
      anthropicApiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.moderationCheck('any');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('INVALID_LLM_RESPONSE');
  });

  it('returns fail-safe block when fetch throws (network/timeout)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const client = new ClaudeSafetyClient({
      anthropicApiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.moderationCheck('any');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('INVALID_LLM_RESPONSE');
  });
```

- [ ] **Step 2: Run, verify pass**

Run: `npx vitest run src/modules/advertising/creative-gen/clients/__tests__/claude-safety-client.test.ts`

Expected: 5 tests passing.

- [ ] **Step 3: Commit**

```bash
git add src/modules/advertising/creative-gen/clients/__tests__/claude-safety-client.test.ts
git commit -m "test(advertising/creative-gen): cover Claude 5xx and network fail-safe"
```

---

## Task 11: `clients/index.ts` barrel + module re-export

**Files:**
- Create: `src/modules/advertising/creative-gen/clients/index.ts`
- Modify: `src/modules/advertising/index.ts`

- [ ] **Step 1: Create the barrel**

Create `src/modules/advertising/creative-gen/clients/index.ts`:

```typescript
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
```

- [ ] **Step 2: Add to module-level barrel**

In `src/modules/advertising/index.ts`, add a new export line in the appropriate alphabetical position:

```typescript
export * as creativeGenClients from './creative-gen/clients';
```

- [ ] **Step 3: Verify type-check passes**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/advertising/creative-gen/clients/index.ts \
        src/modules/advertising/index.ts
git commit -m "feat(advertising/creative-gen): export new clients barrel"
```

---

## Task 12: CLI `runBatch` — env validation

**Files:**
- Create: `scripts/advertising/generate-launch-batch.ts`
- Create: `scripts/advertising/__tests__/generate-launch-batch.test.ts`

- [ ] **Step 1: Write failing test for env validation**

Create `scripts/advertising/__tests__/generate-launch-batch.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from '../generate-launch-batch';

describe('validateEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns missing key list when none are set', () => {
    const result = validateEnv();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(
        expect.arrayContaining([
          'GEMINI_API_KEY',
          'BLOB_READ_WRITE_TOKEN',
          'ANTHROPIC_API_KEY',
          'DATABASE_URL',
        ]),
      );
    }
  });

  it('returns ok when all 4 vars are set', () => {
    process.env.GEMINI_API_KEY = 'g';
    process.env.BLOB_READ_WRITE_TOKEN = 'b';
    process.env.ANTHROPIC_API_KEY = 'a';
    process.env.DATABASE_URL = 'd';
    const result = validateEnv();
    expect(result.ok).toBe(true);
  });

  it('flags only missing ones', () => {
    process.env.GEMINI_API_KEY = 'g';
    process.env.ANTHROPIC_API_KEY = 'a';
    const result = validateEnv();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(['BLOB_READ_WRITE_TOKEN', 'DATABASE_URL']);
    }
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run scripts/advertising/__tests__/generate-launch-batch.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Create skeleton with validateEnv**

Create `scripts/advertising/generate-launch-batch.ts`:

```typescript
import 'dotenv/config';

const REQUIRED_ENV_VARS = [
  'GEMINI_API_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'ANTHROPIC_API_KEY',
  'DATABASE_URL',
] as const;

export type ValidateEnvResult =
  | { ok: true }
  | { ok: false; missing: string[] };

export function validateEnv(): ValidateEnvResult {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run scripts/advertising/__tests__/generate-launch-batch.test.ts`

Expected: 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/advertising/generate-launch-batch.ts \
        scripts/advertising/__tests__/generate-launch-batch.test.ts
git commit -m "feat(advertising/cli): generate-launch-batch env validation"
```

---

## Task 13: CLI `runBatch` — strips duration_sec from templates

**Files:**
- Modify: `scripts/advertising/generate-launch-batch.ts`
- Modify: `scripts/advertising/__tests__/generate-launch-batch.test.ts`

- [ ] **Step 1: Add failing test**

Append to test file:

```typescript
import { stripDurationFromHooks } from '../generate-launch-batch';
import type { HookTemplate } from '@/shared/types/advertising';

describe('stripDurationFromHooks', () => {
  it('clears duration_sec on every template', () => {
    const input: HookTemplate[] = [
      { id: 'a', name: 'A', archetype: 'identity_reveal', copy_template: 'c', visual_mood: 'm', duration_sec: 15, aspect_ratios: ['9:16'], locale: 'en', policy_constraints: [] },
      { id: 'b', name: 'B', archetype: 'authority', copy_template: 'c', visual_mood: 'm', duration_sec: 20, aspect_ratios: ['9:16'], locale: 'en', policy_constraints: [] },
    ];
    const output = stripDurationFromHooks(input);
    expect(output[0].duration_sec).toBeUndefined();
    expect(output[1].duration_sec).toBeUndefined();
    // input not mutated
    expect(input[0].duration_sec).toBe(15);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run scripts/advertising/__tests__/generate-launch-batch.test.ts -t "clears duration_sec"`

Expected: FAIL — function not exported.

- [ ] **Step 3: Add the function**

In `scripts/advertising/generate-launch-batch.ts`, append:

```typescript
import type { HookTemplate } from '@/shared/types/advertising';

export function stripDurationFromHooks(hooks: HookTemplate[]): HookTemplate[] {
  return hooks.map((hook) => ({ ...hook, duration_sec: undefined }));
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run scripts/advertising/__tests__/generate-launch-batch.test.ts`

Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/advertising/generate-launch-batch.ts \
        scripts/advertising/__tests__/generate-launch-batch.test.ts
git commit -m "feat(advertising/cli): strip duration_sec to force image-only batch"
```

---

## Task 14: CLI `runBatch` — orchestrate one slot end-to-end (with mocks)

**Files:**
- Modify: `scripts/advertising/generate-launch-batch.ts`
- Modify: `scripts/advertising/__tests__/generate-launch-batch.test.ts`

- [ ] **Step 1: Add failing integration test**

Append to test file:

```typescript
import { runBatch } from '../generate-launch-batch';
import { vi } from 'vitest';

describe('runBatch', () => {
  const baseEnv = {
    GEMINI_API_KEY: 'g',
    BLOB_READ_WRITE_TOKEN: 'b',
    ANTHROPIC_API_KEY: 'a',
    DATABASE_URL: 'd',
  };

  beforeEach(() => {
    Object.assign(process.env, baseEnv);
  });

  it('generates 1 creative per slot, persists to DB, returns aggregate summary', async () => {
    const inserts: Array<{ values: unknown }> = [];
    const dbMock = {
      insert: () => ({
        values: (row: unknown) => {
          inserts.push({ values: row });
          return Promise.resolve();
        },
      }),
    };

    const imageGenMock = {
      name: 'imagen-4-fast' as const,
      cost_per_image_usd: 0.02,
      generate: vi.fn().mockResolvedValue({
        id: 'asset-1',
        kind: 'image' as const,
        generator: 'imagen-4-fast' as const,
        prompt_used: 'p',
        url: 'https://blob/x.png',
        width: 1080,
        height: 1920,
        cost_usd: 0.02,
        created_at: new Date(),
      }),
    };

    const claudeMock = {
      moderationCheck: vi.fn().mockResolvedValue({ passed: true }),
    };

    const summary = await runBatch({
      countPerLocale: 1,
      locales: ['en'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: dbMock as any,
      imageGen: imageGenMock,
      claudeClient: claudeMock,
    });

    expect(summary.generated).toBe(1);
    expect(summary.rejected).toBe(0);
    expect(summary.total_cost_usd).toBe(0.02);
    expect(summary.failures).toEqual([]);
    expect(inserts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run scripts/advertising/__tests__/generate-launch-batch.test.ts -t "generates 1 creative"`

Expected: FAIL — `runBatch` not exported.

- [ ] **Step 3: Implement `runBatch`**

In `scripts/advertising/generate-launch-batch.ts`, append:

```typescript
import { allHooks } from '@/modules/advertising/creative-gen/templates';
import { generateLaunchBatch } from '@/modules/advertising/creative-gen/batch';
import type { BatchDeps, DbClient } from '@/modules/advertising/creative-gen/batch';
import type { ImageGenerator, VideoGenerator } from '@/shared/types/advertising';
import type { ClaudeClient } from '@/modules/advertising/creative-gen/safety/checks';

export interface RunBatchOpts {
  countPerLocale?: number;
  locales?: ('en' | 'es')[];
  db: DbClient;
  imageGen: ImageGenerator;
  claudeClient: ClaudeClient;
  videoGen?: VideoGenerator;
}

export interface RunBatchSummary {
  generated: number;
  rejected: number;
  total_cost_usd: number;
  creatives: Array<{ id: string; locale: 'en' | 'es'; status: string; url: string; templateId: string }>;
  failures: Array<{ locale: 'en' | 'es'; slot: number; error: string }>;
}

const STUB_VIDEO_GEN: VideoGenerator = {
  name: 'stub-noop',
  cost_per_second_usd: 0,
  generate: () => Promise.reject(new Error('VIDEO_NOT_IMPLEMENTED')),
};

export async function runBatch(opts: RunBatchOpts): Promise<RunBatchSummary> {
  const countPerLocale = opts.countPerLocale ?? 3;
  const locales = opts.locales ?? (['en', 'es'] as const);
  const imageOnlyHooks = stripDurationFromHooks(allHooks);

  const deps: BatchDeps = {
    imageGen: opts.imageGen,
    videoGen: opts.videoGen ?? STUB_VIDEO_GEN,
    hookTemplates: imageOnlyHooks,
    claudeClient: opts.claudeClient,
    db: opts.db,
  };

  const aggregate: RunBatchSummary = {
    generated: 0,
    rejected: 0,
    total_cost_usd: 0,
    creatives: [],
    failures: [],
  };

  for (const locale of locales) {
    for (let slot = 0; slot < countPerLocale; slot++) {
      try {
        const result = await generateLaunchBatch(deps, {
          count_per_locale: 1,
          locales: [locale],
        });
        aggregate.generated += result.generated;
        aggregate.rejected += result.rejected;
        aggregate.total_cost_usd += result.total_cost_usd;
        for (const c of result.creatives) {
          aggregate.creatives.push({
            id: c.id,
            locale: c.locale,
            status: c.status,
            url: c.asset.url,
            templateId: c.hook_template_id,
          });
        }
      } catch (err) {
        aggregate.failures.push({
          locale,
          slot,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return aggregate;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run scripts/advertising/__tests__/generate-launch-batch.test.ts`

Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/advertising/generate-launch-batch.ts \
        scripts/advertising/__tests__/generate-launch-batch.test.ts
git commit -m "feat(advertising/cli): runBatch orchestrator with per-slot isolation"
```

---

## Task 15: CLI `runBatch` — error isolation per slot

**Files:**
- Modify: `scripts/advertising/__tests__/generate-launch-batch.test.ts`

- [ ] **Step 1: Add failing test**

Append inside the existing `describe('runBatch', ...)`:

```typescript
  it('isolates failures per slot — one bad slot does not abort the rest', async () => {
    const dbMock = {
      insert: () => ({ values: () => Promise.resolve() }),
    };

    let callCount = 0;
    const imageGenMock = {
      name: 'imagen-4-fast' as const,
      cost_per_image_usd: 0.02,
      generate: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('GEMINI_NO_IMAGE'));
        }
        return Promise.resolve({
          id: `asset-${callCount}`,
          kind: 'image' as const,
          generator: 'imagen-4-fast' as const,
          prompt_used: 'p',
          url: `https://blob/${callCount}.png`,
          width: 1080,
          height: 1920,
          cost_usd: 0.02,
          created_at: new Date(),
        });
      }),
    };

    const claudeMock = { moderationCheck: vi.fn().mockResolvedValue({ passed: true }) };

    const summary = await runBatch({
      countPerLocale: 3,
      locales: ['en'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: dbMock as any,
      imageGen: imageGenMock,
      claudeClient: claudeMock,
    });

    expect(summary.generated).toBe(2);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]).toEqual({
      locale: 'en',
      slot: 1,
      error: expect.stringContaining('GEMINI_NO_IMAGE'),
    });
  });
```

- [ ] **Step 2: Run, verify pass**

Run: `npx vitest run scripts/advertising/__tests__/generate-launch-batch.test.ts`

Expected: 6 tests passing (existing impl already isolates).

- [ ] **Step 3: Commit**

```bash
git add scripts/advertising/__tests__/generate-launch-batch.test.ts
git commit -m "test(advertising/cli): cover per-slot error isolation"
```

---

## Task 16: CLI `runBatch` — rejected creative path

**Files:**
- Modify: `scripts/advertising/__tests__/generate-launch-batch.test.ts`

- [ ] **Step 1: Add failing test**

Append:

```typescript
  it('persists rejected creatives when safety check blocks', async () => {
    const inserts: Array<{ status: string }> = [];
    const dbMock = {
      insert: () => ({
        values: (row: { status: string }) => {
          inserts.push({ status: row.status });
          return Promise.resolve();
        },
      }),
    };

    const imageGenMock = {
      name: 'imagen-4-fast' as const,
      cost_per_image_usd: 0.02,
      generate: vi.fn().mockResolvedValue({
        id: 'asset-1',
        kind: 'image' as const,
        generator: 'imagen-4-fast' as const,
        prompt_used: 'p',
        url: 'https://blob/x.png',
        width: 1080,
        height: 1920,
        cost_usd: 0.02,
        created_at: new Date(),
      }),
    };

    // Claude blocks the creative
    const claudeMock = {
      moderationCheck: vi.fn().mockResolvedValue({
        passed: false,
        reason: 'fortune-telling language detected',
      }),
    };

    const summary = await runBatch({
      countPerLocale: 1,
      locales: ['en'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: dbMock as any,
      imageGen: imageGenMock,
      claudeClient: claudeMock,
    });

    expect(summary.generated).toBe(0);
    expect(summary.rejected).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].status).toBe('rejected');
  });
```

- [ ] **Step 2: Run, verify pass**

Run: `npx vitest run scripts/advertising/__tests__/generate-launch-batch.test.ts`

Expected: 7 tests passing.

- [ ] **Step 3: Commit**

```bash
git add scripts/advertising/__tests__/generate-launch-batch.test.ts
git commit -m "test(advertising/cli): cover rejected-creative DB persistence path"
```

---

## Task 17: CLI top-level `main()` + summary printing

**Files:**
- Modify: `scripts/advertising/generate-launch-batch.ts`

- [ ] **Step 1: Add `main` and `printSummary` (no test — thin glue)**

Append to `scripts/advertising/generate-launch-batch.ts`:

```typescript
import { GeminiApiClient, ClaudeSafetyClient } from '@/modules/advertising/creative-gen/clients';
import { ImagenFast } from '@/modules/advertising/creative-gen/generators';
import { getDb } from '@/shared/lib/db';

export function printSummary(summary: RunBatchSummary): void {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Generated:   ${summary.generated}`);
  console.log(`  Rejected:    ${summary.rejected}`);
  console.log(`  Failed:      ${summary.failures.length}`);
  console.log(`  Total cost:  $${summary.total_cost_usd.toFixed(2)}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  if (summary.creatives.length > 0) {
    console.log('Creatives:');
    for (const c of summary.creatives) {
      console.log(`  [${c.locale}/${c.templateId}] ${c.status}: ${c.url}`);
    }
    console.log('');
  }
  if (summary.failures.length > 0) {
    console.log('Failures:');
    for (const f of summary.failures) {
      console.log(`  [${f.locale} slot ${f.slot}] ${f.error}`);
    }
    console.log('');
  }
  console.log('Review pending creatives at /admin/advertising/creatives/review (after deploy).');
}

async function main(): Promise<void> {
  const envCheck = validateEnv();
  if (!envCheck.ok) {
    console.error(`Missing required env vars: ${envCheck.missing.join(', ')}`);
    process.exit(1);
  }

  const geminiClient = new GeminiApiClient({
    geminiApiKey: process.env.GEMINI_API_KEY!,
    blobToken: process.env.BLOB_READ_WRITE_TOKEN!,
  });

  const claudeClient = new ClaudeSafetyClient({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const imageGen = new ImagenFast({ apiClient: geminiClient });

  const summary = await runBatch({
    countPerLocale: 3,
    locales: ['en', 'es'],
    db: getDb(),
    imageGen,
    claudeClient,
  });

  printSummary(summary);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 3: Verify all advertising tests still green**

Run: `npx vitest run src/modules/advertising scripts/advertising`

Expected: all tests passing (gemini-api-client: 7, claude-safety-client: 5, generate-launch-batch: 7, plus existing advertising tests).

- [ ] **Step 4: Commit**

```bash
git add scripts/advertising/generate-launch-batch.ts
git commit -m "feat(advertising/cli): wire main entry + printSummary"
```

---

## Task 18: Smoke test — run with real APIs

**Files:** none (verification step)

- [ ] **Step 1: Confirm pre-launch check still 0 errors**

Run: `npm run advertising:pre-launch-check`

Expected: `SUMMARY: 23 passed, 2 warnings, 0 errors`. If errors → stop, fix before proceeding.

- [ ] **Step 2: Run the launch batch**

Run: `npm run advertising:generate-launch-batch`

Expected: terminal output of the form:
```
Creatives:
  [en/en-identity-reveal-1] pending_review: https://....public.blob.vercel-storage.com/creatives/launch/<id>.png
  [en/en-identity-reveal-2] pending_review: https://....public.blob.vercel-storage.com/creatives/launch/<id>.png
  ...

Generated:   N (0..6)
Rejected:    M (0..6)
Failed:      K (0..6)
Total cost:  $0.XX
```

Total cost ≤ $0.20.

- [ ] **Step 3: Verify Blob URLs are publicly fetchable**

For each URL printed, run: `curl -sI "<url>" | head -3`

Expected: HTTP 200, content-type `image/png`. Open at least one in a browser to visually confirm an image was generated.

- [ ] **Step 4: Verify DB rows**

Run:

```bash
psql "$DATABASE_URL" -c \
  "SELECT id, hook_template_id, status, locale, cost_usd, created_at \
   FROM advertising_creatives \
   WHERE created_at > now() - interval '5 minutes' \
   ORDER BY created_at DESC;"
```

Expected: N + M rows (matching the summary above), with `status` values of `pending_review` or `rejected`, and recent `created_at`.

- [ ] **Step 5: Document smoke-test results**

Update `docs/advertising/dry-run-smoke-test.md`: add a new section "Creative batch generation — first run (YYYY-MM-DD)" with:
- Total generated / rejected / failed counts
- Cost
- Sample URL of one generated creative (for future reference)
- Any unexpected behavior (e.g., one model name needed adjustment)

- [ ] **Step 6: Commit smoke-test results**

```bash
git add docs/advertising/dry-run-smoke-test.md
git commit -m "docs(advertising): smoke-test results for first creative batch"
```

---

## Verification

After all 18 tasks:

- All new tests pass: `npx vitest run src/modules/advertising/creative-gen/clients scripts/advertising`
- Type check passes: `npm run typecheck`
- Pre-launch check still 0 errors: `npm run advertising:pre-launch-check`
- `npm run advertising:generate-launch-batch` produces ≥1 successfully generated creative end-to-end with a publicly fetchable Blob URL
- DB has new rows in `advertising_creatives` with `status` of `pending_review` or `rejected`
- Total cost of first run ≤ $0.20
- No production code path uses Anthropic / Gemini API keys outside the explicit advertising creative generation flow
