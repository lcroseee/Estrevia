// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Avoid PostHog/analytics side effects during the render.
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: { COOKIE_CONSENT_ACCEPTED: 'accepted', COOKIE_CONSENT_DECLINED: 'declined' },
}));

import { CookieConsent } from '../CookieConsent';
import { COOKIE_CONSENT_KEY } from '../PostHogProvider';

beforeEach(() => {
  window.localStorage.clear();
});

describe('CookieConsent', () => {
  it('reveals the banner on the first effect flush — no 800ms delay', () => {
    render(<CookieConsent />);
    // testing-library wraps render in act(): effects + the synchronous
    // setVisible(true) have already flushed. With the old 800ms setTimeout the
    // dialog would still be absent here (only a timer was scheduled).
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('stays hidden when a decision is already stored', () => {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    render(<CookieConsent />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
