// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocale: () => 'en',
}));

let useUserReturn: { isSignedIn: boolean } = { isSignedIn: false };
vi.mock('@clerk/nextjs', () => ({
  useUser: () => useUserReturn,
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

import { HeroCalculator } from '../HeroCalculator';

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
  useUserReturn = { isSignedIn: false };
  searchParamsValue = new URLSearchParams();
  window.localStorage.clear();
  lastModalProps = null;
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
    JSON.stringify(fakeChartResponse),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));
});

describe('HeroCalculator gate state machine', () => {
  it('mounts EmailGateModal with open=true after chart-calc when anonymous + no flag set', async () => {
    render(<HeroCalculator />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('gate-modal')).toBeTruthy();
    });
    expect(lastModalProps?.open).toBe(true);
    expect(lastModalProps?.chartId).toBe('chart_int_1');
  });

  it('does NOT mount the modal when user is signed in', async () => {
    useUserReturn = { isSignedIn: true };
    render(<HeroCalculator />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('Leo')).toBeTruthy();
    });
    expect(screen.queryByTestId('gate-modal')).toBeNull();
  });

  it('does NOT mount the modal when localStorage flag is already set', async () => {
    window.localStorage.setItem('email_gate_passed', '1');
    render(<HeroCalculator />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('Leo')).toBeTruthy();
    });
    expect(screen.queryByTestId('gate-modal')).toBeNull();
  });

  it('does NOT mount the modal when ?no_gate=1 is set', async () => {
    searchParamsValue = new URLSearchParams('no_gate=1');
    render(<HeroCalculator />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('Leo')).toBeTruthy();
    });
    expect(screen.queryByTestId('gate-modal')).toBeNull();
  });

  it('on modal onSubmitted closes the gate and reveals the chart result', async () => {
    render(<HeroCalculator />);
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
    render(<HeroCalculator />);
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
