// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// next/script with strategy="afterInteractive" defers injection to the client
// and emits nothing during a jsdom render. Replace it with a plain <script>
// tag so presence/absence can be asserted directly (same shim as the
// [locale] layout.test.tsx).
vi.mock('next/script', () => ({
  default: ({ children, id }: { children?: React.ReactNode; id?: string }) => (
    <script id={id} data-testid="meta-pixel-script">
      {children}
    </script>
  ),
}));

import { MetaPixelLoader } from '../MetaPixelLoader';
import { COOKIE_CONSENT_KEY } from '../PostHogProvider';

function dispatchConsent(consent: 'accepted' | 'declined'): void {
  window.dispatchEvent(
    new CustomEvent('estrevia:consent', { detail: { consent } }),
  );
}

/** Remove any `_fbp` / `_fbc` left over from a previous test. */
function clearMetaCookies(): void {
  document.cookie = '_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  document.cookie = '_fbc=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
}

beforeEach(() => {
  localStorage.clear();
  clearMetaCookies();
});

describe('MetaPixelLoader consent gating (SP-F D1, LIVE-7)', () => {
  it('renders nothing when no consent decision exists', () => {
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    expect(screen.queryByTestId('meta-pixel-script')).toBeNull();
  });

  it('renders nothing when consent is declined', () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    expect(screen.queryByTestId('meta-pixel-script')).toBeNull();
  });

  it('renders nothing without a pixelId even when consent is accepted', () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    render(<MetaPixelLoader pixelId="" />);
    expect(screen.queryByTestId('meta-pixel-script')).toBeNull();
  });

  it('mounts the verbatim pixel snippet when consent was already accepted', () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    const script = screen.getByTestId('meta-pixel-script');
    expect(script.textContent).toContain("fbq('init', 'PIX_TEST')");
    expect(script.textContent).toContain("fbq('track', 'PageView')");
    expect(script.textContent).toContain('connect.facebook.net/en_US/fbevents.js');
  });

  it('mounts the pixel after an accept event without navigation', () => {
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    expect(screen.queryByTestId('meta-pixel-script')).toBeNull();
    act(() => dispatchConsent('accepted'));
    expect(screen.getByTestId('meta-pixel-script')).not.toBeNull();
  });

  it('decline event renders nothing and expires leftover _fbp/_fbc (D2)', () => {
    document.cookie = '_fbp=fb.1.1700000000000.123456789; path=/';
    document.cookie = '_fbc=fb.1.1700000000000.AbCdEf; path=/';
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    act(() => dispatchConsent('declined'));
    expect(screen.queryByTestId('meta-pixel-script')).toBeNull();
    expect(document.cookie).not.toContain('_fbp');
    expect(document.cookie).not.toContain('_fbc');
  });

  it('stored decline from a previous visit clears leftover cookies on mount (old-build migration)', () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    document.cookie = '_fbp=fb.1.1700000000000.123456789; path=/';
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    expect(document.cookie).not.toContain('_fbp');
  });
});
