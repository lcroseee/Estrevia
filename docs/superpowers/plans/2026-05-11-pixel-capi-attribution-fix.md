# Pixel/CAPI Attribution Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Meta attribution for Lead conversions by unblocking 3 of 4 Pixel delivery channels in CSP and extending CAPI server-side payload with `fbc`/`fbp`/IP/UA/referer.

**Architecture:** 7 file changes (6 modified + 1 new) on a single conventional `feat(meta-capi/attribution):` commit. Frontend reads `_fbc`/`_fbp` cookies on email-gate submit → POSTs to `/api/v1/leads` → `trackServerEvent` extracts attribution properties → `sendCapiEvent` puts them into Meta CAPI `user_data`. Browser-side Pixel gets 3 extra delivery channels via CSP whitelisting.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Vitest + React Testing Library + jsdom · Meta Graph API v22 CAPI · Zod 4.

**Spec:** [`docs/superpowers/specs/2026-05-11-pixel-capi-attribution-fix-design.md`](../specs/2026-05-11-pixel-capi-attribution-fix-design.md)

**Commit strategy:** Each task commits with `wip(meta-capi/attribution):` prefix for TDD checkpoints. Task 8 squashes to a single `feat(meta-capi/attribution):` commit per spec.

---

## Task 1: CSP whitelisting for 3 Meta Pixel delivery channels

**Files:**
- Modify: `next.config.ts:60-90`

- [ ] **Step 1: Read current CSP block**

Run: `head -90 next.config.ts | tail -35`
Expected: see `connect-src` (line 68), `frame-src` (line 71), `form-action` (line 86) — current Meta entries: only `https://www.facebook.com` in `connect-src`.

- [ ] **Step 2: Extend `connect-src` (line 68) with 3 wildcard Meta domains**

Apply this edit to `next.config.ts`:

```
OLD:
  "connect-src 'self' https://api.clerk.com https://clerk.estrevia.app https://*.clerk.accounts.dev https://*.accounts.dev https://*.posthog.com https://eu.posthog.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.ingest.sentry.io https://*.sentry.io https://api.stripe.com https://vitals.vercel-insights.com https://vercel.live wss://vercel.live https://www.facebook.com",

NEW:
  "connect-src 'self' https://api.clerk.com https://clerk.estrevia.app https://*.clerk.accounts.dev https://*.accounts.dev https://*.posthog.com https://eu.posthog.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.ingest.sentry.io https://*.sentry.io https://api.stripe.com https://vitals.vercel-insights.com https://vercel.live wss://vercel.live https://www.facebook.com https://*.facebook.com https://*.facebook.net https://*.datah04.com",
```

- [ ] **Step 3: Extend `frame-src` (line 71) with `www.facebook.com`**

```
OLD:
  "frame-src https://js.stripe.com https://*.stripe.com https://clerk.estrevia.app https://*.clerk.accounts.dev https://*.accounts.dev https://vercel.live",

NEW:
  "frame-src https://js.stripe.com https://*.stripe.com https://clerk.estrevia.app https://*.clerk.accounts.dev https://*.accounts.dev https://vercel.live https://www.facebook.com",
```

- [ ] **Step 4: Extend `form-action` (line 86) with `www.facebook.com`**

```
OLD:
  "form-action 'self' https://checkout.stripe.com",

NEW:
  "form-action 'self' https://checkout.stripe.com https://www.facebook.com",
```

- [ ] **Step 5: Update the comment block above `connect-src` (lines 60-67) to document the 4 Pixel channels**

```
OLD:
  // Connect (XHR/fetch/WebSocket): self + API services
  // *.accounts.dev covers Clerk development instances; clerk.estrevia.app is
  // the Frontend API (FAPI) for the production Clerk instance — required for
  // environment fetch, session refresh, sign-in/up flows.
  // PostHog EU uses a dedicated ingest subdomain `eu.i.posthog.com` and asset
  // subdomain `eu-assets.i.posthog.com` — wildcard `*.posthog.com` does NOT
  // cover the `i.posthog.com` third-level hosts, they must be listed explicitly
  // www.facebook.com receives fbq() event POSTs (Meta Pixel browser-side).

NEW:
  // Connect (XHR/fetch/WebSocket): self + API services
  // *.accounts.dev covers Clerk development instances; clerk.estrevia.app is
  // the Frontend API (FAPI) for the production Clerk instance — required for
  // environment fetch, session refresh, sign-in/up flows.
  // PostHog EU uses a dedicated ingest subdomain `eu.i.posthog.com` and asset
  // subdomain `eu-assets.i.posthog.com` — wildcard `*.posthog.com` does NOT
  // cover the `i.posthog.com` third-level hosts, they must be listed explicitly
  //
  // Meta Pixel delivers events through up to 4 redundant channels. We allowlist
  // all of them so attribution survives Safari ITP, Chrome ETP, ORB and 3p-cookie
  // restrictions:
  //   1. https://www.facebook.com         — direct fbq() POST (`/tr/` endpoint)
  //   2. https://*.facebook.com           — Privacy Sandbox API + auxiliary fb subdomains
  //   3. https://*.facebook.net           — connect.facebook.net XHR endpoint
  //   4. https://*.datah04.com            — CAPI Gateway (capig.* first-party host for our Pixel)
  // The matching frame-src and form-action entries below cover the iframe and
  // form-POST fallback channels for resilient capture in older browsers.
```

- [ ] **Step 6: Validate config compiles via build**

Run: `npm run build 2>&1 | tail -30`
Expected: build succeeds (no CSP syntax errors, no TS errors). If build fails for unrelated reasons, scope-check with founder before continuing.

- [ ] **Step 7: Commit**

```bash
git add next.config.ts
git commit -m "wip(meta-capi/attribution): allow Meta CAPI Gateway + Pixel fallback channels in CSP"
```

---

## Task 2: `readMetaCookies()` helper (new file, TDD)

**Files:**
- Create: `src/shared/lib/meta-cookies.ts`
- Create: `src/shared/lib/__tests__/meta-cookies.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/shared/lib/__tests__/meta-cookies.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readMetaCookies } from '../meta-cookies';

beforeEach(() => {
  // jsdom does not auto-reset cookies between tests
  document.cookie.split(';').forEach((c) => {
    const k = c.split('=')[0]?.trim();
    if (k) document.cookie = `${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
});

describe('readMetaCookies', () => {
  it('returns both fbc and fbp when present', () => {
    document.cookie = '_fbc=fb.1.1714867200.AbCdEf123';
    document.cookie = '_fbp=fb.1.1714867200.987654321';
    expect(readMetaCookies()).toEqual({
      fbc: 'fb.1.1714867200.AbCdEf123',
      fbp: 'fb.1.1714867200.987654321',
    });
  });

  it('returns only fbp when fbc is absent', () => {
    document.cookie = '_fbp=fb.1.1714867200.999';
    expect(readMetaCookies()).toEqual({ fbp: 'fb.1.1714867200.999' });
  });

  it('returns empty object when neither cookie is set', () => {
    expect(readMetaCookies()).toEqual({});
  });

  it('ignores cookies whose name differs in case or has a similar prefix', () => {
    document.cookie = '_Fbc=fb.1.x.x';
    document.cookie = '_fbcExtra=fb.1.x.x';
    expect(readMetaCookies()).toEqual({});
  });

  it('tolerates extra whitespace, equals signs in values, and multi-cookie strings', () => {
    document.cookie = '_fbp=fb.1.0.a=b=c';
    expect(readMetaCookies().fbp).toBe('fb.1.0.a=b=c');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/lib/__tests__/meta-cookies.test.ts`
Expected: FAIL with "Cannot find module '../meta-cookies'" or similar import error.

- [ ] **Step 3: Implement `readMetaCookies`**

Create `src/shared/lib/meta-cookies.ts`:

```typescript
/**
 * Read Meta Pixel attribution cookies (_fbc, _fbp) from document.cookie.
 *
 * Pixel JS sets these automatically:
 *  - `_fbc` (fb.1.<ts>.<fbclid>) — present only when the visitor landed via a
 *    URL with ?fbclid=… (i.e. came from a Meta ad). Used by CAPI to bind
 *    server-side conversions to the original ad-click.
 *  - `_fbp` (fb.1.<ts>.<random>) — set on every Pixel-initialised visit;
 *    used for cross-page and cross-domain dedupe.
 *
 * Both values are passed verbatim to Meta's CAPI (no hashing). Missing values
 * are omitted from the result rather than returned as empty strings.
 *
 * SSR safe: returns {} when `document` is undefined.
 */
export function readMetaCookies(): { fbc?: string; fbp?: string } {
  if (typeof document === 'undefined') return {};
  const out: { fbc?: string; fbp?: string } = {};
  for (const c of document.cookie.split(';')) {
    const i = c.indexOf('=');
    if (i < 0) continue;
    const k = c.slice(0, i).trim();
    const v = c.slice(i + 1).trim();
    if (k === '_fbc') out.fbc = v;
    else if (k === '_fbp') out.fbp = v;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/lib/__tests__/meta-cookies.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/meta-cookies.ts src/shared/lib/__tests__/meta-cookies.test.ts
git commit -m "wip(meta-capi/attribution): add readMetaCookies helper"
```

---

## Task 3: Extend `CapiUserData` with `fbc`/`fbp` (TDD)

**Files:**
- Modify: `src/modules/advertising/meta-capi/types.ts:9-22`
- Modify: `src/modules/advertising/meta-capi/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test (append to existing describe block)**

Append after line 21 (inside `describe('meta-capi types', () => {`) in `src/modules/advertising/meta-capi/__tests__/types.test.ts`:

```typescript
  it('CapiUserData accepts fbc + fbp as optional plaintext fields', () => {
    const u: CapiUserData = {
      em: 'hashed',
      external_id: 'hashed_uid',
      fbc: 'fb.1.1714867200.AbCdEf123',
      fbp: 'fb.1.1714867200.987654321',
    };
    expect(u.fbc).toBe('fb.1.1714867200.AbCdEf123');
    expect(u.fbp).toBe('fb.1.1714867200.987654321');
  });
```

- [ ] **Step 2: Run test to verify it fails (TypeScript compile error counts as fail)**

Run: `npx vitest run src/modules/advertising/meta-capi/__tests__/types.test.ts`
Expected: FAIL with TS error: "Object literal may only specify known properties, and 'fbc' does not exist in type 'CapiUserData'."

- [ ] **Step 3: Extend `CapiUserData` interface**

In `src/modules/advertising/meta-capi/types.ts` between lines 11 and 14 (between `em?: string;` and `client_ip_address?: string;`):

```
OLD:
export interface CapiUserData {
  /** SHA-256 hash of normalized Clerk userId. */
  external_id?: string;
  /** SHA-256 hash of lowercase + trimmed email. */
  em?: string;
  /** Request IP, plain (Meta hashes server-side). */
  client_ip_address?: string;

NEW:
export interface CapiUserData {
  /** SHA-256 hash of normalized Clerk userId. */
  external_id?: string;
  /** SHA-256 hash of lowercase + trimmed email. */
  em?: string;
  /** Plain `_fbc` cookie value (fb.1.<ts>.<fbclid>). NOT hashed — Meta API spec. */
  fbc?: string;
  /** Plain `_fbp` cookie value (fb.1.<ts>.<random>). NOT hashed — Meta API spec. */
  fbp?: string;
  /** Request IP, plain (Meta hashes server-side). */
  client_ip_address?: string;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/advertising/meta-capi/__tests__/types.test.ts`
Expected: 3 tests PASS (2 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/modules/advertising/meta-capi/types.ts src/modules/advertising/meta-capi/__tests__/types.test.ts
git commit -m "wip(meta-capi/attribution): add fbc/fbp to CapiUserData type"
```

---

## Task 4: Extend `sendCapiEvent` to forward `fbc`/`fbp` (TDD)

**Files:**
- Modify: `src/modules/advertising/meta-capi/index.ts:54-107`
- Modify: `src/modules/advertising/meta-capi/__tests__/index.test.ts`

- [ ] **Step 1: Write the failing test (append to existing `describe('sendCapiEvent', () => {`)**

Append after line 63 (after the "returns silently …" test) and before the closing `})` of `describe('sendCapiEvent', () => {` in `src/modules/advertising/meta-capi/__tests__/index.test.ts`:

```typescript
  it('passes fbc + fbp through to user_data verbatim (no hashing)', async () => {
    await sendCapiEvent('Lead', {
      email: 'alice@example.com',
      external_id_raw: 'user_42',
      fbc: 'fb.1.1714867200.AbCdEf123',
      fbp: 'fb.1.1714867200.987654321',
      client_ip_address: '203.0.113.42',
      client_user_agent: 'Mozilla/5.0 test-ua',
    });
    const payload = mockSendEvent.mock.calls[0][0] as CapiEventPayload;
    expect(payload.user_data.fbc).toBe('fb.1.1714867200.AbCdEf123');
    expect(payload.user_data.fbp).toBe('fb.1.1714867200.987654321');
    expect(payload.user_data.client_ip_address).toBe('203.0.113.42');
    expect(payload.user_data.client_user_agent).toBe('Mozilla/5.0 test-ua');
  });

  it('omits fbc/fbp from user_data when caller does not supply them (backward-compat)', async () => {
    await sendCapiEvent('Lead', { email: 'a@x.com' });
    const payload = mockSendEvent.mock.calls[0][0] as CapiEventPayload;
    expect(payload.user_data.fbc).toBeUndefined();
    expect(payload.user_data.fbp).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/advertising/meta-capi/__tests__/index.test.ts`
Expected: FAIL — "passes fbc + fbp …" test fails with TS error: "Object literal may only specify known properties, and 'fbc' does not exist in type 'SendCapiInput'." (The backward-compat test passes silently — it covers existing behavior.)

- [ ] **Step 3: Extend `SendCapiInput` interface in `src/modules/advertising/meta-capi/index.ts`**

```
OLD (lines 54-64):
export interface SendCapiInput {
  /** Plaintext email — hashed before send. */
  email?: string;
  /** Plaintext Clerk userId — hashed before send. */
  external_id_raw?: string;
  /** Already-hashed values (e.g. when caller has them pre-hashed). */
  em?: string;
  external_id?: string;
  client_ip_address?: string;
  client_user_agent?: string;
}

NEW:
export interface SendCapiInput {
  /** Plaintext email — hashed before send. */
  email?: string;
  /** Plaintext Clerk userId — hashed before send. */
  external_id_raw?: string;
  /** Already-hashed values (e.g. when caller has them pre-hashed). */
  em?: string;
  external_id?: string;
  client_ip_address?: string;
  client_user_agent?: string;
  /** Plain `_fbc` cookie value verbatim. NOT hashed — Meta API spec. */
  fbc?: string;
  /** Plain `_fbp` cookie value verbatim. NOT hashed — Meta API spec. */
  fbp?: string;
}
```

- [ ] **Step 4: Extend the payload `user_data` construction (around line 99-104)**

```
OLD:
    user_data: {
      em: user.em ?? (user.email ? hashPII(user.email) : undefined),
      external_id: user.external_id ?? (user.external_id_raw ? hashPII(user.external_id_raw) : undefined),
      client_ip_address: user.client_ip_address,
      client_user_agent: user.client_user_agent,
    },

NEW:
    user_data: {
      em: user.em ?? (user.email ? hashPII(user.email) : undefined),
      external_id: user.external_id ?? (user.external_id_raw ? hashPII(user.external_id_raw) : undefined),
      client_ip_address: user.client_ip_address,
      client_user_agent: user.client_user_agent,
      fbc: user.fbc,
      fbp: user.fbp,
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/advertising/meta-capi/__tests__/index.test.ts`
Expected: 7 tests PASS (5 existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add src/modules/advertising/meta-capi/index.ts src/modules/advertising/meta-capi/__tests__/index.test.ts
git commit -m "wip(meta-capi/attribution): forward fbc/fbp through sendCapiEvent"
```

---

## Task 5: Extend `trackServerEvent` to extract CAPI attribution fields (TDD)

**Files:**
- Modify: `src/shared/lib/analytics.ts:166-180`
- Modify: `src/shared/lib/__tests__/analytics-capi.test.ts`

- [ ] **Step 1: Write the failing test (append to existing `describe('trackServerEvent — CAPI integration', () => {`)**

Append before the closing `})` of the describe block in `src/shared/lib/__tests__/analytics-capi.test.ts`:

```typescript
  it('extracts fbc/fbp/client_ip_address/client_user_agent/event_source_url from properties into CAPI user-args + opts', () => {
    trackServerEvent('user_42', AnalyticsEvent.EMAIL_LEAD_SUBMITTED, {
      email: 'alice@example.com',
      $insert_id: 'evt_lead_1',
      fbc: 'fb.1.1714867200.AbCdEf123',
      fbp: 'fb.1.1714867200.987654321',
      client_ip_address: '203.0.113.42',
      client_user_agent: 'Mozilla/5.0 test-ua',
      event_source_url: 'https://estrevia.app/es',
      // unrelated PostHog properties — must NOT leak into user_data
      utm_source: 'meta',
      locale: 'es',
    });
    expect(mockSendCapi).toHaveBeenCalledWith(
      'Lead',
      expect.objectContaining({
        external_id_raw: 'user_42',
        email: 'alice@example.com',
        fbc: 'fb.1.1714867200.AbCdEf123',
        fbp: 'fb.1.1714867200.987654321',
        client_ip_address: '203.0.113.42',
        client_user_agent: 'Mozilla/5.0 test-ua',
      }),
      undefined,
      expect.objectContaining({
        event_id: 'evt_lead_1',
        event_source_url: 'https://estrevia.app/es',
      }),
    );
    // user_data should NOT contain utm_source or locale
    const userArg = mockSendCapi.mock.calls[0][1] as Record<string, unknown>;
    expect(userArg.utm_source).toBeUndefined();
    expect(userArg.locale).toBeUndefined();
  });

  it('handles missing fbc/fbp/IP/UA gracefully (backward-compat path)', () => {
    trackServerEvent('user_42', AnalyticsEvent.USER_REGISTERED, {
      email: 'a@x.com',
      $insert_id: 'evt_x',
    });
    expect(mockSendCapi).toHaveBeenCalledWith(
      'Lead',
      expect.objectContaining({ external_id_raw: 'user_42', email: 'a@x.com' }),
      undefined,
      expect.objectContaining({ event_id: 'evt_x' }),
    );
    const userArg = mockSendCapi.mock.calls[0][1] as Record<string, unknown>;
    expect(userArg.fbc).toBeUndefined();
    expect(userArg.fbp).toBeUndefined();
  });
```

Also add `EMAIL_LEAD_SUBMITTED` mapping to the `mapEstreviaToMeta` mock at the top of the file (line 17-26):

```
OLD:
vi.mock('@/modules/advertising/meta-capi/event-mapper', () => ({
  mapEstreviaToMeta: (e: string) => {
    const map: Record<string, { pixel: string | null; capi: string | null }> = {
      user_registered: { pixel: 'Lead', capi: 'Lead' },
      subscription_started: { pixel: null, capi: 'Subscribe' },
      landing_view: { pixel: 'PageView', capi: null },
      paywall_opened: { pixel: 'InitiateCheckout', capi: 'InitiateCheckout' },
    };
    return map[e] ?? { pixel: null, capi: null };
  },
}));

NEW:
vi.mock('@/modules/advertising/meta-capi/event-mapper', () => ({
  mapEstreviaToMeta: (e: string) => {
    const map: Record<string, { pixel: string | null; capi: string | null }> = {
      user_registered: { pixel: 'Lead', capi: 'Lead' },
      email_lead_submitted: { pixel: 'Lead', capi: 'Lead' },
      subscription_started: { pixel: null, capi: 'Subscribe' },
      landing_view: { pixel: 'PageView', capi: null },
      paywall_opened: { pixel: 'InitiateCheckout', capi: 'InitiateCheckout' },
    };
    return map[e] ?? { pixel: null, capi: null };
  },
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/lib/__tests__/analytics-capi.test.ts`
Expected: FAIL — "extracts fbc/fbp/…" fails because `analytics.ts:trackServerEvent` does not currently extract those fields from `properties` and pass to `sendCapiEvent`.

- [ ] **Step 3: Extend `trackServerEvent` in `src/shared/lib/analytics.ts`**

```
OLD (lines 166-180):
  if (isEstreviaEvent(name)) {
    const mapped = mapEstreviaToMeta(name);
    if (mapped.capi) {
      const email = typeof properties?.email === 'string' ? properties.email : undefined;
      const event_id = typeof properties?.$insert_id === 'string' ? properties.$insert_id : undefined;
      const capiPromise = sendCapiEvent(
        mapped.capi,
        { external_id_raw: distinctId, email },
        propertiesToCustomData(properties),
        event_id ? { event_id } : {},
      );
      // Keep the function alive for CAPI flush, same pattern as PostHog above.
      waitUntil(capiPromise);
    }
  }

NEW:
  if (isEstreviaEvent(name)) {
    const mapped = mapEstreviaToMeta(name);
    if (mapped.capi) {
      const email = typeof properties?.email === 'string' ? properties.email : undefined;
      const event_id = typeof properties?.$insert_id === 'string' ? properties.$insert_id : undefined;
      const fbc = typeof properties?.fbc === 'string' ? properties.fbc : undefined;
      const fbp = typeof properties?.fbp === 'string' ? properties.fbp : undefined;
      const client_ip_address = typeof properties?.client_ip_address === 'string'
        ? properties.client_ip_address : undefined;
      const client_user_agent = typeof properties?.client_user_agent === 'string'
        ? properties.client_user_agent : undefined;
      const event_source_url = typeof properties?.event_source_url === 'string'
        ? properties.event_source_url : undefined;
      const capiPromise = sendCapiEvent(
        mapped.capi,
        { external_id_raw: distinctId, email, fbc, fbp, client_ip_address, client_user_agent },
        propertiesToCustomData(properties),
        {
          ...(event_id ? { event_id } : {}),
          ...(event_source_url ? { event_source_url } : {}),
        },
      );
      // Keep the function alive for CAPI flush, same pattern as PostHog above.
      waitUntil(capiPromise);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/lib/__tests__/analytics-capi.test.ts`
Expected: 6 tests PASS (4 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/analytics.ts src/shared/lib/__tests__/analytics-capi.test.ts
git commit -m "wip(meta-capi/attribution): extract fbc/fbp/IP/UA/url in trackServerEvent"
```

---

## Task 6: Read Meta cookies in `EmailGateModal` + send to `/api/v1/leads` (TDD)

**Files:**
- Modify: `src/shared/components/EmailGateModal.tsx:7, 117-131`
- Modify: `src/shared/components/__tests__/EmailGateModal.test.tsx`

- [ ] **Step 1: Write the failing test (append before the closing `})` of `describe('EmailGateModal', () => {`)**

Append to `src/shared/components/__tests__/EmailGateModal.test.tsx`:

```typescript
  it('submits with fbc + fbp read from document.cookie in the request body', async () => {
    makePosthogMock();
    makeFbqMock();
    // Set Meta cookies before render
    document.cookie = '_fbc=fb.1.1714867200.AbCdEf123';
    document.cookie = '_fbp=fb.1.1714867200.987654321';

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { leadId: 'lead_m', eventId: 'lead_m:email_lead_submitted', wasNew: true }, error: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'cookies@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => expect(baseProps.onSubmitted).toHaveBeenCalled());

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/leads',
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.email).toBe('cookies@example.com');
    expect(body.fbc).toBe('fb.1.1714867200.AbCdEf123');
    expect(body.fbp).toBe('fb.1.1714867200.987654321');
  });

  it('omits fbc/fbp from request body when cookies are absent', async () => {
    makePosthogMock();
    makeFbqMock();
    // No _fbc / _fbp cookies set
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { leadId: 'lead_n', eventId: 'lead_n:email_lead_submitted', wasNew: true }, error: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'nocookies@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => expect(baseProps.onSubmitted).toHaveBeenCalled());

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.fbc).toBeUndefined();
    expect(body.fbp).toBeUndefined();
  });
```

Also extend the `beforeEach` hook at the top of the file (line 10-15) to clear `document.cookie`:

```
OLD:
beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete (window as unknown as { fbq?: unknown }).fbq;
  delete (window as unknown as { posthog?: unknown }).posthog;
});

NEW:
beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete (window as unknown as { fbq?: unknown }).fbq;
  delete (window as unknown as { posthog?: unknown }).posthog;
  // Reset cookies between tests — jsdom does not auto-clear them
  document.cookie.split(';').forEach((c) => {
    const k = c.split('=')[0]?.trim();
    if (k) document.cookie = `${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/components/__tests__/EmailGateModal.test.tsx`
Expected: FAIL — "submits with fbc + fbp …" test fails because body does not contain fbc/fbp yet.

- [ ] **Step 3: Add `readMetaCookies` import to `EmailGateModal.tsx`**

```
OLD (line 7):
import { readUtmCookie } from '@/shared/lib/utm-cookie';

NEW:
import { readUtmCookie } from '@/shared/lib/utm-cookie';
import { readMetaCookies } from '@/shared/lib/meta-cookies';
```

- [ ] **Step 4: Extend `handleSubmit` to include Meta cookies in fetch body**

In `src/shared/components/EmailGateModal.tsx`, inside `handleSubmit` (around line 117-131):

```
OLD:
    setLoading(true);
    try {
      const utm = readUtmCookie() ?? {};
      const anonymous_id = getDistinctId();
      const res = await fetch('/api/v1/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed.toLowerCase(),
          chartId,
          locale,
          anonymous_id,
          ...utm,
        }),
      });

NEW:
    setLoading(true);
    try {
      const utm = readUtmCookie() ?? {};
      const meta = readMetaCookies();
      const anonymous_id = getDistinctId();
      const res = await fetch('/api/v1/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed.toLowerCase(),
          chartId,
          locale,
          anonymous_id,
          ...utm,
          ...meta,
        }),
      });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/shared/components/__tests__/EmailGateModal.test.tsx`
Expected: 12 tests PASS (10 existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add src/shared/components/EmailGateModal.tsx src/shared/components/__tests__/EmailGateModal.test.tsx
git commit -m "wip(meta-capi/attribution): forward fbc/fbp from EmailGateModal to leads endpoint"
```

---

## Task 7: Extend `/api/v1/leads` zod schema + property forwarding (TDD)

**Files:**
- Modify: `src/app/api/v1/leads/route.ts:20-30, 148-160`
- Modify: `src/app/api/v1/leads/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test (append before the closing `})` of `describe('POST /api/v1/leads', () => {`)**

Append to `src/app/api/v1/leads/__tests__/route.test.ts`:

```typescript
  it('forwards fbc/fbp from body + IP/UA/referer from headers to trackServerEvent', async () => {
    const POST = await importPOST();
    await POST(makeRequest(
      {
        email: 'attrib@example.com',
        chartId: 'chart_a',
        locale: 'en',
        fbc: 'fb.1.1714867200.AbCdEf123',
        fbp: 'fb.1.1714867200.987654321',
      },
      {
        'x-forwarded-for': '203.0.113.42',
        'user-agent': 'Mozilla/5.0 attrib-ua',
        'referer': 'https://estrevia.app/es',
      },
    ));
    expect(trackMock).toHaveBeenCalledTimes(1);
    const [, , props] = trackMock.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(props.fbc).toBe('fb.1.1714867200.AbCdEf123');
    expect(props.fbp).toBe('fb.1.1714867200.987654321');
    expect(props.client_ip_address).toBe('203.0.113.42');
    expect(props.client_user_agent).toBe('Mozilla/5.0 attrib-ua');
    expect(props.event_source_url).toBe('https://estrevia.app/es');
  });

  it('accepts a body without fbc/fbp (backward-compat) and forwards undefined attribution', async () => {
    const POST = await importPOST();
    await POST(makeRequest({
      email: 'noattrib@example.com',
      locale: 'en',
    }));
    expect(trackMock).toHaveBeenCalledTimes(1);
    const [, , props] = trackMock.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(props.fbc).toBeUndefined();
    expect(props.fbp).toBeUndefined();
    expect(props.event_source_url).toBeUndefined();
  });

  it('does NOT forward client_ip_address when x-forwarded-for is absent', async () => {
    const POST = await importPOST();
    await POST(makeRequest(
      { email: 'noip@example.com', locale: 'en' },
      // Override default headers — drop x-forwarded-for completely
      // (makeRequest still merges 'x-forwarded-for' default — so override here)
    ));
    // makeRequest sets x-forwarded-for=203.0.113.42 by default. To test the
    // anonymous branch, send a request without that header.
    const reqNoIp = new Request('https://test.local/api/v1/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'noip2@example.com', locale: 'en' }),
    });
    trackMock.mockClear();
    await POST(reqNoIp);
    expect(trackMock).toHaveBeenCalledTimes(1);
    const [, , props] = trackMock.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(props.client_ip_address).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/v1/leads/__tests__/route.test.ts`
Expected: FAIL — "forwards fbc/fbp …" fails because route.ts does not extract fbc/fbp from body or referer from headers yet.

- [ ] **Step 3: Extend zod schema in `src/app/api/v1/leads/route.ts` (lines 20-30)**

```
OLD:
const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  chartId: z.string().max(64).optional(),
  locale: z.enum(['en', 'es']).default('en'),
  utm_source: z.string().max(128).optional(),
  utm_medium: z.string().max(128).optional(),
  utm_campaign: z.string().max(128).optional(),
  utm_content: z.string().max(128).optional(),
  utm_term: z.string().max(128).optional(),
  anonymous_id: z.string().max(128).optional(),
});

NEW:
const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  chartId: z.string().max(64).optional(),
  locale: z.enum(['en', 'es']).default('en'),
  utm_source: z.string().max(128).optional(),
  utm_medium: z.string().max(128).optional(),
  utm_campaign: z.string().max(128).optional(),
  utm_content: z.string().max(128).optional(),
  utm_term: z.string().max(128).optional(),
  anonymous_id: z.string().max(128).optional(),
  /** Meta `_fbc` cookie value verbatim — for CAPI ad-click attribution. */
  fbc: z.string().max(256).optional(),
  /** Meta `_fbp` cookie value verbatim — for cross-page Pixel dedupe. */
  fbp: z.string().max(256).optional(),
});
```

- [ ] **Step 4: Extend the `trackServerEvent` call with attribution properties (lines 148-160)**

```
OLD:
  if (wasNew) {
    const distinctId = input.anonymous_id ?? `lead_${leadId}`;
    trackServerEvent(distinctId, AnalyticsEvent.EMAIL_LEAD_SUBMITTED, {
      email: input.email,
      $insert_id: eventId,
      utm_source: input.utm_source,
      utm_medium: input.utm_medium,
      utm_campaign: input.utm_campaign,
      utm_content: input.utm_content,
      utm_term: input.utm_term,
      source: 'hero_calculator',
      locale: input.locale,
    });
  }

NEW:
  if (wasNew) {
    const distinctId = input.anonymous_id ?? `lead_${leadId}`;
    const referer = request.headers.get('referer') ?? undefined;
    trackServerEvent(distinctId, AnalyticsEvent.EMAIL_LEAD_SUBMITTED, {
      email: input.email,
      $insert_id: eventId,
      utm_source: input.utm_source,
      utm_medium: input.utm_medium,
      utm_campaign: input.utm_campaign,
      utm_content: input.utm_content,
      utm_term: input.utm_term,
      source: 'hero_calculator',
      locale: input.locale,
      // Attribution properties — extracted by analytics.ts:trackServerEvent into
      // CAPI user_data (fbc/fbp/IP/UA) and opts (event_source_url).
      fbc: input.fbc,
      fbp: input.fbp,
      client_ip_address: ip !== 'anonymous' ? ip : undefined,
      client_user_agent: userAgent ?? undefined,
      event_source_url: referer,
    });
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/api/v1/leads/__tests__/route.test.ts`
Expected: 10 tests PASS (7 existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/leads/route.ts src/app/api/v1/leads/__tests__/route.test.ts
git commit -m "wip(meta-capi/attribution): forward fbc/fbp/IP/UA/referer from leads route"
```

---

## Task 8: Full verification + squash to single commit

- [ ] **Step 1: Run full test suite**

Run: `npm test 2>&1 | tail -50`
Expected: All tests pass. The 6 modified test files contribute 17 new test cases. If any unrelated test fails, surface to founder before proceeding.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: zero errors. Confirms `CapiUserData`, `SendCapiInput` extensions are TS-clean across consumers (clerk-webhook, stripe-webhook unaffected — they pass strict subset of inputs).

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 4: Confirm 7 commits exist on top of pre-task1 baseline**

Run: `git log --oneline | head -10`
Expected: see 7 `wip(meta-capi/attribution): …` commits in reverse order, on top of the spec commit (`40765d1` "docs(meta-capi/attribution): pixel/CAPI attribution fix design").

- [ ] **Step 5: Squash 7 wip commits into one feat commit**

Run:

```bash
git reset --soft HEAD~7
git commit -m "$(cat <<'EOF'
feat(meta-capi/attribution): unblock Meta Lead attribution end-to-end

Two root-causes for 0 attributed leads on the live OUTCOME_TRAFFIC
ES ad-set:

1. CSP blocked 3 of 4 Meta Pixel delivery channels (CAPI Gateway,
   form-action fallback, iframe fallback). Whitelist *.facebook.com,
   *.facebook.net, *.datah04.com in connect-src; www.facebook.com in
   frame-src and form-action.

2. Server-side CAPI dropped fbc/fbp/IP/UA/referer. Plumb them
   end-to-end: EmailGateModal reads _fbc/_fbp from document.cookie →
   /api/v1/leads zod accepts them → trackServerEvent extracts CAPI
   attribution props → sendCapiEvent puts them into user_data /
   event_source_url.

Files changed (6 modified + 1 new):
- next.config.ts                                CSP whitelist
- src/modules/advertising/meta-capi/types.ts    CapiUserData += fbc, fbp
- src/modules/advertising/meta-capi/index.ts    SendCapiInput + payload
- src/shared/lib/analytics.ts                   trackServerEvent extract
- src/shared/lib/meta-cookies.ts                NEW: readMetaCookies()
- src/shared/components/EmailGateModal.tsx      cookie capture + body
- src/app/api/v1/leads/route.ts                 zod + forward

17 new unit-test cases across 6 test files (5 extended + 1 new).
All backward-compatible: callers without fbc/fbp continue to work.

Expected impact (per spec, success criteria):
- Match Quality for Lead 4.6 → ≥7 within 2-4h post-deploy
- Attributed leads > 0 in Ads Manager within 24-48h
- Zero CSP violations for Meta domains in browser console

Spec: docs/superpowers/specs/2026-05-11-pixel-capi-attribution-fix-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: single commit on top of `40765d1`; `git log --oneline | head -3` shows the feat commit + the spec docs commit + previous main HEAD.

- [ ] **Step 6: Final sanity check — re-run test suite on the squashed commit**

Run: `npm test 2>&1 | tail -10`
Expected: all tests still pass (squash does not change content).

---

## Task 9: Founder-driven post-deploy verification

> These steps require founder action (push, deploy, browser interaction, Meta console). Agent should stop after Task 8 and report ready-state.

- [ ] **Step 1: Founder pushes to origin/main**

Run (founder): `git push origin main`

- [ ] **Step 2: Wait for Vercel auto-deploy**

Monitor: <https://vercel.com/lcroseee/estrevia/deployments> — wait for the new commit to reach "Ready" status (typically 60-120s).

- [ ] **Step 3: Playwright smoke against prod (mirrors today's diagnostic run)**

Agent (or founder via DevTools): open `https://estrevia.app/es` in 390×844 viewport.

Checks:
- `browser_console_messages('error')` → assert zero CSP violations referencing `capig.datah04.com`, `form-action`, `frame-src`, `www.facebook.com`.
- Fill hero calculator (DOB 15/03/1990, no time, Madrid Spain) → submit → wait for email-gate modal.
- Enter `smoketest+capi@estrevia.app` → submit.
- `browser_network_requests({filter: '/api/v1/leads'})` → assert POST body JSON contains both `fbc` and `fbp` keys.

- [ ] **Step 4: Meta Events Manager — Match Quality (2-4h after deploy)**

URL: <https://business.facebook.com/events_manager2/list/dataset/1945750759636135/>

Check: Lead event → Event Match Quality → target ≥7/10 (from 4.6 baseline).

- [ ] **Step 5: Meta Ads Manager — attributed leads (24-48h after deploy)**

URL: <https://www.facebook.com/adsmanager/manage/ads?act=1435842067150024>

Check: Estrevia Launch — Sidereal Astrology → ES — Launch — Astrología sidérea → insights last 24h → "Leads" column > 0.

- [ ] **Step 6: Sanity — `__missing_event` count did not grow**

Via MCP: `ads_get_dataset_stats(dataset_id="1945750759636135", aggregation="event")` after 24h.

Check: `__missing_event` count is in line with baseline (~0-2 per week). If it grew, investigate the new fbc/fbp payload for malformed values.

---

## Rollback procedure

If any of the post-deploy checks fail in a way that requires rollback (see spec § Rollback for triage table):

```bash
git revert HEAD --no-edit
git push origin main
```

Single-commit history makes revert atomic — no partial state in DB, Meta, or callers. Vercel auto-redeploys the reverted state in 60-120s.

---

## Out-of-scope reminders (do NOT add to this plan)

- Clerk webhook `user.created` CAPI attribution via `unsafe_metadata` — separate spec.
- Stripe `checkout.session.completed` CAPI attribution via Session `metadata` — separate spec.
- Email-gate skip-button A/B test — separate spec post-EMQ recovery.
- `ph` (phone), `zp`/`ct`/`st` geo fields — we don't collect these at the lead stage. YAGNI.
- Chrome `ERR_BLOCKED_BY_ORB` for Privacy Sandbox — browser policy, not our CSP.
