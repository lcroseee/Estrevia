/**
 * /checkout/complete — public post-payment landing page.
 *
 * Outside the (app) route group so anonymous users can reach it without
 * Clerk middleware redirecting to /sign-in first.
 *
 * Server-component flow:
 *   1. Read ?session_id=cs_xxx
 *   2. In parallel: poll Redis for the Clerk sign-in ticket (written by the
 *      Stripe webhook / recover route via checkout-ticket.ts) for up to 5s,
 *      and fetch the Stripe session ONCE to resolve the post-sign-in target
 *      (metadata.return_url — the page that made them pay — or the localized
 *      /chart; never /settings).
 *   3a. If ticket found: server-redirect to /sign-in?__clerk_ticket=…&redirect_url=<target>
 *   3b. If not found: render <CheckoutCompleteClient/> which polls the
 *       session-status endpoint every 2s for up to 30s, then falls back to
 *       a "check your email" message.
 *
 * Once Clerk consumes the ticket at /sign-in, the user lands on the resolved
 * target with a session cookie set; middleware then allows access normally.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { createMetadata } from '@/shared/seo';
import { getStripe } from '@/shared/lib/stripe';
import { getCheckoutTicket } from '@/shared/lib/checkout-ticket';
import { CheckoutCompleteClient } from './CheckoutCompleteClient';

const SERVER_POLL_MAX_MS = 5000;
const SERVER_POLL_INTERVAL_MS = 500;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tMeta = await getTranslations('pageMeta.checkoutComplete');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/checkout/complete',
    locale: locale as 'en' | 'es',
    noIndex: true,
  });
}

/**
 * The webhook writes the ticket to Redis within seconds of payment — poll the
 * same store /session-status reads. Stripe session metadata has NOT carried
 * the ticket since de39cee (Clerk tokens exceed the 500-char metadata cap).
 */
async function waitForTicket(sessionId: string): Promise<string | null> {
  const deadline = Date.now() + SERVER_POLL_MAX_MS;
  while (Date.now() < deadline) {
    try {
      const ticket = await getCheckoutTicket(sessionId);
      if (ticket) return ticket;
    } catch {
      // Redis blip — same as ticket-absent; the client poller is the fallback layer.
    }
    await new Promise((r) => setTimeout(r, SERVER_POLL_INTERVAL_MS));
  }
  return null;
}

/**
 * Where the payer lands after sign-in: metadata.return_url (same-origin path,
 * validated at checkout AND re-checked here — metadata is dashboard-editable)
 * or the localized /chart. One Stripe GET; failure is never fatal.
 */
async function resolveRedirectTarget(sessionId: string, locale: string): Promise<string> {
  const fallback = locale === 'es' ? '/es/chart' : '/chart';
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const returnUrl = session.metadata?.return_url;
    // Reject a leading `/` followed by `/` or `\`, and any backslash elsewhere:
    // browsers normalize `\` to `/`, so `/\evil.com` is protocol-relative
    // (open-redirect) and no legitimate path contains a backslash. Mirrors the
    // checkout route's validation; metadata is dashboard-editable so re-check here.
    if (returnUrl && /^\/(?![/\\])(?!.*\\)/.test(returnUrl) && returnUrl.length <= 500)
      return returnUrl;
  } catch {
    // Session lookup failed — the redirect hint degrades to /chart.
  }
  return fallback;
}

interface PageProps {
  searchParams: Promise<{ session_id?: string }>;
  params: Promise<{ locale: string }>;
}

export default async function CheckoutCompletePage({ searchParams, params }: PageProps) {
  const sp = await searchParams;
  const { locale } = await params;
  const sessionId = sp.session_id;
  if (!sessionId) redirect('/pricing?error=session_not_found');

  const [ticket, redirectTarget] = await Promise.all([
    waitForTicket(sessionId),
    resolveRedirectTarget(sessionId, locale),
  ]);
  if (ticket) {
    const target = `/sign-in?__clerk_ticket=${encodeURIComponent(ticket)}&redirect_url=${encodeURIComponent(redirectTarget)}`;
    redirect(target);
  }

  const t = await getTranslations('pricingPage.checkout.complete');
  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <div
          className="inline-block w-8 h-8 border-2 border-[#FFD700]/30 border-t-[#FFD700] rounded-full animate-spin mb-5"
          role="status"
          aria-label={t('title')}
        />
        <h1
          className="text-lg font-light text-white mb-2"
          style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
        >
          {t('title')}
        </h1>
        <p className="text-sm text-white/50 mb-6">{t('description')}</p>
        <CheckoutCompleteClient sessionId={sessionId} redirectTarget={redirectTarget} />
      </div>
    </div>
  );
}
