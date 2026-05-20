/**
 * Discovery: what Stripe events were delivered for cus_UXLi3mJUjr
 * (destinig7996@gmail.com), and which made it into processed_stripe_events?
 * Identifies the silent failure in the webhook for this customer.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';

const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

const CUSTOMER_ID = 'cus_UXLi3mJUjr';

console.log(`═════ Stripe events for ${CUSTOMER_ID} ═════`);
// Stripe events API doesn't filter by customer directly; we fetch broad list
// then filter client-side. Window: last 14 days for our timeline.
const events = await stripe.events.list({ limit: 100 });
const ours = events.data.filter((e) => {
  const obj = e.data.object;
  const cust = obj.customer ?? obj.id;
  return cust === CUSTOMER_ID || obj.metadata?.clerkUserId === 'user_3DsXX2DHB';
});

console.log(`Filtered to ${ours.length} events for this customer`);

const eventIds = ours.map((e) => e.id);
const processed = await sql`
  SELECT event_id, event_type, processed_at
  FROM processed_stripe_events
  WHERE event_id = ANY(${eventIds})
`;
const processedSet = new Set(processed.map((p) => p.event_id));

console.log('\n=== Timeline (asc) ===');
const table = ours
  .sort((a, b) => a.created - b.created)
  .map((e) => ({
    id: e.id.slice(0, 16),
    type: e.type,
    created: new Date(e.created * 1000).toISOString().slice(0, 19),
    processed: processedSet.has(e.id) ? '✓' : '–',
  }));
console.table(table);

console.log('\n=== Gaps ===');
const unprocessed = ours.filter((e) => !processedSet.has(e.id));
console.log(`${unprocessed.length} events NOT in processed_stripe_events table:`);
for (const e of unprocessed) {
  console.log(`  - ${e.id} (${e.type}) @ ${new Date(e.created * 1000).toISOString()}`);
}
