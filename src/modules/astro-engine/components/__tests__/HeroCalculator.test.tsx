// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocale: () => 'en',
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('a', props, children),
}));

let searchParamsValue = new URLSearchParams();
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useSearchParams: () => searchParamsValue,
  };
});

const onSubmittedHandlers: Array<() => void> = [];
const onDismissHandlers: Array<() => void> = [];
let lastModalProps: { open: boolean; chartId: string; locale: 'en' | 'es' } | null = null;
vi.mock('@/shared/components/EmailGateModal', () => ({
  EmailGateModal: (props: {
    open: boolean;
    chartId: string;
    locale: 'en' | 'es';
    onSubmitted: () => void;
    onDismiss: () => void;
  }) => {
    lastModalProps = { open: props.open, chartId: props.chartId, locale: props.locale };
    if (props.open) {
      onSubmittedHandlers.length = 0;
      onSubmittedHandlers.push(props.onSubmitted);
      onDismissHandlers.length = 0;
      onDismissHandlers.push(props.onDismiss);
    }
    return props.open ? React.createElement('div', { 'data-testid': 'gate-modal' }) : null;
  },
}));

vi.mock('../CityAutocomplete', () => ({
  CityAutocomplete: ({ onCitySelect, onChange }: {
    onCitySelect: (c: { name: string; latitude: number; longitude: number; timezone: string }) => void;
    onChange: (v: string) => void;
  }) => React.createElement('button', {
    'data-testid': 'pick-city',
    onClick: () => {
      onChange('Test City');
      onCitySelect({ name: 'Test City', latitude: 10, longitude: 20, timezone: 'UTC' });
    },
  }, 'pick city'),
}));
vi.mock('../DateInput', () => ({
  DateInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    React.createElement('input', {
      'data-testid': 'date-input',
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    }),
}));
vi.mock('../TimePickerField', () => ({
  TimePickerField: () => null,
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: {
    CHART_CALCULATED: 'chart_calculated',
  },
}));

import { HeroCalculator } from '../HeroCalculator';
import { trackEvent } from '@/shared/lib/analytics';

const fakeChartResponse = {
  success: true,
  data: {
    chartId: 'chart_int_1',
    chart: {
      planets: [{ planet: 'Sun', sign: 'Leo', signDegree: 12.34 }],
    },
  },
};

async function fillFormAndSubmit() {
  fireEvent.change(screen.getByTestId('date-input'), { target: { value: '1990-08-15' } });
  fireEvent.click(screen.getByTestId('pick-city'));
  fireEvent.click(screen.getByRole('button', { name: /submit/i }));
}

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  window.localStorage.clear();
  lastModalProps = null;
  vi.mocked(trackEvent).mockClear();
  delete (window as unknown as { fbq?: unknown }).fbq;
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
    JSON.stringify(fakeChartResponse),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));
});

describe('HeroCalculator gate state machine', () => {
  it('mounts EmailGateModal with open=true after chart-calc when anonymous + no flag set', async () => {
    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('gate-modal')).toBeTruthy();
    });
    expect(lastModalProps?.open).toBe(true);
    expect(lastModalProps?.chartId).toBe('chart_int_1');
  });

  it('does NOT mount the modal when user is signed in', async () => {
    render(<HeroCalculator isSignedIn={true} />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('Leo')).toBeTruthy();
    });
    expect(screen.queryByTestId('gate-modal')).toBeNull();
  });

  it('does NOT mount the modal when localStorage flag is already set', async () => {
    window.localStorage.setItem('email_gate_passed', '1');
    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('Leo')).toBeTruthy();
    });
    expect(screen.queryByTestId('gate-modal')).toBeNull();
  });

  it('does NOT mount the modal when ?no_gate=1 is set', async () => {
    searchParamsValue = new URLSearchParams('no_gate=1');
    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('Leo')).toBeTruthy();
    });
    expect(screen.queryByTestId('gate-modal')).toBeNull();
  });

  it('on modal onSubmitted closes the gate and reveals the chart result', async () => {
    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();
    await waitFor(() => expect(screen.getByTestId('gate-modal')).toBeTruthy());
    expect(screen.queryByText('Leo')).toBeNull();

    act(() => {
      onSubmittedHandlers[0]?.();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('gate-modal')).toBeNull();
      expect(screen.getByText('Leo')).toBeTruthy();
    });
  });

  it('on modal onDismiss closes the gate and reveals the chart result', async () => {
    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();
    await waitFor(() => expect(screen.getByTestId('gate-modal')).toBeTruthy());

    act(() => {
      onDismissHandlers[0]?.();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('gate-modal')).toBeNull();
      expect(screen.getByText('Leo')).toBeTruthy();
    });
  });
});

describe('HeroCalculator analytics (C1 — chart_calculated)', () => {
  it('fires chart_calculated with source="hero" on successful submit (anonymous, no Moon in payload)', async () => {
    // Uses the default fakeChartResponse — Sun=Leo, no Moon.
    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();

    await waitFor(() => {
      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
        'chart_calculated',
        expect.objectContaining({
          source: 'hero',
          has_birth_time: false,
          sun: 'Leo',
          moon: null,
          is_authenticated: false,
        }),
      );
    });
  });

  it('fires chart_calculated with is_authenticated=true when isSignedIn=true', async () => {
    render(<HeroCalculator isSignedIn={true} />);
    await fillFormAndSubmit();

    await waitFor(() => {
      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
        'chart_calculated',
        expect.objectContaining({ is_authenticated: true }),
      );
    });
  });

  it('includes Moon sign in payload when the chart returns one', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({
        success: true,
        data: {
          chartId: 'chart_with_moon',
          chart: {
            planets: [
              { planet: 'Sun', sign: 'Leo', signDegree: 12.34 },
              { planet: 'Moon', sign: 'Pisces', signDegree: 4.20 },
            ],
          },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();

    await waitFor(() => {
      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
        'chart_calculated',
        expect.objectContaining({ sun: 'Leo', moon: 'Pisces' }),
      );
    });
  });

  it('does NOT fire chart_calculated when the server returns 500', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ error: 'server_error' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    ));

    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();

    // Settle: give the rejected branch a tick to run finally{}.
    await new Promise((r) => setTimeout(r, 30));
    expect(vi.mocked(trackEvent)).not.toHaveBeenCalled();
  });

  it('calls fbq("track", "ViewContent", ...) when fbq is on window', async () => {
    const fbqMock = vi.fn();
    (window as unknown as { fbq: typeof fbqMock }).fbq = fbqMock;

    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();

    await waitFor(() => {
      expect(fbqMock).toHaveBeenCalledWith('track', 'ViewContent', { content_type: 'natal_chart' });
    });
  });

  it('does not throw when fbq is absent (PostHog event still fires)', async () => {
    // beforeEach already deletes window.fbq — assert default behavior.
    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();

    await waitFor(() => {
      expect(vi.mocked(trackEvent)).toHaveBeenCalled();
    });
  });
});
