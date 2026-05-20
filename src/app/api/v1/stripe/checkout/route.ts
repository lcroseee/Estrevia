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

const checkoutBodySchema = z.object({
  plan: z.enum(['pro_monthly', 'pro_annual']).default('pro_annual'),
  locale: z.enum(['en', 'es']).optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  utm_click_timestamp: z.string().datetime().optional(),
});

interface CheckoutResponse {
  url: string;
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
  let utm: Record<string, string> = {};
  try {
    const body = await request.json();
    const parsed = checkoutBodySchema.parse(body);
    plan = parsed.plan;
    localeFromBody = parsed.locale;
    utm = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          entry[0] !== 'plan' && entry[0] !== 'locale' && entry[1] !== undefined,
      ),
    );
  } catch {
    plan = 'pro_annual';
  }

  // Stripe Checkout uses 'auto' (browser language) for EN/missing; explicit
  // 'es' for Spanish-locale callers. Stripe also supports 'en' explicitly,
  // but 'auto' is friendlier when the user is on /en but their browser is
  // set to another language Stripe supports.
  const stripeLocale: 'auto' | 'es' = localeFromBody === 'es' ? 'es' : 'auto';

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

    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: userEmail }),
        client_reference_id: userId,
        locale: stripeLocale,
        metadata: {
          clerkUserId: userId,
          ...utm,
          ...(localeFromBody ? { locale: localeFromBody } : {}),
        },
        subscription_data: {
          ...(stripeCustomerId ? {} : { trial_period_days: 3 }),
          metadata: {
            clerkUserId: userId,
            ...utm,
            ...(localeFromBody ? { locale: localeFromBody } : {}),
          },
        },
        success_url: `${appUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/pricing`,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
      });

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

  try {
    const stripe = getStripe();
    const metadata: Record<string, string> = { ...utm };
    if (anonymousId) metadata.anonymous_id = anonymousId;
    if (localeFromBody) metadata.locale = localeFromBody;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(prefilledEmail ? { customer_email: prefilledEmail } : {}),
      ...(anonymousId ? { client_reference_id: anonymousId } : {}),
      locale: stripeLocale,
      metadata,
      subscription_data: {
        trial_period_days: 3,
        metadata,
      },
      success_url: `${appUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

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
