'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/shared/hooks/useSubscription';

type AvatarStyle = 'cosmic' | 'tarot' | 'geometric' | 'nebula';
type GenerationState = 'idle' | 'loading' | 'done' | 'error';

interface AvatarGeneratorProps {
  sunSign: string;
  moonSign: string;
  ascendantSign?: string;
  element: string;
}

const STYLE_OPTIONS: { value: AvatarStyle; label: string }[] = [
  { value: 'cosmic', label: 'Cosmic' },
  { value: 'tarot', label: 'Tarot' },
  { value: 'geometric', label: 'Geometric' },
  { value: 'nebula', label: 'Nebula' },
];

export function AvatarGenerator({
  sunSign,
  moonSign,
  ascendantSign,
  element,
}: AvatarGeneratorProps) {
  const t = useTranslations('avatar');
  const { isPro, isLoading: subLoading } = useSubscription();

  const [style, setStyle] = useState<AvatarStyle>('cosmic');
  const [state, setState] = useState<GenerationState>('idle');
  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setState('loading');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/avatar/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sunSign,
          moonSign,
          ascendantSign,
          element,
          style,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const msg =
          data.error === 'RATE_LIMITED'
            ? t('errorRateLimit')
            : t('errorGeneration');
        setErrorMessage(msg);
        setState('error');
        return;
      }

      setImageDataUri(
        `data:${data.data.mimeType};base64,${data.data.imageBase64}`,
      );
      setState('done');
    } catch {
      setErrorMessage(t('errorGeneration'));
      setState('error');
    }
  }, [sunSign, moonSign, ascendantSign, element, style, t]);

  const handleDownload = useCallback(() => {
    if (!imageDataUri) return;
    const a = document.createElement('a');
    a.href = imageDataUri;
    a.download = `estrevia-avatar-${sunSign.toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [imageDataUri, sunSign]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Style selector (Pro only, free users get cosmic) */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="avatar-style"
          className="text-xs font-medium"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          {t('styleLabel')}
        </label>
        <div className="flex gap-2">
          {STYLE_OPTIONS.map((opt) => {
            const isLocked = !isPro && opt.value !== 'cosmic';
            const isSelected = style === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={isLocked || subLoading}
                onClick={() => setStyle(opt.value)}
                className="relative flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: isSelected
                    ? 'rgba(255,215,0,0.15)'
                    : 'rgba(255,255,255,0.06)',
                  border: isSelected
                    ? '1px solid rgba(255,215,0,0.4)'
                    : '1px solid rgba(255,255,255,0.08)',
                  color: isSelected
                    ? '#FFD700'
                    : 'rgba(255,255,255,0.6)',
                }}
                aria-pressed={isSelected}
                aria-label={
                  isLocked
                    ? `${opt.label} (Pro only)`
                    : opt.label
                }
              >
                {opt.label}
                {isLocked && (
                  <span
                    className="absolute -top-1.5 -right-1.5 text-[9px] px-1 rounded-full"
                    style={{
                      background: 'rgba(255,215,0,0.2)',
                      color: '#FFD700',
                    }}
                    aria-hidden="true"
                  >
                    PRO
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Generated image display */}
      {imageDataUri && (
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
              src={imageDataUri}
              alt={`AI-generated cosmic avatar for ${sunSign} Sun, ${moonSign} Moon`}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-150 active:scale-[0.98]"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.6)',
            }}
            aria-label="Download avatar as PNG"
          >
            <DownloadIcon />
            {t('download')}
          </button>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <p
          className="text-xs text-center"
          style={{ color: '#E74C3C' }}
          role="alert"
        >
          {errorMessage}
        </p>
      )}

      {/* Generate / Regenerate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={state === 'loading'}
        className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
          color: '#0A0A0F',
          boxShadow: '0 4px 16px -4px rgba(255,215,0,0.4)',
        }}
        aria-label={
          state === 'loading'
            ? 'Generating avatar...'
            : state === 'done'
              ? 'Regenerate avatar'
              : 'Generate avatar'
        }
      >
        {state === 'loading' ? (
          <>
            <SpinnerIcon />
            {t('generating')}
          </>
        ) : state === 'done' ? (
          <>
            <RefreshIcon />
            {isPro ? t('regenerate') : t('regenerateFree')}
          </>
        ) : (
          <>
            <SparkleIcon />
            {t('generate')}
          </>
        )}
      </button>

      {/* Free tier hint */}
      {!isPro && state === 'done' && (
        <p
          className="text-xs text-center"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          {t('proHint')}
        </p>
      )}
    </div>
  );
}

// -- Inline SVG icons --------------------------------------------------------

function SpinnerIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M21 21v-5h-5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
