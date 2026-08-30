import { describe, it, expect } from 'vitest';
import {
  PAYWALL_EXIT_COOLDOWN_MS,
  PAYWALL_EXIT_QUALIFY_MS,
  shouldShowPaywallExitSheet,
} from '../paywall-exit';

const NOW = 1_700_000_000_000;

describe('shouldShowPaywallExitSheet', () => {
  it('rejects dwell below the qualify threshold', () => {
    expect(shouldShowPaywallExitSheet(PAYWALL_EXIT_QUALIFY_MS - 1, NOW, () => null)).toBe(false);
  });

  it('shows when dwell qualifies and nothing is stored', () => {
    expect(shouldShowPaywallExitSheet(PAYWALL_EXIT_QUALIFY_MS, NOW, () => null)).toBe(true);
    expect(shouldShowPaywallExitSheet(PAYWALL_EXIT_QUALIFY_MS, NOW, () => '')).toBe(true);
  });

  it('hides when cooldown is still active', () => {
    const stored = String(NOW - PAYWALL_EXIT_COOLDOWN_MS + 1);
    expect(shouldShowPaywallExitSheet(5_000, NOW, () => stored)).toBe(false);
  });

  it('shows when cooldown has elapsed', () => {
    const stored = String(NOW - PAYWALL_EXIT_COOLDOWN_MS);
    expect(shouldShowPaywallExitSheet(5_000, NOW, () => stored)).toBe(true);
  });

  it('treats non-numeric storage as missing (show)', () => {
    expect(shouldShowPaywallExitSheet(5_000, NOW, () => 'nope')).toBe(true);
  });

  it('fails closed when the reader throws', () => {
    expect(
      shouldShowPaywallExitSheet(5_000, NOW, () => {
        throw new Error('blocked');
      }),
    ).toBe(false);
  });
});
