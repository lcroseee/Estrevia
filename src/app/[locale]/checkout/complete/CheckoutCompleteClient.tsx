'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

interface Props {
  sessionId: string;
}

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 30_000;

interface StatusResponseOk {
  success: true;
  data: { ready: boolean; ticket?: string };
  error: null;
}

export function CheckoutCompleteClient({ sessionId }: Props) {
  const t = useTranslations('checkout.complete');
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();
    let cancelled = false;

    async function poll() {
      while (!cancelled && Date.now() - startedAt < POLL_MAX_MS) {
        try {
          const res = await fetch(
            `/api/v1/checkout/session-status?id=${encodeURIComponent(sessionId)}`,
          );
          if (res.ok) {
            const json = (await res.json()) as StatusResponseOk;
            if (json.success && json.data.ready && json.data.ticket) {
              const target = `/sign-in?__clerk_ticket=${encodeURIComponent(json.data.ticket)}&redirect_url=${encodeURIComponent('/settings')}`;
              window.location.href = target;
              return;
            }
          }
        } catch {
          // Network blip; keep polling until deadline.
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      if (!cancelled) {
        trackEvent(AnalyticsEvent.CHECKOUT_TICKET_TIMEOUT, {
          session_id: sessionId,
          waited_ms: Date.now() - startedAt,
        });
        setTimedOut(true);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!timedOut) {
    return <p className="text-xs text-white/40">{t('redirecting')}</p>;
  }

  return (
    <div className="text-left">
      <p className="text-sm text-white/70 mb-3">{t('checkEmail')}</p>
      <p className="text-xs text-white/40">{t('contactSupport')}</p>
    </div>
  );
}
