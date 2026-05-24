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

  it('on 30s timeout, calls /recover and redirects when recovery returns ready=true', async () => {
    const setLoc = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        set href(v: string) {
          setLoc(v);
        },
      },
    });
    // All status-poll calls return ready=false; the final /recover call returns ready=true.
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/recover')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { ready: true, ticket: 'ticket_recovered' },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { ready: false } }),
      };
    });

    render(<CheckoutCompleteClient sessionId="cs_test_1" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(trackEventMock).toHaveBeenCalledWith(
      'checkout_ticket_timeout',
      expect.objectContaining({ session_id: 'cs_test_1' }),
    );
    expect(setLoc).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_recovered&redirect_url=%2Fsettings',
    );
    // Fallback UI must NOT render — recovery succeeded.
    expect(screen.queryByText(/t:checkEmail/)).toBeNull();
  });

  it('on 30s timeout, falls back to "check email" UI when /recover returns ready=false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/recover')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { ready: false } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { ready: false } }),
      };
    });

    render(<CheckoutCompleteClient sessionId="cs_test_1" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(trackEventMock).toHaveBeenCalledWith(
      'checkout_ticket_timeout',
      expect.objectContaining({ session_id: 'cs_test_1' }),
    );
    expect(screen.getByText(/t:checkEmail/)).toBeTruthy();
  });

  it('on 30s timeout, falls back to "check email" UI when /recover network call throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/recover')) {
        throw new Error('network down');
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { ready: false } }),
      };
    });

    render(<CheckoutCompleteClient sessionId="cs_test_1" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(trackEventMock).toHaveBeenCalledWith(
      'checkout_ticket_timeout',
      expect.objectContaining({ session_id: 'cs_test_1' }),
    );
    expect(screen.getByText(/t:checkEmail/)).toBeTruthy();
  });
});
