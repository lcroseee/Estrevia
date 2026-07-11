// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { SubscriptionProvider, useSubscriptionContext } from '../SubscriptionProvider';

function Probe() {
  const { plan, isPro, isLoading } = useSubscriptionContext();
  return <div data-testid="probe">{`${plan}|${isPro}|${isLoading}`}</div>;
}

function renderProvider() {
  return render(
    <SubscriptionProvider>
      <Probe />
    </SubscriptionProvider>,
  );
}

// The provider gates its fetch on Clerk's `__client_uat` client cookie
// (provider-free, so essays render Clerk-free). Drive signed-in/out via it.
function setSignedIn() {
  document.cookie = '__client_uat=1712345678';
}
function clearSession() {
  document.cookie = '__client_uat=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSession();
});

describe('SubscriptionProvider — session gate (anon /chart 401 fix)', () => {
  it('signed-out (no session cookie): no fetch fired, resolves to free tier not-loading', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('free|false|false');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Clerk-free context (no ClerkProvider): renders without throwing, stays free', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // No ClerkProvider ancestor here — the old useAuth() gate would throw.
    expect(() => renderProvider()).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signed-in (session cookie present): fetches and reflects the subscription payload', async () => {
    setSignedIn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        plan: 'pro_monthly',
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: '2026-08-01T00:00:00Z',
        isPro: true,
        isTrialing: false,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('pro_monthly|true|false');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/user/subscription',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});
