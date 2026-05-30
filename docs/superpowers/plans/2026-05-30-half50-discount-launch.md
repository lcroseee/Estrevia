# HALF50 50%-off Launch-Week Discount — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Ship a 50%-off / first-charge / 7-day discount (HALF50) on BOTH plans, coupon + auto-apply
links built now; email blast to ~260 addressable leads prepared but SEND-GATED on CAN-SPAM fix + founder OK.

**Architecture:** Extend the existing TEASER20 coupon pattern via a shared `coupons.ts` registry (server
+ client single source of truth), so a config entry — not hardcoded literals — drives plan eligibility.

**Tech Stack:** Next.js 16 route handler, Stripe subscription Checkout, Drizzle/Neon, Resend, React Email, Vitest.

---

### Task 1: Shared coupon registry + tests

**Files:**
- Create: `src/shared/lib/coupons.ts`
- Test: `src/shared/lib/__tests__/coupons.test.ts`

- [ ] **Step 1:** Write failing tests: `resolveCouponId('TEASER20','pro_annual',{STRIPE_COUPON_TEASER20:'c_t'})==='c_t'`; `resolveCouponId('TEASER20','pro_monthly',…)===null`; `resolveCouponId('HALF50','pro_monthly',{STRIPE_COUPON_HALF50:'c_h'})==='c_h'`; `resolveCouponId('HALF50','pro_annual',{STRIPE_COUPON_HALF50:'c_h'})==='c_h'`; `resolveCouponId('HALF50','pro_monthly',{})===null`; `resolveCouponId(undefined,'pro_annual',…)===null`; `isAllowedCouponCode('HALF50')===true`, `isAllowedCouponCode('NOPE')===false`, `isAllowedCouponCode(null)===false`.
- [ ] **Step 2:** Run `npx vitest run src/shared/lib/__tests__/coupons.test.ts` — expect FAIL (module missing).
- [ ] **Step 3:** Implement `coupons.ts` per spec §1 (ALLOWED_COUPON_CODES, COUPON_CONFIG, isAllowedCouponCode, resolveCouponId with `env` param defaulting to `process.env`).
- [ ] **Step 4:** Run tests — expect PASS.
- [ ] **Step 5:** Commit `feat(discount/T1): shared coupon registry — HALF50 both plans, TEASER20 annual-only`.

### Task 2: Wire registry into checkout route

**Files:**
- Modify: `src/app/api/v1/stripe/checkout/route.ts` (lines 33-36 const, 87 type, 253-255 + 369-371 attach blocks)
- Test: `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts`

- [ ] **Step 1:** Add/extend tests: anon checkout with `{plan:'pro_annual',coupon:'TEASER20'}` + env set → `discounts:[{coupon}]` (regression); `{plan:'pro_monthly',coupon:'HALF50'}` + env set → `discounts:[{coupon}]`; `{plan:'pro_monthly',coupon:'HALF50'}` env UNSET → `allow_promotion_codes:true`; `{plan:'pro_monthly',coupon:'TEASER20'}` → `allow_promotion_codes:true` (annual-only preserved).
- [ ] **Step 2:** Run the test file — expect FAIL on the new HALF50 cases.
- [ ] **Step 3:** Replace inline `ALLOWED_COUPON_CODES`/type with imports from `coupons.ts`; replace both attach blocks with `const resolvedCoupon = resolveCouponId(couponCode, plan); ...(resolvedCoupon ? {discounts:[{coupon:resolvedCoupon}]} : {allow_promotion_codes:true})`.
- [ ] **Step 4:** Run tests — expect PASS.
- [ ] **Step 5:** Commit `feat(discount/T2): checkout route resolves HALF50 on both plans via registry`.

### Task 3: Checkout client accepts allowlisted coupons

**Files:**
- Modify: `src/app/[locale]/checkout/start/CheckoutStartClient.tsx:45-46`
- Test: existing client test if present; else covered by route + e2e.

- [ ] **Step 1:** Replace `const coupon = couponRaw === 'TEASER20' ? 'TEASER20' : undefined;` with `const coupon = isAllowedCouponCode(couponRaw) ? couponRaw : undefined;` + import.
- [ ] **Step 2:** Run `npm run typecheck` — expect PASS (coupon type now `AllowedCouponCode | undefined`, accepted by postJson body).
- [ ] **Step 3:** Commit `feat(discount/T3): checkout client forwards any allowlisted coupon (HALF50)`.

### Task 4: CAN-SPAM postal-address footer

**Files:**
- Modify: `src/emails/components/EmailLayout.tsx`
- Test: `src/emails/components/__tests__/EmailLayout.test.tsx` (create if absent)

- [ ] **Step 1:** Write failing test: rendered footer contains the postal-address constant (EN + ES).
- [ ] **Step 2:** Add `POSTAL_ADDRESS` constant (value = founder-provided; until then a clearly-marked TODO sentinel that the send script refuses to send through) and render it as a footer line.
- [ ] **Step 3:** Run test — PASS.
- [ ] **Step 4:** Commit `fix(email/T4): CAN-SPAM physical postal address in email footer`.

### Task 5: Promo email template (EN + ES)

**Files:**
- Create: `src/emails/DiscountLaunchEmail.tsx`
- Test: `src/emails/__tests__/DiscountLaunchEmail.test.tsx`

- [ ] **Step 1:** Failing render tests: EN + ES render; contains `coupon=HALF50` CTA link; contains first-charge-after-trial disclaimer; uses EmailLayout with unsubscribeUrl.
- [ ] **Step 2:** Implement template per spec §5 (continuation-of-value copy, not "SALE"; ES = español neutro LATAM tú).
- [ ] **Step 3:** Run tests — PASS.
- [ ] **Step 4:** Commit `feat(discount/T5): DiscountLaunchEmail promo template (EN+ES)`.

### Task 6: Idempotent send-log table + migration

**Files:**
- Modify: `src/shared/lib/schema.ts` (add `sentDiscountBlastEmails`)
- Create: migration `drizzle/00NN_sent_discount_blast_emails.sql` via `npm run db:generate`

- [ ] **Step 1:** Add Drizzle table per spec §6 (recipient, lead_id?, user_id?, resend_message_id, coupon_code, sent_at).
- [ ] **Step 2:** `npm run db:generate`; verify SQL.
- [ ] **Step 3:** `npm run typecheck` — PASS.
- [ ] **Step 4:** Commit `feat(discount/T6): sent_discount_blast_emails table + migration (founder applies)`.

### Task 7: Gated send script

**Files:**
- Create: `scripts/advertising/_send_discount_blast_2026_05_30.mjs`

- [ ] **Step 1:** Implement DRY-RUN-default script per spec §7 (audience query + dedupe + suppression + sent-log skip + Resend one-click headers + batch throttle). `--apply` required to send; refuse `--apply` if `STRIPE_COUPON_HALF50` unset OR footer still has the TODO sentinel.
- [ ] **Step 2:** Run dry-run; verify recipient count ≈260 and 0 sends.
- [ ] **Step 3:** Commit `feat(discount/T7): gated discount-blast send script (dry-run default)`.

### Task 8: Create Stripe coupon (authorized) + env var

**Files:**
- Create: `scripts/advertising/_create_half50_coupon_2026_05_30.mjs`
- Modify: `.env.example` (add `STRIPE_COUPON_HALF50=`)

- [ ] **Step 1:** Implement idempotent coupon+promotion_code creation per spec §8.
- [ ] **Step 2:** Run it (live Stripe write — founder authorized). Capture coupon id + expiry.
- [ ] **Step 3:** Add `STRIPE_COUPON_HALF50` to `.env.example`; set in Vercel prod (REST API, type=encrypted).
- [ ] **Step 4:** Commit `feat(discount/T8): HALF50 Stripe coupon creation script + env`.

### Final
- [ ] `npm test` + `npm run typecheck` + `npm run lint` all green.
- [ ] Report to founder; **SEND remains gated** on (a) founder postal address + (b) explicit "send now" OK.
- [ ] Optional: adversarial review workflow over the diff (payments-critical) before founder ships.
