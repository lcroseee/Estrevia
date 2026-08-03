'use client';

import { useState, useCallback, useEffect, useId, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/shared/lib/apiFetch';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { PaywallCta } from '@/shared/components/PaywallCta';
import { PaywallModal } from '@/shared/components/PaywallModal';
import {
  prepareSelfie,
  isAcceptedImageType,
  MAX_UPLOAD_BYTES,
} from '@/shared/lib/image-prep';
import { PRESENTATIONS, type Presentation } from '@/modules/astro-engine/portrait-scale';

type GenerationStatus = 'idle' | 'analysing' | 'composing' | 'rendering' | 'done' | 'error';

interface PortraitPalette {
  lead: string;
  accent: string;
}

interface PortraitResultData {
  id: string;
  url: string;
  palette: PortraitPalette;
  scale: string;
  traitsSummary: string;
}

interface PortraitApiResponse {
  success: boolean;
  data: PortraitResultData | { reasons?: string[]; used?: number; limit?: number } | null;
  error: string | null;
}

interface PortraitGeneratorProps {
  chartId: string;
  sunSign: string;
  moonSign: string;
  isPro: boolean;
}

// Cosmetic-only cadence for the staged waiting animation — the network call
// itself is a single request; these stages just narrate elapsed time.
const STAGE_DURATION_MS = 1800;

const LOADING_STATUSES: ReadonlySet<GenerationStatus> = new Set([
  'analysing',
  'composing',
  'rendering',
]);

function nextStage(status: GenerationStatus): GenerationStatus {
  if (status === 'analysing') return 'composing';
  if (status === 'composing') return 'rendering';
  return status;
}

function stageMessageKey(status: GenerationStatus): 'portrait.generating' | 'portrait.composing' | 'portrait.rendering' {
  if (status === 'composing') return 'portrait.composing';
  if (status === 'rendering') return 'portrait.rendering';
  return 'portrait.generating';
}

/** CSS media queries handle the visual side of prefers-reduced-motion
 * elsewhere (see HeroCalculator/LandingAnimations). This staged animation
 * also drives *content* changes (translated stage text), which a stylesheet
 * cannot suppress — so the auto-advance timer itself is gated here. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function isPortraitResult(
  data: PortraitResultData | { reasons?: string[]; used?: number; limit?: number } | null,
): data is PortraitResultData {
  return data !== null && 'url' in data;
}

export function PortraitGenerator({ chartId, sunSign, moonSign, isPro }: PortraitGeneratorProps) {
  const t = useTranslations('avatar');
  const inputId = useId();
  const presentationLabelId = useId();

  const [paywallOpen, setPaywallOpen] = useState(false);

  // The raw selection stays alongside the already-EXIF-stripped Blob so a
  // failed generation never forces the user back through the file picker —
  // only the processed Blob is ever sent to the server.
  const [file, setFile] = useState<File | null>(null);
  const [preparedBlob, setPreparedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [consent, setConsent] = useState(false);
  const [presentation, setPresentation] = useState<Presentation>('auto');
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [result, setResult] = useState<PortraitResultData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The preview is a local blob: URL — never uploaded, just released on
  // replacement/unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Staged waiting animation: analysing -> composing -> rendering, then
  // holds on "rendering" until the single network response resolves.
  // Reduced-motion users stay on the first stage's message — no cycling.
  useEffect(() => {
    if (status !== 'analysing' && status !== 'composing') return;
    if (prefersReducedMotion()) return;
    const id = setTimeout(() => setStatus((s) => nextStage(s)), STAGE_DURATION_MS);
    return () => clearTimeout(id);
  }, [status]);

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (!selected) return;

      setErrorMessage(null);
      setResult(null);
      setStatus('idle');

      if (!isAcceptedImageType(selected.type) || selected.size > MAX_UPLOAD_BYTES) {
        setErrorMessage(t('portrait.errors.invalidImage'));
        return;
      }

      try {
        const blob = await prepareSelfie(selected);
        setFile(selected);
        setPreparedBlob(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        trackEvent(AnalyticsEvent.AVATAR_PORTRAIT_UPLOADED);
      } catch {
        setErrorMessage(t('portrait.errors.invalidImage'));
      }
    },
    [t],
  );

  const handleGenerate = useCallback(async () => {
    if (!preparedBlob || !consent) return;

    setErrorMessage(null);
    setStatus('analysing');

    const formData = new FormData();
    formData.append('file', preparedBlob, 'selfie.jpg');
    formData.append('presentation', presentation);
    formData.append('style', 'cosmic');
    formData.append('chartId', chartId);

    const res = await apiFetch<PortraitApiResponse>('/api/v1/avatar/portrait', {
      method: 'POST',
      body: formData,
    });

    switch (res.kind) {
      case 'ok': {
        const body = res.data;
        if (!body.success || !isPortraitResult(body.data)) {
          setErrorMessage(t('portrait.errors.generation'));
          setStatus('error');
          return;
        }
        setResult(body.data);
        setStatus('done');
        return;
      }

      case 'auth-required':
        window.location.href =
          '/sign-in?redirect_url=' + encodeURIComponent(window.location.pathname);
        return;

      case 'error': {
        const payload = res.payload as
          | { error?: string; data?: { reasons?: string[]; limit?: number } }
          | undefined;
        const code = payload?.error;
        const reason = payload?.data?.reasons?.[0];

        if (code === 'UNSAFE_IMAGE' && reason) {
          setErrorMessage(t(`portrait.reasons.${reason}` as 'portrait.reasons.no_face'));
        } else if (code === 'PRO_REQUIRED') {
          setErrorMessage(t('portrait.errors.proRequired'));
        } else if (code === 'FEATURE_DISABLED') {
          setErrorMessage(t('portrait.errors.disabled'));
        } else if (code === 'RATE_LIMITED' || code === 'BUDGET_EXCEEDED') {
          setErrorMessage(t('portrait.errors.busy'));
        } else if (code === 'QUOTA_EXCEEDED') {
          setErrorMessage(t('portrait.errors.quota', { limit: payload?.data?.limit ?? 30 }));
        } else if (code === 'INVALID_IMAGE') {
          setErrorMessage(t('portrait.errors.invalidImage'));
        } else {
          setErrorMessage(t('portrait.errors.generation'));
        }
        setStatus('error');
        return;
      }

      case 'network-error':
        setErrorMessage(t('portrait.errors.generation'));
        setStatus('error');
        return;
    }
  }, [preparedBlob, consent, presentation, chartId, t]);

  // -------------------------------------------------------------------
  // Free user: paywall only. No file input, no privacy note, no selfie
  // ever touches this component's state.
  // -------------------------------------------------------------------
  if (!isPro) {
    return (
      <div className="flex flex-col gap-4 w-full">
        <PaywallCta
          trigger="avatar-portrait"
          variant="card"
          onClick={() => setPaywallOpen(true)}
        />
        <PaywallModal
          open={paywallOpen}
          onClose={() => setPaywallOpen(false)}
          triggerContext="avatar-portrait"
          returnUrl={typeof window !== 'undefined' ? window.location.pathname : undefined}
        />
      </div>
    );
  }

  const isLoading = LOADING_STATUSES.has(status);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Privacy promise — shown before any upload */}
      <p className="text-xs text-white/50">{t('portrait.privacyNote')}</p>

      {/* File picker */}
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-xs font-medium text-white/50">
          {file ? t('portrait.change') : t('portrait.upload')}
        </label>
        <input
          id={inputId}
          data-testid="portrait-file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          aria-label={t('portrait.upload')}
          onChange={handleFileChange}
          className="text-xs text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white/70"
        />
      </div>

      {/* Local preview — never uploaded as-is, only the processed Blob is */}
      {previewUrl && (
        <div
          className="relative mx-auto aspect-square w-full max-w-[200px] overflow-hidden rounded-2xl"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-testid="portrait-preview"
            src={previewUrl}
            alt={t('portrait.upload')}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {/* Presentation — which of the four 777 colour scales renders the portrait */}
      <div className="flex flex-col gap-2">
        <p id={presentationLabelId} className="text-xs font-medium text-white/50">
          {t('portrait.presentation')}
        </p>
        <div role="radiogroup" aria-labelledby={presentationLabelId} className="flex flex-wrap gap-3">
          {PRESENTATIONS.map((p) => (
            <label
              key={p}
              className="flex items-center gap-1.5 text-xs text-white/70"
            >
              <input
                type="radio"
                name="portrait-presentation"
                value={p}
                data-testid={`presentation-${p}`}
                checked={presentation === p}
                onChange={() => setPresentation(p)}
                aria-label={t(`portrait.presentations.${p}`)}
              />
              {t(`portrait.presentations.${p}`)}
            </label>
          ))}
        </div>
      </div>

      {/* Consent — required alongside a photo before Generate unlocks */}
      <label className="flex items-start gap-2 text-xs text-white/60">
        <input
          type="checkbox"
          data-testid="portrait-consent"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          aria-label={t('portrait.consent')}
        />
        {t('portrait.consent')}
      </label>

      {/* Error */}
      {errorMessage && (
        <p role="alert" className="text-xs text-center" style={{ color: '#E74C3C' }}>
          {errorMessage}
        </p>
      )}

      {/* Staged waiting live region — announced to assistive tech */}
      {isLoading && (
        <p role="status" aria-live="polite" className="text-xs text-center text-white/60">
          {t(stageMessageKey(status))}
        </p>
      )}

      {/* Generate — disabled until both a processed photo and consent exist */}
      <button
        type="button"
        data-testid="portrait-generate"
        onClick={handleGenerate}
        disabled={!preparedBlob || !consent || isLoading}
        aria-label={t('portrait.generate')}
        className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
          color: '#0A0A0F',
          boxShadow: '0 4px 16px -4px rgba(255,215,0,0.4)',
        }}
      >
        {t('portrait.generate')}
      </button>

      {/* Result + why-panel */}
      {status === 'done' && result && (
        <div className="flex flex-col items-center gap-3">
          <div
            className="relative w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden"
            style={{
              border: '1px solid rgba(255,215,0,0.2)',
              boxShadow: '0 8px 32px -8px rgba(255,215,0,0.15)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="portrait-image"
              src={result.url}
              alt={t('portrait.altText', { scale: result.scale, sunSign, moonSign })}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-xs text-white/60 text-center space-y-1 max-w-xs">
            <p className="font-medium text-white/80">{t('portrait.whyTitle')}</p>
            <p>{t('portrait.whyScale', { scale: result.scale })}</p>
            <p>{t('portrait.whyPalette', { lead: result.palette.lead, accent: result.palette.accent })}</p>
            <p>{t('portrait.whySource', { sunSign, moonSign })}</p>
          </div>
        </div>
      )}
    </div>
  );
}
