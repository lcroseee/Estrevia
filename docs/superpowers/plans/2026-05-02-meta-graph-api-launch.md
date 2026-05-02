# Meta Graph API Adapter + Launch Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-02-meta-graph-api-launch-design.md`

**Goal:** Build the production Meta Graph API adapter that enables uploading approved creatives to Meta as paused ads, with full S4 act-stream support (pause/scale/duplicate/createCampaign/createAdSet); ship publishing infrastructure (CLI + admin endpoint + UI button); generate 20 new creatives across 5 untested templates; reject 2 bad creatives; fix the admin status-filter UX bug.

**Architecture:** New `meta-graph-api/` infrastructure module implements both `MetaApiClient` (creative upload) and `MetaAdClient` (ad management) interfaces with separate classes per concern (`MetaUploadClient`, `MetaAdManagementClient`) plus a shared `MetaGraphApiBase` for HTTP/auth/retry/rate-limit. Wired into the admin approve route, a bulk-publish CLI, an admin endpoint sharing the same service module, and the act-stream runtime via env-gated factory. One-off setup CLI bootstraps the launch Campaign + 2 Ad Sets via API rather than manual UI work.

**Tech Stack:** TypeScript strict, Next.js 16 App Router, Drizzle ORM (Neon Postgres), Vitest, Sentry. Native fetch for Meta Graph API v22.0. Existing Imagen 4 / Gemini integration for creative generation.

---

## File structure

```
src/modules/advertising/meta-graph-api/                     [NEW MODULE]
├── base.ts                                  (Task 1)
├── errors.ts                                (Task 1)
├── types.ts                                 (Task 1)
├── upload-client.ts                         (Task 2)
├── ad-client.ts                             (Task 3)
├── publish-approved-service.ts              (Task 6)
├── index.ts                                 (Task 4)
└── __tests__/
    ├── base.test.ts                         (Task 1)
    ├── errors.test.ts                       (Task 1)
    ├── upload-client.test.ts                (Task 2)
    ├── ad-client.test.ts                    (Task 3)
    ├── integration.test.ts                  (Task 4)
    └── publish-approved-service.test.ts     (Task 6)

src/app/api/admin/creatives/[id]/approve/route.ts           [MODIFY] (Task 5)
src/app/api/admin/creatives/publish-batch/route.ts          [NEW]    (Task 6)
src/app/admin/advertising/creatives/review/page.tsx         [MODIFY] (Task 10)
src/app/admin/advertising/creatives/review/PublishAllButton.tsx [NEW] (Task 10)
src/app/admin/advertising/creatives/review/StatusFilter.tsx [NEW] (Task 10)

src/modules/advertising/act/index.ts                        [MODIFY] (Task 7)
src/modules/advertising/act/meta-marketing.ts               [MODIFY] (Task 3 — extend interface)

scripts/advertising/publish-approved.ts                     [NEW] (Task 6)
scripts/advertising/setup-meta-campaign.ts                  [NEW] (Task 11)
scripts/advertising/reject-bad-creatives.ts                 [NEW] (Task 10)
```

---

## Conventions for all tasks

**Test framework:** Vitest. Tests live in `__tests__/` next to source files. Use `vi.fn()` for fetch mocks. Each test case is wrapped in `describe()` / `it()`.

**Mocking fetch:** Inject via `MetaGraphConfig.fetchImpl` (default = global `fetch`). In tests, pass a `vi.fn()` and assert `mock.calls`.

**TDD cycle:** Write failing test → run to confirm fail → implement minimum → run to confirm pass → commit. No skipping the verify-fail step.

**Commit format:** `<scope>(<area>): <one-line summary>` matching existing repo style. Examples:
- `feat(advertising/meta-graph-api): add MetaGraphApiBase HTTP wrapper`
- `test(advertising/meta-graph-api): cover retry on 5xx`
- `feat(advertising/cli): add publish-approved bulk script`

**Run all tests:** `pnpm test -- --run` (one-shot) or `pnpm test` (watch). For a single test file: `pnpm test -- --run src/path/to/file.test.ts`.

**Typecheck:** `pnpm typecheck` (alias for `tsc --noEmit`). Run before final commit of each task.

**Meta Graph API version:** v22.0. Endpoints reference: https://developers.facebook.com/docs/marketing-api/reference/v22.0. Always send `access_token` as a query param (project convention from `pre-launch-check.ts`).

**Auth:** All admin endpoints require `requireAdmin()` from `@/app/admin/lib/admin-auth` — Clerk JWT + `ADMIN_ALLOWED_EMAILS` allowlist. Never bypass.

**Idempotency:** Where multiple writes might happen (approve race, publish-approved re-run), use `WHERE … RETURNING` UPDATE pattern + `meta_ad_id IS NULL` filter.

---

## Pre-flight checks (do once before kicking off agents)

- [ ] **PF.1** — Verify clean working tree:
  ```bash
  git status --short
  ```
  Expected: empty output.

- [ ] **PF.2** — Pull latest main:
  ```bash
  git pull --ff-only
  ```

- [ ] **PF.3** — Run pre-launch-check (must remain 23/23 throughout):
  ```bash
  pnpm advertising:pre-launch-check
  ```
  Expected: `SUMMARY: 23 passed, 2 warnings, 0 errors`.

- [ ] **PF.4** — Run full test suite to establish baseline:
  ```bash
  pnpm test -- --run
  ```
  Expected: green (1098+ tests passing).

- [ ] **PF.5** — Confirm typecheck baseline:
  ```bash
  pnpm typecheck
  ```
  Expected: no errors.

---

## Task 1: Foundation — types, errors, base HTTP wrapper

**Files:**
- Create: `src/modules/advertising/meta-graph-api/types.ts`
- Create: `src/modules/advertising/meta-graph-api/errors.ts`
- Create: `src/modules/advertising/meta-graph-api/base.ts`
- Create: `src/modules/advertising/meta-graph-api/__tests__/errors.test.ts`
- Create: `src/modules/advertising/meta-graph-api/__tests__/base.test.ts`

**Subagent type:** `backend`

- [ ] **1.1** — Create `types.ts` with shared Meta API response shapes:

```typescript
// src/modules/advertising/meta-graph-api/types.ts

/**
 * Meta Graph API error envelope (v22.0).
 * https://developers.facebook.com/docs/graph-api/guides/error-handling/
 */
export interface MetaErrorEnvelope {
  error: {
    message: string;
    type?: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
    error_user_title?: string;
    error_user_msg?: string;
  };
}

/** Common success response: { id: '...' }. */
export interface MetaIdResponse {
  id: string;
}

/** POST /act_<id>/adimages response. */
export interface MetaAdImagesResponse {
  images: Record<string, { hash: string; url: string }>;
}

/** POST /<ad_id>/copies response. */
export interface MetaCopyResponse {
  copied_ad_id: string;
  ad_object_ids: { ad_id: string }[];
}

/** Rate-limit usage from X-Business-Use-Case-Usage header (parsed JSON). */
export interface MetaUsage {
  call_count: number;       // 0-100, % of limit
  total_cputime: number;
  total_time: number;
  estimated_time_to_regain_access?: number;
}

export interface MetaGraphConfig {
  accessToken: string;
  adAccountId: string;       // 'act_<id>'
  apiVersion?: string;       // default 'v22.0'
  baseUrl?: string;          // default 'https://graph.facebook.com'
  fetchImpl?: typeof fetch;  // injectable for tests
  /** Sleep helper, injectable for tests. Default: setTimeout-based. */
  sleepMs?: (ms: number) => Promise<void>;
}
```

- [ ] **1.2** — Write the failing tests for `errors.ts`:

```typescript
// src/modules/advertising/meta-graph-api/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  MetaApiError,
  MetaAuthError,
  MetaPermissionError,
  MetaRateLimitError,
  MetaValidationError,
  MetaServerError,
  classifyMetaError,
} from '../errors';

describe('classifyMetaError', () => {
  it('returns MetaAuthError for code 190', () => {
    const err = classifyMetaError(401, {
      error: { message: 'Token expired', code: 190, fbtrace_id: 'abc' },
    });
    expect(err).toBeInstanceOf(MetaAuthError);
    expect(err.code).toBe(190);
    expect(err.fbtraceId).toBe('abc');
    expect(err.httpStatus).toBe(401);
  });

  it('returns MetaPermissionError for code 200', () => {
    const err = classifyMetaError(403, {
      error: { message: 'No permission', code: 200 },
    });
    expect(err).toBeInstanceOf(MetaPermissionError);
  });

  it('returns MetaRateLimitError for code 17', () => {
    const err = classifyMetaError(400, {
      error: { message: 'Rate limited', code: 17 },
    });
    expect(err).toBeInstanceOf(MetaRateLimitError);
  });

  it('returns MetaValidationError for code 100', () => {
    const err = classifyMetaError(400, {
      error: { message: 'Bad param', code: 100 },
    });
    expect(err).toBeInstanceOf(MetaValidationError);
  });

  it('returns MetaServerError for HTTP 500-599', () => {
    const err = classifyMetaError(503, {
      error: { message: 'Service unavailable', code: 2 },
    });
    expect(err).toBeInstanceOf(MetaServerError);
  });

  it('falls back to MetaApiError for unknown code', () => {
    const err = classifyMetaError(400, {
      error: { message: 'Unknown', code: 99999 },
    });
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err).not.toBeInstanceOf(MetaValidationError);
  });
});

describe('MetaApiError', () => {
  it('preserves message, code, fbtraceId, httpStatus', () => {
    const e = new MetaApiError('Boom', { code: 100, fbtraceId: 'x', httpStatus: 400 });
    expect(e.message).toBe('Boom');
    expect(e.code).toBe(100);
    expect(e.fbtraceId).toBe('x');
    expect(e.httpStatus).toBe(400);
  });
});
```

- [ ] **1.3** — Run the test, expect FAIL:

```bash
pnpm test -- --run src/modules/advertising/meta-graph-api/__tests__/errors.test.ts
```

Expected: cannot resolve module `../errors`.

- [ ] **1.4** — Implement `errors.ts`:

```typescript
// src/modules/advertising/meta-graph-api/errors.ts
import type { MetaErrorEnvelope } from './types';

interface MetaApiErrorOpts {
  code: number;
  subcode?: number;
  fbtraceId?: string;
  httpStatus: number;
}

export class MetaApiError extends Error {
  readonly code: number;
  readonly subcode?: number;
  readonly fbtraceId?: string;
  readonly httpStatus: number;

  constructor(message: string, opts: MetaApiErrorOpts) {
    super(message);
    this.name = this.constructor.name;
    this.code = opts.code;
    this.subcode = opts.subcode;
    this.fbtraceId = opts.fbtraceId;
    this.httpStatus = opts.httpStatus;
  }
}

export class MetaAuthError extends MetaApiError {}
export class MetaPermissionError extends MetaApiError {}
export class MetaRateLimitError extends MetaApiError {}
export class MetaValidationError extends MetaApiError {}
export class MetaServerError extends MetaApiError {}
export class MetaNetworkError extends MetaApiError {}

const AUTH_CODES = new Set([190, 102, 463]);
const PERMISSION_CODES = new Set([200, 803, 10]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 80004]);
const VALIDATION_CODES = new Set([100, 1487, 1815108, 1487749, 1487472]);

export function classifyMetaError(httpStatus: number, body: MetaErrorEnvelope): MetaApiError {
  const { code, message, fbtrace_id, error_subcode } = body.error;
  const opts: MetaApiErrorOpts = {
    code,
    subcode: error_subcode,
    fbtraceId: fbtrace_id,
    httpStatus,
  };

  if (AUTH_CODES.has(code)) return new MetaAuthError(message, opts);
  if (PERMISSION_CODES.has(code)) return new MetaPermissionError(message, opts);
  if (RATE_LIMIT_CODES.has(code)) return new MetaRateLimitError(message, opts);
  if (VALIDATION_CODES.has(code)) return new MetaValidationError(message, opts);
  if (httpStatus >= 500) return new MetaServerError(message, opts);
  return new MetaApiError(message, opts);
}
```

- [ ] **1.5** — Run the test, expect PASS:

```bash
pnpm test -- --run src/modules/advertising/meta-graph-api/__tests__/errors.test.ts
```

Expected: 7 passed.

- [ ] **1.6** — Write the failing tests for `base.ts`:

```typescript
// src/modules/advertising/meta-graph-api/__tests__/base.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MetaGraphApiBase } from '../base';
import {
  MetaAuthError,
  MetaServerError,
  MetaRateLimitError,
  MetaValidationError,
} from '../errors';

class TestableBase extends MetaGraphApiBase {
  // Expose protected method
  public req<T>(...args: Parameters<MetaGraphApiBase['request']>) {
    return this.request<T>(...args);
  }
}

function makeOkFetch(body: unknown, init: ResponseInit = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200, ...init }));
}

function makeErrFetch(status: number, errorBody: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(errorBody), { status }));
}

describe('MetaGraphApiBase.request', () => {
  it('GETs with access_token query param and parses JSON', async () => {
    const fetchImpl = makeOkFetch({ id: '123', name: 'test' });
    const base = new TestableBase({
      accessToken: 'TOKEN',
      adAccountId: 'act_99',
      apiVersion: 'v22.0',
      fetchImpl,
    });
    const res = await base.req<{ id: string }>('GET', '/me');
    expect(res.id).toBe('123');
    const url = (fetchImpl.mock.calls[0]![0] as URL | string).toString();
    expect(url).toContain('access_token=TOKEN');
    expect(url).toContain('https://graph.facebook.com/v22.0/me');
  });

  it('POSTs JSON body with correct content-type', async () => {
    const fetchImpl = makeOkFetch({ id: 'x' });
    const base = new TestableBase({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await base.req('POST', '/test', { foo: 'bar' });
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"foo":"bar"}');
  });

  it('throws MetaAuthError on 401 with code 190', async () => {
    const fetchImpl = makeErrFetch(401, {
      error: { message: 'Expired', code: 190, fbtrace_id: 'a' },
    });
    const base = new TestableBase({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await expect(base.req('GET', '/me')).rejects.toThrow(MetaAuthError);
  });

  it('throws MetaValidationError on 400 with code 100 and does NOT retry', async () => {
    const fetchImpl = makeErrFetch(400, {
      error: { message: 'Bad', code: 100 },
    });
    const sleepMs = vi.fn(async () => {});
    const base = new TestableBase({
      accessToken: 'T', adAccountId: 'act_1', fetchImpl, sleepMs,
    });
    await expect(base.req('GET', '/me')).rejects.toThrow(MetaValidationError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepMs).not.toHaveBeenCalled();
  });

  it('retries 3 times on 5xx and eventually throws MetaServerError', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'fail', code: 2 } }), { status: 503 }),
    );
    const sleepMs = vi.fn(async () => {});
    const base = new TestableBase({
      accessToken: 'T', adAccountId: 'act_1', fetchImpl, sleepMs,
    });
    await expect(base.req('GET', '/me')).rejects.toThrow(MetaServerError);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // initial + 3 retries
    expect(sleepMs.mock.calls.map((c) => c[0])).toEqual([1000, 2000, 4000]);
  });

  it('succeeds on retry after one 5xx', async () => {
    const responses = [
      new Response(JSON.stringify({ error: { message: 'x', code: 2 } }), { status: 502 }),
      new Response(JSON.stringify({ id: 'OK' }), { status: 200 }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const sleepMs = vi.fn(async () => {});
    const base = new TestableBase({
      accessToken: 'T', adAccountId: 'act_1', fetchImpl, sleepMs,
    });
    const res = await base.req<{ id: string }>('GET', '/me');
    expect(res.id).toBe('OK');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('respects rate-limit header (>75% triggers 60s sleep before next call)', async () => {
    const headers = new Headers({
      'X-Business-Use-Case-Usage': JSON.stringify({
        '<account-id>': [{ call_count: 80, total_cputime: 0, total_time: 0 }],
      }),
    });
    const responses = [
      new Response(JSON.stringify({ id: 'a' }), { status: 200, headers }),
      new Response(JSON.stringify({ id: 'b' }), { status: 200 }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const sleepMs = vi.fn(async () => {});
    const base = new TestableBase({
      accessToken: 'T', adAccountId: 'act_1', fetchImpl, sleepMs,
    });
    await base.req('GET', '/me');
    await base.req('GET', '/me');
    expect(sleepMs).toHaveBeenCalledWith(60_000);
  });

  it('throws MetaRateLimitError immediately when usage >90%', async () => {
    const headers = new Headers({
      'X-Business-Use-Case-Usage': JSON.stringify({
        '<account-id>': [{ call_count: 95, total_cputime: 0, total_time: 0 }],
      }),
    });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200, headers }));
    const base = new TestableBase({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await base.req('GET', '/me'); // first call captures the warning
    await expect(base.req('GET', '/me')).rejects.toThrow(MetaRateLimitError);
  });
});
```

- [ ] **1.7** — Run the test, expect FAIL:

```bash
pnpm test -- --run src/modules/advertising/meta-graph-api/__tests__/base.test.ts
```

Expected: cannot resolve module `../base`.

- [ ] **1.8** — Implement `base.ts`:

```typescript
// src/modules/advertising/meta-graph-api/base.ts
import type { MetaErrorEnvelope, MetaGraphConfig } from './types';
import {
  classifyMetaError,
  MetaApiError,
  MetaRateLimitError,
  MetaServerError,
  MetaNetworkError,
} from './errors';

const DEFAULT_BASE_URL = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v22.0';
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
const RATE_WARN_THRESHOLD = 75;
const RATE_BLOCK_THRESHOLD = 90;
const RATE_COOLDOWN_MS = 60_000;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class MetaGraphApiBase {
  protected readonly accessToken: string;
  protected readonly adAccountId: string;
  protected readonly apiVersion: string;
  protected readonly baseUrl: string;
  protected readonly fetchImpl: typeof fetch;
  protected readonly sleepMs: (ms: number) => Promise<void>;

  /** Last observed call_count (0-100) from X-Business-Use-Case-Usage. */
  private lastUsageCallCount = 0;

  constructor(config: MetaGraphConfig) {
    this.accessToken = config.accessToken;
    this.adAccountId = config.adAccountId;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.sleepMs = config.sleepMs ?? defaultSleep;
  }

  protected async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    // Pre-flight rate-limit check based on previous response usage
    if (this.lastUsageCallCount >= RATE_BLOCK_THRESHOLD) {
      throw new MetaRateLimitError(
        `Local rate-limit guard: usage ${this.lastUsageCallCount}% > ${RATE_BLOCK_THRESHOLD}%`,
        { code: 17, httpStatus: 429 },
      );
    }
    if (this.lastUsageCallCount >= RATE_WARN_THRESHOLD) {
      await this.sleepMs(RATE_COOLDOWN_MS);
      this.lastUsageCallCount = 0;
    }

    const url = this.buildUrl(path);
    const init: RequestInit = {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    };

    return this.requestWithRetry<T>(url, init);
  }

  private buildUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}/${this.apiVersion}${cleanPath}`);
    url.searchParams.set('access_token', this.accessToken);
    return url.toString();
  }

  private async requestWithRetry<T>(url: string, init: RequestInit, attempt = 0): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (e) {
      if (attempt < RETRY_DELAYS_MS.length) {
        await this.sleepMs(RETRY_DELAYS_MS[attempt]!);
        return this.requestWithRetry<T>(url, init, attempt + 1);
      }
      throw new MetaNetworkError(
        e instanceof Error ? e.message : 'Network failure',
        { code: 0, httpStatus: 0 },
      );
    }

    this.captureUsage(response);

    if (response.ok) {
      return (await response.json()) as T;
    }

    const errBody = (await response.json().catch(() => ({
      error: { message: 'Unparseable error', code: 0 },
    }))) as MetaErrorEnvelope;

    const isRetryable = response.status >= 500 || errBody.error.code === 1 || errBody.error.code === 2;
    if (isRetryable && attempt < RETRY_DELAYS_MS.length) {
      await this.sleepMs(RETRY_DELAYS_MS[attempt]!);
      return this.requestWithRetry<T>(url, init, attempt + 1);
    }

    throw classifyMetaError(response.status, errBody);
  }

  private captureUsage(response: Response): void {
    const header = response.headers.get('X-Business-Use-Case-Usage');
    if (!header) return;
    try {
      const parsed = JSON.parse(header) as Record<
        string,
        { call_count: number }[] | undefined
      >;
      const entries = Object.values(parsed).flat();
      const max = Math.max(0, ...entries.filter(Boolean).map((e) => e!.call_count));
      this.lastUsageCallCount = max;
    } catch {
      /* ignore malformed usage header */
    }
  }
}
```

- [ ] **1.9** — Run the test, expect PASS:

```bash
pnpm test -- --run src/modules/advertising/meta-graph-api/__tests__/base.test.ts
```

Expected: 8 passed.

- [ ] **1.10** — Run typecheck:

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **1.11** — Commit:

```bash
git add src/modules/advertising/meta-graph-api/types.ts \
        src/modules/advertising/meta-graph-api/errors.ts \
        src/modules/advertising/meta-graph-api/base.ts \
        src/modules/advertising/meta-graph-api/__tests__/errors.test.ts \
        src/modules/advertising/meta-graph-api/__tests__/base.test.ts

git commit -m "feat(advertising/meta-graph-api): foundation — types, errors, HTTP wrapper

Adds MetaGraphApiBase with retry on 5xx (3× exponential backoff),
rate-limit detection via X-Business-Use-Case-Usage header (warn >75%,
block >90%), and classifyMetaError() that maps Meta error codes to
typed exceptions (auth/permission/rate-limit/validation/server).

Tests: 15 covering request shape, retry, rate-limit gating, error
classification."
```

---

## Task 2: MetaUploadClient — 3-step ad creation

**Files:**
- Create: `src/modules/advertising/meta-graph-api/upload-client.ts`
- Create: `src/modules/advertising/meta-graph-api/__tests__/upload-client.test.ts`

**Subagent type:** `backend`
**Depends on:** Task 1 (types only)

**Meta API references:**
- AdImage: https://developers.facebook.com/docs/marketing-api/reference/ad-image
- AdCreative: https://developers.facebook.com/docs/marketing-api/reference/ad-creative
- Ad: https://developers.facebook.com/docs/marketing-api/reference/adgroup

**Required env at runtime:** `META_LAUNCH_ADSET_ID_EN`, `META_LAUNCH_ADSET_ID_ES` (set by Task 11 setup script). Read inside `uploadCreative` via `process.env`.

- [ ] **2.1** — Write the failing test:

```typescript
// src/modules/advertising/meta-graph-api/__tests__/upload-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaUploadClient } from '../upload-client';

const ADSET_EN = 'as_en_999';
const ADSET_ES = 'as_es_888';

beforeEach(() => {
  process.env.META_LAUNCH_ADSET_ID_EN = ADSET_EN;
  process.env.META_LAUNCH_ADSET_ID_ES = ADSET_ES;
});

function chainedFetch(...responses: Response[]) {
  const queue = [...responses];
  return vi.fn(async () => {
    const r = queue.shift();
    if (!r) throw new Error('Unexpected fetch call');
    return r;
  });
}

describe('MetaUploadClient.uploadCreative', () => {
  it('runs 3 sequential calls and returns ad_id', async () => {
    const fetchImpl = chainedFetch(
      // 1. /adimages
      new Response(JSON.stringify({ images: { abc: { hash: 'IMGHASH', url: 'u' } } })),
      // 2. /adcreatives
      new Response(JSON.stringify({ id: 'creative_1' })),
      // 3. /ads
      new Response(JSON.stringify({ id: 'ad_42' })),
    );
    const client = new MetaUploadClient({
      accessToken: 'T', adAccountId: 'act_1', fetchImpl,
    });

    const result = await client.uploadCreative({
      asset_url: 'https://blob/x.png',
      copy: 'Sidereal accuracy',
      cta: 'Calculate your chart',
      locale: 'en',
      tracking: {
        utm_source: 'meta', utm_medium: 'image',
        utm_campaign: 'estrevia_launch_en', utm_content: 'cb_1', utm_term: 'identity_reveal',
      },
    });

    expect(result).toEqual({ creative_id: 'creative_1', ad_id: 'ad_42' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    // /ads call MUST set status=PAUSED
    const adsBody = JSON.parse((fetchImpl.mock.calls[2]![1] as RequestInit).body as string);
    expect(adsBody.status).toBe('PAUSED');
    expect(adsBody.adset_id).toBe(ADSET_EN);
    expect(adsBody.creative.creative_id).toBe('creative_1');
  });

  it('uses ES adset id when locale=es', async () => {
    const fetchImpl = chainedFetch(
      new Response(JSON.stringify({ images: { x: { hash: 'h', url: 'u' } } })),
      new Response(JSON.stringify({ id: 'cr2' })),
      new Response(JSON.stringify({ id: 'ad_es' })),
    );
    const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await client.uploadCreative({
      asset_url: 'https://blob/y.png', copy: 'x', cta: 'Calcula', locale: 'es',
      tracking: { utm_source: 'meta', utm_medium: 'image', utm_campaign: 'estrevia_launch_es', utm_content: 'b', utm_term: 'authority' },
    });
    const adsBody = JSON.parse((fetchImpl.mock.calls[2]![1] as RequestInit).body as string);
    expect(adsBody.adset_id).toBe(ADSET_ES);
  });

  it('appends UTM params to link_url in adcreative', async () => {
    const fetchImpl = chainedFetch(
      new Response(JSON.stringify({ images: { x: { hash: 'h', url: 'u' } } })),
      new Response(JSON.stringify({ id: 'cr3' })),
      new Response(JSON.stringify({ id: 'ad3' })),
    );
    const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await client.uploadCreative({
      asset_url: 'https://blob/z.png', copy: 'x', cta: 'Try', locale: 'en',
      tracking: { utm_source: 'meta', utm_medium: 'image', utm_campaign: 'estrevia_launch_en', utm_content: 'cb', utm_term: 'rarity' },
    });
    const creativeBody = JSON.parse((fetchImpl.mock.calls[1]![1] as RequestInit).body as string);
    const linkData = creativeBody.object_story_spec.link_data;
    expect(linkData.link).toContain('utm_source=meta');
    expect(linkData.link).toContain('utm_campaign=estrevia_launch_en');
    expect(linkData.link).toContain('utm_term=rarity');
  });

  it('propagates error if /adimages fails (no orphan)', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'bad', code: 100 } }), { status: 400 },
    ));
    const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await expect(
      client.uploadCreative({
        asset_url: 'https://blob/x.png', copy: 'x', cta: 'y', locale: 'en',
        tracking: { utm_source: 'meta', utm_medium: 'image', utm_campaign: 'c', utm_content: 'cb', utm_term: 't' },
      }),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws if META_LAUNCH_ADSET_ID_EN missing', async () => {
    delete process.env.META_LAUNCH_ADSET_ID_EN;
    const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl: vi.fn() });
    await expect(
      client.uploadCreative({
        asset_url: 'u', copy: 'c', cta: 'x', locale: 'en',
        tracking: { utm_source: 'meta', utm_medium: 'image', utm_campaign: 'c', utm_content: 'b', utm_term: 't' },
      }),
    ).rejects.toThrow(/META_LAUNCH_ADSET_ID_EN/);
  });
});
```

- [ ] **2.2** — Run the test, expect FAIL (module missing).

```bash
pnpm test -- --run src/modules/advertising/meta-graph-api/__tests__/upload-client.test.ts
```

- [ ] **2.3** — Implement `upload-client.ts`:

```typescript
// src/modules/advertising/meta-graph-api/upload-client.ts
import type { MetaApiClient } from '@/modules/advertising/creative-gen/upload/meta-upload';
import type { MetaIdResponse, MetaAdImagesResponse } from './types';
import { MetaGraphApiBase } from './base';

const SITE_BASE = 'https://estrevia.app';

export class MetaUploadClient extends MetaGraphApiBase implements MetaApiClient {
  async uploadCreative(opts: {
    asset_url: string;
    copy: string;
    cta: string;
    locale: string;
    tracking: {
      utm_source: string;
      utm_medium: string;
      utm_campaign: string;
      utm_content: string;
      utm_term: string;
    };
  }): Promise<{ creative_id: string; ad_id: string }> {
    const adsetId = this.getAdSetId(opts.locale);

    // Step 1: Upload image (Meta fetches from public URL)
    const imageRes = await this.request<MetaAdImagesResponse>(
      'POST',
      `/${this.adAccountId}/adimages`,
      { url: opts.asset_url },
    );
    const imageHash = Object.values(imageRes.images)[0]?.hash;
    if (!imageHash) {
      throw new Error('Meta /adimages returned no hash');
    }

    // Step 2: Create AdCreative
    const linkUrl = this.buildLinkUrl(opts.tracking);
    const creativeRes = await this.request<MetaIdResponse>(
      'POST',
      `/${this.adAccountId}/adcreatives`,
      {
        name: `creative_${opts.tracking.utm_content}`,
        object_story_spec: {
          link_data: {
            image_hash: imageHash,
            message: opts.copy,
            link: linkUrl,
            name: opts.copy.slice(0, 40),
            call_to_action: {
              type: 'LEARN_MORE',
              value: { link: linkUrl },
            },
          },
        },
      },
    );

    // Step 3: Create Ad (PAUSED)
    const adRes = await this.request<MetaIdResponse>(
      'POST',
      `/${this.adAccountId}/ads`,
      {
        name: `ad_${opts.tracking.utm_content}`,
        adset_id: adsetId,
        creative: { creative_id: creativeRes.id },
        status: 'PAUSED',
      },
    );

    return { creative_id: creativeRes.id, ad_id: adRes.id };
  }

  private getAdSetId(locale: string): string {
    const envKey = locale === 'es' ? 'META_LAUNCH_ADSET_ID_ES' : 'META_LAUNCH_ADSET_ID_EN';
    const id = process.env[envKey];
    if (!id) throw new Error(`Required env var ${envKey} is not set. Run setup-meta-campaign.ts first.`);
    return id;
  }

  private buildLinkUrl(tracking: {
    utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string; utm_term: string;
  }): string {
    const url = new URL('/', SITE_BASE);
    url.searchParams.set('utm_source', tracking.utm_source);
    url.searchParams.set('utm_medium', tracking.utm_medium);
    url.searchParams.set('utm_campaign', tracking.utm_campaign);
    url.searchParams.set('utm_content', tracking.utm_content);
    url.searchParams.set('utm_term', tracking.utm_term);
    return url.toString();
  }
}
```

- [ ] **2.4** — Run the test, expect PASS:

```bash
pnpm test -- --run src/modules/advertising/meta-graph-api/__tests__/upload-client.test.ts
```

Expected: 5 passed.

- [ ] **2.5** — Run typecheck:

```bash
pnpm typecheck
```

- [ ] **2.6** — Commit:

```bash
git add src/modules/advertising/meta-graph-api/upload-client.ts \
        src/modules/advertising/meta-graph-api/__tests__/upload-client.test.ts
git commit -m "feat(advertising/meta-graph-api): MetaUploadClient (3-step upload)

Implements MetaApiClient with sequential calls to Meta Graph API:
1) POST /adimages (Meta fetches from Vercel Blob URL),
2) POST /adcreatives (image_hash + UTM-encoded link),
3) POST /ads (status=PAUSED, attached to env-configured adset_id).

Adset id resolved per-locale from META_LAUNCH_ADSET_ID_{EN,ES} —
both must be set before uploadCreative runs (Task 11 setup script
populates them)."
```

---

## Task 3: MetaAdManagementClient + extend interface

**Files:**
- Create: `src/modules/advertising/meta-graph-api/ad-client.ts`
- Create: `src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts`
- Modify: `src/modules/advertising/act/meta-marketing.ts`

**Subagent type:** `backend`
**Depends on:** Task 1 (types only)

**Meta API references:**
- Ad pause/update: https://developers.facebook.com/docs/marketing-api/reference/adgroup
- AdSet update: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign
- Ad copy: https://developers.facebook.com/docs/marketing-api/reference/adgroup/copies/
- Campaign create: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
- AdSet create + targeting: https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-specs/

- [ ] **3.1** — Read existing `src/modules/advertising/act/meta-marketing.ts` to confirm current interface shape (34 lines, MetaAdClient definition).

- [ ] **3.2** — Extend the interface in `src/modules/advertising/act/meta-marketing.ts` (additive):

```typescript
// src/modules/advertising/act/meta-marketing.ts (after existing MetaAdClient definition)

export interface CreateCampaignOpts {
  name: string;
  objective: 'OUTCOME_TRAFFIC' | 'OUTCOME_AWARENESS';
  status: 'PAUSED';
}

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
  optimizationGoal: 'LINK_CLICKS' | 'LANDING_PAGE_VIEWS';
  billingEvent: 'IMPRESSIONS' | 'LINK_CLICKS';
  status: 'PAUSED';
}
```

Then add 2 method declarations to `MetaAdClient` interface:

```typescript
export interface MetaAdClient {
  pauseAd(adId: string): Promise<void>;
  updateAdSetBudget(adSetId: string, dailyBudgetCents: number): Promise<void>;
  duplicateAd(adId: string, overrides?: Record<string, unknown>): Promise<{ ad_id: string }>;
  // NEW:
  createCampaign(opts: CreateCampaignOpts): Promise<{ campaign_id: string }>;
  createAdSet(opts: CreateAdSetOpts): Promise<{ adset_id: string }>;
}
```

- [ ] **3.3** — Update existing mock in `src/modules/advertising/__tests__/mocks/meta-api.ts` to add stubs for the 2 new methods (so existing tests still type-check). Example:

```typescript
// in MockMetaApi class
async createCampaign(_opts: CreateCampaignOpts) {
  return { campaign_id: 'mock_campaign_1' };
}
async createAdSet(_opts: CreateAdSetOpts) {
  return { adset_id: 'mock_adset_1' };
}
```

- [ ] **3.4** — Run full test suite to ensure interface change didn't break anything:

```bash
pnpm test -- --run
pnpm typecheck
```

Expected: green.

- [ ] **3.5** — Write the failing tests for `ad-client.ts`:

```typescript
// src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MetaAdManagementClient } from '../ad-client';

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}
function chainedFetch(...resps: Response[]) {
  const q = [...resps];
  return vi.fn(async () => q.shift() ?? new Response('', { status: 500 }));
}

describe('MetaAdManagementClient', () => {
  describe('pauseAd', () => {
    it('POSTs status=PAUSED to /<ad_id>', async () => {
      const fetchImpl = chainedFetch(ok({ success: true }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      await client.pauseAd('ad_99');
      const url = fetchImpl.mock.calls[0]![0] as string;
      expect(url).toContain('/v22.0/ad_99');
      const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
      expect(body).toEqual({ status: 'PAUSED' });
    });
  });

  describe('updateAdSetBudget', () => {
    it('POSTs daily_budget in cents to /<adset_id>', async () => {
      const fetchImpl = chainedFetch(ok({ success: true }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      await client.updateAdSetBudget('as_5', 1500);
      const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
      expect(body).toEqual({ daily_budget: 1500 });
    });
  });

  describe('duplicateAd', () => {
    it('POSTs to /<ad_id>/copies and returns new ad_id', async () => {
      const fetchImpl = chainedFetch(ok({ copied_ad_id: 'ad_new', ad_object_ids: [{ ad_id: 'ad_new' }] }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.duplicateAd('ad_orig');
      expect(res).toEqual({ ad_id: 'ad_new' });
      const url = fetchImpl.mock.calls[0]![0] as string;
      expect(url).toContain('/ad_orig/copies');
    });
  });

  describe('createCampaign', () => {
    it('POSTs to /act_X/campaigns with required fields and returns campaign_id', async () => {
      const fetchImpl = chainedFetch(ok({ id: 'cmp_42' }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.createCampaign({
        name: 'Estrevia Launch',
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
      });
      expect(res).toEqual({ campaign_id: 'cmp_42' });
      const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.special_ad_categories).toEqual([]);
      expect(body.objective).toBe('OUTCOME_TRAFFIC');
    });
  });

  describe('createAdSet', () => {
    it('POSTs to /act_X/adsets with targeting JSON-encoded and budget in cents', async () => {
      const fetchImpl = chainedFetch(ok({ id: 'as_77' }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.createAdSet({
        campaignId: 'cmp_1',
        name: 'EN — Launch',
        locale: 'en',
        dailyBudgetCents: 500,
        targeting: { countries: ['US', 'CA'], ageMin: 18, ageMax: 45 },
        optimizationGoal: 'LINK_CLICKS',
        billingEvent: 'LINK_CLICKS',
        status: 'PAUSED',
      });
      expect(res).toEqual({ adset_id: 'as_77' });
      const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.daily_budget).toBe(500);
      expect(body.targeting.geo_locations.countries).toEqual(['US', 'CA']);
      expect(body.targeting.age_min).toBe(18);
      expect(body.targeting.age_max).toBe(45);
      expect(body.optimization_goal).toBe('LINK_CLICKS');
    });
  });
});
```

- [ ] **3.6** — Run the test, expect FAIL (module missing).

- [ ] **3.7** — Implement `ad-client.ts`:

```typescript
// src/modules/advertising/meta-graph-api/ad-client.ts
import type { MetaIdResponse, MetaCopyResponse } from './types';
import type {
  MetaAdClient,
  CreateCampaignOpts,
  CreateAdSetOpts,
} from '@/modules/advertising/act/meta-marketing';
import { MetaGraphApiBase } from './base';

export class MetaAdManagementClient extends MetaGraphApiBase implements MetaAdClient {
  async pauseAd(adId: string): Promise<void> {
    await this.request('POST', `/${adId}`, { status: 'PAUSED' });
  }

  async updateAdSetBudget(adSetId: string, dailyBudgetCents: number): Promise<void> {
    await this.request('POST', `/${adSetId}`, { daily_budget: dailyBudgetCents });
  }

  async duplicateAd(adId: string, overrides?: Record<string, unknown>): Promise<{ ad_id: string }> {
    const res = await this.request<MetaCopyResponse>(
      'POST',
      `/${adId}/copies`,
      { deep_copy: false, status_option: 'PAUSED', ...overrides },
    );
    const newId = res.ad_object_ids?.[0]?.ad_id ?? res.copied_ad_id;
    return { ad_id: newId };
  }

  async createCampaign(opts: CreateCampaignOpts): Promise<{ campaign_id: string }> {
    const res = await this.request<MetaIdResponse>(
      'POST',
      `/${this.adAccountId}/campaigns`,
      {
        name: opts.name,
        objective: opts.objective,
        status: opts.status,
        special_ad_categories: [], // required by Meta even when empty
      },
    );
    return { campaign_id: res.id };
  }

  async createAdSet(opts: CreateAdSetOpts): Promise<{ adset_id: string }> {
    const targeting = {
      geo_locations: { countries: opts.targeting.countries },
      age_min: opts.targeting.ageMin,
      age_max: opts.targeting.ageMax,
      ...(opts.targeting.interests
        ? { flexible_spec: [{ interests: opts.targeting.interests.map((i) => ({ id: i, name: i })) }] }
        : {}),
    };
    const res = await this.request<MetaIdResponse>(
      'POST',
      `/${this.adAccountId}/adsets`,
      {
        name: opts.name,
        campaign_id: opts.campaignId,
        daily_budget: opts.dailyBudgetCents,
        optimization_goal: opts.optimizationGoal,
        billing_event: opts.billingEvent,
        targeting,
        status: opts.status,
      },
    );
    return { adset_id: res.id };
  }
}
```

- [ ] **3.8** — Run the test, expect PASS:

```bash
pnpm test -- --run src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts
```

Expected: 5 passed.

- [ ] **3.9** — Run full suite and typecheck:

```bash
pnpm test -- --run
pnpm typecheck
```

- [ ] **3.10** — Commit:

```bash
git add src/modules/advertising/meta-graph-api/ad-client.ts \
        src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts \
        src/modules/advertising/act/meta-marketing.ts \
        src/modules/advertising/__tests__/mocks/meta-api.ts
git commit -m "feat(advertising/meta-graph-api): MetaAdManagementClient (5 methods)

Implements MetaAdClient with: pauseAd, updateAdSetBudget, duplicateAd
(via /copies endpoint), createCampaign, createAdSet (targeting builder).

Extends MetaAdClient interface in act/meta-marketing.ts with the two
new setup methods (additive change). Mock in __tests__/mocks updated
to satisfy the extended interface."
```

---

## Task 4: Factory + integration test

**Files:**
- Create: `src/modules/advertising/meta-graph-api/index.ts`
- Create: `src/modules/advertising/meta-graph-api/__tests__/integration.test.ts`

**Subagent type:** `backend`
**Depends on:** Task 2 (MetaUploadClient), Task 3 (MetaAdManagementClient)

- [ ] **4.1** — Write the failing tests:

```typescript
// src/modules/advertising/meta-graph-api/__tests__/integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMetaUploadClient, createMetaAdClient } from '../index';

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  process.env.META_ACCESS_TOKEN = 'TOKEN';
  process.env.META_AD_ACCOUNT_ID = 'act_1';
  process.env.META_LAUNCH_ADSET_ID_EN = 'as_en';
  process.env.META_LAUNCH_ADSET_ID_ES = 'as_es';
  delete process.env.VITEST;
  process.env.NODE_ENV = 'production';
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe('factory', () => {
  it('createMetaUploadClient reads env and returns client', async () => {
    const client = createMetaUploadClient();
    expect(client).toBeDefined();
    expect(typeof client.uploadCreative).toBe('function');
  });

  it('createMetaAdClient reads env and returns client', async () => {
    const client = createMetaAdClient();
    expect(typeof client.pauseAd).toBe('function');
    expect(typeof client.createCampaign).toBe('function');
  });

  it('throws if META_ACCESS_TOKEN missing', () => {
    delete process.env.META_ACCESS_TOKEN;
    expect(() => createMetaUploadClient()).toThrow(/META_ACCESS_TOKEN/);
  });

  it('throws if running in test mode (VITEST=true)', () => {
    process.env.VITEST = 'true';
    expect(() => createMetaUploadClient()).toThrow(/Use mock in tests/);
  });

  it('throws if NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    expect(() => createMetaUploadClient()).toThrow(/Use mock in tests/);
  });
});

describe('integration: full upload flow through factory client', () => {
  it('runs all 3 calls and returns ad_id', async () => {
    const responses = [
      new Response(JSON.stringify({ images: { x: { hash: 'H', url: 'u' } } })),
      new Response(JSON.stringify({ id: 'cr1' })),
      new Response(JSON.stringify({ id: 'ad1' })),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);

    // Override default fetch via createMetaUploadClient by passing fetchImpl through env-mocked path.
    // For this integration test we use the class directly with injected fetch
    // (factory env validation is covered above).
    const { MetaUploadClient } = await import('../upload-client');
    const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    const res = await client.uploadCreative({
      asset_url: 'u', copy: 'c', cta: 'x', locale: 'en',
      tracking: { utm_source: 'meta', utm_medium: 'image', utm_campaign: 'k', utm_content: 'b', utm_term: 't' },
    });
    expect(res.ad_id).toBe('ad1');
  });
});
```

- [ ] **4.2** — Run the test, expect FAIL.

- [ ] **4.3** — Implement `index.ts`:

```typescript
// src/modules/advertising/meta-graph-api/index.ts
import type { MetaApiClient } from '@/modules/advertising/creative-gen/upload/meta-upload';
import type { MetaAdClient } from '@/modules/advertising/act/meta-marketing';
import { MetaUploadClient } from './upload-client';
import { MetaAdManagementClient } from './ad-client';

export { MetaUploadClient } from './upload-client';
export { MetaAdManagementClient } from './ad-client';
export {
  MetaApiError, MetaAuthError, MetaPermissionError,
  MetaRateLimitError, MetaValidationError, MetaServerError, MetaNetworkError,
} from './errors';
export type { MetaGraphConfig } from './types';

function readEnv(): { accessToken: string; adAccountId: string } {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken) throw new Error('META_ACCESS_TOKEN is not set');
  if (!adAccountId) throw new Error('META_AD_ACCOUNT_ID is not set');
  return { accessToken, adAccountId };
}

function guardTestEnv(): void {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    throw new Error('createMetaUploadClient/createMetaAdClient: Use mock in tests');
  }
}

export function createMetaUploadClient(): MetaApiClient {
  guardTestEnv();
  const env = readEnv();
  return new MetaUploadClient(env);
}

export function createMetaAdClient(): MetaAdClient {
  guardTestEnv();
  const env = readEnv();
  return new MetaAdManagementClient(env);
}
```

- [ ] **4.4** — Run the test, expect PASS:

```bash
pnpm test -- --run src/modules/advertising/meta-graph-api/__tests__/integration.test.ts
```

- [ ] **4.5** — Run full suite + typecheck:

```bash
pnpm test -- --run
pnpm typecheck
```

- [ ] **4.6** — Commit:

```bash
git add src/modules/advertising/meta-graph-api/index.ts \
        src/modules/advertising/meta-graph-api/__tests__/integration.test.ts
git commit -m "feat(advertising/meta-graph-api): factory + integration test

Adds createMetaUploadClient() and createMetaAdClient() factories that
read META_ACCESS_TOKEN and META_AD_ACCOUNT_ID from env, with a hard
guard against being called in test mode (throws to force mock use).
Exports error classes + MetaGraphConfig type via barrel."
```

---

## Task 5: Wire upload into approve route + race fix

**Files:**
- Modify: `src/app/api/admin/creatives/[id]/approve/route.ts`
- Modify or create: `src/app/api/admin/creatives/[id]/approve/__tests__/route.test.ts`

**Subagent type:** `backend`
**Depends on:** Task 2 (MetaUploadClient via factory)

- [ ] **5.1** — Read current `route.ts` (90 lines) to understand existing structure.

- [ ] **5.2** — Write failing tests:

```typescript
// src/app/api/admin/creatives/[id]/approve/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { getDb } from '@/shared/lib/db';

vi.mock('@/app/admin/lib/admin-auth', () => ({
  requireAdmin: async () => ({ email: 'admin@example.com' }),
}));

vi.mock('@/modules/advertising/meta-graph-api', () => ({
  createMetaUploadClient: () => ({
    uploadCreative: vi.fn(async () => ({ creative_id: 'cr1', ad_id: 'ad1' })),
  }),
}));

// Use a known creative id seeded via fixture or stub the DB
// (Adapt to project test conventions — the project may already provide a
// fixture-loading helper. If so, follow its pattern.)

describe('POST /api/admin/creatives/[id]/approve', () => {
  it('returns 409 if creative is not pending_review (idempotency guard)', async () => {
    // Insert a creative with status='approved' in test DB,
    // call POST, expect 409 INVALID_STATUS
    // (Real test depends on existing DB-fixture helper. Follow project patterns.)
  });

  it('updates status to uploaded + sets meta_ad_id on success', async () => {
    // Insert creative with status='pending_review',
    // call POST, expect 200 + DB row updated to status='uploaded' + meta_ad_id='ad1'
  });

  it('keeps status approved + null meta_ad_id if Meta upload throws', async () => {
    // Mock createMetaUploadClient().uploadCreative to throw,
    // expect 500 returned, DB row at status='approved', meta_ad_id IS NULL,
    // so the bulk-publish CLI can pick it up later.
  });
});
```

If the project lacks a DB-fixture helper, the agent should add a minimal one in `src/test-utils/db-fixtures.ts` that inserts/cleans rows. Follow patterns visible in the existing tests for advertising modules.

- [ ] **5.3** — Run the tests, expect FAIL.

- [ ] **5.4** — Modify `route.ts`:

Replace the existing approve route body with:

```typescript
// src/app/api/admin/creatives/[id]/approve/route.ts
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '@/app/admin/lib/admin-auth';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';
import { createMetaUploadClient } from '@/modules/advertising/meta-graph-api';
import { buildTrackingParams } from '@/modules/advertising/creative-gen/upload/meta-upload';
import type { CreativeBundle } from '@/shared/types/advertising';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let approverEmail: string;
  try {
    const admin = await requireAdmin();
    approverEmail = admin.email;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  const { id } = await params;
  const db = getDb();

  // Atomic approve guarded against double-submit
  const updated = await db
    .update(advertisingCreatives)
    .set({
      status: 'approved',
      approvedBy: approverEmail,
      approvedAt: new Date(),
    })
    .where(and(
      eq(advertisingCreatives.id, id),
      eq(advertisingCreatives.status, 'pending_review'),
    ))
    .returning({
      id: advertisingCreatives.id,
      assetUrl: advertisingCreatives.assetUrl,
      copy: advertisingCreatives.copy,
      cta: advertisingCreatives.cta,
      locale: advertisingCreatives.locale,
      hookTemplateId: advertisingCreatives.hookTemplateId,
      assetKind: advertisingCreatives.assetKind,
    });

  if (updated.length === 0) {
    // Either not found OR already approved/rejected/uploaded
    return NextResponse.json(
      { success: false, error: 'INVALID_STATUS' },
      { status: 409 },
    );
  }

  const row = updated[0]!;

  // Build CreativeBundle for buildTrackingParams + uploadCreative
  const bundle: CreativeBundle = {
    id: row.id,
    hook_template_id: row.hookTemplateId,
    asset: { url: row.assetUrl, kind: row.assetKind as 'image' | 'video' },
    copy: row.copy,
    cta: row.cta,
    locale: row.locale as 'en' | 'es',
    status: 'approved',
  };

  try {
    const tracking = buildTrackingParams(bundle);
    const client = createMetaUploadClient();
    const { ad_id } = await client.uploadCreative({
      asset_url: bundle.asset.url,
      copy: bundle.copy,
      cta: bundle.cta,
      locale: bundle.locale,
      tracking,
    });

    await db
      .update(advertisingCreatives)
      .set({ status: 'uploaded', metaAdId: ad_id })
      .where(eq(advertisingCreatives.id, id));

    return NextResponse.json(
      { success: true, data: { id, status: 'uploaded', meta_ad_id: ad_id } },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { area: 'meta-upload', creative_id: id } });
    } catch {
      console.error('[admin/creatives/approve] meta upload failed:', err);
    }
    // DB stays at status='approved', meta_ad_id NULL — picked up by bulk CLI
    return NextResponse.json(
      { success: false, error: 'META_UPLOAD_FAILED', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 502 },
    );
  }
}
```

- [ ] **5.5** — Run the test, expect PASS:

```bash
pnpm test -- --run src/app/api/admin/creatives/[id]/approve/__tests__/route.test.ts
```

- [ ] **5.6** — Run full suite + typecheck.

- [ ] **5.7** — Commit:

```bash
git add src/app/api/admin/creatives/[id]/approve/route.ts \
        src/app/api/admin/creatives/[id]/approve/__tests__/route.test.ts
git commit -m "feat(advertising/admin): approve route auto-uploads to Meta

Atomically updates creative to status='approved' using WHERE+RETURNING,
preventing double-submit. On success, calls createMetaUploadClient()
and sets status='uploaded' + meta_ad_id. On Meta failure, leaves
DB at approved/null so bulk-publish CLI can retry."
```

---

## Task 6: Bulk publish service + CLI + admin endpoint

**Files:**
- Create: `src/modules/advertising/meta-graph-api/publish-approved-service.ts`
- Create: `src/modules/advertising/meta-graph-api/__tests__/publish-approved-service.test.ts`
- Create: `scripts/advertising/publish-approved.ts`
- Create: `src/app/api/admin/creatives/publish-batch/route.ts`
- Create: `src/app/api/admin/creatives/publish-batch/__tests__/route.test.ts`

**Subagent type:** `backend`
**Depends on:** Task 2 (uploadClient via factory), Task 4 (factory exists)

- [ ] **6.1** — Write failing service tests:

```typescript
// src/modules/advertising/meta-graph-api/__tests__/publish-approved-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { publishApprovedService } from '../publish-approved-service';

interface TestRow {
  id: string;
  copy: string;
  cta: string;
  locale: 'en' | 'es';
  assetUrl: string;
  assetKind: 'image' | 'video';
  hookTemplateId: string;
  metaAdId: string | null;
}

function makeDeps(rows: TestRow[]) {
  const updated: { id: string; metaAdId: string }[] = [];
  return {
    selectApproved: async () => rows.filter((r) => !r.metaAdId),
    uploadCreative: vi.fn(async (r: TestRow) => ({ creative_id: 'c', ad_id: `ad_${r.id}` })),
    markUploaded: async (id: string, metaAdId: string) => { updated.push({ id, metaAdId }); },
    findExistingByExcerpt: vi.fn(async () => null),
    auditLog: vi.fn(async () => {}),
    updated,
  };
}

describe('publishApprovedService', () => {
  it('uploads all rows with null meta_ad_id', async () => {
    const rows: TestRow[] = [
      { id: 'a', copy: 'c1', cta: 'x', locale: 'en', assetUrl: 'u1', assetKind: 'image', hookTemplateId: 'en-authority-1', metaAdId: null },
      { id: 'b', copy: 'c2', cta: 'x', locale: 'es', assetUrl: 'u2', assetKind: 'image', hookTemplateId: 'es-rarity-1', metaAdId: null },
    ];
    const deps = makeDeps(rows);
    const result = await publishApprovedService({ ...deps });
    expect(result.uploaded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(deps.updated).toEqual([
      { id: 'a', metaAdId: 'ad_a' },
      { id: 'b', metaAdId: 'ad_b' },
    ]);
  });

  it('skips rows with existing Meta ad found via search guard', async () => {
    const rows: TestRow[] = [
      { id: 'a', copy: 'c1', cta: 'x', locale: 'en', assetUrl: 'u1', assetKind: 'image', hookTemplateId: 'en-authority-1', metaAdId: null },
    ];
    const deps = {
      ...makeDeps(rows),
      findExistingByExcerpt: vi.fn(async () => 'ad_existing'),
    };
    const result = await publishApprovedService({ ...deps });
    expect(result.uploaded).toBe(0);
    expect(result.skipped).toBe(1);
    expect(deps.uploadCreative).not.toHaveBeenCalled();
    expect(deps.updated).toEqual([{ id: 'a', metaAdId: 'ad_existing' }]);
  });

  it('continues past one failure, counts failed', async () => {
    const rows: TestRow[] = [
      { id: 'a', copy: 'c1', cta: 'x', locale: 'en', assetUrl: 'u1', assetKind: 'image', hookTemplateId: 'h1', metaAdId: null },
      { id: 'b', copy: 'c2', cta: 'x', locale: 'es', assetUrl: 'u2', assetKind: 'image', hookTemplateId: 'h2', metaAdId: null },
    ];
    const deps = makeDeps(rows);
    deps.uploadCreative = vi.fn(async (r) => {
      if (r.id === 'a') throw new Error('boom');
      return { creative_id: 'c', ad_id: `ad_${r.id}` };
    });
    const result = await publishApprovedService({ ...deps });
    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('honors limit parameter', async () => {
    const rows: TestRow[] = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`, copy: 'c', cta: 'x', locale: 'en' as const,
      assetUrl: 'u', assetKind: 'image' as const, hookTemplateId: 'h', metaAdId: null,
    }));
    const deps = makeDeps(rows);
    const result = await publishApprovedService({ ...deps, limit: 2 });
    expect(result.uploaded).toBe(2);
  });

  it('dryRun does not call uploadCreative or markUploaded', async () => {
    const rows: TestRow[] = [
      { id: 'a', copy: 'c1', cta: 'x', locale: 'en', assetUrl: 'u1', assetKind: 'image', hookTemplateId: 'h', metaAdId: null },
    ];
    const deps = makeDeps(rows);
    const result = await publishApprovedService({ ...deps, dryRun: true });
    expect(result.uploaded).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.previewed).toBe(1);
    expect(deps.uploadCreative).not.toHaveBeenCalled();
    expect(deps.updated).toEqual([]);
  });
});
```

- [ ] **6.2** — Run, expect FAIL.

- [ ] **6.3** — Implement `publish-approved-service.ts`:

```typescript
// src/modules/advertising/meta-graph-api/publish-approved-service.ts

export interface ApprovedRow {
  id: string;
  copy: string;
  cta: string;
  locale: 'en' | 'es';
  assetUrl: string;
  assetKind: 'image' | 'video';
  hookTemplateId: string;
  metaAdId: string | null;
}

export interface PublishApprovedDeps {
  selectApproved: () => Promise<ApprovedRow[]>;
  uploadCreative: (row: ApprovedRow) => Promise<{ creative_id: string; ad_id: string }>;
  markUploaded: (id: string, metaAdId: string) => Promise<void>;
  /** Search Meta for an existing ad with this creative's body excerpt. Returns ad_id or null. */
  findExistingByExcerpt: (row: ApprovedRow) => Promise<string | null>;
  auditLog: (entry: { kind: string; creative_id: string; meta_ad_id?: string; error?: string }) => Promise<void>;
  /** Optional: print human-readable progress (CLI only). */
  log?: (msg: string) => void;
  limit?: number;
  dryRun?: boolean;
}

export interface PublishApprovedResult {
  uploaded: number;
  failed: number;
  skipped: number;
  previewed: number;
  errors: { id: string; message: string }[];
}

export async function publishApprovedService(
  deps: PublishApprovedDeps,
): Promise<PublishApprovedResult> {
  const all = await deps.selectApproved();
  const slice = deps.limit ? all.slice(0, deps.limit) : all;

  const result: PublishApprovedResult = {
    uploaded: 0, failed: 0, skipped: 0, previewed: 0, errors: [],
  };

  for (const row of slice) {
    try {
      if (deps.dryRun) {
        deps.log?.(`[dry-run] would upload ${row.id} (${row.locale}, ${row.hookTemplateId})`);
        result.previewed++;
        continue;
      }

      const existing = await deps.findExistingByExcerpt(row);
      if (existing) {
        deps.log?.(`[skip] ${row.id} already in Meta as ${existing}`);
        await deps.markUploaded(row.id, existing);
        await deps.auditLog({ kind: 'creative_upload_skipped_existing', creative_id: row.id, meta_ad_id: existing });
        result.skipped++;
        continue;
      }

      const { ad_id } = await deps.uploadCreative(row);
      await deps.markUploaded(row.id, ad_id);
      await deps.auditLog({ kind: 'creative_uploaded', creative_id: row.id, meta_ad_id: ad_id });
      deps.log?.(`[ok] ${row.id} → ${ad_id}`);
      result.uploaded++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await deps.auditLog({ kind: 'creative_upload_failed', creative_id: row.id, error: msg });
      result.failed++;
      result.errors.push({ id: row.id, message: msg });
      deps.log?.(`[fail] ${row.id}: ${msg}`);
    }
  }

  return result;
}
```

- [ ] **6.4** — Run service tests, expect PASS.

- [ ] **6.5** — Implement CLI `scripts/advertising/publish-approved.ts`:

```typescript
// scripts/advertising/publish-approved.ts
import 'dotenv/config';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';
import { createMetaUploadClient } from '@/modules/advertising/meta-graph-api';
import { buildTrackingParams } from '@/modules/advertising/creative-gen/upload/meta-upload';
import {
  publishApprovedService,
  type ApprovedRow,
} from '@/modules/advertising/meta-graph-api/publish-approved-service';

function parseArgs(argv: string[]): { dryRun: boolean; limit?: number } {
  let dryRun = false;
  let limit: number | undefined;
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true;
    if (a.startsWith('--limit=')) limit = Number(a.slice('--limit='.length));
  }
  return { dryRun, limit };
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  const db = getDb();
  const uploadClient = dryRun ? null : createMetaUploadClient();

  const result = await publishApprovedService({
    async selectApproved(): Promise<ApprovedRow[]> {
      const rows = await db
        .select({
          id: advertisingCreatives.id,
          copy: advertisingCreatives.copy,
          cta: advertisingCreatives.cta,
          locale: advertisingCreatives.locale,
          assetUrl: advertisingCreatives.assetUrl,
          assetKind: advertisingCreatives.assetKind,
          hookTemplateId: advertisingCreatives.hookTemplateId,
          metaAdId: advertisingCreatives.metaAdId,
        })
        .from(advertisingCreatives)
        .where(and(
          eq(advertisingCreatives.status, 'approved'),
          isNull(advertisingCreatives.metaAdId),
        ));
      return rows.map((r) => ({
        ...r,
        locale: r.locale as 'en' | 'es',
        assetKind: r.assetKind as 'image' | 'video',
      }));
    },

    async uploadCreative(row) {
      const tracking = buildTrackingParams({
        id: row.id, hook_template_id: row.hookTemplateId,
        asset: { url: row.assetUrl, kind: row.assetKind },
        copy: row.copy, cta: row.cta, locale: row.locale, status: 'approved',
      });
      return uploadClient!.uploadCreative({
        asset_url: row.assetUrl, copy: row.copy, cta: row.cta, locale: row.locale, tracking,
      });
    },

    async markUploaded(id, metaAdId) {
      await db.update(advertisingCreatives)
        .set({ status: 'uploaded', metaAdId })
        .where(eq(advertisingCreatives.id, id));
    },

    async findExistingByExcerpt(row) {
      // Light guard: search Meta for ad whose creative body contains a unique 30-char excerpt.
      // For MVP we skip the search to keep CLI fast — set to always return null.
      // Later improvement: actual GET /act_X/ads?filtering=[creative.body CONTAIN <excerpt>]
      return null;
    },

    async auditLog(entry) {
      // Best-effort: write to DB audit table if present, else stdout.
      // The exact audit insert depends on existing audit/creative-log.ts schema.
      // For first iteration: console.log; agent may upgrade if helper exists.
      console.log(`[audit] ${JSON.stringify(entry)}`);
    },

    log: (m) => console.log(m),
    limit,
    dryRun,
  });

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **6.6** — Add npm script to `package.json`:

```json
"scripts": {
  ...
  "advertising:publish-approved": "tsx scripts/advertising/publish-approved.ts"
}
```

- [ ] **6.7** — Implement admin endpoint:

```typescript
// src/app/api/admin/creatives/publish-batch/route.ts
import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { requireAdmin } from '@/app/admin/lib/admin-auth';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';
import { createMetaUploadClient } from '@/modules/advertising/meta-graph-api';
import { buildTrackingParams } from '@/modules/advertising/creative-gen/upload/meta-upload';
import { publishApprovedService, type ApprovedRow } from '@/modules/advertising/meta-graph-api/publish-approved-service';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  const db = getDb();
  const uploadClient = dryRun ? null : createMetaUploadClient();

  const result = await publishApprovedService({
    async selectApproved(): Promise<ApprovedRow[]> {
      const rows = await db
        .select({
          id: advertisingCreatives.id,
          copy: advertisingCreatives.copy,
          cta: advertisingCreatives.cta,
          locale: advertisingCreatives.locale,
          assetUrl: advertisingCreatives.assetUrl,
          assetKind: advertisingCreatives.assetKind,
          hookTemplateId: advertisingCreatives.hookTemplateId,
          metaAdId: advertisingCreatives.metaAdId,
        })
        .from(advertisingCreatives)
        .where(and(
          eq(advertisingCreatives.status, 'approved'),
          isNull(advertisingCreatives.metaAdId),
        ));
      return rows.map((r) => ({
        ...r, locale: r.locale as 'en' | 'es', assetKind: r.assetKind as 'image' | 'video',
      }));
    },
    async uploadCreative(row) {
      const tracking = buildTrackingParams({
        id: row.id, hook_template_id: row.hookTemplateId,
        asset: { url: row.assetUrl, kind: row.assetKind },
        copy: row.copy, cta: row.cta, locale: row.locale, status: 'approved',
      });
      return uploadClient!.uploadCreative({
        asset_url: row.assetUrl, copy: row.copy, cta: row.cta, locale: row.locale, tracking,
      });
    },
    async markUploaded(id, metaAdId) {
      await db.update(advertisingCreatives)
        .set({ status: 'uploaded', metaAdId })
        .where(eq(advertisingCreatives.id, id));
    },
    async findExistingByExcerpt() { return null; },
    async auditLog(entry) { console.log(`[audit] ${JSON.stringify(entry)}`); },
    limit, dryRun,
  });

  return NextResponse.json(result, { status: 200 });
}
```

- [ ] **6.8** — Write minimal endpoint test (mock `requireAdmin`, `getDb`, `createMetaUploadClient`).

- [ ] **6.9** — Run all tests + typecheck.

- [ ] **6.10** — Commit:

```bash
git add src/modules/advertising/meta-graph-api/publish-approved-service.ts \
        src/modules/advertising/meta-graph-api/__tests__/publish-approved-service.test.ts \
        scripts/advertising/publish-approved.ts \
        src/app/api/admin/creatives/publish-batch/route.ts \
        src/app/api/admin/creatives/publish-batch/__tests__/route.test.ts \
        package.json
git commit -m "feat(advertising/cli): bulk publish-approved service + CLI + endpoint

publishApprovedService is the shared engine — DI-friendly, takes
selectApproved/uploadCreative/markUploaded/findExistingByExcerpt as
deps. Used by both the CLI script and the admin POST endpoint to
avoid logic duplication.

CLI flags: --dry-run, --limit=N. Endpoint accepts ?dry_run=1 and
?limit=N. Both return the same {uploaded, failed, skipped, previewed,
errors} shape."
```

---

## Task 7: Wire act runtime factory

**Files:**
- Modify: `src/modules/advertising/act/index.ts`
- Modify or create: `src/modules/advertising/act/__tests__/index.test.ts`

**Subagent type:** `backend`
**Depends on:** Task 3 (MetaAdManagementClient), Task 4 (factory)

- [ ] **7.1** — Read existing `act/index.ts` to confirm what exports/imports exist.

- [ ] **7.2** — Add `getMetaAdClient()` factory at the bottom of `act/index.ts`:

```typescript
// src/modules/advertising/act/index.ts (append)
import type { MetaAdClient } from './meta-marketing';
import { MockMetaApi } from '@/modules/advertising/__tests__/mocks/meta-api';

/**
 * Returns a real MetaAdManagementClient in production (with DRY_RUN=false),
 * else a mock so dev/test code can run without touching Meta API.
 */
export function getMetaAdClient(): MetaAdClient {
  const isProd = process.env.NODE_ENV === 'production';
  const dryRun = process.env.ADVERTISING_AGENT_DRY_RUN === 'true';
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  if (!isProd || dryRun || isTest) {
    return new MockMetaApi();
  }
  // Lazy import to avoid pulling in real adapter in test bundles
  const { createMetaAdClient } = require('@/modules/advertising/meta-graph-api');
  return createMetaAdClient();
}
```

- [ ] **7.3** — Write test:

```typescript
// src/modules/advertising/act/__tests__/index.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMetaAdClient } from '../index';

const ORIG = { ...process.env };
beforeEach(() => { process.env = { ...ORIG }; });
afterEach(() => { process.env = ORIG; });

describe('getMetaAdClient', () => {
  it('returns mock when NODE_ENV != production', () => {
    process.env.NODE_ENV = 'development';
    const c = getMetaAdClient();
    expect(c.constructor.name).toBe('MockMetaApi');
  });

  it('returns mock when DRY_RUN=true even in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ADVERTISING_AGENT_DRY_RUN = 'true';
    const c = getMetaAdClient();
    expect(c.constructor.name).toBe('MockMetaApi');
  });

  it('returns mock when VITEST=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.ADVERTISING_AGENT_DRY_RUN = 'false';
    process.env.VITEST = 'true';
    const c = getMetaAdClient();
    expect(c.constructor.name).toBe('MockMetaApi');
  });
});
```

(We do NOT directly test the production path here — that requires unmocking + actual env, which is asserted in Task 4 integration test.)

- [ ] **7.4** — Run test, expect PASS.

- [ ] **7.5** — Audit existing call sites in `act/pause.ts`, `act/scale.ts`, `act/duplicate.ts`. Replace any direct `new MockMetaApi()` instantiation in **production code paths** (not tests) with `getMetaAdClient()`. Tests stay using the mock directly via DI parameter.

- [ ] **7.6** — Run full suite + typecheck.

- [ ] **7.7** — Commit:

```bash
git add src/modules/advertising/act/index.ts \
        src/modules/advertising/act/__tests__/index.test.ts \
        src/modules/advertising/act/{pause,scale,duplicate}.ts
git commit -m "feat(advertising/act): runtime factory for MetaAdClient

getMetaAdClient() returns mock in dev/test/DRY_RUN paths and the
real MetaAdManagementClient in production with DRY_RUN=false.
Lazy-requires the real client so test bundles never load the real
adapter code."
```

---

## Task 8: Generate creatives — identity-reveal-2 + identity-reveal-6

**Files:**
- (no code changes) — runs existing `npm run advertising:generate-launch-batch` with target flags
- Append run notes to: `docs/advertising/creative-batch-2026-05-02.md` (NEW)

**Subagent type:** `meta-ads`
**Depends on:** none

- [ ] **8.1** — Verify the targeted batch CLI flags. Actual flags (per `parseCliArgs` in `scripts/advertising/generate-launch-batch.ts`):
- `--templates=<comma-separated-ids>` (plural)
- `--samples=<n>`
- locale is inferred from template ID prefix (`en-` / `es-`)
- optional `--model=fast|ultra` (default ultra @ $0.06/img)

Template IDs in `hooks-{en,es}.ts` are prefixed: e.g. `en-identity-reveal-2`, `es-identity-reveal-2`.

- [ ] **8.2** — Run a single batch (4 templates × 2 samples = 8 ads):

```bash
npx tsx scripts/advertising/generate-launch-batch.ts \
  --templates=en-identity-reveal-2,es-identity-reveal-2,en-identity-reveal-6,es-identity-reveal-6 \
  --samples=2
```

Expected: 8 rows in `advertising_creatives` with `status='pending_review'`. Total Gemini cost ~$0.48.

- [ ] **8.3** — Verify in DB:

```bash
npx tsx scripts/advertising/count-creatives.ts
```

Expected: pending_review count went up by 8.

- [ ] **8.4** — Append a section to `docs/advertising/creative-batch-2026-05-02.md`:

```markdown
## Batch A — identity_reveal expansion (2026-05-02)

Templates: `identity-reveal-2` ("most apps never updated"), `identity-reveal-6` ("80% have a different sun sign").

| Template | EN | ES | Cost |
|---|---|---|---|
| identity-reveal-2 | 2 | 2 | ~$0.24 |
| identity-reveal-6 | 2 | 2 | ~$0.24 |

Total: 8 ads, ~$0.48 Gemini spend. All in `pending_review` awaiting founder approval.
```

- [ ] **8.5** — Commit:

```bash
git add docs/advertising/creative-batch-2026-05-02.md
git commit -m "docs(advertising): batch A creative gen run (identity-reveal -2 -6)"
```

---

## Task 9: Generate creatives — authority-3 + rarity-3 + rarity-5

**Files:**
- (no code changes)
- Append to: `docs/advertising/creative-batch-2026-05-02.md`

**Subagent type:** `meta-ads`
**Depends on:** none

- [ ] **9.1** — Run a single batch (6 templates × 2 samples = 12 ads). CLI flags as documented in Task 8.1.

```bash
npx tsx scripts/advertising/generate-launch-batch.ts \
  --templates=en-authority-3,es-authority-3,en-rarity-3,es-rarity-3,en-rarity-5,es-rarity-5 \
  --samples=2
```

Expected: 12 new rows pending_review. Cost ~$0.72.

- [ ] **9.2** — Verify count via `count-creatives.ts`.

- [ ] **9.3** — Append to doc:

```markdown
## Batch B — authority + rarity expansion (2026-05-02)

| Template | EN | ES | Cost |
|---|---|---|---|
| authority-3 (Lahiri ayanamsa) | 2 | 2 | ~$0.24 |
| rarity-3 (Cosmic Passport showcase) | 2 | 2 | ~$0.24 |
| rarity-5 (sharing mechanic) | 2 | 2 | ~$0.24 |

Total: 12 ads, ~$0.72 Gemini spend. All in `pending_review` awaiting founder approval.
```

- [ ] **9.4** — Commit:

```bash
git add docs/advertising/creative-batch-2026-05-02.md
git commit -m "docs(advertising): batch B creative gen run (authority-3, rarity-3, rarity-5)"
```

---

## Task 10: Admin UX — status filter + Publish button + reject 2 bad

**Files:**
- Modify: `src/app/admin/advertising/creatives/review/page.tsx`
- Create: `src/app/admin/advertising/creatives/review/StatusFilter.tsx`
- Create: `src/app/admin/advertising/creatives/review/PublishAllButton.tsx`
- Create: `scripts/advertising/reject-bad-creatives.ts`
- Add to existing: `src/app/admin/advertising/creatives/review/__tests__/page.test.tsx` (if exists, else create)

**Subagent type:** `frontend`
**Depends on:** Task 6 (publish-batch endpoint must exist for the button to call)

- [ ] **10.1** — Read current `page.tsx` (90 lines).

- [ ] **10.2** — Update `page.tsx` to read `?status=…` from search params:

```typescript
// src/app/admin/advertising/creatives/review/page.tsx
import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';
import type { AdvertisingCreative } from '@/shared/lib/schema';
import type { SafetyCheckResult } from '@/shared/types/advertising';
import { CreativeCard } from './CreativeCard';
import { BulkApproveButton } from './BulkApproveButton';
import { StatusFilter } from './StatusFilter';
import { PublishAllButton } from './PublishAllButton';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Creative Review | Estrevia Admin',
};

const ALL_STATUSES = [
  'pending_review', 'approved', 'uploaded', 'live', 'paused', 'rejected',
] as const;
type StatusKey = typeof ALL_STATUSES[number];

function computeScore(creative: AdvertisingCreative): number {
  const checks = (creative.safetyChecks ?? []) as SafetyCheckResult[];
  if (!checks.length) return 0;
  return checks.filter((c) => c.passed).length / checks.length;
}

export default async function CreativeReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const requested = sp.status ?? 'pending_review';
  const showAll = requested === 'all';
  const filter = (ALL_STATUSES as readonly string[]).includes(requested)
    ? (requested as StatusKey)
    : 'pending_review';

  const db = getDb();

  const rows = showAll
    ? await db.select().from(advertisingCreatives).orderBy(desc(advertisingCreatives.createdAt)).limit(200)
    : await db.select().from(advertisingCreatives).where(eq(advertisingCreatives.status, filter)).orderBy(desc(advertisingCreatives.createdAt)).limit(200);

  const sortedByScore = [...rows].sort((a, b) => computeScore(b) - computeScore(a));
  const top6Ids = filter === 'pending_review' ? sortedByScore.slice(0, 6).map((c) => c.id) : [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Creative Review</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {rows.length} creative{rows.length !== 1 ? 's' : ''} ({showAll ? 'all statuses' : filter})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusFilter current={showAll ? 'all' : filter} />
          {filter === 'approved' && <PublishAllButton />}
          {filter === 'pending_review' && top6Ids.length > 0 && (
            <BulkApproveButton ids={top6Ids} label={`Approve top ${top6Ids.length} by score`} />
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-white/30">
          <p className="text-4xl mb-3">∅</p>
          <p className="text-sm">No creatives match this filter</p>
        </div>
      ) : (
        <ul
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Creatives"
        >
          {rows.map((creative) => (
            <li key={creative.id}>
              <CreativeCard creative={creative} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **10.3** — Implement `StatusFilter.tsx` (client component):

```tsx
// src/app/admin/advertising/creatives/review/StatusFilter.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const OPTIONS = [
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'uploaded', label: 'Uploaded (paused in Meta)' },
  { value: 'live', label: 'Live' },
  { value: 'paused', label: 'Paused' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

export function StatusFilter({ current }: { current: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <select
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(sp);
        next.set('status', e.target.value);
        router.push(`?${next.toString()}`);
      }}
      className="bg-black/40 border border-white/10 text-white text-sm rounded px-2 py-1"
      aria-label="Filter by status"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
```

- [ ] **10.4** — Implement `PublishAllButton.tsx`:

```tsx
// src/app/admin/advertising/creatives/review/PublishAllButton.tsx
'use client';

import { useState } from 'react';

export function PublishAllButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function go(dryRun = false) {
    setBusy(true);
    setResult(null);
    try {
      const url = `/api/admin/creatives/publish-batch${dryRun ? '?dry_run=1' : ''}`;
      const res = await fetch(url, { method: 'POST' });
      const json = await res.json();
      setResult(`uploaded=${json.uploaded ?? 0} failed=${json.failed ?? 0} skipped=${json.skipped ?? 0} previewed=${json.previewed ?? 0}`);
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => go(true)}
        disabled={busy}
        className="text-sm rounded px-3 py-1 border border-white/10 text-white/80 hover:bg-white/5 disabled:opacity-50"
      >
        Dry-run
      </button>
      <button
        onClick={() => go(false)}
        disabled={busy}
        className="text-sm rounded px-3 py-1 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? 'Publishing…' : 'Publish all approved'}
      </button>
      {result && <span className="text-xs text-white/60">{result}</span>}
    </div>
  );
}
```

- [ ] **10.5** — Update existing tests for `page.tsx` if they exist (they were not seen during exploration; if absent, skip).

- [ ] **10.6** — Implement `scripts/advertising/reject-bad-creatives.ts`:

```typescript
// scripts/advertising/reject-bad-creatives.ts
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';

const BAD_IDS = [
  'QgVH83CNEv1unzbRdOKJC', // EN authority-1, sky artifact
  'V8a1sQF5SwR1P-OGOIrfo', // ES identity-reveal-3, off-prompt planet collage
];

async function main() {
  const db = getDb();
  const existing = await db
    .select({ id: advertisingCreatives.id, status: advertisingCreatives.status })
    .from(advertisingCreatives)
    .where(inArray(advertisingCreatives.id, BAD_IDS));

  console.log('Found:', existing);

  await db
    .update(advertisingCreatives)
    .set({ status: 'rejected' })
    .where(inArray(advertisingCreatives.id, BAD_IDS));

  const after = await db
    .select({ id: advertisingCreatives.id, status: advertisingCreatives.status })
    .from(advertisingCreatives)
    .where(inArray(advertisingCreatives.id, BAD_IDS));

  console.log('After:', after);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **10.7** — Run reject script:

```bash
npx tsx scripts/advertising/reject-bad-creatives.ts
```

Expected output: both rows transition from `approved` → `rejected`.

- [ ] **10.8** — Run full suite + typecheck.

- [ ] **10.9** — Manually verify in browser: open `/admin/advertising/creatives/review?status=approved` → see remaining approved (15 - 0 from batches not yet approved). Open `?status=rejected` → see the 2 bad ones. Open `?status=all` → see everything.

- [ ] **10.10** — Commit:

```bash
git add src/app/admin/advertising/creatives/review/page.tsx \
        src/app/admin/advertising/creatives/review/StatusFilter.tsx \
        src/app/admin/advertising/creatives/review/PublishAllButton.tsx \
        scripts/advertising/reject-bad-creatives.ts
git commit -m "feat(admin/advertising): status filter + publish button; reject 2 bad

Review page now reads ?status=… (pending_review|approved|uploaded|
live|paused|rejected|all), defaults to pending_review. Adds
StatusFilter dropdown client component and PublishAllButton that
calls /api/admin/creatives/publish-batch with dry-run + real modes.

reject-bad-creatives.ts is a one-off SQL helper that flipped two
known-bad creatives (sky-artifact authority-1 EN; off-prompt
identity-reveal-3 ES) to status='rejected' so they will not be
picked up by bulk-publish."
```

---

## Task 11: Setup Meta Campaign + AdSets

**Files:**
- Create: `scripts/advertising/setup-meta-campaign.ts`
- Create: `scripts/advertising/__tests__/setup-meta-campaign.test.ts`

**Subagent type:** `backend`
**Depends on:** Task 3 (createCampaign + createAdSet methods)

- [ ] **11.1** — Write failing test:

```typescript
// scripts/advertising/__tests__/setup-meta-campaign.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runSetup } from '../setup-meta-campaign';

describe('runSetup', () => {
  it('creates campaign + 2 adsets and returns IDs', async () => {
    const adClient = {
      createCampaign: vi.fn(async () => ({ campaign_id: 'cmp_X' })),
      createAdSet: vi.fn(async (opts) => ({ adset_id: opts.locale === 'en' ? 'as_en_X' : 'as_es_X' })),
      pauseAd: vi.fn(),
      updateAdSetBudget: vi.fn(),
      duplicateAd: vi.fn(),
    };
    const result = await runSetup({ adClient, dailyBudgetCentsEn: 500, dailyBudgetCentsEs: 500 });
    expect(result).toEqual({ campaign_id: 'cmp_X', adset_id_en: 'as_en_X', adset_id_es: 'as_es_X' });
    expect(adClient.createCampaign).toHaveBeenCalledOnce();
    expect(adClient.createAdSet).toHaveBeenCalledTimes(2);
    const enCall = adClient.createAdSet.mock.calls.find((c) => c[0].locale === 'en')![0];
    expect(enCall.targeting.countries).toContain('US');
    const esCall = adClient.createAdSet.mock.calls.find((c) => c[0].locale === 'es')![0];
    expect(esCall.targeting.countries).toContain('MX');
  });
});
```

- [ ] **11.2** — Run, expect FAIL.

- [ ] **11.3** — Implement `scripts/advertising/setup-meta-campaign.ts`:

```typescript
// scripts/advertising/setup-meta-campaign.ts
import 'dotenv/config';
import { createMetaAdClient } from '@/modules/advertising/meta-graph-api';
import type { MetaAdClient } from '@/modules/advertising/act/meta-marketing';

const EN_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'IE', 'NZ'];
const ES_COUNTRIES = ['MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY'];

interface SetupOpts {
  adClient: MetaAdClient;
  campaignName?: string;
  dailyBudgetCentsEn: number;
  dailyBudgetCentsEs: number;
  ageMin?: number;
  ageMax?: number;
}

interface SetupResult {
  campaign_id: string;
  adset_id_en: string;
  adset_id_es: string;
}

export async function runSetup(opts: SetupOpts): Promise<SetupResult> {
  const { adClient } = opts;
  const ageMin = opts.ageMin ?? 18;
  const ageMax = opts.ageMax ?? 45;

  const { campaign_id } = await adClient.createCampaign({
    name: opts.campaignName ?? 'Estrevia Launch — Sidereal Astrology',
    objective: 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
  });

  const en = await adClient.createAdSet({
    campaignId: campaign_id,
    name: 'EN — Launch — Sidereal interest',
    locale: 'en',
    dailyBudgetCents: opts.dailyBudgetCentsEn,
    targeting: { countries: EN_COUNTRIES, ageMin, ageMax },
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'LINK_CLICKS',
    status: 'PAUSED',
  });

  const es = await adClient.createAdSet({
    campaignId: campaign_id,
    name: 'ES — Launch — Astrología sidérea',
    locale: 'es',
    dailyBudgetCents: opts.dailyBudgetCentsEs,
    targeting: { countries: ES_COUNTRIES, ageMin, ageMax },
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'LINK_CLICKS',
    status: 'PAUSED',
  });

  return { campaign_id, adset_id_en: en.adset_id, adset_id_es: es.adset_id };
}

async function main() {
  const adClient = createMetaAdClient();
  const result = await runSetup({
    adClient,
    dailyBudgetCentsEn: 500, // $5/day
    dailyBudgetCentsEs: 500, // $5/day
  });

  console.log('\n=== Setup complete ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('\n=== Run these commands to add IDs to Vercel production env ===\n');
  console.log(`vercel env add META_LAUNCH_CAMPAIGN_ID production  # value: ${result.campaign_id}`);
  console.log(`vercel env add META_LAUNCH_ADSET_ID_EN production  # value: ${result.adset_id_en}`);
  console.log(`vercel env add META_LAUNCH_ADSET_ID_ES production  # value: ${result.adset_id_es}`);
  console.log('\nThen redeploy: vercel --prod\n');
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **11.4** — Run test, expect PASS.

- [ ] **11.5** — Run full suite + typecheck.

- [ ] **11.6** — Commit:

```bash
git add scripts/advertising/setup-meta-campaign.ts \
        scripts/advertising/__tests__/setup-meta-campaign.test.ts
git commit -m "feat(advertising/cli): setup-meta-campaign one-off bootstrap

Creates a paused launch Campaign + EN/ES Ad Sets via Meta API.
Targeting: EN — US/GB/CA/AU/IE/NZ; ES — 18 LATAM countries.
Budgets: \$5/day each (10/day total, well under 20/day spend cap).
Optimization: LINK_CLICKS, billing on LINK_CLICKS.

Outputs returned IDs and prints 3 vercel env add commands the
founder pastes to set META_LAUNCH_CAMPAIGN_ID, _ADSET_ID_EN,
_ADSET_ID_ES — followed by vercel --prod redeploy."
```

---

## Final integration smoke (manual, founder-driven)

After all 11 tasks merge to main:

- [ ] **F.1** — Verify clean main:

```bash
git checkout main && git pull --ff-only
git status --short  # expected empty
```

- [ ] **F.2** — Run full test suite:

```bash
pnpm test -- --run
pnpm typecheck
pnpm advertising:pre-launch-check  # still 23/23
```

- [ ] **F.3** — Run setup script (creates Meta Campaign + 2 AdSets):

```bash
npx tsx scripts/advertising/setup-meta-campaign.ts
```

Capture the printed `vercel env add` commands.

- [ ] **F.4** — Add IDs to Vercel production env:

```bash
vercel env add META_LAUNCH_CAMPAIGN_ID production   # paste cmp_X
vercel env add META_LAUNCH_ADSET_ID_EN production   # paste as_en_X
vercel env add META_LAUNCH_ADSET_ID_ES production   # paste as_es_X
```

- [ ] **F.5** — Redeploy production:

```bash
vercel --prod
```

- [ ] **F.6** — In admin UI: review and approve the 20 new pending creatives at `/admin/advertising/creatives/review?status=pending_review`. Each `/api/admin/creatives/[id]/approve` will auto-upload to Meta on success.

- [ ] **F.7** — If any auto-upload failed mid-approval (visible at `?status=approved` with `meta_ad_id IS NULL`), retry via:

```bash
pnpm advertising:publish-approved -- --dry-run
```

Inspect output → looks correct → run for real:

```bash
pnpm advertising:publish-approved -- --limit=1
```

- [ ] **F.8** — Open Meta Ads Manager and verify the first uploaded ad:
  - Status = PAUSED
  - Asset image renders correctly
  - Copy + CTA fields display correctly
  - Link in the ad has all UTM params (`utm_source=meta`, `utm_campaign=estrevia_launch_<locale>`, etc.)
  - Ad belongs to the correct AdSet (EN or ES) under the launch Campaign

- [ ] **F.9** — If F.8 OK, run full bulk:

```bash
pnpm advertising:publish-approved
```

Or click **Publish all approved** in `/admin/advertising/creatives/review?status=approved`.

- [ ] **F.10** — Verify in Meta Ads Manager that 35 paused ads now exist (15 existing approved minus 0 problematic + 20 new approved from Tasks 8/9 minus any rejected during F.6).

- [ ] **F.11** — Founder un-pauses 6-12 best ads in Meta Ads Manager UI. The $20/day cap is in effect so even all-on is bounded.

- [ ] **F.12** — Ads are LIVE. DRY_RUN remains `true` for at least 24-48h while the agent observes (telegram alerts only). Day-7 review routine (`trig_012WMFuy4qxchNRKhtu14YUu`) will fire on 2026-05-09 14:00 UTC and post a manual checklist as a GitHub issue.

---

## Acceptance criteria

(Same as Spec §12 — re-listed here for executing-plans verification.)

1. `pnpm test -- --run` green.
2. `pnpm typecheck` passes.
3. `pnpm advertising:pre-launch-check` still 23/23.
4. `MetaUploadClient` and `MetaAdManagementClient` implement the interfaces (TS compiler enforces).
5. `setup-meta-campaign.ts` runs end-to-end against Meta API and creates Campaign + 2 Ad Sets visible in Meta Business Manager UI (PAUSED).
6. After founder runs `vercel env add` and redeploys, `pnpm advertising:publish-approved -- --dry-run` prints correct preview.
7. One creative successfully appears in Meta Ads Manager as paused with all fields correct.
8. Admin "Publish all approved" button works and yields the same idempotent result as the CLI.
9. 20 new creatives generated and approved.
10. 2 bad creatives (`QgVH83CNEv1unzbRdOKJC`, `V8a1sQF5SwR1P-OGOIrfo`) at `status='rejected'`.
11. Admin review page shows status filter dropdown.
12. Production deploy successful; ENABLED=true, DRY_RUN=true; cron handlers continue triggering Telegram alerts.

---

## Notes for execution

- **TDD discipline is non-negotiable.** Every implementation task starts with a failing test that gets verified to fail before any production code is written.
- **No agent uses `getMetaAdClient()` or `createMetaUploadClient()` in tests.** Both factories explicitly throw in test mode. Tests must inject mocks via constructor or DI parameters.
- **Lazy require in Task 7** is deliberate — it keeps test bundles from pulling the real adapter. Don't refactor to a top-level import.
- **Idempotency**: `meta_ad_id IS NULL` filter + `WHERE … RETURNING` on approve means re-running any of the publish flows is always safe.
- **Meta Graph API version v22.0** is what this codebase already uses (see `pre-launch-check.ts`). Don't bump.
- **Subagent dispatch order** follows §9.2 of the spec — 4 waves, 11 agents total. See spec for the exact wave map.
