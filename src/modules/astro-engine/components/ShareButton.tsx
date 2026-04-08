'use client';

import { useState, useCallback } from 'react';
import type { PassportResponse } from '@/shared/types/api';

interface ShareButtonProps {
  passportId: string;
  passport: PassportResponse;
}

type ShareState = 'idle' | 'copied' | 'downloading';

// Build share text
function buildShareText(passport: PassportResponse): string {
  const asc = passport.ascendantSign ? ` | ↑ ASC in ${passport.ascendantSign}` : '';
  return `My Cosmic Passport: ☉ Sun in ${passport.sunSign} | ☽ Moon in ${passport.moonSign}${asc} — 1 of ${passport.rarityPercent}% Get yours at estrevia.app`;
}

function buildShareUrl(passportId: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/s/${passportId}`;
  }
  return `https://estrevia.app/s/${passportId}`;
}

/**
 * Multi-channel share widget.
 * Primary: Web Share API (mobile native sheet).
 * Fallbacks: Copy link, Twitter/X intent, Telegram URL.
 * Download: fetches OG image from /api/og/passport/[id] as downloadable PNG.
 */
export function ShareButton({ passportId, passport }: ShareButtonProps) {
  const [shareState, setShareState] = useState<ShareState>('idle');

  const shareUrl = buildShareUrl(passportId);
  const shareText = buildShareText(passport);

  // Native share sheet (mobile)
  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: 'My Cosmic Passport',
        text: shareText,
        url: shareUrl,
      });
    } catch {
      // User dismissed share sheet — not an error
    }
  }, [shareUrl, shareText]);

  // Copy link to clipboard
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement('input');
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2000);
    }
  }, [shareUrl]);

  // Download PNG — links to OG image endpoint
  const handleDownloadPng = useCallback(async () => {
    setShareState('downloading');
    try {
      const ogUrl = `/api/og/passport/${passportId}`;
      const response = await fetch(ogUrl);
      if (!response.ok) throw new Error('Failed to fetch image');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `cosmic-passport-${passportId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Silent fail — user sees no broken state
    } finally {
      setShareState('idle');
    }
  }, [passportId]);

  // Twitter/X share intent
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  // Telegram share URL
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div
      className="flex flex-col gap-3 w-full"
      aria-label="Share your Cosmic Passport"
    >
      {/* Primary action: native share on mobile, fallback to copy on desktop */}
      {canNativeShare ? (
        <button
          type="button"
          onClick={handleNativeShare}
          className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
            color: '#0A0A0F',
            boxShadow: '0 4px 16px -4px rgba(255,215,0,0.4)',
          }}
          aria-label="Share your Cosmic Passport via the native share menu"
        >
          <ShareIcon />
          Share Passport
        </button>
      ) : (
        <button
          type="button"
          onClick={handleCopyLink}
          className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98]"
          style={{
            background: shareState === 'copied'
              ? 'linear-gradient(135deg, #2ECC71 0%, #27AE60 100%)'
              : 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
            color: '#0A0A0F',
            boxShadow: shareState === 'copied'
              ? '0 4px 16px -4px rgba(46,204,113,0.4)'
              : '0 4px 16px -4px rgba(255,215,0,0.4)',
          }}
          aria-label={shareState === 'copied' ? 'Link copied to clipboard' : 'Copy share link'}
          aria-live="polite"
        >
          {shareState === 'copied' ? <CheckIcon /> : <CopyIcon />}
          {shareState === 'copied' ? 'Copied!' : 'Copy Link'}
        </button>
      )}

      {/* Secondary actions row */}
      <div className="flex gap-2">
        {/* Copy link (secondary on mobile when native share is available) */}
        {canNativeShare && (
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 active:scale-[0.98]"
            style={{
              background: shareState === 'copied' ? 'rgba(46,204,113,0.12)' : 'rgba(255,255,255,0.06)',
              border: shareState === 'copied' ? '1px solid rgba(46,204,113,0.3)' : '1px solid rgba(255,255,255,0.08)',
              color: shareState === 'copied' ? '#2ECC71' : 'rgba(255,255,255,0.6)',
            }}
            aria-label={shareState === 'copied' ? 'Link copied' : 'Copy link'}
            aria-live="polite"
          >
            {shareState === 'copied' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            {shareState === 'copied' ? 'Copied' : 'Copy'}
          </button>
        )}

        {/* Twitter/X */}
        <a
          href={twitterUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none',
          }}
          aria-label="Share on Twitter / X"
        >
          <XIcon size={14} />
          X / Twitter
        </a>

        {/* Telegram */}
        <a
          href={telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none',
          }}
          aria-label="Share on Telegram"
        >
          <TelegramIcon size={14} />
          Telegram
        </a>

        {/* Download PNG */}
        <button
          type="button"
          onClick={handleDownloadPng}
          disabled={shareState === 'downloading'}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 disabled:opacity-50"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.6)',
          }}
          aria-label={shareState === 'downloading' ? 'Downloading image...' : 'Download as PNG for Instagram Stories'}
          aria-busy={shareState === 'downloading'}
        >
          {shareState === 'downloading' ? <SpinnerIcon size={14} /> : <DownloadIcon size={14} />}
          PNG
        </button>
      </div>
    </div>
  );
}

// ── Inline SVG icons — no external icon library dependency ──────────────────

function ShareIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function CopyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DownloadIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TelegramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function SpinnerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
