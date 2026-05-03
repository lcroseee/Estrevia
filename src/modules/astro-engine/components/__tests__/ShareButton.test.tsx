// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ShareButton } from '../ShareButton';

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: {
    PASSPORT_RESHARED: 'passport_reshared',
    PASSPORT_DOWNLOADED: 'passport_downloaded',
  },
}));

vi.mock('@/shared/lib/share', () => ({
  buildShareUrl: (url: string, _channel: string) => url,
}));

const passport = {
  id: 'test-id',
  sunSign: 'Aries',
  moonSign: 'Taurus',
  ascendantSign: 'Gemini',
  element: 'Fire',
  rulingPlanet: 'Mars',
  rarityPercent: 5.5,
} as unknown as Parameters<typeof ShareButton>[0]['passport'];

const enMessages = {
  share: {
    passport: {
      copy: { x: '', telegram: '', whatsapp: '', stories_caption: '', native_share: '' },
      title: 'My Cosmic Passport',
      button: {
        share: 'Share Passport',
        copyLink: 'Copy Link',
        copyShort: 'Copy',
        copied: 'Copied!',
        copiedShort: 'Copied',
        downloading: 'Downloading...',
      },
      aria: {
        container: 'Share your Cosmic Passport',
        shareNative: 'Share your Cosmic Passport via the native share menu',
        shareOnX: 'Share on X',
        shareOnTelegram: 'Share on Telegram',
        shareOnWhatsApp: 'Share on WhatsApp',
        linkCopied: 'Link copied to clipboard',
        copyShareLink: 'Copy share link',
        linkCopiedShort: 'Link copied',
        copyLinkShort: 'Copy link',
        downloadFormat: 'Download format',
        downloadAs: 'Download as {format} PNG',
      },
    },
  },
};

const esMessages = {
  share: {
    passport: {
      copy: { x: '', telegram: '', whatsapp: '', stories_caption: '', native_share: '' },
      title: 'Mi Pasaporte Cósmico',
      button: {
        share: 'Compartir pasaporte',
        copyLink: 'Copiar enlace',
        copyShort: 'Copiar',
        copied: '¡Copiado!',
        copiedShort: 'Copiado',
        downloading: 'Descargando...',
      },
      aria: {
        container: 'Comparte tu Pasaporte Cósmico',
        shareNative: 'Comparte tu Pasaporte Cósmico mediante el menú nativo',
        shareOnX: 'Compartir en X',
        shareOnTelegram: 'Compartir en Telegram',
        shareOnWhatsApp: 'Compartir en WhatsApp',
        linkCopied: 'Enlace copiado al portapapeles',
        copyShareLink: 'Copiar enlace para compartir',
        linkCopiedShort: 'Enlace copiado',
        copyLinkShort: 'Copiar enlace',
        downloadFormat: 'Formato de descarga',
        downloadAs: 'Descargar como PNG {format}',
      },
    },
  },
};

beforeEach(() => {
  // jsdom doesn't define navigator.share — stub it so primary "Share Passport"
  // branch renders. Without this, ShareButton falls back to "Copy Link".
  vi.stubGlobal('navigator', { ...globalThis.navigator, share: vi.fn(), clipboard: { writeText: vi.fn() } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ShareButton — EN render', () => {
  it('shows primary button "Share Passport"', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ShareButton passportId="test-id" passport={passport} />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole('button', { name: /share your cosmic passport via the native share menu/i }),
    ).not.toBeNull();
    expect(screen.getByText('Share Passport')).not.toBeNull();
  });
});

describe('ShareButton — ES render', () => {
  it('shows primary button "Compartir pasaporte"', () => {
    render(
      <NextIntlClientProvider locale="es" messages={esMessages}>
        <ShareButton passportId="test-id" passport={passport} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Compartir pasaporte')).not.toBeNull();
  });

  it('localizes one aria-label per category (container, social, download)', () => {
    render(
      <NextIntlClientProvider locale="es" messages={esMessages}>
        <ShareButton passportId="test-id" passport={passport} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText('Comparte tu Pasaporte Cósmico')).not.toBeNull();
    expect(screen.getByLabelText('Compartir en X')).not.toBeNull();
    expect(screen.getByLabelText('Formato de descarga')).not.toBeNull();
  });
});
