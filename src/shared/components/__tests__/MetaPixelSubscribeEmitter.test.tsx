// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

// Mockable Next.js useSearchParams. Each test sets the URLSearchParams via setSearchParams().
let currentParams = new URLSearchParams();
function setSearchParams(qs: string) {
  currentParams = new URLSearchParams(qs);
}

vi.mock('next/navigation', () => ({
  useSearchParams: () => currentParams,
}));

import { MetaPixelSubscribeEmitter } from '../MetaPixelSubscribeEmitter';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setSearchParams('');
  delete (window as unknown as { fbq?: unknown }).fbq;
});

function makeFbqMock() {
  const fbq = vi.fn();
  (window as unknown as { fbq: typeof fbq }).fbq = fbq;
  return fbq;
}

describe('MetaPixelSubscribeEmitter', () => {
  it('does nothing when there is no session_id in URL', async () => {
    setSearchParams('');
    const fbq = makeFbqMock();
    render(<MetaPixelSubscribeEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fbq).not.toHaveBeenCalled();
  });

  it('does nothing when window.fbq is undefined', async () => {
    setSearchParams('session_id=cs_test_1');
    // No fbq set
    render(<MetaPixelSubscribeEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect((window as unknown as { fbq?: unknown }).fbq).toBeUndefined();
  });

  it('fires fbq Subscribe exactly once with the correct eventID', async () => {
    setSearchParams('session_id=cs_test_abc123');
    const fbq = makeFbqMock();
    render(<MetaPixelSubscribeEmitter />);
    await waitFor(() => {
      expect(fbq).toHaveBeenCalledTimes(1);
    });
    expect(fbq).toHaveBeenCalledWith(
      'track',
      'Subscribe',
      {},
      { eventID: 'cs_test_abc123:subscription_started' },
    );
  });

  it('does not fire twice for the same session_id when localStorage flag is set', async () => {
    setSearchParams('session_id=cs_test_repeat');
    window.localStorage.setItem('subscribe_fired:cs_test_repeat', '1');
    const fbq = makeFbqMock();
    render(<MetaPixelSubscribeEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fbq).not.toHaveBeenCalled();
  });

  it('writes the localStorage flag after firing', async () => {
    setSearchParams('session_id=cs_test_flag');
    makeFbqMock();
    render(<MetaPixelSubscribeEmitter />);
    await waitFor(() => {
      expect(window.localStorage.getItem('subscribe_fired:cs_test_flag')).toBe('1');
    });
  });

  it('tolerates localStorage throwing (silent fail, no fire)', async () => {
    setSearchParams('session_id=cs_test_throws');
    const fbq = makeFbqMock();
    const origGetItem = window.localStorage.getItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('localStorage disabled');
    });
    render(<MetaPixelSubscribeEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fbq).not.toHaveBeenCalled();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(origGetItem);
  });
});
