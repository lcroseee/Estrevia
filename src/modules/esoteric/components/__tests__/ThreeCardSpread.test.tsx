// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

const cards = [
  { id: 'fool', number: 0, name: { en: 'The Fool' }, suit: 'major' },
  { id: 'magus', number: 1, name: { en: 'The Magus' }, suit: 'major' },
  { id: 'priestess', number: 2, name: { en: 'The Priestess' }, suit: 'major' },
];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en/tarot',
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) =>
    React.createElement('a', props, children),
}));

const makeT = () => {
  const t = (key: string) => key;
  t.has = (_key: string) => false;
  t.rich = (key: string) => key;
  return t;
};

vi.mock('next-intl', () => ({
  useTranslations: () => makeT(),
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

const mockPostJson = vi.fn();
vi.mock('@/shared/lib/apiFetch', () => ({
  postJson: (...args: unknown[]) => mockPostJson(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPostJson.mockResolvedValue({ kind: 'ok', data: { success: true, data: null } });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

import { ThreeCardSpread } from '../ThreeCardSpread';

describe('ThreeCardSpread — value-then-block', () => {
  it('renders Draw button for free user (no early return to upgrade-only state)', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { getByRole, queryByText } = render(<ThreeCardSpread allCards={cards} />);
    expect(getByRole('button', { name: /draw/i })).toBeTruthy();
    // Legacy '/settings' link must be absent
    expect(queryByText(/settings/i)).toBeNull();
  });

  it('does not call /api/v1/tarot/interpret for free user even after a draw', async () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { getByRole } = render(<ThreeCardSpread allCards={cards} />);
    const drawBtn = getByRole('button', { name: /draw/i });
    drawBtn.click();
    // Wait one tick for any synchronous state updates
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPostJson).not.toHaveBeenCalledWith(
      '/api/v1/tarot/interpret',
      expect.anything(),
    );
  });
});
