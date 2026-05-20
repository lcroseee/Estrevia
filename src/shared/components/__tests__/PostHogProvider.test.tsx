// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { PostHogProvider } from '../PostHogProvider';

// ----- Hoisted mocks -------------------------------------------------------

const hoisted = vi.hoisted(() => {
  const mockUsePathname = vi.fn();
  const mockRegister = vi.fn();
  return { mockUsePathname, mockRegister };
});

vi.mock('next/navigation', () => ({
  usePathname: hoisted.mockUsePathname,
}));

// ----- Test setup ----------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Place a posthog stub on window so the effect's `if (!posthog?.register)`
  // guard passes. Real PostHog init is async + gated by consent; we shortcut.
  (window as unknown as Record<string, unknown>).posthog = {
    register: hoisted.mockRegister,
  };
  // Avoid initPostHog noise: clear the consent key.
  window.localStorage.removeItem('estrevia_cookie_consent');
});

describe('PostHogProvider — locale super-property', () => {
  it('registers locale="en" on EN pathnames', async () => {
    hoisted.mockUsePathname.mockReturnValue('/en/pricing');
    render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'en' });
    });
  });

  it('registers locale="es" on ES pathnames', async () => {
    hoisted.mockUsePathname.mockReturnValue('/es/pricing');
    render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'es' });
    });
  });

  it('defaults to locale="en" on root pathname', async () => {
    hoisted.mockUsePathname.mockReturnValue('/');
    render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'en' });
    });
  });

  it('re-registers when pathname changes mid-session', async () => {
    hoisted.mockUsePathname.mockReturnValue('/en');
    const { rerender } = render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'en' });
    });
    act(() => {
      hoisted.mockUsePathname.mockReturnValue('/es');
    });
    rerender(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'es' });
    });
  });

  it('no-ops when posthog global is not loaded yet', async () => {
    hoisted.mockUsePathname.mockReturnValue('/en');
    delete (window as unknown as Record<string, unknown>).posthog;
    render(<PostHogProvider><div /></PostHogProvider>);
    // Wait a tick to ensure no async register call.
    await new Promise((r) => setTimeout(r, 10));
    expect(hoisted.mockRegister).not.toHaveBeenCalled();
  });
});
