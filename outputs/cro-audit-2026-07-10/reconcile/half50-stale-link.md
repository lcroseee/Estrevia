# RECONCILE #7 — Stale `?coupon=HALF50` link on deployed code

**Date:** 2026-07-10 · **Method:** origin/main (`de39cee`) code trace + read-only prod checks (Neon SQL, Stripe GET, Resend GET)
**Verdict: 08-pricing-checkout is right about the deployed API path; 01-stripe is wrong (no failure mode exists). Both missed that the realistic link path is even more benign — AND the whole scenario is unreachable: no HALF50 link was ever sent and no deployed surface emits one.**

---

## The two claims

- **01-stripe.md §4:** "`CheckoutStartClient.tsx` + checkout route accept `?coupon=HALF50`. If the blast (or any old link) were sent today, **session creation would fail on an expired coupon**."
- **08-pricing-checkout.md STR-4:** "the deployed zod enum rejects `coupon:'HALF50'`, and the parse-failure catch **resets `plan='pro_annual'` and drops locale+UTM** for the whole request" (checkout proceeds at full price).

Repo state confirmed: `git rev-list --left-right --count main...origin/main` → `6 0`. The 6 HALF50 commits (`9c69b61 a7fd213 a50812e 5f7f690 9e1d19e 7241c3b`) are local-only; deployed = `origin/main` @ `de39cee`.

## Deployed code (origin/main), exact lines

`src/app/api/v1/stripe/checkout/route.ts`:

```ts
// L35
const ALLOWED_COUPON_CODES = ['TEASER20'] as const;
// L48 (inside checkoutBodySchema)
  coupon: z.enum(ALLOWED_COUPON_CODES).optional(),
// L84-102
  let plan: 'pro_monthly' | 'pro_annual' = 'pro_annual';
  let localeFromBody: 'en' | 'es' | undefined = undefined;
  let utm: Record<string, string> = {};
  let couponCode: AllowedCouponCode | undefined = undefined;
  try {
    const parsed = checkoutBodySchema.parse(body);
    plan = parsed.plan; localeFromBody = parsed.locale; couponCode = parsed.coupon; utm = ...;
  } catch {
    plan = 'pro_annual';          // ← locale/UTM/coupon stay at initial empty values
  }
// L253 + L369 (both branches) — the ONLY way any coupon reaches Stripe:
  ...(couponCode === 'TEASER20' && plan === 'pro_annual' && process.env.STRIPE_COUPON_TEASER20
    ? { discounts: [{ coupon: process.env.STRIPE_COUPON_TEASER20 }] }
    : { allow_promotion_codes: true }),
```

`src/app/[locale]/checkout/start/CheckoutStartClient.tsx`:

```ts
// L45-46
  const couponRaw = searchParams.get('coupon');
  const coupon = couponRaw === 'TEASER20' ? 'TEASER20' : undefined;   // HALF50 → undefined
// L61 — POST body
  { plan, returnUrl, locale, ...utmFields, ...(coupon ? { coupon } : {}) },
```

## Trace

**(a) The link a HALF50 email would carry** — shape per the (unpushed) blast script `scripts/advertising/_send_discount_blast_2026_05_30.mjs:116`: `https://estrevia.app/{es/}checkout/start?plan=pro_monthly&coupon=HALF50&utm_source=discount-blast&…`.
Deployed `CheckoutStartClient` L46 maps `HALF50` → `undefined` **before the POST**; the body carries no `coupon` key at all. Zod parse **succeeds** (`z.object` strips the unknown `returnUrl` key; no `.strict()`). Result: **full-price** session, `allow_promotion_codes: true`, and **plan (`pro_monthly` from URL), locale (`useLocale`), and UTM all SURVIVE** (URL UTMs → `UtmCapture` in `src/app/[locale]/layout.tsx:85` → last-touch cookie → `readUtmLastTouch()` in the POST). No failure, no reset, no drop.
`/pricing?coupon=HALF50`: the deployed pricing surface has **zero** coupon handling (`git grep coupon origin/main -- 'src/app/[locale]/(marketing)/pricing/'` → nothing; deployed `src/shared/lib/email.ts:1035` comment: "the /pricing UI does not forward ?coupon"). Same outcome: coupon ignored, nothing else affected.

**(b) Direct POST** to `/api/v1/stripe/checkout` with `{coupon:'HALF50', plan:'pro_monthly', locale:'es', utm_*}`: `z.enum(['TEASER20'])` throws → catch at L100-102 → **plan reset to `pro_annual`, locale+UTM dropped** (stay `undefined`/`{}`), `couponCode=undefined` → 200 OK, full-price annual session with promo-code box open. **Not a failure.** This is exactly 08's sentence — but it is reachable only by a handcrafted API call, never by clicking a link, because the deployed client filters the coupon first (a).

**01's failure mode is impossible on deployed code:** the L253/L369 ternary means only `STRIPE_COUPON_TEASER20` can ever reach `stripe.checkout.sessions.create` — the expired HALF50 coupon **cannot reach Stripe at all**, so "session creation would fail on an expired coupon" has no code path. It is wrong even against the local tree 01 read: unpushed `route.ts` L54-88 adds a coupon-rejected fallback (`coupon_expired`/`resource_missing` → warn + retry once without discount) precisely so "a permanent emailed `&coupon=…` link never hard-fails checkout with a 500" (local L57).

**(c) Reachability — can a real user even hold such a link? NO.**
- `SELECT to_regclass('public.sent_discount_blast_emails')` → **null** (table absent in prod; migration 0018 never applied). The blast script's dedup pre-check `SELECT … FROM sent_discount_blast_emails` (script L88) runs **before** the send loop — it would crash on the missing table, so not even one blast email can have been sent.
- **Resend full history:** 1,809 emails fetched back to 2026-05-17 18:49 UTC (covers the whole ≥05-20 window, 1,508 emails). **Zero** subjects matching `/half50|50 ?%|discount|descuento/i` beyond TEASER20 items. Only discount emails ever sent: variant-C paywall teasers ("…20% off, 48h only", 6 EN+ES) and "Last chance — keep Estrevia Pro at 20% off" ×7 — all TEASER20.
- The 6 `trial_ended` win-back emails render prod `TRIAL_WINBACK_COUPON_CODE` = **TEASER20** as typable text ("code TEASER20 at checkout for 10% off…", no `coupon=` link) — verified by fetching bodies of `ed25b098…`, `22b60d3e…`, `53e2b4e9…` from Resend. No HALF50 anywhere.
- Deployed link emitters: `git grep 'coupon=' origin/main -- src/` → only `&coupon=TEASER20` (email.ts L692 drip variant C; L1037 cart-abandon — and `sent_cart_abandon_emails` has **0 rows**).
- Stripe: coupon `HALF50` `valid=false`, `redeem_by=2026-06-06T23:53:30Z`, `times_redeemed=0`; promo `promo_1Tcwh5DoVTUWyGzGTIaYxYDF` `active=false`, 0 redemptions.

## Verdict

| Claim | Correct? |
|---|---|
| 01: "session creation would fail on an expired coupon" | **Wrong** — HALF50 can never reach Stripe on origin/main (client filter L46 + zod L48 + TEASER20-only ternary L253/369); and the local tree it read has an explicit retry-without-discount fallback |
| 08: "deployed zod enum rejects HALF50; catch resets plan=pro_annual, drops locale+UTM; checks out at full price" | **Right** — for a direct API POST. For the actual link path the deployed client strips the coupon pre-POST, so plan/locale/UTM survive intact (even more benign than 08 stated; 08's "consolation" line also credited the unpushed fallback for full-price survival, but on deployed code the client filter + zod are what deliver it) |
| Reachability | **Not reachable.** Blast never sent (table absent → script crashes pre-send), zero HALF50 subjects/links in all 1,809 Resend sends since 05-17, no deployed surface emits a HALF50 link. Hypothetical only. |

## What REPORT.md must say

Drop 01-stripe's hazard sentence ("session creation would fail"). Correct framing: a stale `?coupon=HALF50` link — which **does not exist in any inbox** — would silently check out at **full price** on deployed code (link path: plan/locale/UTM intact; raw API POST only: plan reset to pro_annual + locale/UTM dropped — a data-quality footnote, not a revenue or availability risk). The operative recommendation is unchanged from STR-4: if reviving HALF50, cut a **new** coupon (old one expired 2026-06-06, 0 redemptions), push the 6 commits (which add the `coupons.ts` allowlist + coupon-rejected retry), apply migration 0018, set `STRIPE_COUPON_HALF50` + `COMPANY_POSTAL_ADDRESS` in Vercel prod — and do not send against today's deployed code because links would silently deliver **full price** (not because they would 500).

*Derivation script: `scripts/advertising/_cro_audit_2026_07_10_reconcile_half50.mjs` (read-only).*
