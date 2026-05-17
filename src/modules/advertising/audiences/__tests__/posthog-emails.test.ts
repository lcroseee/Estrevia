import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted because vi.mock factories evaluate before module-level consts.
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

import {
  getRecentlyRegisteredEmails,
  getCalcNoRegisterEmails,
  getRegisterNoPaidEmails,
} from '../posthog-emails';

const ORIGINAL_FETCH = global.fetch;

describe('posthog-emails HogQL queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.POSTHOG_PROJECT_ID = 'p1';
    process.env.POSTHOG_PERSONAL_API_KEY = 'k1';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.posthog.com';
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [['user@x.com'], ['Other@X.com']] }),
    });
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    delete process.env.POSTHOG_PROJECT_ID;
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  });

  it('getRecentlyRegisteredEmails returns deduplicated lowercased emails', async () => {
    const out = await getRecentlyRegisteredEmails(new Date('2026-04-26T00:00:00Z'));
    expect(out.sort()).toEqual(['other@x.com', 'user@x.com']);
  });

  it('getRecentlyRegisteredEmails issues a HogQL query filtering on user_registered + sinceDate', async () => {
    await getRecentlyRegisteredEmails(new Date('2026-04-26T00:00:00Z'));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/projects\/p1\/query\//);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer k1');
    const body = JSON.parse(init.body as string) as { query: { kind: string; query: string } };
    expect(body.query.kind).toBe('HogQLQuery');
    expect(body.query.query).toMatch(/event = 'user_registered'/);
    expect(body.query.query).toMatch(/2026-04-26/);
  });

  it('getCalcNoRegisterEmails excludes distinct_ids that registered in the same window', async () => {
    await getCalcNoRegisterEmails(7);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.query.query).toMatch(/event = 'chart_calculated'/);
    expect(body.query.query).toMatch(/NOT IN/);
    expect(body.query.query).toMatch(/event = 'user_registered'/);
  });

  it('getRegisterNoPaidEmails excludes distinct_ids that subscribed', async () => {
    await getRegisterNoPaidEmails(14);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.query.query).toMatch(/event = 'user_registered'/);
    expect(body.query.query).toMatch(/event = 'subscription_started'/);
  });

  it('skips rows with empty / non-email values', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          ['valid@x.com'],
          [''],
          [null],
          ['no-at-sign'],
          ['  Mixed@CASE.com  '],
        ],
      }),
    });
    const out = await getRecentlyRegisteredEmails(new Date('2026-04-26T00:00:00Z'));
    expect(out.sort()).toEqual(['mixed@case.com', 'valid@x.com']);
  });

  it('throws on non-ok HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    await expect(getRecentlyRegisteredEmails(new Date('2026-04-26T00:00:00Z'))).rejects.toThrow(
      /PostHog query failed: 500/,
    );
  });

  it('throws when POSTHOG_PROJECT_ID is missing', async () => {
    delete process.env.POSTHOG_PROJECT_ID;
    await expect(
      getRecentlyRegisteredEmails(new Date('2026-04-26T00:00:00Z')),
    ).rejects.toThrow(/POSTHOG_PROJECT_ID/);
  });

  it('throws when POSTHOG_PERSONAL_API_KEY is missing', async () => {
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    await expect(
      getRecentlyRegisteredEmails(new Date('2026-04-26T00:00:00Z')),
    ).rejects.toThrow(/POSTHOG_PERSONAL_API_KEY/);
  });
});
