/**
 * /checkout/complete — public post-payment landing page.
 *
 * Outside the (app) route group so anonymous users can reach it without
 * Clerk middleware redirecting to /sign-in first.
 *
 * Server-component flow:
 *   1. Read ?session_id=cs_xxx
 *   2. Poll Stripe session metadata for signInTicket up to 8s
 *   3a. If ticket found: server-redirect to /sign-in?__clerk_ticket=…
 *   3b. If not found: render <CheckoutCompleteClient/> which polls the
 *       session-status endpoint every 2s for up to 30s, then falls back to
 *       a "check your email" message.
 *
 * Once Clerk consumes the ticket at /sign-in, the user lands on /settings
 * with a session cookie set; middleware then allows access normally.
 */

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStripe } from '@/shared/lib/stripe';
import { CheckoutCompleteClient } from './CheckoutCompleteClient';

const SERVER_POLL_MAX_MS = 8000;
const SERVER_POLL_INTERVAL_MS = 500;

async function waitForTicket(sessionId: string): Promise<string | null> {
  const stripe = getStripe();
  const deadline = Date.now() + SERVER_POLL_MAX_MS;
  while (Date.now() < deadline) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const ticket = session.metadata?.signInTicket;
      if (ticket) return ticket;
    } catch {
      // Network / transient — keep polling until deadline
    }
    await new Promise((r) => setTimeout(r, SERVER_POLL_INTERVAL_MS));
  }
  return null;
}

interface PageProps {
  searchParams: Promise<{ session_id?: string }>;
  params: Promise<{ locale: string }>;
}

export default async function CheckoutCompletePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sessionId = sp.session_id;
  if (!sessionId) redirect('/pricing?error=session_not_found');

  const ticket = await waitForTicket(sessionId);
  if (ticket) {
    const target = `/sign-in?__clerk_ticket=${encodeURIComponent(ticket)}&redirect_url=${encodeURIComponent('/settings')}`;
    redirect(target);
  }

  const t = await getTranslations('checkout.complete');
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
        <CheckoutCompleteClient sessionId={sessionId} />
      </div>
    </div>
  );
}
