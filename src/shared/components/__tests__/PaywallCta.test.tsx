// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock IntersectionObserver: invoke callback immediately as if intersecting.
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
      }
      observe(target: Element) {
        this.cb(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    return (key: string) => `${namespace ?? ''}.${key}`;
  },
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

import { trackEvent } from '@/shared/lib/analytics';
import { PaywallCta } from '../PaywallCta';

const mockTrackEvent = vi.mocked(trackEvent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PaywallCta', () => {
  it('fires PAYWALL_CTA_VIEWED on mount with trigger + variant payload', () => {
    render(<PaywallCta trigger="celtic-cross" onClick={vi.fn()} />);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'PAYWALL_CTA_VIEWED',
      expect.objectContaining({ trigger: 'celtic-cross', variant: 'card' }),
    );
  });

  it('fires onClick when CTA button is pressed', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <PaywallCta trigger="three-card" onClick={onClick} />,
    );
    fireEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders inline variant when variant="inline"', () => {
    const { container } = render(
      <PaywallCta
        trigger="synastry-ai"
        variant="inline"
        onClick={vi.fn()}
      />,
    );
    // Inline variant carries data-variant for assertion
    const root = container.querySelector('[data-variant="inline"]');
    expect(root).not.toBeNull();
  });

  it('passes aria-haspopup="dialog" on the button', () => {
    const { getByRole } = render(
      <PaywallCta trigger="celtic-cross" onClick={vi.fn()} />,
    );
    expect(getByRole('button').getAttribute('aria-haspopup')).toBe('dialog');
  });
});
