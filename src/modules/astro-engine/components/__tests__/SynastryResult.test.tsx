// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SynastryResult } from '../SynastryResult';

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: {
    PASSPORT_RESHARED: 'passport_reshared',
  },
}));

vi.mock('@/shared/lib/share', () => ({
  buildShareUrl: (url: string, channel: string) =>
    `${url}?utm_source=share_${channel}&utm_medium=passport_share&utm_campaign=cosmic_passport`,
}));

import { trackEvent } from '@/shared/lib/analytics';

const minimalProps = {
  id: 'syn_test_id',
  chart1Summary: { name: 'Alice', sunSign: 'Aries', moonSign: 'Taurus', ascendant: null },
  chart2Summary: { name: 'Bob', sunSign: 'Leo', moonSign: 'Cancer', ascendant: null },
  aspects: [],
  scores: {
    overall: 78,
    categories: [],
  },
  onReset: vi.fn(),
} as unknown as Parameters<typeof SynastryResult>[0];

const messages = {
  synastry: {
    person1: 'Person 1',
    person2: 'Person 2',
    resultsTitle: 'Synastry Results',
    shareButton: 'Share',
    aspectsLabel: 'Aspects',
    newComparison: 'New Comparison',
  },
};

function renderResult() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SynastryResult {...minimalProps} />
    </NextIntlClientProvider>,
  );
}

describe('SynastryResult.handleShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis.navigator, 'share');
    Reflect.deleteProperty(globalThis.navigator, 'clipboard');
  });

  it('fires PASSPORT_RESHARED with platform=native + UTM URL when navigator.share is present', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'share', {
      value: shareMock,
      configurable: true,
      writable: true,
    });

    renderResult();
    const shareBtn = await screen.findByRole('button', { name: /share/i });
    fireEvent.click(shareBtn);
    await new Promise((r) => setTimeout(r, 0));

    expect(shareMock).toHaveBeenCalledTimes(1);
    expect(shareMock.mock.calls[0][0].url).toContain('utm_source=share_native');
    expect(trackEvent).toHaveBeenCalledWith('passport_reshared', {
      platform: 'native',
      passport_id: 'syn_test_id',
    });
  });

  it('fires PASSPORT_RESHARED with platform=copy_link + UTM URL when navigator.share is absent', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    renderResult();
    const shareBtn = await screen.findByRole('button', { name: /share/i });
    fireEvent.click(shareBtn);
    await new Promise((r) => setTimeout(r, 0));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('utm_source=share_native');
    expect(trackEvent).toHaveBeenCalledWith('passport_reshared', {
      platform: 'copy_link',
      passport_id: 'syn_test_id',
    });
  });

  it('does NOT fire trackEvent when navigator.share rejects (user dismissed)', async () => {
    const shareMock = vi.fn().mockRejectedValue(new Error('dismissed'));
    Object.defineProperty(globalThis.navigator, 'share', {
      value: shareMock,
      configurable: true,
      writable: true,
    });

    renderResult();
    const shareBtn = await screen.findByRole('button', { name: /share/i });
    fireEvent.click(shareBtn);
    await new Promise((r) => setTimeout(r, 0));

    expect(shareMock).toHaveBeenCalledTimes(1);
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
