// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeatureFlag } from '../useFeatureFlag';

// Mock the PostHogProvider's usePostHog hook
const mockUsePostHog = vi.fn();
vi.mock('@/shared/components/PostHogProvider', () => ({
  usePostHog: () => mockUsePostHog(),
}));

interface MockPostHog {
  getFeatureFlag: ReturnType<typeof vi.fn>;
  onFeatureFlags: ReturnType<typeof vi.fn>;
}

let mockPostHog: MockPostHog;
let onFeatureFlagsCallback: (() => void) | null;

beforeEach(() => {
  onFeatureFlagsCallback = null;
  mockPostHog = {
    getFeatureFlag: vi.fn(() => 'variant-b'),
    onFeatureFlags: vi.fn((cb: () => void) => {
      onFeatureFlagsCallback = cb;
    }),
  };
  (window as unknown as { posthog?: MockPostHog }).posthog = mockPostHog;
  mockUsePostHog.mockReturnValue({ isInitialized: true });
});

afterEach(() => {
  delete (window as unknown as { posthog?: MockPostHog }).posthog;
  vi.clearAllMocks();
});

describe('useFeatureFlag', () => {
  it('returns defaultValue with isLoading=true when not initialized', () => {
    mockUsePostHog.mockReturnValue({ isInitialized: false });
    const { result } = renderHook(() => useFeatureFlag('test-flag', 'default-value'));
    expect(result.current.value).toBe('default-value');
    expect(result.current.isLoading).toBe(true);
  });

  it('resolves to flag value with isLoading=false when initialized', () => {
    const { result } = renderHook(() => useFeatureFlag('test-flag', 'default-value'));
    expect(result.current.value).toBe('variant-b');
    expect(result.current.isLoading).toBe(false);
  });

  it('falls back to defaultValue when posthog returns null', () => {
    mockPostHog.getFeatureFlag.mockReturnValue(null);
    const { result } = renderHook(() => useFeatureFlag('test-flag', 'fallback'));
    expect(result.current.value).toBe('fallback');
    expect(result.current.isLoading).toBe(false);
  });

  it('re-evaluates when onFeatureFlags callback fires', () => {
    const { result } = renderHook(() => useFeatureFlag('test-flag', 'default'));
    expect(result.current.value).toBe('variant-b');

    mockPostHog.getFeatureFlag.mockReturnValue('variant-c');
    act(() => {
      onFeatureFlagsCallback?.();
    });
    expect(result.current.value).toBe('variant-c');
  });

  it('returns defaultValue when window.posthog is missing despite isInitialized=true', () => {
    delete (window as unknown as { posthog?: MockPostHog }).posthog;
    const { result } = renderHook(() => useFeatureFlag('test-flag', 'safe-default'));
    expect(result.current.value).toBe('safe-default');
    expect(result.current.isLoading).toBe(true);
  });
});
