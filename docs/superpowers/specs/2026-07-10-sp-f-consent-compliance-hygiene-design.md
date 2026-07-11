# SP-F — Consent Compliance & Repo Hygiene (Design)

**Date:** 2026-07-10 · **Status:** Approved (recommended-option authorization) · **Timing:** pixel gating should land before scaled Meta re-spend (compliance risk grows with traffic)
**Audit anchors:** LIVE-7 (`_fbp` set pre-consent AND after Decline while the banner claims "no third-party tracking"), Drizzle journal drift (idx 13 missing; idx 14-17 `when` timestamps are 2025-epoch, below idx 12 — migrator would silently skip them), `.env.example` gaps.

## Problem

Verified mechanisms: the Meta Pixel base snippet mounts in the server component `src/app/[locale]/layout.tsx:53-84` gated ONLY on `NEXT_PUBLIC_META_PIXEL_ID` — no consent check exists anywhere in the pixel path (grep: zero `fbq('consent'…)` usages), and a `<noscript>` `facebook.com/tr` img fires unconditionally; consent plumbing (`estrevia_cookie_consent` localStorage + `estrevia:consent` CustomEvent) is consumed ONLY by PostHogProvider. The banner's claim "No ads, no third-party tracking" (`CookieConsent.tsx:91-93`) is factually false. Journal: `drizzle/meta/_journal.json` lacks idx 13 entirely and idx 14-17 carry `when` ≈ 2025-05-24 (1748044800000…) — lower than idx 12's value, so drizzle's migrator ordering is broken for them; snapshots 0013-0017 are unrecoverable but the committed 0018 snapshot already healed `db:generate` diffing. `.env.example` lacks `TRIAL_WINBACK_COUPON_CODE`, `DRY_RUN`, `CART_ABANDON_DRY_RUN`, `DUNNING_DRY_RUN`, `META_CAPI_GRAPH_VERSION` (all read in src/). The `/privacy` page may repeat the tracking claim (unaudited).

## Goals

1. No Meta cookie (`_fbp`) and no facebook.com request before consent or after Decline.
2. Banner + privacy-page copy tells the truth (strings themselves ship via SP-B's i18n work; THIS spec fixes the mechanism the copy describes).
3. Journal internally consistent (correct ordering), with the manual-apply migration discipline explicitly kept.
4. `.env.example` complete.

## Non-goals

- Making `npm run db:migrate` authoritative (would need a `__drizzle_migrations` ledger backfill; the hand-applied idempotent-SQL pattern stays — decision recorded).
- Consent-rate optimization (audit exclusion).
- CookieConsent visual/copy changes beyond what SP-B ships.

## Decisions

- **D1. Pixel loader becomes a consent-gated client component.** New `src/shared/components/MetaPixelLoader.tsx` (`'use client'`): reads `getCookieConsent()` (exported at `PostHogProvider.tsx:39-44`), listens for the `estrevia:consent` CustomEvent; renders the `<Script id="meta-pixel-base">` (same snippet, `next/script` works in client components) ONLY when consent === 'accepted'; on Decline/absent renders nothing. Accept-after-load: the event listener flips state and the script mounts without navigation. Revoking after grant requires reload to drop fbq (documented; cookies are cleared… NOT automatically — see D2). `src/app/[locale]/layout.tsx:53-84` replaces the inline snippet + `<noscript>` img with `<MetaPixelLoader pixelId={pixelId} />` (noscript img is REMOVED — it cannot be consent-gated and its value is ~zero: ad clicks come from JS-capable in-app browsers). The five downstream `fbq(...)` emitters already no-op when `fbq` is undefined — verified, no changes needed.
- **D2. Decline also clears `_fbp`/`_fbc`.** On `estrevia:consent` = declined, MetaPixelLoader expires the `_fbp`/`_fbc` cookies (document.cookie set with past expiry on the root domain) — covers the "declined AFTER the pixel already set cookies in a previous visit under the old build" migration case.
- **D3. Attribution trade-off accepted and instrumented.** Post-consent-only pixel = browser events undercount by the consent-decline/ignore rate. Server-side CAPI (graph.facebook.com path) is unaffected. The runbook's relaunch metrics use server `landing_view` (Phase 0 T11) as the denominator — decision recorded there; EMQ impact watched in Events Manager during week 1.
- **D4. Journal repair (hand-edit, no tooling exists):** insert `{"idx":13,"version":"7","when":<idx12.when+1>,"tag":"0013_curiosity_hook_renumber","breakpoints":true}`; rewrite idx 14-17 `when` to real 2026 epoch values, strictly monotonic between idx 13 and idx 18 (e.g. 1779580800000+n). Verified against: journal parses, idx strictly increasing, `when` strictly increasing. `db:generate` sanity: run it after the edit and confirm it emits an EMPTY diff (0018 snapshot is the baseline; if it re-emits tables, hand-trim per `feedback_drizzle_snapshot_stale` — expected empty).
- **D5. `.env.example` additions** (with one-line comments + defaults): `TRIAL_WINBACK_COUPON_CODE` (note: superseded by SP-C's `STRIPE_COUPON_SAVE50` — add whichever survives implementation order; coordinate), `DRY_RUN`, `CART_ABANDON_DRY_RUN` (default true), `DUNNING_DRY_RUN` (default true), `META_CAPI_GRAPH_VERSION` (default v22.0). `NEXT_PUBLIC_VERCEL_URL` skipped (platform-injected).
- **D6. `/privacy` copy audit** (both locales): read the page, align any "no third-party tracking"-class claims with post-D1 reality ("Meta Pixel loads only after you accept cookies; we never send your birth data to advertisers"). Content edits are surgical copy fixes, not a rewrite (page is legal copy — flag anything structural to the founder instead of editing).

## Error handling

- MetaPixelLoader must never throw during render (localStorage access wrapped — private-mode safe); missing pixelId → renders nothing (current behavior preserved).
- Journal edit is all-or-nothing: commit only after `db:generate` empty-diff verification passes.

## Testing

- MetaPixelLoader unit (jsdom): no consent → no script node, no cookies touched; consent accepted (pre-set) → script mounts; accept via event after mount → script appears; decline via event → no script + `_fbp` cookie expired.
- Regression: layout renders MetaPixelLoader with env set, nothing with it unset.
- Journal: a small node assertion script (or vitest) — parse `_journal.json`, assert idx and `when` strictly increasing, tags match on-disk sql files 0000-0018 minus none.
- E2E (extends paywall/landing specs): fresh context → zero requests to `facebook.net`/`facebook.com` before consent (Playwright `page.on('request')` collector); after Accept → pixel request observed.
- `npx vitest run` + typecheck + lint.

## Success criteria

- Fresh prod visit (devtools): no `_fbp` cookie, no facebook requests until Accept; Decline leaves none and clears leftovers.
- Banner claim (SP-B copy) and mechanism agree.
- `db:generate` produces an empty diff on the repaired journal; journal ordering monotonic.
- `.env.example` documents every env var src/ reads (spot-check via the audit grep).
