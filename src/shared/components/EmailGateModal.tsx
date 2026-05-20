'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { readUtmLastTouch } from '@/shared/lib/utm-cookie';
import { readMetaCookies } from '@/shared/lib/meta-cookies';

interface EmailGateModalProps {
  open: boolean;
  onSubmitted: () => void;
  onDismiss: () => void;
  chartId: string;
  locale: 'en' | 'es';
}

interface LeadOk {
  success: true;
  data: { leadId: string; eventId: string; wasNew: boolean };
  error: null;
}
interface LeadErr {
  success: false;
  data: null;
  error: string;
}
type LeadResponse = LeadOk | LeadErr;

type FbqGlobal = (
  command: 'track',
  event: 'Lead',
  data: Record<string, unknown>,
  options: { eventID: string },
) => void;

const STORAGE_FLAG = 'email_gate_passed';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getDistinctId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const ph = (window as unknown as { posthog?: { get_distinct_id?: () => string } }).posthog;
  try {
    return ph?.get_distinct_id?.();
  } catch {
    return undefined;
  }
}

function safeSetFlag(): void {
  try {
    window.localStorage.setItem(STORAGE_FLAG, '1');
  } catch {
    /* private mode / quota — ignore */
  }
}

export function EmailGateModal({ open, onSubmitted, onDismiss, chartId, locale }: EmailGateModalProps) {
  const t = useTranslations('emailGate');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleDismiss = useCallback(() => {
    safeSetFlag();
    trackEvent(AnalyticsEvent.EMAIL_GATE_DISMISSED, { chartId, locale });
    onDismiss();
  }, [chartId, locale, onDismiss]);

  const viewedFiredRef = useRef(false);

  useEffect(() => {
    if (open) {
      if (!viewedFiredRef.current) {
        trackEvent(AnalyticsEvent.EMAIL_GATE_VIEWED, { chartId, locale });
        viewedFiredRef.current = true;
      }
    } else {
      viewedFiredRef.current = false;
    }
  }, [open, chartId, locale]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleDismiss();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleDismiss]);

  if (!open) return null;

  const trimmed = email.trim();
  const submitDisabled = loading || trimmed.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (!EMAIL_REGEX.test(trimmed)) {
      setError(t('errInvalidEmail'));
      return;
    }

    setLoading(true);
    try {
      const utm = readUtmLastTouch();
      const meta = readMetaCookies();
      const anonymous_id = getDistinctId();
      const res = await fetch('/api/v1/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed.toLowerCase(),
          chartId,
          locale,
          anonymous_id,
          ...utm,
          ...meta,
        }),
      });

      if (res.status === 429) {
        setError(t('errRateLimited'));
        return;
      }

      let json: LeadResponse;
      try {
        json = (await res.json()) as LeadResponse;
      } catch {
        setError(t('errGeneric'));
        return;
      }

      if (!res.ok || !json.success) {
        setError(t('errGeneric'));
        return;
      }

      const { eventId, wasNew } = json.data;

      if (wasNew) {
        const fbq = (window as unknown as { fbq?: FbqGlobal }).fbq;
        if (typeof fbq === 'function') {
          try {
            fbq('track', 'Lead', {}, { eventID: eventId });
          } catch {
            /* fbq is best-effort */
          }
        }
      } else {
        trackEvent(AnalyticsEvent.EMAIL_LEAD_RESUBMITTED, { chartId, locale });
      }

      safeSetFlag();
      onSubmitted();
    } catch {
      setError(t('errNetwork'));
    } finally {
      setLoading(false);
    }
  }

  // Render via portal to document.body so the modal escapes any ancestor
  // stacking context. The hero calculator's animation wrapper applies
  // `transform: translateY(...)` which creates a new containing block —
  // without portal, `fixed inset-0 z-50` positions relative to that wrapper
  // and the page's trust-line sibling renders visually on top of the modal.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleDismiss}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="relative z-10 w-full md:max-w-md md:rounded-2xl rounded-t-2xl bg-[#0F0F17] border border-white/8 shadow-2xl shadow-black/60 max-h-[90vh] overflow-y-auto"
      >
        <button
          ref={closeButtonRef}
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <form onSubmit={handleSubmit} noValidate className="px-6 pt-8 pb-6">
          <div className="text-center mb-6">
            <h2
              className="text-2xl font-light text-white mb-1"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('title')}
            </h2>
            <p className="text-sm text-white/45">{t('subtitle')}</p>
          </div>

          <label htmlFor="email-gate-input" className="block text-xs text-white/60 uppercase tracking-widest mb-2">
            {t('emailLabel')}
          </label>
          <input
            id="email-gate-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFD700]/40 focus:bg-white/8"
            aria-invalid={!!error}
            aria-describedby={error ? 'email-gate-error' : undefined}
          />

          {error && (
            <p id="email-gate-error" className="text-xs text-red-400 mt-2" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitDisabled}
            className="mt-4 w-full py-3.5 px-6 rounded-xl text-sm font-semibold tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #FFD700, #FFE033)',
              color: '#0A0A0F',
            }}
            aria-busy={loading}
          >
            {loading ? t('submittingCta') : t('submitCta')}
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="mt-2 w-full py-2.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            {t('dismissCta')}
          </button>

          <p className="text-[11px] text-white/25 text-center mt-3 leading-relaxed">
            {t('privacyText')}
          </p>
        </form>
      </div>
    </div>,
    document.body,
  );
}
