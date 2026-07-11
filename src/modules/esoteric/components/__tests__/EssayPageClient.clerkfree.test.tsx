// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => 'en',
}));
// PaywallModal pulls next-intl + analytics; stub to keep this unit-scoped.
vi.mock('@/shared/components/PaywallModal', () => ({ PaywallModal: () => null }));

import { SubscriptionProvider } from '@/shared/context/SubscriptionProvider';
import { EssayPageClient } from '@/modules/esoteric/components/EssayPageClient';

beforeEach(() => {
  // SubscriptionProvider fetches on mount; anon path returns "free".
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false, status: 401,
    headers: { get: () => null },
    json: async () => ({}),
  }));
});

describe('essays render Clerk-free (auth-regression guard for (content) group)', () => {
  it('EssayPageClient mounts WITHOUT a ClerkProvider ancestor and does not throw', () => {
    // Clerk hooks throw "can only be used within <ClerkProvider>" outside one.
    // If a future edit adds useUser/useAuth to the essay tree, this throws.
    expect(() =>
      render(
        <SubscriptionProvider>
          <EssayPageClient><p>Essay body</p></EssayPageClient>
        </SubscriptionProvider>,
      ),
    ).not.toThrow();
  });

  it('free/anon reader (no provider result) gets the truncation wrapper, not a full unlock', () => {
    const { container } = render(
      <SubscriptionProvider>
        <EssayPageClient><p data-testid="body">Essay body</p></EssayPageClient>
      </SubscriptionProvider>,
    );
    // DEFAULT_STATE => isPro:false => the max-h-[60vh] overflow-hidden truncation div (EssayPageClient.tsx:30)
    expect(container.querySelector('[class*="max-h-"]')).not.toBeNull();
  });
});
