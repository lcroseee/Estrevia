// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const { trackEventMock, fetchMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: trackEventMock,
  AnalyticsEvent: {
    CHECKOUT_TICKET_TIMEOUT: 'checkout_ticket_timeout',
  },
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `t:${key}`,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  trackEventMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

import { CheckoutCompleteClient } from '../CheckoutCompleteClient';

describe('CheckoutCompleteClient', () => {
  it('redirects to /sign-in when poll returns ready=true', async () => {
    const setLoc = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        set href(v: string) {
          setLoc(v);
        },
      },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { ready: true, ticket: 'ticket_zzz' } }),
    });

    render(<CheckoutCompleteClient sessionId="cs_test_1" />);

    // Flush microtasks for the first fetch + json resolution.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(setLoc).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_zzz&redirect_url=%2Fsettings',
    );
  });

  it('fires CHECKOUT_TICKET_TIMEOUT and shows fallback after 30s', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { ready: false } }),
    });

    render(<CheckoutCompleteClient sessionId="cs_test_1" />);

    // 15 polls @ 2s = 30s; advance past the deadline to trigger timeout branch.
    // Wrap in act() so React flushes the setTimedOut(true) state update.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(trackEventMock).toHaveBeenCalledWith(
      'checkout_ticket_timeout',
      expect.objectContaining({ session_id: 'cs_test_1' }),
    );
    // getByText throws if no match — a truthy return means the fallback rendered.
    expect(screen.getByText(/t:checkEmail/)).toBeTruthy();
  });
});
