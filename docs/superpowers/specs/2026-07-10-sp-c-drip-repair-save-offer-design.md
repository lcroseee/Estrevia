# SP-C — Drip Engine Repair & Trial-End Save Offer (Design)

**Date:** 2026-07-10 · **Status:** Approved (recommended-option authorization) · **Depends on:** Phase 0 P0-1 (emails must reach payers before any save offer can work)
**Audit anchors:** `04-resend.md` R-2 (bounce suppression writes 0 flags), finding #5 (utm_content null on 77/77 drip pageviews), #6 (synastry_teaser = 6/10 lifetime unsubs), REPORT.md HALF50 wrap-up ("repurpose as the pre-trial-end save offer, not a cold blast"), welcome NULL `resend_message_id` mechanism.

## Problem

Four verified drip/email-engine defects: (1) the Resend bounce webhook parses fields that don't exist — handler reads `data.bounce_type`/`data.email` (`webhooks/resend/route.ts:24-30,101-102`) while Resend actually sends `data.bounce.type` (`Permanent|Transient|Undetermined`) and `data.to[]` (SDK `resend@6.10.0` types + live audit) — so suppression has NEVER flagged anything and its tests encode the wrong shape; (2) `sendWelcomeEmail` has no `result.error` check (`email.ts:162-181`) AND `recordSent` blindly INSERTs a second row that collides with the one-shot partial unique index for `welcome` (`sent-emails.ts:36` vs `schema.ts:484-486`) — welcome rows likely never carry a message id even on success; (3) drip links carry no `utm_medium`/`utm_content`/`utm_term` (`email.ts` — 7 senders), leaving per-template attribution blind; (4) T+21d `synastry_teaser` drives 6 of 10 lifetime unsubscribes. Meanwhile the shelved HALF50 infrastructure (coupon registry, gated blast, `sent_discount_blast_emails`) is the natural engine for a trial-end save offer, and `TRIAL_WINBACK_COUPON_CODE` half-exists (display-only, never appended to the URL — `trial-expiration-email.ts:100,95-97`).

## Goals

1. Bounce/complaint suppression actually writes flags (correct payload shape, correct policy).
2. Welcome (and all `sent_emails` one-shot types) use the claim→update dedup pattern; no more false-positive "sent".
3. Every drip link carries `utm_medium=email`, `utm_content=<leadId>`, `utm_term=<template>`.
4. A 50% save offer reaches trial-enders at T-1d (and the existing trial_ended winback), coupon applied by URL, fully env-gated.
5. synastry_teaser retired.

## Non-goals

- Cold blast to the exhausted lead pool — explicitly rejected (roadmap decision D4).
- New drip content/steps (refuel with new sequences is a post-relaunch decision with data).
- The placeholder-email fix itself — Phase 0.

## Decisions

- **D1. Bounce policy:** `bounce.type === 'Permanent'` → hard: set `users.emailUndeliverable` + `emailLeads.emailUndeliverable` for every address in `data.to[]` (lowercased). `Transient`/`Undetermined` → log only (revisit if Undetermined volume appears). Complaint path switches to `data.to[]` too. Types rewritten to match the SDK (`EmailBouncedEvent`: `data: BaseEmailEventData & { bounce: EmailBounce }`); tests rewritten with the REAL payload shape (fixture from SDK types; svix verification flow unchanged).
- **D2. Welcome sender:** adopt the lead-sender pattern (`email.ts:474-481`): claim slot → send → throw on `result.error` → UPDATE the claimed row with the message id. Concretely: new `tryInsertOneShotUser` + `recordSentUpdate` in `sent-emails.ts` mirroring `sent-lead-emails.ts:35-93` (claim inserts NULL-msgid row, returns sent/retry/already; success path UPDATEs instead of INSERTing a colliding second row). `purchase_confirmation` keeps Resend idempotencyKey (non-one-shot type, unaffected by the partial index).
- **D3. UTM scheme (resolves the audit's design tension):** `utm_content=<leadId>` — keeps the Stripe-webhook lead-link fallback working (it regex-matches a 21-char leadId, `webhooks/stripe/route.ts:289-291`); `utm_term=<template>` (t0/curiosity_hook/…) for per-template attribution; `utm_medium=email` everywhere. Applied to all 7 drip senders + cart-abandon (has medium already) in `email.ts`. The audit's alternative (template in utm_content) rejected — it would permanently disable the lead-link fallback.
- **D4. Save offer:** cut a NEW Stripe coupon (50% off, `duration: once`, both plans, NO `redeem_by` this time — per-send urgency lives in copy, not coupon immutability), registered as a new registry code `SAVE50` in `coupons.ts` (`ALLOWED_COUPON_CODES` + `COUPON_CONFIG` → env `STRIPE_COUPON_SAVE50`; keeps HALF50 history clean). Coupon-creation script mirrors `_create_half50_coupon_2026_05_30.mjs`. Delivery: `reminder_1d` branch of `trial-expiration-email.ts` gets `couponCode` + `&coupon=SAVE50` appended to `proUrl` when `STRIPE_COUPON_SAVE50` is set (env-gated: unset → email unchanged); `TrialReminder1dEmail` gains an optional coupon block (50%-off framing). `trial_ended` winback: replace the display-only `TRIAL_WINBACK_COUPON_CODE` mechanism — same registry code, `&coupon=` actually appended to the URL. Copy: new STRINGS in the two templates (EN+ES), NOT a reuse of `DiscountLaunchEmail` (its copy targets pre-trial leads).
- **D5. synastry_teaser retired:** remove the step 6→7 handler from `STEP_HANDLERS` (`lead-nurture/route.ts:100`); step 6 becomes terminal (nextDelayMs null on the 5→6 handler). Leads currently at step 6 simply never get the last send. Template file stays (history); `sent_lead_emails` enum keeps the value (rows exist).
- **D6. Env docs:** `STRIPE_COUPON_SAVE50` added to `.env.example` here (SP-F owns the unrelated backlog of missing vars); `TRIAL_WINBACK_COUPON_CODE` reading removed (superseded).

## Error handling

- Webhook: unknown bounce types → log + 200 (never 500-loop on Resend retries); per-address update failures isolated.
- Save offer: coupon resolution failure (env unset / not in registry) degrades to the plain email — never blocks the trial reminder itself.
- Cron/senders: keep the existing throw-on-`result.error` + claim/retry semantics.

## Testing

- Resend webhook: real-shape fixtures — Permanent flags user+lead (multi-recipient `to[]`), Transient logs only, complaint sets `unsubscribedAt`, malformed → 200 + log; old-shape payload (regression: must NOT flag).
- Welcome: Resend error → claim released for retry, no false `sent:true`; success → row UPDATEd with msgid (no 23505); second call → `already_sent`.
- UTM: each sender's URL asserted to carry medium/content/term (extend existing email render tests).
- Save offer: reminder_1d with env set → URL contains `&coupon=SAVE50` + copy block renders (EN+ES); env unset → byte-identical to today; trial_ended same. coupons.ts registry test extended.
- STEP_HANDLERS: no handler for fromStep 6; 5→6 terminal.

## Success criteria

- Next real bounce writes `email_undeliverable` (verify in prod after first occurrence — audit ES pool guarantees candidates fast).
- `sent_emails` welcome rows carry non-NULL `resend_message_id` for successful sends.
- PostHog/Stripe attribution can split drip performance per template via `utm_term` while lead-link fallback keeps functioning.
- First trial-ender after ship receives the T-1d offer with a working 50% checkout link (test-mode verified first).
- Unsub rate on the final drip step drops (synastry_teaser retired).
