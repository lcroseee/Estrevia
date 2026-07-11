/**
 * POST /api/v1/stripe/checkout
 *
 * Creates a Stripe Checkout session for upgrading to Premium.
 * Works in two modes:
 *
 *   AUTHENTICATED — existing behavior: ties session to current user's email,
 *   reuses stripeCustomerId, short-circuits if already premium.
 *
 *   ANONYMOUS — new: when no Clerk session, looks up email from email_leads
 *   by anonymous_id cookie (best-effort pre-fill). Stripe Checkout collects
 *   email natively if no pre-fill available. Webhook materializes the Clerk
 *   user on payment success.
 *
 * Returns: { url: string } — the hosted Checkout URL.
 */

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { computeIsPremium } from '@/modules/auth/lib/premium';
import { getDb } from '@/shared/lib/db';
import { users, emailLeads } from '@/shared/lib/schema';
import { getStripe } from '@/shared/lib/stripe';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { ApiResponse } from '@/shared/types';
import { randomUUID } from 'node:crypto';
import { findOrPrepareCustomer, utcDayBucket, buildCheckoutIdempotencyKey } from './findOrPrepareCustomer';
import { ALLOWED_COUPON_CODES, resolveCouponId, type AllowedCouponCode } from '@/shared/lib/coupons';

const checkoutBodySchema = z.object({
  plan: z.enum(['pro_monthly', 'pro_annual']).default('pro_annual'),
  locale: z.enum(['en', 'es']).optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  utm_click_timestamp: z.string().datetime().optional(),
  // A/B test coupon — only allowlisted values accepted (see ALLOWED_COUPON_CODES)
  coupon: z.enum(ALLOWED_COUPON_CODES).optional(),
  // Post-purchase return target — same-origin, single-slash-rooted path only
  // (e.g. /tarot/celtic-cross). Reject a leading `/` followed by `/` or `\`, AND
  // any backslash elsewhere: browsers normalize `\` to `/`, so `/\evil.com`
  // becomes protocol-relative (https://evil.com) — an open-redirect vector — and
  // no legitimate rooted path contains a backslash. .catch(undefined) degrades an
  // invalid value to absent instead of failing the whole parse: checkout must
  // never break over a redirect hint. 500-char cap = Stripe metadata value limit.
  returnUrl: z.string().max(500).regex(/^\/(?![/\\])(?!.*\\)/).optional().catch(undefined),
});

interface CheckoutResponse {
  url: string;
}

/**
 * Create a Checkout session, attaching `resolvedCoupon` via `discounts` (which
 * disables promo-code entry to prevent stacking). If Stripe rejects the coupon
 * — e.g. HALF50 past its 7-day redeem_by, or a deleted coupon — retry ONCE
 * without the discount (open promo codes) under a distinct idempotency key, so
 * a permanent emailed `&coupon=…` link never hard-fails checkout with a 500.
 * When there is no coupon, just open promo codes.
 */
type CheckoutSessionParams = NonNullable<Parameters<Stripe['checkout']['sessions']['create']>[0]>;

async function createCheckoutSessionWithCouponFallback(
  stripe: Stripe,
  baseParams: CheckoutSessionParams,
  resolvedCoupon: string | null,
  idempotencyKey: string,
) {
  if (!resolvedCoupon) {
    return stripe.checkout.sessions.create(
      { ...baseParams, allow_promotion_codes: true },
      { idempotencyKey },
    );
  }
  try {
    return await stripe.checkout.sessions.create(
      { ...baseParams, discounts: [{ coupon: resolvedCoupon }] },
      { idempotencyKey },
    );
  } catch (err) {
    const e = err as { code?: string; param?: string };
    const isCouponError =
      e?.code === 'coupon_expired' ||
      e?.code === 'resource_missing' ||
      (typeof e?.param === 'string' && e.param.includes('coupon'));
    if (!isCouponError) throw err;
    console.warn('[stripe/checkout] coupon rejected — retrying without discount', {
      coupon: resolvedCoupon,
      code: e?.code,
    });
    return stripe.checkout.sessions.create(
      { ...baseParams, allow_promotion_codes: true },
      { idempotencyKey: `${idempotencyKey}:nc` },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse<ApiResponse<CheckoutResponse>>> {
  // ---------------------------------------------------------------------------
  // 1. Resolve auth state (may be null for anonymous)
  // ---------------------------------------------------------------------------
  const { userId } = await auth();
  const isAuthenticated = userId !== null && userId !== undefined;

  // For anonymous, key rate-limit by anonymous_id cookie; fall back to IP.
  const cookieStore = await cookies();
  const anonymousId = cookieStore.get('anonymous_id')?.value ?? null;
  const rateLimitKey = isAuthenticated
    ? userId
    : (anonymousId ?? request.headers.get('x-forwarded-for') ?? 'unknown');

  // ---------------------------------------------------------------------------
  // 2. Rate limiting
  // ---------------------------------------------------------------------------
  const limiter = getRateLimiter('stripe/checkout');
  const { success: rateLimitOk } = await limiter.limit(rateLimitKey);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Parse plan + locale + UTM
  // ---------------------------------------------------------------------------
  let plan: 'pro_monthly' | 'pro_annual' = 'pro_annual';
  let localeFromBody: 'en' | 'es' | undefined = undefined;
  let returnUrl: string | undefined = undefined;
  let utm: Record<string, string> = {};
  let couponCode: AllowedCouponCode | undefined = undefined;
  try {
    const body = await request.json();
    const parsed = checkoutBodySchema.parse(body);
    plan = parsed.plan;
    localeFromBody = parsed.locale;
    returnUrl = parsed.returnUrl;
    couponCode = parsed.coupon;
    utm = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          entry[0] !== 'plan' &&
          entry[0] !== 'locale' &&
          entry[0] !== 'coupon' &&
          entry[0] !== 'returnUrl' &&
          entry[1] !== undefined,
      ),
    );
  } catch {
    plan = 'pro_annual';
  }
  // Normalize trivially-useless return targets to absent. CheckoutStartClient
  // ALWAYS POSTs returnUrl (default '/'), and PricingUpgradeButton's auth-failure
  // fallback routes through /checkout/start?return=%2Fpricing — storing those
  // would land payers on the marketing landing page (ES payers on EN '/') or
  // back on /pricing instead of the default localized /chart.
  // Drops: '/', '/es', '/es/', '/pricing', '/es/pricing'.
  if (returnUrl && /^\/(es\/?)?(pricing)?$/.test(returnUrl)) returnUrl = undefined;

  // Resolve the Stripe coupon id to attach (config-driven, see shared/lib/coupons.ts).
  // Returns null when no coupon, the code is not eligible for this plan, or its
  // env var is unset → caller falls back to allow_promotion_codes (no discount, no break).
  const resolvedCoupon = resolveCouponId(couponCode, plan);

  // Stripe Checkout uses 'auto' (browser language) for EN/missing; explicit
  // 'es-419' (LATAM Spanish) for Spanish-locale callers — tú form, LATAM
  // terminology, matches our /es content style guide. Stripe also supports
  // 'es' (European) but es-419 is more appropriate for our MX/CO/PE/CL/AR audience.
  const stripeLocale: 'auto' | 'es-419' = localeFromBody === 'es' ? 'es-419' : 'auto';

  // LATAM currency-equivalent shown inside Stripe Checkout (custom_text.submit).
  // Mirrors messages/es.json pricing.{monthlyPriceEquiv,annualPriceEquiv}.
  // Server-side hardcode to avoid pulling next-intl runtime into API route;
  // keep in sync with messages/es.json when FX rates refresh (quarterly).
  const esCurrencyEquiv =
    plan === 'pro_annual'
      ? '≈ 630 MXN · 147 000 COP · 33 200 CLP · 133 PEN · 1 400 UYU'
      : '≈ 90 MXN · 21 000 COP · 4 740 CLP · 19 PEN · 200 UYU';
  const customTextForLocale =
    localeFromBody === 'es'
      ? { submit: { message: esCurrencyEquiv } }
      : undefined;

  // ---------------------------------------------------------------------------
  // 4. Resolve price ID
  // ---------------------------------------------------------------------------
  const priceIdMap: Record<string, string | undefined> = {
    pro_monthly: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
    pro_annual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL,
  };
  const priceId = priceIdMap[plan] ?? process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    console.error('[stripe/checkout] No price ID configured for plan', { plan });
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://estrevia.app';
  // Locale-prefixed success/cancel URLs. next-intl localePrefix is 'as-needed':
  // EN lives at root (unchanged), ES under /es — so ES payers stay in Spanish
  // through Checkout success AND cancel instead of landing on EN /pricing.
  const localePath = localeFromBody === 'es' ? '/es' : '';

  // ---------------------------------------------------------------------------
  // 5a. AUTHENTICATED branch (preserves existing behavior)
  // ---------------------------------------------------------------------------
  if (isAuthenticated) {
    let stripeCustomerId: string | null = null;
    let userEmail = '';
    let isAlreadyPremium = false;
    try {
      const db = getDb();
      const rows = await db
        .select({
          email: users.email,
          stripeCustomerId: users.stripeCustomerId,
          subscriptionTier: users.subscriptionTier,
          subscriptionStatus: users.subscriptionStatus,
          subscriptionExpiresAt: users.subscriptionExpiresAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const row = rows[0];
      stripeCustomerId = row?.stripeCustomerId ?? null;
      userEmail = row?.email ?? '';
      if (row) {
        isAlreadyPremium = computeIsPremium(
          row.subscriptionTier,
          row.subscriptionStatus,
          row.subscriptionExpiresAt,
        );
      }
    } catch (err) {
      console.error('[stripe/checkout] db lookup failed', { userId, err });
      return NextResponse.json(
        { success: false, data: null, error: 'DATABASE_ERROR' },
        { status: 500 },
      );
    }

    if (isAlreadyPremium) {
      return NextResponse.json(
        { success: true, data: { url: `${appUrl}/settings?already_subscribed=1` }, error: null },
        { status: 200 },
      );
    }

    // Stripe-sync gap fallback: if we have an email but no stripeCustomerId
    // on file, ask Stripe directly. Catches new users between checkout and
    // T13.1 hourly watchdog reconciliation.
    if (!stripeCustomerId && userEmail) {
      try {
        const stripe = getStripe();
        const dedup = await findOrPrepareCustomer(stripe, userEmail);
        if (dedup.kind === 'block') {
          return NextResponse.json(
            { success: true, data: { url: `${appUrl}/settings?already_subscribed=1` }, error: null },
            { status: 200 },
          );
        }
        if (dedup.kind === 'reuse') {
          stripeCustomerId = dedup.customerId;
        }
      } catch (err) {
        console.warn(
          '[stripe/checkout] auth-branch dedup lookup failed (non-fatal)',
          err instanceof Error ? err.message : 'unknown',
        );
      }
    }

    try {
      const stripe = getStripe();
      const idempotencyKey = buildCheckoutIdempotencyKey({
        identity: userId,
        plan,
        day: utcDayBucket(),
        stripeLocale,
        localeFromBody,
        utm,
        customer: stripeCustomerId ?? userEmail ?? 'new',
        coupon: resolvedCoupon,
      });

      const session = await createCheckoutSessionWithCouponFallback(
        stripe,
        {
          mode: 'subscription',
          payment_method_types: ['card', 'link'],
          line_items: [{ price: priceId, quantity: 1 }],
          ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: userEmail }),
          client_reference_id: userId,
          locale: stripeLocale,
          ...(customTextForLocale ? { custom_text: customTextForLocale } : {}),
          metadata: {
            clerkUserId: userId,
            ...utm,
            ...(localeFromBody ? { locale: localeFromBody } : {}),
            ...(returnUrl ? { return_url: returnUrl } : {}),
          },
          subscription_data: {
            ...(stripeCustomerId ? {} : { trial_period_days: 3 }),
            metadata: {
              clerkUserId: userId,
              ...utm,
              ...(localeFromBody ? { locale: localeFromBody } : {}),
            },
          },
          success_url: `${appUrl}${localePath}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}${localePath}/pricing`,
          billing_address_collection: 'auto',
        },
        resolvedCoupon,
        idempotencyKey,
      );

      if (!session.url) {
        console.error('[stripe/checkout] session has no URL', { sessionId: session.id });
        return NextResponse.json(
          { success: false, data: null, error: 'INTERNAL_ERROR' },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { success: true, data: { url: session.url }, error: null },
        { status: 200 },
      );
    } catch (err) {
      try {
        const { captureException } = await import('@sentry/nextjs');
        captureException(err, { tags: { checkout: 'authenticated', stage: 'session-create' } });
      } catch {
        console.error('[stripe/checkout] stripe error', { userId, err });
      }
      return NextResponse.json(
        { success: false, data: null, error: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 5b. ANONYMOUS branch
  // ---------------------------------------------------------------------------
  let prefilledEmail: string | undefined = undefined;
  if (anonymousId) {
    try {
      const db = getDb();
      const rows = await db
        .select({ email: emailLeads.email })
        .from(emailLeads)
        .where(eq(emailLeads.anonymousId, anonymousId))
        .orderBy(desc(emailLeads.createdAt))
        .limit(1);
      if (rows.length > 0) prefilledEmail = rows[0].email;
    } catch (err) {
      console.warn(
        '[stripe/checkout] anonymous email_lead lookup failed (non-fatal)',
        err instanceof Error ? err.message : 'unknown',
      );
    }
  }

  // Dedup: if we already know the email, ask Stripe whether a matching
  // customer + active sub already exists. Block-or-reuse before creating
  // a fresh Checkout session.
  let reuseCustomerId: string | undefined = undefined;
  if (prefilledEmail) {
    const stripe = getStripe();
    const dedup = await findOrPrepareCustomer(stripe, prefilledEmail);
    if (dedup.kind === 'block') {
      return NextResponse.json(
        { success: true, data: { url: `${appUrl}/settings?already_subscribed=1` }, error: null },
        { status: 200 },
      );
    }
    if (dedup.kind === 'reuse') {
      reuseCustomerId = dedup.customerId;
    }
  }

  try {
    const stripe = getStripe();
    const metadata: Record<string, string> = { ...utm };
    if (anonymousId) metadata.anonymous_id = anonymousId;
    if (localeFromBody) metadata.locale = localeFromBody;
    if (returnUrl) metadata.return_url = returnUrl;

    // No stable anonymous_id (cookieless-at-checkout race) → randomUUID so the
    // key is never the shared 'noanon' bucket. The anonymous_id cookie set in
    // middleware makes this fallback rare; when present it keeps the key stable
    // across a single user's identical retries (double-click dedup).
    const idempotencyKey = buildCheckoutIdempotencyKey({
      identity: anonymousId ?? randomUUID(),
      plan,
      day: utcDayBucket(),
      stripeLocale,
      localeFromBody,
      utm,
      customer: reuseCustomerId ?? prefilledEmail ?? 'new',
      coupon: resolvedCoupon,
    });

    const session = await createCheckoutSessionWithCouponFallback(
      stripe,
      {
        mode: 'subscription',
        payment_method_types: ['card', 'link'],
        line_items: [{ price: priceId, quantity: 1 }],
        ...(reuseCustomerId
          ? { customer: reuseCustomerId }
          : prefilledEmail
          ? { customer_email: prefilledEmail }
          : {}),
        ...(anonymousId ? { client_reference_id: anonymousId } : {}),
        locale: stripeLocale,
        ...(customTextForLocale ? { custom_text: customTextForLocale } : {}),
        metadata,
        subscription_data: {
          trial_period_days: 3,
          metadata,
        },
        success_url: `${appUrl}${localePath}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}${localePath}/pricing`,
        billing_address_collection: 'auto',
      },
      resolvedCoupon,
      idempotencyKey,
    );

    if (!session.url) {
      console.error('[stripe/checkout] session has no URL (anonymous)', { sessionId: session.id });
      return NextResponse.json(
        { success: false, data: null, error: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    }

    // Best-effort analytics fire (server-side PostHog). Non-blocking.
    try {
      trackServerEvent(anonymousId ?? `cs:${session.id}`, AnalyticsEvent.ANONYMOUS_CHECKOUT_STARTED, {
        email_known: Boolean(prefilledEmail),
        anonymous_id: anonymousId,
        plan,
        ...utm,
      });
    } catch {
      // PostHog failures must never break the checkout response.
    }

    return NextResponse.json(
      { success: true, data: { url: session.url }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { checkout: 'anonymous', stage: 'session-create' } });
    } catch {
      console.error('[stripe/checkout] anonymous stripe error', { anonymousId, err });
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
