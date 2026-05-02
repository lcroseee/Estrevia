'use client';

/**
 * /checkout/start — post-auth bridge that auto-starts a Stripe Checkout session
 * and redirects to Stripe. Visited by users who just signed in/up via the
 * paywall or /pricing flow, so they land directly on Stripe without having to
 * re-click the trial button on the original page.
 *
 * Query params:
 *   plan    — 'pro_monthly' | 'pro_annual' (defaults to pro_annual)
 *   return  — path to send the user back to if checkout fails (defaults to '/')
 *
 * Outcomes:
 *   - ok + stripe URL  → window.location.href = stripeUrl (Stripe Checkout)
 *   - auth-required    → back to /sign-in (edge case: session expired mid-flow)
 *   - error / network  → inline error + retry + "go back" button
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { postJson } from '@/shared/lib/apiFetch';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

type Plan = 'pro_monthly' | 'pro_annual';

interface CheckoutResponse {
  success: boolean;
  data?: { url: string };
  error?: string;
}

export function CheckoutStartClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('pricingPage.checkout');

  const planRaw = searchParams.get('plan');
  const plan: Plan = planRaw === 'pro_monthly' ? 'pro_monthly' : 'pro_annual';
  const returnUrl = searchParams.get('return') ?? '/';

  const [phase, setPhase] = useState<'preparing' | 'redirecting' | 'error'>('preparing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    trackEvent(AnalyticsEvent.CHECKOUT_AUTO_STARTED, { plan, returnUrl, attempt });

    (async () => {
      const result = await postJson<CheckoutResponse>(
        '/api/v1/stripe/checkout',
        { plan, returnUrl },
      );
      if (cancelled) return;

      switch (result.kind) {
        case 'ok': {
          if (result.data.success && result.data.data?.url) {
            setPhase('redirecting');
            trackEvent(AnalyticsEvent.CHECKOUT_STRIPE_REDIRECTED, { plan });
            window.location.href = result.data.data.url;
          } else {
            setPhase('error');
            setErrorMessage(t('errSession'));
            trackEvent(AnalyticsEvent.CHECKOUT_ERROR, {
              plan,
              reason: result.data.error ?? 'unknown',
            });
          }
          break;
        }
        case 'auth-required': {
          // Edge case: session expired between sign-in and this page. Bounce
          // back through sign-up so we keep the original intent.
          const again = `/checkout/start?plan=${plan}&return=${encodeURIComponent(returnUrl)}`;
          window.location.href = `/sign-up?redirect_url=${encodeURIComponent(again)}`;
          break;
        }
        case 'error': {
          setPhase('error');
          setErrorMessage(result.message || t('errGeneric'));
          trackEvent(AnalyticsEvent.CHECKOUT_ERROR, {
            plan,
            status: result.status,
            reason: result.message,
          });
          break;
        }
        case 'network-error': {
          setPhase('error');
          setErrorMessage(t('errNetwork'));
          trackEvent(AnalyticsEvent.CHECKOUT_ERROR, { plan, reason: 'network' });
          break;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // attempt drives retries; plan/returnUrl come from URL and don't change mid-session.
  }, [plan, returnUrl, attempt, t]);

  function retry() {
    setPhase('preparing');
    setErrorMessage('');
    setAttempt((n) => n + 1);
  }

  function goBack() {
    router.push(returnUrl);
  }

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <div className="text-center max-w-sm">
        {phase === 'preparing' && (
          <>
            <Spinner label={t('loadingAria')} />
            <h1
              className="text-lg font-light text-white mt-5"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('preparing')}
            </h1>
            <p className="text-sm text-white/50 mt-1.5">
              {t('takingTo')}
            </p>
          </>
        )}

        {phase === 'redirecting' && (
          <>
            <Spinner label={t('loadingAria')} />
            <h1
              className="text-lg font-light text-white mt-5"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('redirecting')}
            </h1>
          </>
        )}

        {phase === 'error' && (
          <>
            <h1
              className="text-lg font-light text-white mb-3"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('somethingWrong')}
            </h1>
            <p className="text-sm text-white/60 mb-6">{errorMessage}</p>
            <div className="flex flex-col gap-3 items-stretch">
              <button
                type="button"
                onClick={retry}
                className="py-3 px-6 rounded-xl text-sm font-semibold tracking-wide transition-transform hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #FFD700, #FFE033)',
                  color: '#0A0A0F',
                }}
              >
                {t('tryAgain')}
              </button>
              <button
                type="button"
                onClick={goBack}
                className="text-xs text-white/45 hover:text-white/70 py-2"
              >
                {t('goBack')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div
      className="inline-block w-8 h-8 border-2 border-[#FFD700]/30 border-t-[#FFD700] rounded-full animate-spin"
      role="status"
      aria-label={label}
    />
  );
}
