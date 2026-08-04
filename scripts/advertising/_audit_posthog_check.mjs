import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

if (!KEY || !PROJECT) {
  console.log('Missing POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID — skipping');
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const ago30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

const query = {
  query: {
    kind: 'HogQLQuery',
    query: `
      SELECT event, COUNT() AS n
      FROM events
      WHERE timestamp >= toDateTime('${ago30} 00:00:00')
        AND event IN ('email_lead_submitted', 'email_gate_dismissed', 'paywall_opened', 'paywall_trial_clicked', 'checkout_auto_started', 'checkout_stripe_redirected', 'checkout_error', 'subscription_started')
      GROUP BY event
      ORDER BY n DESC
    `,
  },
};

const res = await fetch(`https://eu.posthog.com/api/projects/${PROJECT}/query/`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(query),
});
const data = await res.json();
if (!res.ok) {
  console.log('PostHog error:', JSON.stringify(data).slice(0, 300));
  process.exit(1);
}
console.log('═════ PostHog funnel events (last 30d) ═════');
for (const row of data.results || []) {
  console.log(`  ${row[1].toString().padStart(5)}  ${row[0]}`);
}
