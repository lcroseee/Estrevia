// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { PostHogProvider } from '../PostHogProvider';

// ----- Hoisted mocks -------------------------------------------------------

const hoisted = vi.hoisted(() => {
  const mockUsePathname = vi.fn();
  const mockRegister = vi.fn();
  const mockInit = vi.fn();
  return { mockUsePathname, mockRegister, mockInit };
});

vi.mock('next/navigation', () => ({
  usePathname: hoisted.mockUsePathname,
}));

vi.mock('posthog-js', () => ({
  default: {
    init: hoisted.mockInit,
    register: hoisted.mockRegister,
  },
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

  it('does NOT mislabel /essays/* as es (startsWith bug)', async () => {
    hoisted.mockUsePathname.mockReturnValue('/essays/what-is-sidereal');
    render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'en' });
    });
  });

  it('labels the bare /es root as es', async () => {
    hoisted.mockUsePathname.mockReturnValue('/es');
    render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'es' });
    });
  });
});

describe('PostHogProvider — first-pageview locale via loaded callback', () => {
  it('passes a loaded callback to posthog.init that calls register({locale}) BEFORE first capture', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    hoisted.mockUsePathname.mockReturnValue('/es/pricing');
    // Accept consent so init runs.
    window.localStorage.setItem('estrevia_cookie_consent', 'accepted');
    // Reset the window posthog stub from the outer beforeEach so the test
    // observes the import-path register, not the route-change useEffect.
    delete (window as unknown as Record<string, unknown>).posthog;

    render(<PostHogProvider><div /></PostHogProvider>);

    await waitFor(() => {
      expect(hoisted.mockInit).toHaveBeenCalledTimes(1);
    });

    const [, options] = hoisted.mockInit.mock.calls[0];
    expect(typeof options.loaded).toBe('function');

    // Invoke the loaded callback as PostHog would, with a fake ph stub.
    const fakePh = { register: hoisted.mockRegister };
    options.loaded(fakePh);

    expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'es' });
  });

  it('loaded callback uses locale="en" on EN/non-ES routes', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    hoisted.mockUsePathname.mockReturnValue('/sign-in');
    window.localStorage.setItem('estrevia_cookie_consent', 'accepted');
    delete (window as unknown as Record<string, unknown>).posthog;

    render(<PostHogProvider><div /></PostHogProvider>);

    await waitFor(() => {
      expect(hoisted.mockInit).toHaveBeenCalledTimes(1);
    });

    const [, options] = hoisted.mockInit.mock.calls[0];
    const fakePh = { register: hoisted.mockRegister };
    options.loaded(fakePh);

    expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'en' });
  });

  it('loaded callback does NOT mislabel /essays/* as es (startsWith bug)', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    hoisted.mockUsePathname.mockReturnValue('/essays/what-is-sidereal');
    window.localStorage.setItem('estrevia_cookie_consent', 'accepted');
    delete (window as unknown as Record<string, unknown>).posthog;

    render(<PostHogProvider><div /></PostHogProvider>);

    await waitFor(() => {
      expect(hoisted.mockInit).toHaveBeenCalledTimes(1);
    });

    const [, options] = hoisted.mockInit.mock.calls[0];
    const fakePh = { register: hoisted.mockRegister };
    options.loaded(fakePh);

    expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'en' });
  });
});

describe('PostHogProvider — session recording (masked)', () => {
  it('init enables recording with maskAllInputs + data-ph-mask text masking', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    hoisted.mockUsePathname.mockReturnValue('/en');
    window.localStorage.setItem('estrevia_cookie_consent', 'accepted');
    delete (window as unknown as Record<string, unknown>).posthog;

    render(<PostHogProvider><div /></PostHogProvider>);

    await waitFor(() => {
      expect(hoisted.mockInit).toHaveBeenCalledTimes(1);
    });

    const [, options] = hoisted.mockInit.mock.calls[0];
    expect(options.disable_session_recording).toBe(false);
    expect(options.session_recording).toEqual({
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
    });
  });

  it('before_send scrubs birth-PII params from URL props and rrweb snapshot hrefs', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    hoisted.mockUsePathname.mockReturnValue('/en');
    window.localStorage.setItem('estrevia_cookie_consent', 'accepted');
    delete (window as unknown as Record<string, unknown>).posthog;

    render(<PostHogProvider><div /></PostHogProvider>);

    await waitFor(() => {
      expect(hoisted.mockInit).toHaveBeenCalledTimes(1);
    });

    const [, options] = hoisted.mockInit.mock.calls[0];
    // sanitize_properties never runs on $snapshot events and the input/text
    // masks cannot reach the recorded URL — before_send is the PII gate.
    expect(typeof options.before_send).toBe('function');

    const piiUrl =
      'https://estrevia.app/en/chart?bd=1990-06-15&bt=14%3A30&lat=40.7128&lon=-74.006&place=New+York&tz=America%2FNew_York&utm_source=meta';
    const scrubbed = options.before_send({
      event: '$snapshot',
      properties: {
        $current_url: piiUrl,
        $session_entry_url: piiUrl,
        $snapshot_data: [
          // rrweb Meta event — its href is what the replay player's URL bar shows
          { type: 4, data: { href: piiUrl, width: 390, height: 844 } },
          // incremental event without href — must pass through untouched
          { type: 3, data: { source: 2 } },
        ],
      },
    });

    for (const url of [
      scrubbed.properties.$current_url,
      scrubbed.properties.$session_entry_url,
      scrubbed.properties.$snapshot_data[0].data.href,
    ] as string[]) {
      expect(url).not.toMatch(/[?&](bd|bt|lat|lon|place|tz|ktb)=/);
    }
    // Non-PII params survive the scrub (attribution stays intact).
    expect(scrubbed.properties.$current_url).toContain('utm_source=meta');
    // Events without URL props pass through unchanged.
    const plain = options.before_send({ event: 'paywall_opened', properties: { trigger: 'three-card' } });
    expect(plain.properties.trigger).toBe('three-card');
  });
});
