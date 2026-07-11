// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockUseAuth = vi.fn();
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockUseAuth(),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SubscriptionProvider — Clerk gate (anon /chart 401 fix)', () => {
  it('signed-out: no fetch fired, resolves to free tier not-loading', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('free|false|false');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Clerk not loaded yet: stays in loading state, no fetch', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    // Give any (wrong) mount-time fetch a tick to fire.
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId('probe').textContent).toBe('free|false|true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signed-in: fetches and reflects the subscription payload', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
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
