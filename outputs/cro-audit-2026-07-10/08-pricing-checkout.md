# Sector 08 — Pricing Page + Checkout API Path (bottom-of-funnel CRO, code-level)

**CRO audit 2026-07-10 · window 2026-05-29 → 2026-07-10 (~6 weeks) unless labeled otherwise · all probes read-only**
**Baseline:** `outputs/ad-audit-2026-05-29/REPORT.md`
**Probe scripts (new, local):** `scripts/advertising/_cro_audit_2026_07_10_pricing_stripe.mjs`, `_cro_audit_2026_07_10_pricing_db.mjs`, `_cro_audit_2026_07_10_pricing_posthog.mjs`, `_cro_audit_2026_07_10_pricing_resend_clerk.mjs`

---

## TL;DR

The anon sign-in fix (de39cee) **is deployed and works** — both anonymous payers since 5/30 materialized, got their Redis ticket, and signed in within ~2 minutes (0 ticket timeouts). Baseline P0 #2 is **closed**. But the same webhook path has a **new verified P0**: it writes `users.email = stripe-pending-…@placeholder.invalid` and the Clerk `user.created` webhook (`onConflictDoNothing`) never overwrites it — so **every lifecycle email to every anonymous payer bounces**: purchase confirmation, all trial-end reminders, all 4 dunning recovery emails, the cancellation email, and re-engagement. The trial-billing-recovery stack built to fix baseline P0 #3 exists and fires on schedule, but for the only cohort that actually pays (100% of completed checkouts since 5/29 were anonymous) it emails a dead address. One annual customer ($34.99, `sub_1TixxA…`) failed at trial end 6/19–7/03 while all 4 recovery emails bounced — that is the recovery stack failing in exactly the scenario it was built for. Separately: `/checkout/complete` still burns a guaranteed 8 s polling Stripe metadata that can never contain the ticket (dead code after de39cee); the ES trial CTA still lacks "gratis" (open since 5/29 audit); and the HALF50 launch is dead on the shelf — 6 commits unpushed and the live Stripe coupon expired 2026-06-06 with 0 redemptions.

Bottom-funnel scale for context: **9 checkout sessions in 6 weeks** (ads dark since 5/24), 2 completed (22%), 2 new subs → 1 retained payer. MRR $4.99, lifetime revenue $24.95.

---

## 1. Verified funnel numbers (5/29 → 7/10)

| Metric | Value | Source (all read-only) |
|---|---|---|
| Checkout sessions created | 9 (8 EN-context, 1 ES) | Stripe `checkout.sessions.list created≥2026-05-29` |
| Sessions completed | 2 (22%) — both EN, both **anonymous** | same |
| ES sessions completed | 0/1 (the es-419 session expired) | same |
| New subscriptions | 2 (6/07 monthly, 6/16 annual) | Stripe `subscriptions.list status=all` |
| Trial→paid | 1/2 — `la***@gmail` paid $4.99 on 6/10 **and** 7/10 (retained); `mp***@gmail` annual failed at trial end, canceled 7/03 | Stripe invoices + subscriptions |
| MRR now | $4.99 (1 active sub) — unchanged vs baseline | Stripe subscriptions |
| Lifetime revenue | $24.95 (was $14.97 at baseline; +$9.98 = the retained payer's two charges) | Stripe `invoices.list status=paid` |
| `invoice.payment_failed` webhooks | 50 since 5/29, last 2026-07-10 | Neon `processed_stripe_events` |
| email_leads | 279 total (+22 since 5/29), 145 ES, 17 converted | Neon `email_leads` |
| checkout_ticket_timeout events | **0** | PostHog HogQL since 5/29 |
| /pricing pageviews | 8 in 6 weeks (1 ES) — page is near-zero traffic while ads are dark | PostHog `$pageview` pathname LIKE '%/pricing%' |

Funnel event counts since 5/29 (PostHog): `anonymous_checkout_started` 9 → `checkout_stripe_redirected` 8 → `checkout.session.completed` 2 → `anonymous_user_materialized` 2 → `checkout_ticket_ready` 2 → `subscription_started` 2. Recovery endpoints: 0 attempts (never needed).

---

## 2. Findings (ranked)

### STR-1 · P0 — Every lifecycle email to anonymous payers bounces: `users.email` stays `stripe-pending-…@placeholder.invalid` forever

**Load-bearing number: 9/9 lifecycle emails to the two June anon payers went to `@placeholder.invalid` and bounced (Resend `last_event=bounced`).**

- **Mechanism (code):**
  - `src/app/api/webhooks/stripe/route.ts:389` — anon branch upserts the users row with `email: 'stripe-pending-<id>@placeholder.invalid'` and a comment saying it "must be overwritten when the Clerk webhook arrives".
  - `src/app/api/webhooks/clerk/route.ts:92-101` — `user.created` inserts with **`.onConflictDoNothing()`**. For anon payers the Stripe webhook always creates the row first (it calls `clerk.users.createUser` mid-handler), so the Clerk webhook always hits the conflict and never writes the real email. Deterministic, not a race.
- **Blast radius (every consumer of `users.email`):** purchase confirmation (`sendPurchaseConfirmationEmail`, webhook line ~478), trial-expiration reminders (`/api/cron/trial-expiration` + `trial_will_end` webhook), dunning recovery (`invoice.payment_failed` handler), `subscription_canceled` email, `re_engagement_28d` cron.
- **Verified in prod (Resend GET /emails/{id} on `sent_trial_emails` / `sent_dunning_emails` message ids):**
  - 5/5 trial emails since 5/29 → `stripe-pending-user_3En2Ff…@placeholder.invalid` / `…user_3FDqWz…@placeholder.invalid`, all `last_event=bounced`.
  - Dunning d0 for the failed annual payer (`f968079d…`, 6/19) → placeholder, `bounced`; d3/d7/d10 same recipient (users.email unchanged throughout). Contrast: dunning to an authenticated-era user (`di***@gmail`, d10 7/03) was `opened` — the machinery itself works.
  - `sent_emails`: `subscription_canceled` (7/03, user_3FDqWz) and `re_engagement_28d` (7/05, user_3En2Ff) also addressed via users.email → placeholder.
- **Money already lost:** `mp***@gmail` completed checkout 6/16 (annual, $34.99/yr), payment failed at trial end 6/19, Stripe retried until 7/03, **all 4 dunning emails with the one-click update-payment link bounced**, sub canceled 7/03. This is baseline P0 #3's fix failing for exactly the case it was built for.
- **Ongoing risk:** the ONLY current paying customer (`user_3En2Ff…`, $4.99/mo) is unreachable by any email — when their card eventually declines, dunning will bounce and the $4.99 MRR dies silently. (Clerk has the real address: `la***@gmail`; sign-in works — only the DB column is stale.)
- **Fix (small, 3 parts):**
  1. Stripe webhook anon branch: the real email is already in scope (`session.customer_details.email` — the branch cannot proceed without it). Use it in the upsert instead of the placeholder; keep the placeholder only for the authenticated-branch edge where email is genuinely unknown.
  2. Clerk `user.created`: change `.onConflictDoNothing()` to `onConflictDoUpdate` that sets `email` when the existing value matches `stripe-pending-%@placeholder.invalid` (never overwrite a real email).
  3. Backfill: 4 rows currently match `LIKE 'stripe-pending-%@placeholder.invalid'` (Neon `users`); 2 have `user_` ids and real emails in Clerk (verified via Clerk API) — one-time repair script, and re-run `_repair_orphan_anon_payers_2026_05_30.mjs --apply` semantics for the 2 pre-fix UUID-keyed rows (both canceled, low value).
  4. Regression test: anon `checkout.session.completed` → users.email equals the Stripe session email, not placeholder.

### STR-2 · P1 — `/checkout/complete` blocks every payer ~8 s polling Stripe metadata that can never contain the ticket (dead code after de39cee)

**Load-bearing number: 0 writers of `metadata.signInTicket` remain in `src/` (grep) — yet the deployed page polls it 16× over 8 s before rendering anything.**

- `src/app/[locale]/checkout/complete/page.tsx:41-55` (`waitForTicket`) polls `session.metadata?.signInTicket` every 500 ms for 8 s. Since de39cee the ticket lives only in Redis (`src/shared/lib/checkout-ticket.ts`); the webhook/`recover` never write metadata. Confirmed identical on origin/main (`git diff origin/main..main -- src/app/[locale]/checkout/complete/` is empty).
- Effect: every paying user stares at a blank navigation for a guaranteed 8 s at the single highest-anxiety moment of the funnel ("did my payment go through?"), plus 16 wasted Stripe API reads per payer, before the client poller (which works) takes over. Both June payers did eventually sign in (~1–2 min end-to-end incl. Clerk), and 0 timeouts fired — this is friction, not breakage.
- **Fix:** replace the Stripe-metadata poll with the server reading Redis directly (`getCheckoutTicket(sessionId)` — already imported infrastructure), poll for ~3-4 s max; on hit, server-redirect immediately. Typical webhook latency is 1–2 s, so most payers would hard-redirect to sign-in with no client polling at all.

### STR-3 · P1 — ES trial CTA still omits "gratis" — carried over from 5/29 audit (finding #6), live 6+ weeks later

**Load-bearing number: 52% of all leads are ES (145/279, Neon `email_leads`) but ES has 1 paid conversion ever.**

- Verified live on `https://estrevia.app/es/pricing` (curl, 2026-07-10): button reads **"Comenzar prueba de 3 días"**. `messages/es.json` `pricing.startTrial` and `paywall.trialCta` both lack "gratis"; EN says "Start 3-Day **Free** Trial". "Free" is the single highest-lift word on a trial CTA and the ES funnel breaks precisely at paywall_click (traffic audit 5/23).
- Copy alternatives (pick one pair, keep both keys in sync):
  1. **ES:** "Prueba Pro gratis por 3 días" / **EN:** "Try Pro Free for 3 Days" — value-first, plan name in the button.
  2. **ES:** "Comienza tu prueba gratis de 3 días" / **EN:** "Start My 3-Day Free Trial" — the 5/29 audit's exact suggestion; first-person possessive lifts trial CTAs.
  3. **ES:** "Ver mi carta completa — gratis 3 días" / **EN:** "Unlock My Full Chart — Free for 3 Days" — outcome-language for the paywall variant (`paywall.trialCta`), where the user just hit a blocked reading.
- One-line i18n change + the paywall twin; no code changes.

### STR-4 · P1 — HALF50 is dead on the shelf: 6 commits unpushed since 5/30 AND the live Stripe coupon expired 2026-06-06 with 0 redemptions

**Load-bearing number: coupon `HALF50` `redeem_by=2026-06-06`, `valid=false`, `times_redeemed=0` (Stripe `coupons.list`, 2026-07-10).**

- State matrix (coded vs deployed vs sent):
  | Piece | Local repo | Deployed (origin/main) | Prod data |
  |---|---|---|---|
  | `coupons.ts` registry (TEASER20+HALF50) | ✅ commit a7fd213 | ❌ (deployed zod enum = `['TEASER20']` only) | — |
  | Coupon-fallback session create | ✅ 9e1d19e/7241c3b | ❌ | — |
  | `DiscountLaunchEmail` + CAN-SPAM footer | ✅ a50812e | ❌ | — |
  | Migration 0018 `sent_discount_blast_emails` | ✅ 5f7f690 | ❌ | table **does not exist** in Neon |
  | Stripe coupon HALF50 | — | — | exists but **expired 6/06, valid=false, 0 redemptions** |
  | Promotion code HALF50 | — | — | `active=false` |
  | Blast send | gated script `_send_discount_blast_2026_05_30.mjs` | — | **never sent** (no table, 0 redemptions) |
  | `STRIPE_COUPON_HALF50` env | in local `.env` | unknown in Vercel prod | — |
- The 7-day 50%-off window aimed at ~256 leads simply lapsed. Consolation: the coded coupon-rejected fallback (retry without discount) means a stale emailed `&coupon=HALF50` link would still check out at full price rather than 500.
- **Decision needed (founder):** either (a) re-cut the coupon with a fresh `redeem_by`, push the 6 commits, apply migration 0018, set `STRIPE_COUPON_HALF50` + `COMPANY_POSTAL_ADDRESS` in Vercel prod (EmailLayout **throws** without it — see memory note), and send; or (b) formally drop it. Do NOT send against today's deployed code: the deployed zod enum rejects `coupon:'HALF50'`, and the parse-failure catch resets `plan='pro_annual'` and drops locale+UTM for the whole request.

### STR-5 · P2 — Pricing headline is jargon-first; "14 days" vs "3-day trial" number collision

- Live H1: **"Sidereal Vedic charts — Lahiri-accurate"** with subheading "The way the ancient texts intended. Try Pro risk-free for 14 days." Three numbers compete within one viewport: 3-day trial (CTA), 14-day guarantee (subheading + guarantee block), "won't be charged until {date}" (fine print). A cold visitor must reconcile trial vs guarantee; "Lahiri-accurate" means nothing pre-education (5-second value-prop test fails for paid-social traffic).
- Headline alternatives (outcome-focused, matches "your sign is wrong" ad angles):
  1. **EN:** "Your real chart. Every reading unlocked." / **ES:** "Tu carta real. Todas las lecturas desbloqueadas."
  2. **EN:** "Go deeper than your Sun sign — Pro unlocks everything" / **ES:** "Ve más allá de tu signo solar — Pro lo desbloquea todo"
  3. **EN:** "One coffee a month for the sky as NASA sees it" / **ES:** "Un café al mes por el cielo tal como lo ve la NASA" (price-anchor + the winning "NASA" creative angle, $1.14 CPL).
- Subheading fix: state both numbers as a sequence, once: **EN** "3-day free trial, then $4.99/mo. Not for you? Full refund within 14 days." / **ES** "3 días de prueba gratis, luego $4.99/mes. ¿No es para ti? Reembolso total en 14 días."

### STR-6 · P2 — Mobile order: Free card renders above Pro; primary CTA ~2 screens below the fold

- `PricingToggle.tsx:103-222` — `grid-cols-1 md:grid-cols-2` with Free first in DOM. On mobile (dominant for Meta traffic) the visitor scrolls past 9 free features before seeing the Pro price or the gold CTA; the free tier reads as the recommended option. Fix: `order-first md:order-none` on the Pro card (or swap DOM order and mirror with `md:order-*`), and consider a "Most popular"/"Recomendado" badge on Pro — currently nothing explicitly marks the recommended plan except border color.

### STR-7 · P2 — Billing-retry zombie: sub past_due 44 days, 50 `invoice.payment_failed` webhooks in 6 weeks, dunning re-cycles on the same invoice

- `sub_1TagCX…` (user_3EBHoi/di***) has been `past_due` since trial end 2026-05-27 with no `canceled_at` (Stripe). `processed_stripe_events` logged 50 `invoice.payment_failed` since 5/29 (last 7/10). `sent_dunning_emails` shows a **second** d0→d10 cycle for the same `billing_period_start=2026-05-27` sent 6/27→7/03 (ids 48–54) — the step-dedup key resets, so the same dead sub re-triggers a full email cycle every ~30 days indefinitely.
- Fix: in Stripe Dashboard → Billing → Revenue recovery, set "cancel subscription" after the final retry (baseline recommended this implicitly); optionally dedup dunning on `(subscription_id, stripe_invoice_id, step)` instead of billing period. Low dollar impact today, but it inflates every failed-payment metric and will spam real customers post-relaunch.

### STR-8 · P3 — Post-purchase lands on `/settings`, not the product

- `CheckoutCompleteClient.tsx:29` and `complete/page.tsx:69` hard-code `redirect_url=/settings`. The one retained payer signed in on 6/07 and has `last_active=2026-06-07` (Clerk) — paid twice, used the product ~once. Landing a fresh payer on a settings page instead of their unlocked chart/reading wastes the activation moment. Fix: redirect to `/chart` (or carry the originating paywalled path through checkout metadata).

### STR-9 · P3 — Minor checkout-config polish

- **"Current Plan" on the Free card** is shown to anonymous visitors who have no plan (`pricing.currentPlan`); for signed-out traffic, label it "Free forever" / "Gratis para siempre" and make it a secondary sign-up link.
- **Promotion-code surface unused:** `allow_promotion_codes: true` on the default path, and TEASER20's promo code is active/typable — 0 redemptions ever (Stripe `promotionCodes.list`). Either surface a code in emails or drop the field (it adds a "hunt for a coupon" abandon vector).
- **Deployed idempotency key omits the coupon** (`buildCheckoutIdempotencyKey` gains `coupon:` only in unpushed 7241c3b) — same-day retry of the same user with/without coupon could collide. Already fixed locally; ships with the HALF50 push.
- **FAQ3 promises Apple Pay / Google Pay** — accurate only insofar as wallets ride the `card` payment method; fine, but verify wallet toggles in Stripe settings before relying on it in copy.

---

## 3. Checkout session config as-coded (assessment b) — deployed (origin/main de39cee)

| Item | State | Evidence |
|---|---|---|
| `payment_method_types` | `['card','link']` on **both** branches; no other `checkout.sessions.create` call sites in `src/` (grep) — baseline STR-5 leak closed | `route.ts:276,394` |
| Stripe `locale` | `es-419` when body locale=es, else `auto` — confirmed live on the 6/02 ES session (`locale=es-419`) | route.ts:155; Stripe session `cs_live_b1kMBD…` |
| `custom_text` (ES) | LATAM currency equivalents injected for ES; strings match `messages/es.json` badge values exactly (630 MXN / 147 000 COP / …) | route.ts:161-168 |
| `trial_period_days` | 3 on anon branch always; 3 on auth branch only for customers without `stripeCustomerId` (returning customers get no second trial — correct) | route.ts:287,405 |
| Coupons | Deployed: TEASER20 only, annual-only, via `discounts` (disables promo entry, no stacking); else `allow_promotion_codes: true`. HALF50 support unpushed | route.ts (origin/main) |
| Idempotency | Param-aware key incl. identity/plan/day/locale/UTM/customer; anon fallback `randomUUID()` (no shared-bucket collision — 5/23 fix holds); coupon component unpushed | `findOrPrepareCustomer.ts` |
| Dedup | `findOrPrepareCustomer` block/reuse on known emails both branches (dup-customer fix holds) | route.ts:237-256, 353-366 |
| success/cancel URLs | `/checkout/complete?session_id=…` / `/pricing` | route.ts:294,408 |
| LATAM currency badge (shipped 5/21) | Still live on `/es/pricing` (curl verified), ES-locale-gated, monthly+annual variants; consistent with Stripe `custom_text` | PricingToggle.tsx:183-191 |

## 4. Post-payment path trace (assessment c) — VERIFIED WORKING in prod

`checkout.session.completed` → `extractClerkUserId` returns null for anon (`user_` prefix guard, route.ts:78-90) → Clerk find-or-create with race recovery → `signInTokens.createSignInToken` (600 s) → **Redis** `checkout_ticket:<session_id>` (TTL 900 s) → user lands on `/checkout/complete` → ⚠️ 8 s dead metadata poll (STR-2) → client polls `/session-status` (reads Redis) → `/sign-in?__clerk_ticket=…&redirect_url=/settings` → Clerk session → `/settings`.

Deployment proof (behavioral, not just git): origin/main tip **is** de39cee; both post-fix payers (6/07, 6/16) have real `user_`-prefixed ids, real emails in Clerk, `checkout_ticket_ready` fired, and Clerk `last_sign_in_at` 1–2 min after payment; `checkout_ticket_timeout` = 0 and `/recover` was never invoked. **Baseline P0 #2 closed.** Remaining gap: what they can't do is receive email (STR-1), and where they land is `/settings` (STR-8).

## 5. Trial-end billing recovery (assessment d)

Exists and is **deployed + operating** (contra baseline "does any exist" framing — it shipped 2026-05-24, commits 9d5b327/d86c9d6/5fa5f6f, before the 5/29 audit ran):
- T-72h `reminder_3d` via `customer.subscription.trial_will_end` webhook; T-24h `reminder_1d` + T-0 `trial_ended` via hourly `/api/cron/trial-expiration` (vercel.json `0 * * * *`); dunning d0/d3/d7/d10 via `invoice.payment_failed` with billing-portal one-click update-payment link.
- Prod counts (Neon): reminder_1d ×8, reminder_3d ×7, trial_ended ×6 all-time; 5 sends since 5/29, all with Resend message ids, fired exactly on schedule for both June trials.
- **But**: for anonymous payers 100% of these bounce (STR-1). The stack is real; the address book is broken. For authenticated-era users it delivers (dunning d10 to `di***@gmail` was opened).

## 6. What changed vs 2026-05-29 baseline

| Baseline finding | Status 2026-07-10 |
|---|---|
| P0 #2 paid anon can't sign in | **CLOSED** — de39cee deployed, verified with 2 real payers |
| P0 #3 trial→paid ~8%, no recovery emails | **Machinery shipped & firing**, but **functionally dead for anon payers** (STR-1, new P0); trial→paid since: 1/2 |
| P0/P1 #4 ES checkout abandonment | Unmeasurable at n=1 (single ES session, expired); ES CTA copy fix (#6) still not applied (STR-3) |
| card+link every path (STR-5) | **CLOSED** — single create site, both branches card+link |
| Account dark | Still dark — 9 sessions/6 weeks confirms near-zero bottom-funnel traffic |
| Real MRR | $4.99 → $4.99 (unchanged); lifetime $14.97 → $24.95 |

## 7. Recommended fix order (this sector only)

1. **STR-1** — real email into `users` for anon payers + Clerk-webhook conflict update + backfill 4 rows (protects the only live MRR and makes the whole email stack real). Ship before any ad relaunch.
2. **STR-2** — Redis-based server wait on `/checkout/complete` (delete `waitForTicket` metadata poll).
3. **STR-3** — "gratis"/"Free" CTA i18n (two keys), 5 minutes.
4. **STR-4** — HALF50 go/no-go decision; if go: new coupon + push + migration 0018 + 2 env vars.
5. STR-5/6 — pricing-page copy + mobile order when relaunch traffic makes /pricing matter again.
6. STR-7 — Stripe revenue-recovery auto-cancel setting (Dashboard, no code).
