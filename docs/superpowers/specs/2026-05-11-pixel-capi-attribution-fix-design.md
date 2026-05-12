# Pixel/CAPI Attribution Fix (Meta Lead) — Design

**Date:** 2026-05-11
**Author:** Kirill (founder) + Claude
**Status:** Approved (sections 1-6)
**Sibling spec:** [2026-05-07-fbq-lead-subscribe-design.md](./2026-05-07-fbq-lead-subscribe-design.md) (browser-side fbq emitters)

## Context

On 2026-05-11 an audit of the live Meta campaign `Estrevia Launch — Sidereal Astrology` (campaign id `120243025911300527`, `OUTCOME_TRAFFIC`, ES ad-set live at $6/day) showed strong top-of-funnel performance — CTR 4.57%, CPM $0.73, CPC $0.02, 1,219 landing-page views over 7 days — but **0 attributed leads** in Ads Manager, despite 9 real Lead events recorded in the Meta Pixel dataset (`Estrevia Pixel 2`, id `1945750759636135`).

Root-cause investigation surfaced two distinct problems:

### Problem A — CSP blocks 3 of 4 Pixel delivery channels

A live browser session against `https://estrevia.app/es` produced these CSP violations (Playwright console capture, 2026-05-11):

| Channel | Endpoint | Blocked by directive |
|---|---|---|
| CAPI Gateway | `capig.datah04.com/events/<token>` | `connect-src` |
| Form-action fallback | `www.facebook.com/tr/` | `form-action` |
| iframe fallback | `www.facebook.com/` | `frame-src` |
| Pixel direct fetch | `www.facebook.com/*` | (allowed) |

The Pixel JS internally signals `cdl=API_unavailable` in its URL parameters when the CAPI Gateway is unreachable — visible in the network log. Of the four redundant Pixel delivery channels Meta uses for resilient event capture, only one is currently functional.

### Problem B — Server-side CAPI omits cookie + IP attribution fields

`src/modules/advertising/meta-capi/types.ts` defines `CapiUserData` with `external_id`, `em`, `client_ip_address`, `client_user_agent`, `fn`, `ln`, `db` — but no `fbc` or `fbp`. The send path in `meta-capi/index.ts:99-107` therefore cannot transmit Meta's two most critical attribution identifiers, even if callers had them.

The browser already sets `_fbp` cookie on every Pixel-initialised visit (verified: `_fbp=fb.1.1778548314820.401616275300001552` on a fresh `/es` load) and would set `_fbc` for traffic arriving via `?fbclid=...`. The data exists; the pipeline drops it.

Meta Event Match Quality (EMQ) for `Lead` is currently **4.6/10** (`ads_get_dataset_quality` MCP, 2026-05-11):
- `email` coverage 100% ✓
- `external_id` coverage 100% ✓
- `fbc`, `fbp`, `ph`, `ge`, `ct`, `st`, `zp` — absent

With `fbc`/`fbp` added the score is expected to reach 7+/10, which unlocks attribution to ad clicks.

## Goal

Restore Meta attribution for Lead conversions on the live ES `OUTCOME_TRAFFIC` ad-set by:

1. Whitelisting the 3 currently-blocked Pixel delivery channels in CSP.
2. Extending the server-side CAPI pipeline to carry `fbc`, `fbp`, `client_ip_address`, `client_user_agent`, `event_source_url` end-to-end from the `/api/v1/leads` endpoint.

Success criteria (priority order):

1. Zero CSP violations for Meta-related domains in browser console on `/es` and `/en` after deploy.
2. EMQ for `Lead` event ≥ 7/10 in Meta Events Manager within 2-4h post-deploy.
3. Attributed leads > 0 in Ads Manager insights (ES ad-set, 24h rolling window) within 48h.
4. `__missing_event` count in Pixel dataset does not grow above current baseline (~0-2/week).
5. All affected unit tests + `npm run typecheck` + `npm run lint` pass before deploy.

## Non-goals (out of scope for this spec)

- **Clerk webhook attribution** (`user.created` → CAPI Lead with `fbc`/`fbp` via Clerk `unsafe_metadata`). Defer to a separate spec once we switch the campaign objective to `OUTCOME_LEADS` / `CONVERSIONS`.
- **Stripe webhook attribution** (`checkout.session.completed` → CAPI Purchase via Stripe Checkout Session metadata). Same reasoning.
- **Email-gate skip-button conversion lift** — LPV→Lead is 0.74% (9/1219) which is below the 3% benchmark, but cause may be attribution-side rather than UX-side. Decide after EMQ recovery; A/B test deferred.
- **Phone (`ph`), geo (`zp`, `ct`, `st`) user_data fields** — we only collect email at the lead-capture stage. YAGNI.
- **Privacy Sandbox API `ERR_BLOCKED_BY_ORB`** — Chrome browser policy, not our CSP. Adapt when Meta migrates to stable Sandbox spec.
- **End-to-end Playwright coverage in CI** — manual post-deploy smoke as documented under Testing is sufficient for this delta.

## Architecture

### Data flow (after fix)

```
[ Meta Ad Click ]                ?fbclid=… → Pixel sets _fbc cookie
        │
        ▼
[ Landing /es ]                  browser: _fbc + _fbp cookies present
        │
        ▼
[ Hero Calculator → chart calc → email-gate modal opens ]
        │
        ▼
[ EmailGateModal.tsx submit ]
        │  readMetaCookies()     → { fbc, fbp } from document.cookie    ← NEW
        │  fetch /api/v1/leads   body += { fbc, fbp }                   ← NEW fields
        │  fbq('track','Lead', {}, { eventID })                         ← unchanged
        ▼
[ POST /api/v1/leads ]
        │  zod schema accepts fbc, fbp                                  ← NEW
        │  trackServerEvent(distinctId, EMAIL_LEAD_SUBMITTED, {
        │    email, $insert_id, utm_*,
        │    fbc, fbp,                                                  ← NEW
        │    client_ip_address: ip,                                     ← NEW (x-forwarded-for)
        │    client_user_agent: userAgent,                              ← NEW
        │    event_source_url: referer,                                 ← NEW
        │  })
        ▼
[ analytics.ts:trackServerEvent ]
        │  extract { fbc, fbp, client_ip_address, client_user_agent,
        │            event_source_url } from properties
        │  pass to sendCapiEvent(name, user_data_input, custom_data, opts)
        ▼
[ meta-capi/index.ts:sendCapiEvent ]
        │  payload.user_data = { em, external_id, fbc, fbp,
        │                        client_ip_address, client_user_agent }
        │  payload.event_source_url
        ▼
[ Meta Graph API /<pixelId>/events ] → EMQ ≥ 7/10
        │
        ▼  in parallel, all 4 Pixel channels now permitted by CSP:
[ Browser fbq → www.facebook.com ]      (already allowed)
[ Browser fbq → capig.datah04.com ]     (P0 fix)
[ Browser fbq → form-action fallback ]  (P0 fix)
[ Browser fbq → iframe fallback ]       (P0 fix)
        │
        ▼
[ Meta attribution engine ] — dedupe browser-Lead + CAPI-Lead via event_id
        │
        ▼
[ Ads Manager insights ] → leads > 0 ✓
```

### File-level changes (6 modified + 1 new = 7 files)

| # | File | Type | Change |
|---|---|---|---|
| 1 | `next.config.ts` | modified | CSP `connect-src` + `form-action` + `frame-src` whitelisting |
| 2 | `src/modules/advertising/meta-capi/types.ts` | modified | `CapiUserData` += `fbc?`, `fbp?` |
| 3 | `src/modules/advertising/meta-capi/index.ts` | modified | `SendCapiInput` += `fbc?`, `fbp?`; user_data payload extension |
| 4 | `src/shared/lib/analytics.ts` | modified | `trackServerEvent` extracts CAPI fields from properties |
| 5 | `src/shared/lib/meta-cookies.ts` | **new** | `readMetaCookies()` helper |
| 6 | `src/shared/components/EmailGateModal.tsx` | modified | Call `readMetaCookies()`; extend fetch body |
| 7 | `src/app/api/v1/leads/route.ts` | modified | Zod schema + forward `fbc`/`fbp`/IP/UA/referer |

Plus 6 test files (5 extended + 1 new — see Testing section).

## Detailed changes

### 1. `next.config.ts` — CSP (lines 32-90)

Add to `connect-src` (line 68): `https://*.facebook.com`, `https://*.facebook.net`, `https://*.datah04.com`.

Add to `frame-src` (line 71): `https://www.facebook.com`.

Add to `form-action` (line 86): `https://www.facebook.com`.

Update the comment block above `connect-src` (lines 60-67) to document the 4 Pixel delivery channels.

#### Wildcard rationale

`*.datah04.com` is preferred over a pinned `capig.datah04.com` because Meta may rotate the subdomain when reconfiguring CAPI Gateway for a Pixel. `datah04.com` is a Meta-owned domain shared across customers; wildcarding its subdomains does not increase exfiltration risk relative to `*.facebook.com`.

### 2. `src/modules/advertising/meta-capi/types.ts` — `CapiUserData` (lines 9-22)

```diff
 export interface CapiUserData {
   external_id?: string;
   em?: string;
+  /** Plain `_fbc` cookie value (fb.1.<ts>.<fbclid>). NOT hashed. */
+  fbc?: string;
+  /** Plain `_fbp` cookie value (fb.1.<ts>.<random>). NOT hashed. */
+  fbp?: string;
   client_ip_address?: string;
   client_user_agent?: string;
   fn?: string;
   ln?: string;
   db?: string;
 }
```

`fbc` and `fbp` are transmitted **plaintext** per Meta API spec — they are not PII identifiers and contain no email/phone/name data.

### 3. `src/modules/advertising/meta-capi/index.ts` (lines 54-107)

Extend `SendCapiInput`:

```diff
 export interface SendCapiInput {
   email?: string;
   external_id_raw?: string;
   em?: string;
   external_id?: string;
   client_ip_address?: string;
   client_user_agent?: string;
+  fbc?: string;
+  fbp?: string;
 }
```

Forward into payload:

```diff
   const payload: CapiEventPayload = {
     event_name, event_time, event_id,
     action_source: 'website',
     user_data: {
       em: user.em ?? (user.email ? hashPII(user.email) : undefined),
       external_id: user.external_id ?? (user.external_id_raw ? hashPII(user.external_id_raw) : undefined),
       client_ip_address: user.client_ip_address,
       client_user_agent: user.client_user_agent,
+      fbc: user.fbc,
+      fbp: user.fbp,
     },
     custom_data,
     event_source_url: opts.event_source_url,
   };
```

### 4. `src/shared/lib/analytics.ts:trackServerEvent` (lines 148-181)

Opportunistically extract attribution fields from PostHog `properties` and pass to CAPI:

```diff
   if (isEstreviaEvent(name)) {
     const mapped = mapEstreviaToMeta(name);
     if (mapped.capi) {
       const email = typeof properties?.email === 'string' ? properties.email : undefined;
       const event_id = typeof properties?.$insert_id === 'string' ? properties.$insert_id : undefined;
+      const fbc = typeof properties?.fbc === 'string' ? properties.fbc : undefined;
+      const fbp = typeof properties?.fbp === 'string' ? properties.fbp : undefined;
+      const client_ip_address = typeof properties?.client_ip_address === 'string' ? properties.client_ip_address : undefined;
+      const client_user_agent = typeof properties?.client_user_agent === 'string' ? properties.client_user_agent : undefined;
+      const event_source_url = typeof properties?.event_source_url === 'string' ? properties.event_source_url : undefined;
       const capiPromise = sendCapiEvent(
         mapped.capi,
-        { external_id_raw: distinctId, email },
+        { external_id_raw: distinctId, email, fbc, fbp, client_ip_address, client_user_agent },
         propertiesToCustomData(properties),
-        event_id ? { event_id } : {},
+        {
+          ...(event_id ? { event_id } : {}),
+          ...(event_source_url ? { event_source_url } : {}),
+        },
       );
       waitUntil(capiPromise);
     }
   }
```

Backward compatible: callers that do not include `fbc`/`fbp`/etc. in properties continue to work — `undefined` flows through and Meta omits the absent fields.

### 5. `src/shared/lib/meta-cookies.ts` — NEW (~30 lines)

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

### 6. `src/shared/components/EmailGateModal.tsx` (lines 7, 107-131)

```diff
 import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
 import { readUtmCookie } from '@/shared/lib/utm-cookie';
+import { readMetaCookies } from '@/shared/lib/meta-cookies';
```

```diff
     try {
       const utm = readUtmCookie() ?? {};
+      const meta = readMetaCookies();
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
+          ...meta,
         }),
       });
```

### 7. `src/app/api/v1/leads/route.ts` (lines 20-30, 148-160)

```diff
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
+  /** Meta `_fbc` cookie value verbatim — for CAPI ad-click attribution. */
+  fbc: z.string().max(256).optional(),
+  /** Meta `_fbp` cookie value verbatim — for cross-page Pixel dedupe. */
+  fbp: z.string().max(256).optional(),
 });
```

```diff
   if (wasNew) {
     const distinctId = input.anonymous_id ?? `lead_${leadId}`;
+    const referer = request.headers.get('referer') ?? undefined;
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
+      // ↓ extracted by analytics.ts:trackServerEvent into CAPI user_data / opts
+      fbc: input.fbc,
+      fbp: input.fbp,
+      client_ip_address: ip !== 'anonymous' ? ip : undefined,
+      client_user_agent: userAgent ?? undefined,
+      event_source_url: referer,
     });
   }
```

#### PII discipline note

`client_ip_address` is passed plaintext to CAPI (Meta hashes server-side per their API spec). The Postgres column `email_leads.ipAddressHash` keeps SHA-256 of the IP — a separate, GDPR-driven concern. The two are independent; we do not start storing plain IPs in DB.

## Testing

### Unit tests

| Test file | Status | Coverage |
|---|---|---|
| `src/modules/advertising/meta-capi/__tests__/types.test.ts` | extend | `CapiUserData` accepts `fbc`/`fbp` without TS error |
| `src/modules/advertising/meta-capi/__tests__/index.test.ts` | extend | `sendCapiEvent({ fbc, fbp })` puts both into payload `user_data` |
| `src/shared/lib/__tests__/meta-cookies.test.ts` | **new** | parse both cookies; one missing; malformed cookie string; `document` undefined (SSR) |
| `src/shared/lib/__tests__/analytics-capi.test.ts` | extend | `trackServerEvent` with `{fbc, fbp, client_ip_address, client_user_agent, event_source_url}` in properties → `sendCapiEvent` user-arg + opts contain them |
| `src/app/api/v1/leads/__tests__/route.test.ts` | extend | POST body with fbc/fbp passes zod; properties forwarded to `trackServerEvent`. POST without fbc/fbp still works (backward-compat). |
| `src/shared/components/__tests__/EmailGateModal.test.tsx` | extend | mock `document.cookie='_fbc=fb.1.x; _fbp=fb.1.y'` → form submit → fetch body includes both |

CSP changes are not unit-testable in isolation (headers config). Verification is via Playwright smoke (below).

### Manual verification

**Pre-deploy (optional, via Meta Test Events Code):**

1. Founder creates a Test Events Code in Meta Events Manager → Test Events.
2. Set `META_CAPI_TEST_EVENT_CODE=TEST123` in `.env.local`.
3. Hit `/api/v1/leads` locally with realistic `fbc`/`fbp`/`client_ip_address`/UA.
4. Confirm event appears in Test Events with high Match Quality and visible `fbc`/`fbp` parameters.

**Post-deploy Playwright smoke (mirrors today's diagnostic run):**

1. Open `https://estrevia.app/es` in 390×844 viewport.
2. `browser_console_messages('error')` → assert no CSP violations referencing `capig.datah04.com`, `form-action`, `frame-src`, `www.facebook.com`.
3. Fill hero calculator with synthetic data → submit → wait for email-gate modal.
4. Submit email through the modal.
5. `browser_network_requests({filter: '/api/v1/leads'})` → assert POST body contains both `fbc` and `fbp`.

**Post-deploy observability (24-48h):**

1. Meta Events Manager → Pixel `Estrevia Pixel 2` → Match Quality for Lead: target ≥7/10.
2. `ads_get_dataset_stats` MCP: server-event count delta vs baseline should rise (CAPI Gateway events now arrive).
3. `__missing_event` weekly count: stays ≤2/week (no regression).
4. Meta Ads Manager → `Estrevia Launch — Sidereal Astrology` → ES ad-set → insights last 24h: leads > 0.

## Rollback

| Scenario | Action |
|---|---|
| New CSP violation on a non-Meta domain (e.g. Stripe form-action breaks) | `git revert <sha>` → push → Vercel auto-deploy <2 min |
| EMQ regresses below 4.6 (unexpected — we only add fields, never remove) | `git revert` |
| Single Pixel channel remains blocked after deploy | Iterate forward — add missing domain in a follow-up commit. Do not revert. |
| Lead events stop arriving entirely (worst case) | Immediate `git revert`. Indicator: `ads_get_dataset_stats` shows Lead-event count drop vs baseline. |

All 7 files contain backward-compatible additive changes (optional fields, opportunistic property extraction). `git revert` leaves no partial state in the database, Meta, or callers.

## Implementation order (single commit)

Per founder workflow preference (direct-to-main, single deploy), all 7 files land in one commit with the conventional-scope prefix `feat(meta-capi/attribution):` matching the project's commit-style.

Recommended file order for review legibility:

1. `next.config.ts` (CSP) — smallest blast radius first.
2. `meta-capi/types.ts` — type extension.
3. `meta-capi/index.ts` — payload extension.
4. `analytics.ts` — properties → CAPI plumbing.
5. `meta-cookies.ts` (new) — leaf utility.
6. `EmailGateModal.tsx` — consumer.
7. `api/v1/leads/route.ts` — consumer.
8. 6 test files — extend + 1 new.

Tests run via `npm test` + `npm run typecheck` + `npm run lint` before push.
