// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.has = () => false;
    return t;
  },
  useLocale: () => 'en',
}));

const trackEvent = vi.fn();
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmLastTouch: vi.fn().mockReturnValue({}),
}));

import { PaywallModal } from '../PaywallModal';
import { PAYWALL_EXIT_STORAGE_KEY } from '@/shared/lib/paywall-exit';

function renderOpen(onClose = vi.fn()) {
  return { onClose, ...render(<PaywallModal open={true} onClose={onClose} triggerContext="essay" />) };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-30T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('PaywallModal exit sheet', () => {
  it('unqualified close (dwell < 2s) fires dismissed and calls onClose, no exit sheet', () => {
    const { onClose } = renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('exit.title')).toBeNull();
    expect(trackEvent).toHaveBeenCalledWith(
      'PAYWALL_DISMISSED',
      expect.objectContaining({
        trigger: 'essay',
        method: 'close_button',
        stage: 'offer',
        qualified: false,
      }),
    );
    expect(trackEvent).not.toHaveBeenCalledWith('PAYWALL_EXIT_SHOWN', expect.anything());
  });

  it('qualified close shows the exit sheet and does not call onClose', () => {
    const { onClose } = renderOpen();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('exit.title')).toBeTruthy();
    expect(screen.getByText('exit.keepFree')).toBeTruthy();
    expect(screen.getByText('exit.tryAnnual')).toBeTruthy();
    expect(trackEvent).toHaveBeenCalledWith(
      'PAYWALL_EXIT_SHOWN',
      expect.objectContaining({ trigger: 'essay', plan: 'pro_monthly' }),
    );
  });

  it('keep-free on the exit sheet closes for real', () => {
    const { onClose } = renderOpen();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByText('exit.keepFree'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      'PAYWALL_DISMISSED',
      expect.objectContaining({ method: 'keep_free', stage: 'exit', qualified: true }),
    );
  });

  it('second close on the exit sheet still calls onClose', () => {
    const { onClose } = renderOpen();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape on offer after 2s opens the sheet; Escape on exit closes', () => {
    const { onClose } = renderOpen();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('exit.title')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides tryAnnual when the user already selected annual', () => {
    renderOpen();
    fireEvent.click(screen.getByText('annual'));
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.getByText('exit.title')).toBeTruthy();
    expect(screen.queryByText('exit.tryAnnual')).toBeNull();
  });

  it('annual exit CTA posts checkout with pro_annual', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { url: 'https://stripe.com/pay' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderOpen();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    await act(async () => {
      fireEvent.click(screen.getByText('exit.tryAnnual'));
    });
    expect(trackEvent).toHaveBeenCalledWith(
      'PAYWALL_EXIT_ANNUAL_CLICKED',
      expect.objectContaining({ trigger: 'essay' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.plan).toBe('pro_annual');
    vi.unstubAllGlobals();
  });

  it('keeps the annual CTA mounted while checkout loads and surfaces errors on the exit sheet', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderOpen();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByText('exit.tryAnnual'));
    expect(screen.getByText('redirecting')).toBeTruthy();
    expect(screen.getByText('exit.keepFree')).toBeTruthy();
    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ success: false }),
      });
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('exit.keepFree')).toBeTruthy();
    expect(screen.getByText('exit.tryAnnual')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('does not move focus to close when toggling the annual plan', () => {
    renderOpen();
    const annualToggle = screen.getByRole('button', { name: /annual/i });
    annualToggle.focus();
    expect(document.activeElement).toBe(annualToggle);
    fireEvent.click(annualToggle);
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'close' }));
  });

  it('cooldown skips the exit sheet on a later qualified close', () => {
    const { onClose, unmount } = renderOpen();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(localStorage.getItem(PAYWALL_EXIT_STORAGE_KEY)).toBeTruthy();
    unmount();
    const onClose2 = vi.fn();
    render(<PaywallModal open={true} onClose={onClose2} triggerContext="essay" />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose2).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('exit.title')).toBeNull();
    void onClose;
  });

  it('keep-mounted reopen after a qualified dismiss paints the offer, not the exit sheet', () => {
    const onClose = vi.fn();
    const openPaints: string[] = [];

    function Harness({ open }: { open: boolean }) {
      React.useLayoutEffect(() => {
        if (!open) {
          openPaints.push('closed');
          return;
        }
        openPaints.push(
          document.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? 'missing',
        );
      });
      return <PaywallModal open={open} onClose={onClose} triggerContext="essay" />;
    }

    const { rerender } = render(<Harness open />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.getByText('exit.title')).toBeTruthy();
    fireEvent.click(screen.getByText('exit.keepFree'));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Harness open={false} />);
    rerender(<Harness open />);

    const closedAt = openPaints.lastIndexOf('closed');
    expect(openPaints[closedAt + 1]).toBe('title');
    expect(screen.queryByText('exit.title')).toBeNull();
    expect(screen.getByText('title')).toBeTruthy();
    expect(screen.getByText('trialCta')).toBeTruthy();
  });

  it('keep-mounted reopen after an exit checkout error does not show a stale alert', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    const { rerender } = render(
      <PaywallModal open={true} onClose={onClose} triggerContext="essay" />,
    );
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByText('exit.tryAnnual'));
    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ success: false }),
      });
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByText('exit.keepFree'));
    rerender(<PaywallModal open={false} onClose={onClose} triggerContext="essay" />);
    rerender(<PaywallModal open={true} onClose={onClose} triggerContext="essay" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('exit.title')).toBeNull();
    expect(screen.getByText('trialCta')).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
