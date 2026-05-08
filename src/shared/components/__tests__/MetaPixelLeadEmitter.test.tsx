// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

// Mockable Clerk useUser. Each test sets the return value via setUseUserReturn().
let useUserReturn: { isLoaded: boolean; isSignedIn: boolean; user: { id: string; createdAt: Date } | null } = {
  isLoaded: false,
  isSignedIn: false,
  user: null,
};
function setUseUserReturn(v: typeof useUserReturn) {
  useUserReturn = v;
}

vi.mock('@clerk/nextjs', () => ({
  useUser: () => useUserReturn,
}));

import { MetaPixelLeadEmitter } from '../MetaPixelLeadEmitter';

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  // Default: no fbq present (Pixel disabled)
  delete (window as unknown as { fbq?: unknown }).fbq;
});

function makeFbqMock() {
  const fbq = vi.fn();
  (window as unknown as { fbq: typeof fbq }).fbq = fbq;
  return fbq;
}

function freshUser(id = 'user_abc'): { id: string; createdAt: Date } {
  return { id, createdAt: new Date(Date.now() - 30_000) }; // 30s old
}

function staleUser(id = 'user_old'): { id: string; createdAt: Date } {
  return { id, createdAt: new Date(Date.now() - 30 * 60_000) }; // 30min old
}

describe('MetaPixelLeadEmitter', () => {
  it('does nothing when Clerk has not loaded yet', () => {
    setUseUserReturn({ isLoaded: false, isSignedIn: false, user: null });
    const fbq = makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    expect(fbq).not.toHaveBeenCalled();
  });

  it('does nothing when user is signed out', () => {
    setUseUserReturn({ isLoaded: true, isSignedIn: false, user: null });
    const fbq = makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    expect(fbq).not.toHaveBeenCalled();
  });

  it('does nothing when user.createdAt is older than the freshness window', async () => {
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user: staleUser() });
    const fbq = makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    await waitFor(() => {
      expect(fbq).not.toHaveBeenCalled();
    });
  });

  it('does nothing when window.fbq is undefined (Pixel disabled)', async () => {
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user: freshUser() });
    // No fbq set
    render(<MetaPixelLeadEmitter />);
    // Wait a tick so any useEffect runs
    await new Promise((r) => setTimeout(r, 0));
    expect((window as unknown as { fbq?: unknown }).fbq).toBeUndefined();
  });

  it('fires fbq Lead exactly once for a fresh signed-in user with the correct eventID', async () => {
    const user = freshUser('user_fresh_1');
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user });
    const fbq = makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    await waitFor(() => {
      expect(fbq).toHaveBeenCalledTimes(1);
    });
    expect(fbq).toHaveBeenCalledWith(
      'track',
      'Lead',
      {},
      { eventID: 'user_fresh_1:user_registered' },
    );
  });

  it('does not fire twice for the same user.id when localStorage flag is set', async () => {
    const user = freshUser('user_repeat');
    window.localStorage.setItem('lead_fired:user_repeat', '1');
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user });
    const fbq = makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fbq).not.toHaveBeenCalled();
  });

  it('writes the localStorage flag after firing', async () => {
    const user = freshUser('user_flag');
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user });
    makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    await waitFor(() => {
      expect(window.localStorage.getItem('lead_fired:user_flag')).toBe('1');
    });
  });

  it('tolerates localStorage throwing (silent fail, no fire)', async () => {
    const user = freshUser('user_ls_throws');
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user });
    const fbq = makeFbqMock();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('localStorage disabled');
    });
    render(<MetaPixelLeadEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fbq).not.toHaveBeenCalled();
  });
});
