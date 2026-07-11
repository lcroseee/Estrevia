// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { getCheckoutTicketMock, sessionsRetrieveMock, redirectMock } = vi.hoisted(() => ({
  getCheckoutTicketMock: vi.fn(),
  sessionsRetrieveMock: vi.fn(),
  redirectMock: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

// The ticket lives ONLY in Redis (checkout-ticket.ts) since de39cee — the page
// must never poll Stripe metadata for it.
vi.mock('@/shared/lib/checkout-ticket', () => ({
  getCheckoutTicket: getCheckoutTicketMock,
}));
vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: sessionsRetrieveMock } } }),
}));
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));
// Namespace-echoing translator: a regression back to the broken
// 'checkout.complete' namespace changes the rendered text and fails assertions.
vi.mock('next-intl/server', () => ({
  getTranslations: async (ns: string) => (key: string) => `${ns}.${key}`,
  getLocale: async () => 'en',
}));
// Stub the client fallback so the test can capture the redirectTarget prop
// without running its 30s poll loop.
vi.mock('../CheckoutCompleteClient', () => ({
  CheckoutCompleteClient: ({
    sessionId,
    redirectTarget,
  }: {
    sessionId: string;
    redirectTarget: string;
  }) => <div data-testid="client-stub" data-session={sessionId} data-target={redirectTarget} />,
}));

import CheckoutCompletePage from '../page';

function pageProps(sessionId: string | undefined, locale = 'en') {
  return {
    searchParams: Promise.resolve(sessionId ? { session_id: sessionId } : {}),
    params: Promise.resolve({ locale }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
  sessionsRetrieveMock.mockResolvedValue({ id: 'cs_test_1', metadata: {} });
});

describe('/checkout/complete page (SP-A D2/D3/D4)', () => {
  it('redirects to sign-in with redirect_url = metadata.return_url when the Redis ticket is ready', async () => {
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { return_url: '/tarot/celtic-cross' },
    });

    await expect(CheckoutCompletePage(pageProps('cs_test_1'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Ftarot%2Fceltic-cross',
    );
    // Success criterion: exactly ONE Stripe GET (metadata read), zero polls.
    expect(sessionsRetrieveMock).toHaveBeenCalledTimes(1);
  });

  it('defaults to /chart when metadata has no return_url (EN)', async () => {
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');

    await expect(CheckoutCompletePage(pageProps('cs_test_1', 'en'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fchart',
    );
  });

  it('defaults to /es/chart for the ES route locale', async () => {
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');

    await expect(CheckoutCompletePage(pageProps('cs_test_1', 'es'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fes%2Fchart',
    );
  });

  it('re-validates return_url server-side: an absolute URL in metadata falls back to /chart', async () => {
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { return_url: 'https://evil.example/phish' },
    });

    await expect(CheckoutCompletePage(pageProps('cs_test_1'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fchart',
    );
  });

  it('re-validates return_url server-side: a protocol-relative //host in metadata falls back to /chart', async () => {
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { return_url: '//evil.example/phish' },
    });

    await expect(CheckoutCompletePage(pageProps('cs_test_1'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fchart',
    );
  });

  it('re-validates return_url server-side: a backslash-normalized /\\host in metadata falls back to /chart', async () => {
    // Browsers normalize `\` to `/`, so `/\evil.example` resolves to the
    // protocol-relative //evil.example (open-redirect). Must NOT reach redirect_url.
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { return_url: '/\\evil.example/phish' },
    });

    await expect(CheckoutCompletePage(pageProps('cs_test_1'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fchart',
    );
  });

  it('re-validates return_url server-side: a /es\\host path in metadata falls back to /chart', async () => {
    // Any backslash disqualifies the path — no legitimate rooted path contains one.
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { return_url: '/es\\evil.example/phish' },
    });

    await expect(CheckoutCompletePage(pageProps('cs_test_1', 'es'))).rejects.toThrow('NEXT_REDIRECT');

    // ES route locale → falls back to the localized /es/chart default.
    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fes%2Fchart',
    );
  });

  it('a failed Stripe session fetch is non-fatal — redirects to /chart', async () => {
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');
    sessionsRetrieveMock.mockRejectedValue(new Error('stripe down'));

    await expect(CheckoutCompletePage(pageProps('cs_test_1'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fchart',
    );
  });

  it('no ticket → renders pricingPage.checkout.complete strings and passes redirectTarget to the client', async () => {
    getCheckoutTicketMock.mockResolvedValue(null);
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { return_url: '/synastry' },
    });

    const result = await CheckoutCompletePage(pageProps('cs_test_1'));
    render(result);

    // Real namespace, not raw 'checkout.complete.*' keys (D4).
    expect(screen.getByText('pricingPage.checkout.complete.title')).toBeTruthy();
    expect(screen.getByText('pricingPage.checkout.complete.description')).toBeTruthy();

    const stub = screen.getByTestId('client-stub');
    expect(stub.getAttribute('data-session')).toBe('cs_test_1');
    expect(stub.getAttribute('data-target')).toBe('/synastry');
  }, 10_000); // Redis poll budget = 5s

  it('redirects to /pricing?error=session_not_found when session_id missing', async () => {
    await expect(CheckoutCompletePage(pageProps(undefined))).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/pricing?error=session_not_found');
    expect(sessionsRetrieveMock).not.toHaveBeenCalled();
  });
});
