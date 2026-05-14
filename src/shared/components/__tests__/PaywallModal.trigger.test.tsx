// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// Capture which i18n key was requested so we can assert headline resolution.
const requestedKeys: string[] = [];

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t: any = (key: string) => {
      requestedKeys.push(key);
      // Return distinct sentinel for `title` vs contextual keys.
      if (key === 'title') return 'GENERIC_TITLE';
      if (key === 'contextualTitles.celticCross') return 'CELTIC_TITLE';
      if (key === 'contextualTitles.threeCard') return 'THREECARD_TITLE';
      if (key === 'contextualTitles.synastryAi') return 'SYNASTRY_TITLE';
      if (key === 'contextualTitles.essay') return 'ESSAY_TITLE';
      return key;
    };
    t.has = (key: string) => key.startsWith('contextualTitles.') || key === 'title';
    return t;
  },
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmCookie: vi.fn().mockReturnValue(null),
}));

import { trackEvent } from '@/shared/lib/analytics';
import { PaywallModal } from '../PaywallModal';

const mockTrackEvent = vi.mocked(trackEvent);

beforeEach(() => {
  vi.clearAllMocks();
  requestedKeys.length = 0;
});

describe('PaywallModal — triggerContext', () => {
  it('renders generic title when triggerContext is omitted (backwards-compat)', () => {
    const { getByText } = render(<PaywallModal open={true} onClose={vi.fn()} />);
    expect(getByText('GENERIC_TITLE')).toBeTruthy();
  });

  it('renders contextual title when triggerContext="celtic-cross"', () => {
    const { getByText } = render(
      <PaywallModal open={true} onClose={vi.fn()} triggerContext="celtic-cross" />,
    );
    expect(getByText('CELTIC_TITLE')).toBeTruthy();
  });

  it('renders contextual title when triggerContext="synastry-ai"', () => {
    const { getByText } = render(
      <PaywallModal open={true} onClose={vi.fn()} triggerContext="synastry-ai" />,
    );
    expect(getByText('SYNASTRY_TITLE')).toBeTruthy();
  });

  it('falls back to generic title when triggerContext="generic"', () => {
    const { getByText } = render(
      <PaywallModal open={true} onClose={vi.fn()} triggerContext="generic" />,
    );
    expect(getByText('GENERIC_TITLE')).toBeTruthy();
  });

  it('PAYWALL_OPENED event payload includes the trigger dimension', () => {
    render(
      <PaywallModal
        open={true}
        onClose={vi.fn()}
        triggerContext="three-card"
        returnUrl="/tarot/three-card"
      />,
    );
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'PAYWALL_OPENED',
      expect.objectContaining({ trigger: 'three-card', returnUrl: '/tarot/three-card' }),
    );
  });

  it('PAYWALL_OPENED event uses "generic" when triggerContext is omitted', () => {
    render(<PaywallModal open={true} onClose={vi.fn()} returnUrl="/foo" />);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'PAYWALL_OPENED',
      expect.objectContaining({ trigger: 'generic' }),
    );
  });
});
