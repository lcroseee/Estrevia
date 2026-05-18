// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { sessionsRetrieveMock, redirectMock } = vi.hoisted(() => ({
  sessionsRetrieveMock: vi.fn(),
  redirectMock: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: sessionsRetrieveMock } } }),
}));
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  getLocale: async () => 'en',
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `t:${key}`,
}));

import CheckoutCompletePage from '../page';

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
});

describe('/checkout/complete page', () => {
  it('redirects to /sign-in?__clerk_ticket=... when ticket is ready immediately', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { signInTicket: 'ticket_xyz' },
    });

    await expect(
      CheckoutCompletePage({
        searchParams: Promise.resolve({ session_id: 'cs_test_1' }),
        params: Promise.resolve({ locale: 'en' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fsettings',
    );
  });

  it('renders the client polling fallback when ticket is not ready after server poll', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: {},
    });

    const result = await CheckoutCompletePage({
      searchParams: Promise.resolve({ session_id: 'cs_test_1' }),
      params: Promise.resolve({ locale: 'en' }),
    });
    render(result);
    expect(screen.getByText(/t:title/i)).toBeTruthy();
  }, 15000); // server poll budget = 8s, test wait ~10s

  it('redirects to /pricing?error=session_not_found when sessionId missing', async () => {
    await expect(
      CheckoutCompletePage({
        searchParams: Promise.resolve({}),
        params: Promise.resolve({ locale: 'en' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/pricing?error=session_not_found');
  });
});
