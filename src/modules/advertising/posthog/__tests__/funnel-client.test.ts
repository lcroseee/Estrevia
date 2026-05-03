import { describe, it, expect, vi } from 'vitest';
import { PosthogFunnelClient } from '../funnel-client';

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function err(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('PosthogFunnelClient', () => {
  it('POSTs HogQL query to /api/projects/<id>/query and maps results to funnel steps', async () => {
    const fetchImpl = vi.fn(async () =>
      ok({
        results: [
          ['landing_view', 87, 87],
          ['chart_calculated', 39, 39],
          ['passport_reshared', 12, 11],
          ['paywall_opened', 5, 5],
          ['subscription_started', 1, 1],
        ],
      }),
    );

    const client = new PosthogFunnelClient({
      projectId: '1234',
      apiKey: 'phx_test',
      host: 'https://eu.i.posthog.com',
      fetchImpl,
    });

    const snapshot = await client.getFunnel({
      date_from: '2026-04-25T00:00:00Z',
      date_to: '2026-04-26T00:00:00Z',
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://eu.i.posthog.com/api/projects/1234/query/');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer phx_test');

    const body = JSON.parse(init.body as string);
    expect(body.query.kind).toBe('HogQLQuery');
    expect(body.query.query).toContain('SELECT event');
    expect(body.query.query).toContain("event IN ('landing_view', 'chart_calculated', 'passport_reshared', 'user_registered', 'paywall_opened', 'subscription_started')");

    expect(snapshot.steps).toHaveLength(6);
    expect(snapshot.steps[0]).toMatchObject({ event_name: 'landing_view', count: 87, unique_users: 87 });
    expect(snapshot.steps[1]).toMatchObject({ event_name: 'chart_calculated', count: 39 });
    // CANONICAL name in output, REAL name in HogQL response — proves mapping works
    expect(snapshot.steps[2]).toMatchObject({ event_name: 'passport_shared', count: 12, unique_users: 11 });
    // Missing event from PostHog (user_registered) → zeroed in funnel under canonical name
    expect(snapshot.steps[3]).toMatchObject({ event_name: 'user_registered', count: 0, unique_users: 0 });
    expect(snapshot.steps[4]).toMatchObject({ event_name: 'paywall_view', count: 5 });
    expect(snapshot.steps[5]).toMatchObject({ event_name: 'subscription_started', count: 1 });
  });

  it('appends utm_source filter to WHERE clause', async () => {
    const fetchImpl = vi.fn(async () => ok({ results: [] }));
    const client = new PosthogFunnelClient({
      projectId: '1', apiKey: 'k', host: 'https://posthog.test', fetchImpl,
    });

    await client.getFunnel({
      date_from: '2026-04-25T00:00:00Z',
      date_to: '2026-04-26T00:00:00Z',
      filters: { utm_source: 'meta' },
    });

    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.query.query).toContain("properties.utm_source = 'meta'");
  });

  it('appends ad_id filter as utm_content match', async () => {
    const fetchImpl = vi.fn(async () => ok({ results: [] }));
    const client = new PosthogFunnelClient({
      projectId: '1', apiKey: 'k', host: 'https://posthog.test', fetchImpl,
    });

    await client.getFunnel({
      date_from: '2026-04-25T00:00:00Z',
      date_to: '2026-04-26T00:00:00Z',
      filters: { ad_id: 'ad_test_001' },
    });

    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.query.query).toContain("properties.utm_content = 'ad_test_001'");
  });

  it('escapes single quotes in filter values', async () => {
    const fetchImpl = vi.fn(async () => ok({ results: [] }));
    const client = new PosthogFunnelClient({
      projectId: '1', apiKey: 'k', host: 'https://posthog.test', fetchImpl,
    });

    await client.getFunnel({
      date_from: '2026-04-25T00:00:00Z',
      date_to: '2026-04-26T00:00:00Z',
      filters: { utm_source: "meta'; DROP TABLE--" },
    });

    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.query.query).toContain("'meta''; DROP TABLE--'");
  });

  it('throws on non-2xx PostHog response', async () => {
    const fetchImpl = vi.fn(async () => err(401, { detail: 'Unauthorized' }));
    const client = new PosthogFunnelClient({
      projectId: '1', apiKey: 'bad', host: 'https://posthog.test', fetchImpl,
    });

    await expect(client.getFunnel({
      date_from: '2026-04-25T00:00:00Z',
      date_to: '2026-04-26T00:00:00Z',
    })).rejects.toThrow(/PostHog query failed: 401/);
  });

  it('translates canonical names to real names in HogQL and back to canonical in results', async () => {
    const fetchImpl = vi.fn(async () =>
      ok({
        results: [
          // PostHog returns ONLY the real-name events that fired
          ['passport_reshared', 100, 80],
          ['paywall_opened', 50, 45],
        ],
      }),
    );

    const client = new PosthogFunnelClient({
      projectId: '1', apiKey: 'k', host: 'https://posthog.test', fetchImpl,
    });

    const snapshot = await client.getFunnel({
      date_from: '2026-04-25T00:00:00Z',
      date_to: '2026-04-26T00:00:00Z',
    });

    // HogQL must request the REAL names
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.query.query).toContain("'passport_reshared'");
    expect(body.query.query).toContain("'paywall_opened'");
    // and must NOT request the canonical names directly
    expect(body.query.query).not.toContain("'passport_shared'");
    expect(body.query.query).not.toContain("'paywall_view'");

    // Output uses CANONICAL names with the counts from the real-name events
    const passport = snapshot.steps.find((s) => s.event_name === 'passport_shared');
    const paywall = snapshot.steps.find((s) => s.event_name === 'paywall_view');
    expect(passport).toMatchObject({ event_name: 'passport_shared', count: 100, unique_users: 80 });
    expect(paywall).toMatchObject({ event_name: 'paywall_view', count: 50, unique_users: 45 });
  });
});
