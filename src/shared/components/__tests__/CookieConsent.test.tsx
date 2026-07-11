// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// CookieConsent imports the consent helpers from PostHogProvider — stub them
// so no PostHog init runs and the "no decision yet" branch always shows.
vi.mock('../PostHogProvider', () => ({
  COOKIE_CONSENT_KEY: 'estrevia_cookie_consent',
  getCookieConsent: vi.fn(() => null),
}));
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

import { CookieConsent, type CookieConsentStrings } from '../CookieConsent';

const ES_STRINGS: CookieConsentStrings = {
  ariaLabel: 'Consentimiento de cookies',
  shortCopy: 'Cookies de analítica y anuncios.',
  shortPrivacyLabel: 'Privacidad',
  shortPrivacyAria: 'Política de privacidad',
  fullCopy: 'Usamos cookies para analítica y medición de anuncios — solo después de que aceptes.',
  privacyPolicyLabel: 'Política de privacidad',
  decline: 'Rechazar',
  accept: 'Aceptar',
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function renderBanner() {
  const utils = render(<CookieConsent strings={ES_STRINGS} privacyHref="/es/privacy" />);
  // The banner shows after an 800ms anti-flash delay.
  act(() => {
    vi.advanceTimersByTime(800);
  });
  return utils;
}

describe('CookieConsent — server-resolved strings (SP-B D4)', () => {
  it('renders the Spanish strings passed via props', () => {
    renderBanner();
    expect(screen.getByRole('dialog', { name: 'Consentimiento de cookies' })).toBeTruthy();
    expect(screen.getByText(/solo después de que aceptes/)).toBeTruthy();
    expect(screen.getByText('Cookies de analítica y anuncios.', { exact: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeTruthy();
  });

  it('both privacy links carry the locale-prefixed href', () => {
    renderBanner();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('/es/privacy');
    }
  });
});
