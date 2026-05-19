# Attribution Health Pack — design spec

**Date:** 2026-05-18
**Status:** brainstormed, awaiting plan
**Scope:** small (~2 hours dev + ~30 min ops verification)

## Context

Two attribution-related gaps were surfaced in the 2026-05-18 audit:

1. **MFR1 trial (`sub_1TYH2ZDoVTUWyGzGClRttDgK`)** — Meta EN lead converted to a Stripe trial, but lead-email (`morpheusdreams444@gmail.com`) ≠ Stripe customer-email (`destinig7996@gmail.com`). The existing Stripe webhook lead-linking logic (`src/app/api/webhooks/stripe/route.ts:222-237`) matches only by `email` and `anonymous_id`, so the lead row remains `converted_to_user_id IS NULL` and the lead-nurture cron will keep sending T+72h / T+7d / T+14d / T+21d drip emails to a recipient that already paid for a trial.

2. **Resend bounce/complaint propagation** — Resend webhook handler (`src/app/api/webhooks/resend/route.ts`) already implements `email.bounced` (hard) and `email.complained` → sets `email_undeliverable=true` and (on complaint) `unsubscribed_at=NOW()` on both `users` and `email_leads`. Code is shipped, but production wiring is unverified: `RESEND_WEBHOOK_SECRET` may not be set in Vercel, and the Resend Dashboard may not have a webhook endpoint configured to `https://estrevia.app/api/webhooks/resend`.

Combined, the closure of both gaps tightens the lead-attribution loop without introducing new pipelines.

## Goals

- Stop the lead-nurture drip for any lead whose `id` appears as `utm_content` in a successful Stripe checkout — even if the lead-email differs from the checkout-email.
- Verify (and document the verification of) the production wiring of the existing Resend bounce/complaint webhook.

## Non-goals (deferred to backlog)

- **Clerk-authed checkout lead-linking.** The existing `email_leads` UPDATE in `stripe-webhook/route.ts` runs only inside the anonymous-checkout branch (`if (!clerkUserId)`). Clerk-authed checkouts skip the linking entirely. Closing that gap requires extracting the linking into a shared helper called from both branches. Out of scope for this pack; tracked separately.
- **Retroactive cleanup of orphan leads.** The MFR1 lead (`qnU9lsC9dkhb8XUTXF4wZ`) will remain in `email_leads` with `converted_to_user_id IS NULL` and `unsubscribed_at IS NULL` until manually patched. Out of scope; founder may run a one-shot SQL after the code lands.
- **Audit dashboard metric** distinguishing linkage-by-path (`email` vs `anonymous_id` vs `utm_content`) in PostHog.
- **Programmatic configuration** of the Resend webhook endpoint. Webhook setup remains a manual Resend Dashboard click — the verification script reads, does not write.

## Architecture

Two files touched, zero migrations, zero schema changes.

| Change | File | Type | Approx LOC |
|---|---|---|---|
| `utm_content` fallback path | `src/app/api/webhooks/stripe/route.ts` | edit (replace existing UPDATE block) | +30 |
| Stripe webhook unit tests | `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` | edit (append 6 cases) | +120 |
| Resend webhook wiring audit | `scripts/advertising/_audit_resend_webhook_wiring.mjs` | new standalone script | ~80 |

Existing columns reused as-is:
- `email_leads.unsubscribed_at` — drip cron already filters via `isNull(unsubscribedAt)` (verified in `src/app/api/cron/lead-nurture/route.ts`).
- `email_leads.converted_to_user_id` — unchanged semantics; not touched by `utm_content` fallback.

## Component design

### Component 1 — `utm_content` fallback in Stripe webhook

Replaces the existing UPDATE block at `src/app/api/webhooks/stripe/route.ts:222-243` (inside the anonymous-checkout branch, after the Clerk user materialization and sign-in-ticket creation).

```ts
// Existing path: link by anonymous_id and/or email. Capture matched rows via
// .returning() so we can decide whether to run the utm_content fallback.
const linkedRows = await db
  .update(emailLeads)
  .set({ convertedToUserId: clerkUserId, convertedAt: new Date() })
  .where(
    anonymousIdMeta
      ? or(
          eq(emailLeads.anonymousId, anonymousIdMeta),
          eq(emailLeads.email, email),
        )
      : eq(emailLeads.email, email),
  )
  .returning({ id: emailLeads.id });

// utm_content fallback. Fires only if the standard linkage matched zero rows
// — i.e., the lead-email differs from the checkout-email (MFR1 case) and the
// browser dropped the anonymous_id cookie (or never set it). Sets ONLY
// unsubscribed_at, NOT converted_to_user_id, because we cannot prove identity
// match across different emails (the link might have been shared with a friend
// who paid under their own email).
//
// Validation: utm_content must look like a nanoid (21 chars, [A-Za-z0-9_-]).
// This filters out legacy ad_id-shaped UTMs and malformed input.
//
// Idempotency: guards on `unsubscribed_at IS NULL` and
// `converted_to_user_id IS NULL` make Stripe webhook retries safe.
const utmContent = session.metadata?.utm_content;
const looksLikeLeadId =
  typeof utmContent === 'string' && /^[A-Za-z0-9_-]{21}$/.test(utmContent);

if (linkedRows.length === 0 && looksLikeLeadId) {
  await db
    .update(emailLeads)
    .set({ unsubscribedAt: new Date() })
    .where(
      and(
        eq(emailLeads.id, utmContent),
        isNull(emailLeads.unsubscribedAt),
        isNull(emailLeads.convertedToUserId),
      ),
    );
  console.info('[stripe-webhook] utm_content fallback unsubscribed lead', {
    sessionId: session.id,
    leadId: utmContent,
  });
}
```

Existing try/catch wrapping (`catch (linkErr)` at line 238) remains; both UPDATEs share it. A failure in the second UPDATE logs `email_leads link failed (non-fatal)` and the webhook still returns 200 — Stripe retry would re-attempt both UPDATEs, and the idempotency guards ensure no double-flagging.

The existing `trackServerEvent` calls (`ANONYMOUS_USER_MATERIALIZED`, `CHECKOUT_TICKET_READY`) are not modified.

### Component 2 — Resend webhook wiring audit script

New file: `scripts/advertising/_audit_resend_webhook_wiring.mjs`. Follows the established `_audit_*.mjs` pattern (dotenv + Resend SDK + Neon).

Three read-only checks:

1. **Local env presence.** Verify `RESEND_WEBHOOK_SECRET` is set in `process.env`. (Vercel-side prod env check via REST API is more involved; surfaced as a manual follow-up if local is also missing.)
2. **Resend webhook configuration.** Call `resend.webhooks.list()` if the SDK exposes it; otherwise `fetch('https://api.resend.com/webhooks', { Authorization })`. Look for any webhook with endpoint URL containing `estrevia.app/api/webhooks/resend` and events including at least `email.bounced` and `email.complained`.
3. **Recent webhook deliveries.** If the API exposes per-webhook delivery history, list the last 10 attempts. Flag if all are 4xx/5xx. If no deliveries exist, log an explicit note: "no bounce/complaint events yet — fire a test event from Resend Dashboard → Webhooks → Send test".

Output shape (3-line summary + actionable URLs):

```
Check 1 (local RESEND_WEBHOOK_SECRET):     ✓ present
Check 2 (Resend webhook endpoint):         ✓ configured: webhook_abc123 → /api/webhooks/resend
Check 3 (recent deliveries):               ⚠ no events yet — https://resend.com/webhooks
```

No code in the script writes to Resend, Vercel, or the DB.

## Data flow

```
Stripe Checkout completed
   ↓
checkout.session.completed webhook
   ↓
anonymous-branch (clerkUserId resolved via createUser-or-find)
   ↓
UPDATE email_leads SET converted_to_user_id, converted_at
  WHERE anonymous_id = X OR email = Y       ← Path 1 (existing)
   ↓
RETURNING { id }
   ↓
linkedRows.length === 0 ?
   ├── no  → done
   └── yes → check session.metadata.utm_content
              ↓
              matches /^[A-Za-z0-9_-]{21}$/ ?
              ├── no  → done
              └── yes → UPDATE email_leads SET unsubscribed_at = NOW()
                          WHERE id = utm_content
                            AND unsubscribed_at IS NULL
                            AND converted_to_user_id IS NULL    ← Path 2 (new)
```

## Error handling

All paths share the existing `try { ... } catch (linkErr) { console.warn(...) }` wrapper (`stripe-webhook/route.ts:238-242`). A failure in either UPDATE is non-fatal — the webhook returns 200, Stripe does not retry, and the lead remains un-linked.

Rationale for non-fatal: the primary purpose of `checkout.session.completed` is activating premium on the `users` row. Lead linkage is observability/UX. Forcing a 5xx would loop Stripe retries unnecessarily.

Idempotency on Stripe retry is structural (the column guards prevent double-writes), not transactional.

## Testing

Append to `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`. All cases use mocked `db.update().set().where().returning()` and assert call patterns + arguments.

| # | Test | Behaviour asserted |
|---|---|---|
| 1 | `linksByEmail_thenSkipsUtmFallback` | email match returns 1 row → second UPDATE never invoked, even with valid `utm_content` |
| 2 | `emailMismatch_utmFallbackSetsUnsubscribed` | email match returns 0 rows, valid 21-char `utm_content` → second UPDATE runs with `unsubscribed_at=NOW()` and dual `IS NULL` guards |
| 3 | `utmFallback_idempotentOnRetry` | Lead already has `unsubscribed_at IS NOT NULL` → guard short-circuits, no rows touched |
| 4 | `utmFallback_invalidFormatNoOp` | `utm_content="ad_123"` (legacy) or 22-char string → pattern check rejects, no UPDATE |
| 5 | `utmFallback_skipsAlreadyConverted` | Lead has `converted_to_user_id IS NOT NULL` → guard prevents overwriting |
| 6 | `utmFallback_noMetadataNoOp` | `session.metadata.utm_content` undefined → no UPDATE, no error |

The Resend wiring script is operational tooling, not unit-tested.

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Lead-ID format drift (some leads with non-nanoid IDs) | Low — empirically verified 132/132 match `^[A-Za-z0-9_-]{21}$` at spec time | Pattern check; if a future migration changes the ID format, pattern test in CI catches it |
| Stripe retries cause double UPDATE on Path 2 | High frequency, low impact | `unsubscribed_at IS NULL` guard makes second fire a no-op |
| Race: parallel webhook deliveries link the same lead via different paths | Very low (Stripe serializes by event_id, dedup table in webhook prevents reprocessing) | Existing `processedStripeEvents` dedup table |
| Resend SDK doesn't expose `webhooks.list()` | Medium | Fallback to raw `fetch('https://api.resend.com/webhooks')` with Authorization; ultimate fallback is runbook noting "verify in Resend Dashboard" |

## References

- Audit surfacing the gap: `outputs/advertising-audit-2026-05-17-evening/00-executive-summary.md`
- MFR1 trial details: 2026-05-18 conversation; `sub_1TYH2ZDoVTUWyGzGClRttDgK`, lead `qnU9lsC9dkhb8XUTXF4wZ`
- Existing Resend webhook handler: `src/app/api/webhooks/resend/route.ts`
- Existing lead-linkage: `src/app/api/webhooks/stripe/route.ts:222-243`
- Cron filter on `unsubscribed_at`: `src/app/api/cron/lead-nurture/route.ts`

## Acceptance criteria

1. After deploy, any `checkout.session.completed` whose `metadata.utm_content` is a valid lead-ID and whose lead-email differs from the checkout-email sets `email_leads.unsubscribed_at` on that lead row.
2. The lead-nurture cron, on its next run, skips that lead (no more drip).
3. `_audit_resend_webhook_wiring.mjs` runs cleanly, prints a 3-line green/red status, and the founder can act on any red line in under 5 minutes.
4. All 6 new tests + the existing webhook test suite pass.
