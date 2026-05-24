/**
 * PostHog HogQL cohort builder for the cart-abandon email cron.
 *
 * Returns leads who fired `paywall_opened` (or `checkout_stripe_redirected`)
 * in the last `windowDays` days but did NOT fire `subscription_started` in
 * the same window.
 *
 * The cutoff window excludes events fired within the last 1 hour to avoid
 * emailing users who are still on the pricing page.
 *
 * Env:
 *   POSTHOG_PROJECT_ID          — numeric project id
 *   POSTHOG_PERSONAL_API_KEY    — personal API key (Bearer auth)
 *   NEXT_PUBLIC_POSTHOG_HOST    — base URL (default https://us.i.posthog.com)
 */

interface HogQLResponse {
  results?: Array<Array<unknown>>;
}

export interface CartAbandonEntry {
  email: string;
  lastPaywallAt: Date;
  checkoutClicks: number;
}

function isoDateTime(d: Date): string {
  // HogQL toDateTime expects 'YYYY-MM-DD HH:MM:SS'
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Fetches cart-abandon cohort from PostHog.
 *
 * @param windowDays   — look back this many days (max 7 recommended)
 * @returns            — deduplicated list of CartAbandonEntry, ordered by
 *                       checkout_clicks DESC (hottest first)
 */
export async function getCartAbandonCohort(windowDays: number): Promise<CartAbandonEntry[]> {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(/\/$/, '');

  if (!projectId) throw new Error('POSTHOG_PROJECT_ID is not set');
  if (!apiKey) throw new Error('POSTHOG_PERSONAL_API_KEY is not set');

  const since = new Date(Date.now() - windowDays * 86_400_000);
  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // exclude last 1h

  const sinceIso = isoDateTime(since);
  const cutoffIso = isoDateTime(cutoff);

  // Group by email — count checkout clicks separately, take last paywall timestamp.
  // Excludes any distinct_id that fired subscription_started in the same window.
  const query = `
    SELECT
      lower(properties.email)                              AS email,
      MAX(timestamp)                                       AS last_paywall_at,
      countIf(event = 'checkout_stripe_redirected')        AS checkout_clicks
    FROM events
    WHERE event IN ('paywall_opened', 'checkout_stripe_redirected')
      AND timestamp >= toDateTime('${sinceIso}')
      AND timestamp <= toDateTime('${cutoffIso}')
      AND properties.email IS NOT NULL
      AND distinct_id NOT IN (
        SELECT DISTINCT distinct_id
        FROM events
        WHERE event = 'subscription_started'
          AND timestamp >= toDateTime('${sinceIso}')
      )
    GROUP BY lower(properties.email)
    ORDER BY checkout_clicks DESC, last_paywall_at DESC
  `;

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

  // Deduplicate by email (HogQL GROUP BY should handle this, but be defensive).
  const seen = new Set<string>();
  const entries: CartAbandonEntry[] = [];

  for (const row of rows) {
    const rawEmail = row[0];
    const rawTimestamp = row[1];
    const rawClicks = row[2];

    if (typeof rawEmail !== 'string') continue;
    const email = rawEmail.trim().toLowerCase();
    if (!email || !email.includes('@') || !email.includes('.')) continue;
    if (seen.has(email)) continue;
    seen.add(email);

    const lastPaywallAt =
      rawTimestamp instanceof Date
        ? rawTimestamp
        : typeof rawTimestamp === 'string'
          ? new Date(rawTimestamp)
          : new Date();

    const checkoutClicks =
      typeof rawClicks === 'number' ? rawClicks :
      typeof rawClicks === 'string' ? parseInt(rawClicks, 10) || 0 :
      0;

    entries.push({ email, lastPaywallAt, checkoutClicks });
  }

  return entries;
}
