// @vitest-environment jsdom
// src/modules/astro-engine/components/__tests__/PortraitGenerator.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    // NOTE (T13, deviation from the brief's verbatim mock): the brief's
    // key-echo mock returns a plain function, but the real `PaywallModal`
    // (rendered for real — only `PaywallCta` is mocked below) calls the
    // legitimate next-intl `t.has(key)` API to pick a contextual headline.
    // The bare mock crashed with "t.has is not a function". Fixing the
    // mock, not PaywallModal, per the defective-test-double rule — this is
    // additive (still echoes every key) and changes no assertion above.
    const t = (key: string, vars?: Record<string, unknown>) =>
      vars ? `${ns}.${key}:${JSON.stringify(vars)}` : `${ns}.${key}`;
    t.has = () => true;
    return t;
  },
  useLocale: () => 'en',
}));

vi.mock('@/shared/components/PaywallCta', () => ({
  PaywallCta: ({ trigger }: { trigger: string }) => <div data-testid="paywall">{trigger}</div>,
}));

const prep = vi.hoisted(() => ({
  prepareSelfie: vi.fn(async () => new Blob(['jpeg-bytes'], { type: 'image/jpeg' })),
}));
vi.mock('@/shared/lib/image-prep', async (orig) => {
  const actual = await orig<typeof import('@/shared/lib/image-prep')>();
  return { ...actual, prepareSelfie: prep.prepareSelfie };
});

import { PortraitGenerator } from '../PortraitGenerator';

function renderIt(props: Record<string, unknown> = {}) {
  return render(
    <PortraitGenerator chartId="chart_1" sunSign="Scorpio" moonSign="Taurus" isPro {...props} />,
  );
}

function pickFile(type = 'image/jpeg', name = 'selfie.jpg') {
  const input = screen.getByTestId('portrait-file') as HTMLInputElement;
  const file = new File(['x'], name, { type });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  prep.prepareSelfie.mockResolvedValue(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }));
});

describe('PortraitGenerator — gating', () => {
  it('shows the paywall and no file input for a free user', () => {
    renderIt({ isPro: false });
    expect(screen.getByTestId('paywall').textContent).toBe('avatar-portrait');
    expect(screen.queryByTestId('portrait-file')).toBeNull();
  });

  it('states the privacy promise before any upload', () => {
    renderIt();
    expect(screen.getByText('avatar.portrait.privacyNote')).not.toBeNull();
  });

  it('keeps Generate disabled until BOTH a photo and consent are present', async () => {
    renderIt();
    const button = screen.getByTestId('portrait-generate') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    pickFile();
    await waitFor(() => expect(screen.getByTestId('portrait-preview')).not.toBeNull());
    expect((screen.getByTestId('portrait-generate') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('portrait-consent'));
    await waitFor(() =>
      expect((screen.getByTestId('portrait-generate') as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it('offers all four presentation options', () => {
    renderIt();
    for (const p of ['auto', 'feminine', 'masculine', 'androgynous']) {
      expect(screen.getByTestId(`presentation-${p}`)).not.toBeNull();
    }
  });
});

describe('PortraitGenerator — client-side validation', () => {
  it('rejects an unsupported file type without contacting the server', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderIt();
    pickFile('application/pdf', 'doc.pdf');
    await waitFor(() =>
      expect(screen.getByText('avatar.portrait.errors.invalidImage')).not.toBeNull(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('PortraitGenerator — generation', () => {
  async function submit() {
    renderIt();
    pickFile();
    await waitFor(() => expect(screen.getByTestId('portrait-preview')).not.toBeNull());
    fireEvent.click(screen.getByTestId('portrait-consent'));
    fireEvent.click(screen.getByTestId('portrait-generate'));
  }

  it('announces progress to assistive technology while generating', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    await submit();
    await waitFor(() => expect(screen.getByRole('status')).not.toBeNull());
  });

  it('renders the rejection reason when the server refuses the photo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: false, data: { reasons: ['likely_minor'] }, error: 'UNSAFE_IMAGE' }, 422),
    );
    await submit();
    await waitFor(() =>
      expect(screen.getByText('avatar.portrait.reasons.likely_minor')).not.toBeNull(),
    );
  });

  it('shows the portrait and the why-panel on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: {
            id: 'av_1',
            url: '/api/v1/avatar/av_1/image',
            scale: 'queen',
            palette: { lead: 'Sky blue', accent: 'Emerald flecked gold' },
          },
          error: null,
        },
        200,
      ),
    );
    await submit();

    const img = await waitFor(() => screen.getByTestId('portrait-image'));
    expect(img.getAttribute('src')).toBe('/api/v1/avatar/av_1/image');
    // The why-panel interpolates scale and palette through the key-echo mock.
    expect(screen.getByText(/avatar\.portrait\.whyScale:.*queen/)).not.toBeNull();
    expect(screen.getByText(/avatar\.portrait\.whyPalette:.*Sky blue/)).not.toBeNull();
  });

  it('keeps the chosen file after a failure so retry needs no re-upload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: false, data: null, error: 'GEMINI_5XX' }, 502),
    );
    await submit();
    await waitFor(() =>
      expect(screen.getByText('avatar.portrait.errors.generation')).not.toBeNull(),
    );
    // Preview still mounted and the button is usable again — the File never left state.
    expect(screen.getByTestId('portrait-preview')).not.toBeNull();
    expect((screen.getByTestId('portrait-generate') as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends multipart, never JSON base64', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: true, data: { id: 'av_1', url: '/u', scale: 'king', palette: { lead: 'a', accent: 'b' } }, error: null }, 200),
    );
    await submit();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
  });
});
