// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

const cards = Array.from({ length: 22 }, (_, i) => ({
  id: `card-${i}`,
  number: i,
  name: { en: `Card ${i}` },
  suit: 'major',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en/tarot',
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) =>
    React.createElement('a', props, children),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

const mockUseSubscription = vi.fn();
vi.mock('@/shared/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

vi.mock('@/shared/components/PaywallCta', () => ({
  PaywallCta: ({ onClick }: { onClick: () => void }) =>
    React.createElement('button', { 'data-testid': 'paywall-cta', onClick }, 'Unlock Pro'),
}));

vi.mock('@/shared/components/PaywallModal', () => ({
  PaywallModal: ({ open }: { open: boolean }) =>
    open ? React.createElement('div', { 'data-testid': 'paywall-modal' }) : null,
}));

const mockPostJson = vi.fn();
vi.mock('@/shared/lib/apiFetch', () => ({
  postJson: (...args: unknown[]) => mockPostJson(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPostJson.mockResolvedValue({ kind: 'ok', data: { success: true, data: { interpretation: 'mock interp' } } });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

import { CelticCross } from '../CelticCross';

describe('CelticCross — value-then-block + LLM interpretation', () => {
  it('renders the Draw button for free user (no early return to upgrade-only state)', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { getByRole } = render(<CelticCross allCards={cards} />);
    expect(getByRole('button', { name: /drawCelticCross/i })).toBeTruthy();
  });

  it('does not call /api/v1/tarot/interpret for free user', async () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { getByRole } = render(<CelticCross allCards={cards} />);
    getByRole('button', { name: /drawCelticCross/i }).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPostJson).not.toHaveBeenCalledWith(
      '/api/v1/tarot/interpret',
      expect.anything(),
    );
  });

  it('legacy /settings upgrade link is absent for free user', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { container } = render(<CelticCross allCards={cards} />);
    const link = container.querySelector('a[href*="/settings"]');
    expect(link).toBeNull();
  });
});
