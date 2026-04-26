'use client';

import { useState, useCallback } from 'react';
import type { PassportResponse } from '@/shared/types/api';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

interface ShareButtonProps {
  passportId: string;
  passport: PassportResponse;
}

type ShareState = 'idle' | 'copied' | 'downloading';
type DownloadFormat = 'stories' | 'square';

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
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>('stories');

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
      trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'native', passport_id: passportId });
    } catch {
      // User dismissed share sheet — not an error
    }
  }, [shareUrl, shareText, passportId]);

  // Copy link to clipboard
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareState('copied');
      trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'copy_link', passport_id: passportId });
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
      trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'copy_link', passport_id: passportId });
      setTimeout(() => setShareState('idle'), 2000);
    }
  }, [shareUrl, passportId]);

  // Download PNG — links to OG image endpoint with selected format
  const handleDownloadPng = useCallback(async () => {
    setShareState('downloading');
    try {
      const ogUrl = `/api/og/passport/${passportId}?format=${downloadFormat}`;
      const response = await fetch(ogUrl);
      if (!response.ok) throw new Error('Failed to fetch image');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `cosmic-passport-${passportId}-${downloadFormat}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      trackEvent(AnalyticsEvent.PASSPORT_DOWNLOADED, { passport_id: passportId, format: downloadFormat });
    } catch {
      // Silent fail — user sees no broken state
    } finally {
      setShareState('idle');
    }
  }, [passportId, downloadFormat]);

  // X (formerly Twitter) share intent — using legacy /intent/tweet path for mobile-app reliability
  const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

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
          className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
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
          className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
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
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
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
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none',
          }}
          aria-label="Share on X"
          onClick={() => trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'twitter', passport_id: passportId })}
        >
          <XIcon size={14} />
          X
        </a>

        {/* Telegram */}
        <a
          href={telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none',
          }}
          aria-label="Share on Telegram"
          onClick={() => trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'telegram', passport_id: passportId })}
        >
          <TelegramIcon size={14} />
          Telegram
        </a>

        {/* WhatsApp */}
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none',
          }}
          aria-label="Share on WhatsApp"
          onClick={() => trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'whatsapp', passport_id: passportId })}
        >
          <WhatsAppIcon size={14} />
          WhatsApp
        </a>

        {/* Download format selector + button */}
        <div className="flex-1 flex items-center gap-0">
          <select
            value={downloadFormat}
            onChange={(e) => setDownloadFormat(e.target.value as DownloadFormat)}
            className="h-full px-1.5 py-2.5 rounded-l-xl text-xs outline-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.6)',
            }}
            aria-label="Download format"
          >
            <option value="stories">9:16</option>
            <option value="square">1:1</option>
          </select>
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={shareState === 'downloading'}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-r-xl text-xs font-medium transition-all duration-150 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderLeft: 'none',
              color: 'rgba(255,255,255,0.6)',
            }}
            aria-label={shareState === 'downloading' ? 'Downloading...' : `Download as ${downloadFormat} PNG`}
          >
            {shareState === 'downloading' ? <SpinnerIcon size={14} /> : <DownloadIcon size={14} />}
            PNG
          </button>
        </div>
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

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
