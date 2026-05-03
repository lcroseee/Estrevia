// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LandingViewTracker } from '../LandingViewTracker';

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: { LANDING_VIEW: 'landing_view' },
}));

import { trackEvent } from '@/shared/lib/analytics';

describe('LandingViewTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires landing_view exactly once on mount with locale=en', () => {
    render(
      <NextIntlClientProvider locale="en" messages={{}}>
        <LandingViewTracker locale="en" />
      </NextIntlClientProvider>,
    );
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith('landing_view', { locale: 'en' });
  });

  it('fires landing_view with locale=es when rendered in Spanish', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{}}>
        <LandingViewTracker locale="es" />
      </NextIntlClientProvider>,
    );
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith('landing_view', { locale: 'es' });
  });

  it('renders nothing visible (returns null)', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{}}>
        <LandingViewTracker locale="en" />
      </NextIntlClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
