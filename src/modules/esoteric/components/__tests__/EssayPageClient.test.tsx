// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mockUseSubscription = vi.fn();
vi.mock('@/shared/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock('@/shared/components/PaywallModal', () => ({
  PaywallModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="paywall-modal-open" /> : null,
}));

import { EssayPageClient } from '../EssayPageClient';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EssayPageClient — honest unlock CTA (SP-E D6)', () => {
  it('free users see the unlockFull label (not readMore) and it opens the paywall', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    render(
      <EssayPageClient>
        <p>essay body</p>
      </EssayPageClient>,
    );
    expect(screen.queryByRole('button', { name: 'readMore' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'unlockFull' }));
    expect(screen.getByTestId('paywall-modal-open')).toBeTruthy();
  });

  it('pro users get full content with no unlock button', () => {
    mockUseSubscription.mockReturnValue({ isPro: true, isLoading: false });
    render(
      <EssayPageClient>
        <p>essay body</p>
      </EssayPageClient>,
    );
    expect(screen.queryByRole('button', { name: 'unlockFull' })).toBeNull();
    expect(screen.getByText('essay body')).toBeTruthy();
  });
});
