import type { FunnelSnapshot, FunnelEvent } from '@/shared/types/advertising';
import type { PosthogFunnelApi } from '@/modules/advertising/perceive/posthog-funnel';

/**
 * PostHog server-side funnel client.
 *
 * Uses PostHog's HogQL Query API (POST /api/projects/<id>/query/) to count
 * the 6 funnel events in a given time window, optionally filtered by
 * utm_source or utm_content (ad_id).
 *
 * Env vars (validated at construction):
 *   POSTHOG_PROJECT_ID         — numeric project id
 *   POSTHOG_PERSONAL_API_KEY   — personal API key from PostHog UI (Bearer auth)
 *   NEXT_PUBLIC_POSTHOG_HOST   — base URL (default https://eu.i.posthog.com)
 *
 * Returned counts feed `fetchFunnelSnapshot` which recomputes
 * conversion_from_previous, so this client only needs raw counts per event.
 */

const FUNNEL_EVENTS: FunnelEvent['event_name'][] = [
  'landing_view',
  'chart_calculated',
  'passport_shared',
  'user_registered',
  'paywall_view',
  'subscription_started',
];

interface HogQLResponse {
  results?: [string, number, number][]; // [event, count, unique_users]
  columns?: string[];
}

export interface PosthogFunnelClientConfig {
  projectId: string;
  apiKey: string;
  host: string;
  fetchImpl?: typeof fetch;
}

export class PosthogFunnelClient implements PosthogFunnelApi {
  private readonly projectId: string;
  private readonly apiKey: string;
  private readonly host: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PosthogFunnelClientConfig) {
    this.projectId = config.projectId;
    this.apiKey = config.apiKey;
    this.host = config.host.replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async getFunnel(opts: {
    date_from: string;
    date_to: string;
    filters?: { utm_source?: string; ad_id?: string };
  }): Promise<FunnelSnapshot> {
    const eventList = FUNNEL_EVENTS.map((e) => `'${e}'`).join(', ');

    let where = `timestamp >= toDateTime('${opts.date_from}') AND timestamp < toDateTime('${opts.date_to}') AND event IN (${eventList})`;
    if (opts.filters?.utm_source) {
      where += ` AND properties.utm_source = '${this.escapeSql(opts.filters.utm_source)}'`;
    }
    if (opts.filters?.ad_id) {
      where += ` AND properties.utm_content = '${this.escapeSql(opts.filters.ad_id)}'`;
    }

    const query = `SELECT event, count() AS c, count(DISTINCT distinct_id) AS u FROM events WHERE ${where} GROUP BY event`;

    const url = `${this.host}/api/projects/${this.projectId}/query/`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`PostHog query failed: ${res.status} ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as HogQLResponse;
    const rows = json.results ?? [];

    const counts = new Map<string, { count: number; unique: number }>();
    for (const row of rows) {
      const [event, count, unique] = row;
      counts.set(event, { count: Number(count) || 0, unique: Number(unique) || 0 });
    }

    const steps: FunnelEvent[] = FUNNEL_EVENTS.map((event_name) => {
      const r = counts.get(event_name) ?? { count: 0, unique: 0 };
      return {
        event_name,
        count: r.count,
        unique_users: r.unique,
        // conversion_from_previous is overwritten by normalizeConversions
        // in fetchFunnelSnapshot — pass 0 here as a placeholder.
        conversion_from_previous: 0,
      };
    });

    return {
      window_start: new Date(opts.date_from),
      window_end: new Date(opts.date_to),
      source_filter: opts.filters,
      steps,
    };
  }

  /**
   * Escapes single quotes in user-provided UTM values to keep them inside
   * the string literal. UTM values arrive from our own ad upload flow, but
   * we still want defense in depth to prevent quote-injection breaking the query.
   */
  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }
}

function readEnv(): { projectId: string; apiKey: string; host: string } {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
  if (!projectId) throw new Error('POSTHOG_PROJECT_ID is not set');
  if (!apiKey) throw new Error('POSTHOG_PERSONAL_API_KEY is not set');
  return { projectId, apiKey, host };
}

function guardTestEnv(): void {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    throw new Error('createPosthogFunnelClient: Use mock in tests');
  }
}

export function createPosthogFunnelClient(): PosthogFunnelClient {
  guardTestEnv();
  return new PosthogFunnelClient(readEnv());
}
