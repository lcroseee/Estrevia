// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete (window as unknown as { fbq?: unknown }).fbq;
  delete (window as unknown as { posthog?: unknown }).posthog;
});

function makeFbqMock() {
  const fbq = vi.fn();
  (window as unknown as { fbq: typeof fbq }).fbq = fbq;
  return fbq;
}

function makePosthogMock() {
  const ph = {
    get_distinct_id: vi.fn(() => 'ph_anon_xyz'),
    capture: vi.fn(),
  };
  (window as unknown as { posthog: typeof ph }).posthog = ph;
  return ph;
}

import { EmailGateModal } from '../EmailGateModal';

const baseProps = {
  open: true,
  chartId: 'chart_test_1',
  locale: 'en' as const,
  onSubmitted: vi.fn(),
  onDismiss: vi.fn(),
};

beforeEach(() => {
  baseProps.onSubmitted.mockClear();
  baseProps.onDismiss.mockClear();
});

describe('EmailGateModal', () => {
  it('renders when open=true', () => {
    render(<EmailGateModal {...baseProps} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('renders nothing when open=false', () => {
    render(<EmailGateModal {...baseProps} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('disables submit when email is empty', () => {
    render(<EmailGateModal {...baseProps} />);
    const submit = screen.getByRole('button', { name: 'submitCta' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('shows inline error and does NOT fetch for an invalid email', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(<EmailGateModal {...baseProps} />);
    const input = screen.getByLabelText('emailLabel') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => {
      expect(screen.getByText('errInvalidEmail')).toBeTruthy();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submits a valid email; on wasNew=true fires fbq Lead with returned eventID + writes localStorage flag + calls onSubmitted', async () => {
    makePosthogMock();
    const fbq = makeFbqMock();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { leadId: 'lead_abc', eventId: 'lead_abc:email_lead_submitted', wasNew: true }, error: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'good@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => expect(baseProps.onSubmitted).toHaveBeenCalled());
    expect(fbq).toHaveBeenCalledWith(
      'track',
      'Lead',
      {},
      { eventID: 'lead_abc:email_lead_submitted' },
    );
    expect(window.localStorage.getItem('email_gate_passed')).toBe('1');
  });

  it('on wasNew=false does NOT fire fbq but still sets flag, calls onSubmitted, and tracks email_lead_resubmitted', async () => {
    const ph = makePosthogMock();
    const fbq = makeFbqMock();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { leadId: 'lead_x', eventId: 'lead_x:email_lead_submitted', wasNew: false }, error: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'returning@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => expect(baseProps.onSubmitted).toHaveBeenCalled());
    expect(fbq).not.toHaveBeenCalled();
    expect(ph.capture).toHaveBeenCalledWith('email_lead_resubmitted', expect.any(Object));
    expect(window.localStorage.getItem('email_gate_passed')).toBe('1');
  });

  it('shows errRateLimited on 429 and does not fire fbq', async () => {
    const fbq = makeFbqMock();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: false, data: null, error: 'RATE_LIMITED' }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    ));
    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'rl@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => {
      expect(screen.getByText('errRateLimited')).toBeTruthy();
    });
    expect(fbq).not.toHaveBeenCalled();
  });

  it('shows errNetwork when fetch rejects', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'net@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => {
      expect(screen.getByText('errNetwork')).toBeTruthy();
    });
  });

  it('dismiss button calls onDismiss, sets flag, tracks email_gate_dismissed, no fbq', () => {
    const ph = makePosthogMock();
    const fbq = makeFbqMock();
    render(<EmailGateModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'dismissCta' }));
    expect(baseProps.onDismiss).toHaveBeenCalled();
    expect(window.localStorage.getItem('email_gate_passed')).toBe('1');
    expect(ph.capture).toHaveBeenCalledWith('email_gate_dismissed', expect.any(Object));
    expect(fbq).not.toHaveBeenCalled();
  });

  it('Escape key triggers onDismiss', () => {
    render(<EmailGateModal {...baseProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(baseProps.onDismiss).toHaveBeenCalled();
  });

  it('tolerates localStorage throwing on setItem (silent fail, still onSubmitted)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { leadId: 'lead_ls', eventId: 'lead_ls:email_lead_submitted', wasNew: true }, error: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    makeFbqMock();
    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'ls@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => expect(baseProps.onSubmitted).toHaveBeenCalled());
  });
});
