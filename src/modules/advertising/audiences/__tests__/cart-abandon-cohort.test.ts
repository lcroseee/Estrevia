import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock fetch used by runHogQL inside cart-abandon-cohort.ts
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Set required env vars before module import
vi.stubEnv('POSTHOG_PROJECT_ID', 'proj_123');
vi.stubEnv('POSTHOG_PERSONAL_API_KEY', 'phx_test_key');
vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCartAbandonCohort', () => {
  it('correctly parses HogQL response into CartAbandonEntry array', async () => {
    const isoNow = new Date().toISOString();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          ['test@example.com', isoNow, 2],
          ['another@example.com', isoNow, 0],
        ],
      }),
    });

    const { getCartAbandonCohort } = await import('../cart-abandon-cohort');
    const cohort = await getCartAbandonCohort(7);

    expect(cohort).toHaveLength(2);
    expect(cohort[0]).toMatchObject({
      email: 'test@example.com',
      checkoutClicks: 2,
    });
    expect(cohort[0].lastPaywallAt).toBeInstanceOf(Date);
    expect(cohort[1]).toMatchObject({
      email: 'another@example.com',
      checkoutClicks: 0,
    });
  });

  it('filters out rows with invalid email format', async () => {
    const isoNow = new Date().toISOString();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          ['not-an-email', isoNow, 1],
          ['valid@user.com', isoNow, 0],
          ['', isoNow, 0],
          [null, isoNow, 0],
        ],
      }),
    });

    const { getCartAbandonCohort } = await import('../cart-abandon-cohort');
    const cohort = await getCartAbandonCohort(7);

    expect(cohort).toHaveLength(1);
    expect(cohort[0].email).toBe('valid@user.com');
  });

  it('deduplicates identical emails', async () => {
    const isoNow = new Date().toISOString();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          ['dup@example.com', isoNow, 3],
          ['DUP@EXAMPLE.COM', isoNow, 1],
        ],
      }),
    });

    const { getCartAbandonCohort } = await import('../cart-abandon-cohort');
    const cohort = await getCartAbandonCohort(7);

    expect(cohort).toHaveLength(1);
    // Should keep the one with higher checkout_clicks
    expect(cohort[0].checkoutClicks).toBe(3);
  });

  it('returns empty array when PostHog returns no results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const { getCartAbandonCohort } = await import('../cart-abandon-cohort');
    const cohort = await getCartAbandonCohort(7);

    expect(cohort).toHaveLength(0);
  });

  it('throws when PostHog returns non-ok status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const { getCartAbandonCohort } = await import('../cart-abandon-cohort');
    await expect(getCartAbandonCohort(7)).rejects.toThrow('PostHog query failed');
  });
});
