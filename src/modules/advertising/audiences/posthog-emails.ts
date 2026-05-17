/**
 * HogQL helpers for the audience-refresh cron.
 *
 * Three queries — recently-registered (exclusion source), calc-no-register
 * (cold retargeting), and register-no-paid (warm retargeting). All return
 * deduplicated lowercased plain-text emails; SHA-256 hashing happens at the
 * Meta upload boundary in `meta-custom-audiences.ts`.
 *
 * Reuses the auth pattern from `posthog/funnel-client.ts:104-118`. Built on
 * `fetch` (not the posthog-node SDK) because PostHog's HogQL Query API is a
 * lightweight POST — adding the SDK would be overkill for three queries.
 *
 * Env:
 *   POSTHOG_PROJECT_ID         — numeric project id
 *   POSTHOG_PERSONAL_API_KEY   — personal API key (Bearer auth)
 *   NEXT_PUBLIC_POSTHOG_HOST   — base URL (default https://us.i.posthog.com)
 */

interface HogQLResponse {
  results?: Array<Array<unknown>>;
}

/**
 * Exposed for tests only — runs the HogQL query and returns the deduplicated
 * lowercased emails from the first column of each row.
 */
async function runHogQL(query: string): Promise<string[]> {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(/\/$/, '');
  if (!projectId) throw new Error('POSTHOG_PROJECT_ID is not set');
  if (!apiKey) throw new Error('POSTHOG_PERSONAL_API_KEY is not set');

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PostHog query failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as HogQLResponse;
  const rows = json.results ?? [];

  const emails = new Set<string>();
  for (const row of rows) {
    const raw = row[0];
    if (typeof raw !== 'string') continue;
    const normalised = raw.trim().toLowerCase();
    if (normalised.length === 0 || !normalised.includes('@')) continue;
    emails.add(normalised);
  }
  return Array.from(emails);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Returns emails of users who fired `user_registered` since `sinceDate`.
 * Used as one of the two sources for the exclusion audience (alongside
 * active Stripe subscribers).
 */
export async function getRecentlyRegisteredEmails(sinceDate: Date): Promise<string[]> {
  const sinceIso = isoDate(sinceDate);
  const query = `SELECT DISTINCT properties.email AS email
                 FROM events
                 WHERE event = 'user_registered'
                   AND timestamp >= toDateTime('${sinceIso}')
                   AND properties.email IS NOT NULL`;
  return runHogQL(query);
}

/**
 * Cold retargeting: users who calculated a chart in the last `windowDays`
 * but did NOT register. Their distinct_id is excluded if it appears in any
 * `user_registered` event in the same window.
 */
export async function getCalcNoRegisterEmails(windowDays: number): Promise<string[]> {
  const sinceIso = isoDate(new Date(Date.now() - windowDays * 86_400_000));
  const query = `SELECT DISTINCT properties.email AS email
                 FROM events
                 WHERE event = 'chart_calculated'
                   AND timestamp >= toDateTime('${sinceIso}')
                   AND properties.email IS NOT NULL
                   AND distinct_id NOT IN (
                     SELECT DISTINCT distinct_id FROM events
                     WHERE event = 'user_registered'
                       AND timestamp >= toDateTime('${sinceIso}')
                   )`;
  return runHogQL(query);
}

/**
 * Warm retargeting: users who registered in the last `windowDays` but did
 * NOT start a subscription. Excludes any distinct_id that fired
 * `subscription_started` in the same window.
 */
export async function getRegisterNoPaidEmails(windowDays: number): Promise<string[]> {
  const sinceIso = isoDate(new Date(Date.now() - windowDays * 86_400_000));
  const query = `SELECT DISTINCT properties.email AS email
                 FROM events
                 WHERE event = 'user_registered'
                   AND timestamp >= toDateTime('${sinceIso}')
                   AND properties.email IS NOT NULL
                   AND distinct_id NOT IN (
                     SELECT DISTINCT distinct_id FROM events
                     WHERE event = 'subscription_started'
                       AND timestamp >= toDateTime('${sinceIso}')
                   )`;
  return runHogQL(query);
}
