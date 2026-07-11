# CAPI 422 diagnosis — `capig.datah04.com` gateway

**Task:** Task 15 (Track 5c, bounded investigation) — `.superpowers/sdd/task-15-brief.md`
**Date:** 2026-07-11
**Branch:** `cro-plans-exec` (isolated worktree)
**Trigger:** 2026-07-10 CRO audit roadmap flagged the Meta CAPI gateway
`capig.datah04.com` rejecting ~100% of observed page-view events with HTTP 422
(`docs/superpowers/specs/2026-07-10-cro-phase0-relaunch-blockers-design.md`,
Track 5 bullet 3).

## Ground truth from the repo (code read, not inferred)

### 1. The browser Pixel snippet — `src/app/[locale]/layout.tsx:59-70`

```tsx
<Script id="meta-pixel-base" strategy="afterInteractive">
  {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');`}
</Script>
```

This is Meta's own boilerplate loader. Our code's entire contribution is: (a)
fetch `fbevents.js` from `connect.facebook.net`, (b) call `fbq('init', pixelId)`,
(c) call `fbq('track', 'PageView')`. There is no URL construction, no fetch/XHR
call, and no reference to `datah04.com` or `capig` anywhere in this file or
anywhere the Pixel is invoked client-side (`grep` results below).

`pixelId` here (line 53) is `process.env.NEXT_PUBLIC_META_PIXEL_ID` — the
**browser-side** env var.

### 2. Server-side CAPI — `src/modules/advertising/meta-capi/client.ts:68`

```ts
async sendBatch(payloads: CapiEventPayload[]): Promise<CapiBatchResponse> {
    const url = `https://graph.facebook.com/${this.version}/${this.pixelId}/events`;
```

Server CAPI (`CapiClient.sendBatch`, called via
`src/modules/advertising/meta-capi/index.ts:sendCapiEvent`) POSTs directly to
`graph.facebook.com` using `META_PIXEL_ID` (the **server-side** env var, read
at `meta-capi/index.ts:29`). It never touches `datah04.com` in any form. This
path is architecturally isolated from the browser Pixel's delivery channels —
different domain, different transport (server `fetch` vs. `fbevents.js`
XHR/beacon), different credential (`META_CAPI_TOKEN` vs. nothing/cookie-based).

**Conclusion: server CAPI is not implicated in the 422s.**

## Repo-wide search for a `capig`/`datah04` request-builder

Searched (from repo root, excluding `node_modules/` and `.git/`):

```bash
grep -rn "datah04" -I . | grep -v node_modules | grep -v /.git/
grep -rn "capig"    -I . | grep -v node_modules | grep -v /.git/
grep -rn "Conversions API Gateway" -I . | grep -v node_modules | grep -v /.git/
grep -rn "graph.facebook.com" --include='*.ts' --include='*.tsx' -I . | grep -v node_modules
```

Results — every `datah04`/`capig` hit in the repo:

| File | Line | What it is |
|---|---|---|
| `next.config.ts` | 74, 77 | CSP `connect-src` **allowlist** entry `https://*.datah04.com` (permission, not a request) |
| `docs/superpowers/plans/2026-05-11-pixel-capi-attribution-fix.md` | 36, 87, 918, 977 | Historical plan doc for the CSP fix (see below) |
| `docs/superpowers/specs/2026-05-11-pixel-capi-attribution-fix-design.md` | 20, 107, 136, 146, 370 | Historical design doc, same fix |
| `docs/superpowers/specs/2026-07-10-cro-phase0-relaunch-blockers-design.md` | 82 | This task's own spec, citing the audit finding |
| `docs/superpowers/plans/2026-07-10-cro-phase0-relaunch-blockers.md` | 1607, 1611, 1615 | This task's own plan (Task 15 brief source) |

Every `graph.facebook.com` hit is a literal `fetch`/`axios` target string in
`scripts/advertising/*.ts` (Graph API ops scripts), the meta-graph-api /
meta-capi / meta-custom-audiences modules, and their tests — all deliberate,
all going to `graph.facebook.com`, none to `datah04.com`.

**No repo code — server or client, prod or scripts — builds, fetches, or
otherwise constructs a request to `capig.datah04.com` or any `*.datah04.com`
host.** The only repo artifact that even names the domain is a CSP `connect-src`
wildcard permission added in the 2026-05-11 design / 2026-05-13 ship
(`feat` commit `9318183`, see `project_meta_attribution_fix_shipped` memory) —
i.e. we told the browser it's *allowed* to talk to that host; we never told it
*to*.

## The actual mechanism (from the 2026-05-11 design doc + code)

The 2026-05-11 attribution-fix design doc (`docs/superpowers/specs/2026-05-11-pixel-capi-attribution-fix-design.md`)
documents that Meta's `fbevents.js` (loaded from `connect.facebook.net`, see
above) delivers Pixel events over **up to 4 redundant channels** determined by
the Pixel's *remote* configuration in Meta Events Manager — not by any
parameter our `fbq()` calls pass:

1. direct `fbq()` POST to `www.facebook.com/tr/`
2. `*.facebook.com` auxiliary/Privacy-Sandbox channel
3. `connect.facebook.net` (the loader itself)
4. **CAPI Gateway** — `capig.datah04.com/events/<token>`, present *only if* a
   Conversions API Gateway instance is configured for pixel
   `NEXT_PUBLIC_META_PIXEL_ID` in Events Manager

Channel 4 only exists because a Gateway was provisioned for this Pixel
server-side, on Meta's infrastructure, at some point before the 2026-05-11
audit (the CSP fix that unblocked it shipped 2026-05-13, commit `9318183`,
see `project_meta_attribution_fix_shipped` memory — the Gateway itself
predates that fix, since the fix's whole premise was "CSP is blocking an
already-existing channel"). `fbevents.js` reads this config at runtime and
attempts delivery through the Gateway host with no code-side involvement from
this repo. Setting up, reconfiguring, or removing that Gateway can only be
done in Events Manager, not in this codebase.

## Why this can't be a code fix

There is no code path to change:
- The Gateway's existence, host, or auth token are **not** repo-configurable
  — they live in Meta's Events Manager UI for the pixel, provisioned outside
  this repo.
- The 422 response is the Gateway rejecting the payload `fbevents.js` builds
  and sends *itself* — our code never assembles that request body, so there is
  nothing in our source to patch to change its shape.
- Server CAPI already bypasses the Gateway entirely (goes direct to
  `graph.facebook.com`), so there is no server-side dedupe/fallback logic to
  add for this — it isn't broken there.

## Decision

**(A) — Gateway stale / third-party-managed, likely dating to the pre-05-13
attribution work.** Founder action, not a code fix:

1. Events Manager → **Data sources** → pixel `1945750759636135` → **Settings**
   → **Conversions API Gateway** section.
2. If a Gateway instance is listed: check its status. If it's stale,
   disconnected from its origin, or pointing at an expired/rotated token,
   **remove it** (or reconfigure per Meta's current setup wizard if the
   founder wants Gateway-based server-side dedup — optional, not required for
   attribution to work).
3. Once removed/fixed, `fbevents.js` will simply stop attempting channel 4;
   browser events keep flowing through channels 1-3 (`www.facebook.com`,
   `*.facebook.com`, `connect.facebook.net`), all already CSP-allowed and
   already working per the 05-13 fix. Server CAPI is untouched throughout —
   no action needed there.

**(B) — fallback, if (A)'s Events Manager screen instead shows a fixable
config mismatch** (e.g. Gateway present and "active" but pointing at a
different/decommissioned dataset, or a token needing rotation): follow Meta's
in-UI repair flow for that Gateway instance (Events Manager surfaces a
"Repair" or "Reconnect" action for misconfigured Gateways) rather than
deleting it. Same code-side conclusion — no repo change either way.

There is no (C): confirmed above, zero repo code is involved in constructing,
sending, or receiving the Gateway request.

## Add to Task 17's founder checklist

Task 17 (`DEPLOY-GATE-CHECKLIST.md`) Step 7, Meta Events Manager item 6
references this doc's outcome — see that file for the checklist entry.

## Founder verification steps (not executable from this environment — no
browser/Meta Events Manager credentials in this documentation task)

**1. Capture the failing request (devtools).**
- Open `https://estrevia.app` (or `/es`) with DevTools → Network tab open,
  filter on `datah04`, hard-reload.
- Record: full request URL (includes the Gateway token after `/events/`),
  the POST payload `fbevents.js` sends, and the verbatim 422 response body.
- Cross-check `cdl=API_unavailable` (or similar) query params on the
  fallback-channel requests — this was the 2026-05-11 audit's signal that a
  channel was unreachable; worth confirming whether it now reads
  differently (e.g. `cdl=` absent but 422 present = Gateway reachable but
  rejecting, versus `cdl=API_unavailable` = Gateway unreachable entirely).

**2. Determine the Gateway state (Events Manager).**
- Events Manager → Data sources → confirm the pixel being inspected is
  `1945750759636135` (**Pixel 2**, the live one per
  `project_advertising_audit_2026_05_17` memory) and that this **matches**
  both `NEXT_PUBLIC_META_PIXEL_ID` and `META_PIXEL_ID` in Vercel Production
  (see flag below — do not assume, confirm both).
- Settings → Conversions API Gateway: gateway instance listed? Status
  (active/error/disconnected)? Hosting/managed-by info, if shown.
- Note whether it was provisioned by the founder, by an agency/partner, or
  auto-suggested by Meta during the 05-11/05-13 attribution work.

**3. EMQ + browser event flow (the relaunch attribution-readiness check the
CRO audit said no sector owned).**
- Events Manager → pixel `1945750759636135` → Test Events / Event overview:
  confirm browser `PageView` and `Lead` events are arriving (not just server
  CAPI ones — check the "Browser" source column specifically).
- Check current Event Match Quality (EMQ) score for `Lead` — the 2026-05-11
  baseline was 4.6/10 before `fbc`/`fbp` were added; confirm it reads ≥7/10
  now that the 05-13 fix has been live ~2 months.

## Flag: two separate Pixel-ID env vars, both must be confirmed

- **Browser** (`src/app/[locale]/layout.tsx:53`): `NEXT_PUBLIC_META_PIXEL_ID`
- **Server** (`src/modules/advertising/meta-capi/index.ts:29`): `META_PIXEL_ID`

These are two distinct Vercel env vars (not one shared value read twice) —
`.env.example:99` and `:105` document them as siblings that must be kept in
sync manually. **Confirm both = `1945750759636135` in Vercel Production**
before drawing any conclusion about the 422s being Gateway-only; a
browser/server pixel-ID mismatch would look similar in Events Manager symptoms
but would be a config problem in Vercel, not Events Manager, and would need a
Vercel env fix (still not a code fix).
