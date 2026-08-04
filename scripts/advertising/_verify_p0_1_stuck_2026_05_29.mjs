import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sql = neon(process.env.DATABASE_URL);
const events = await stripe.events.list({ types: ['checkout.session.completed'], limit: 100, created: { gte: Math.floor(Date.now()/1000)-30*86400 } });
console.log('session | clerkUserId? | client_ref? | customer | provisioned');
for (const ev of events.data) {
  const s = ev.data.object;
  if (s.mode !== 'subscription') continue;
  const cust = typeof s.customer === 'string' ? s.customer : s.customer?.id;
  const rows = cust ? await sql`SELECT subscription_tier, subscription_status FROM users WHERE stripe_customer_id = ${cust} LIMIT 1` : [];
  const prov = rows.length ? `${rows[0].subscription_tier}/${rows[0].subscription_status}` : 'NO ROW';
  console.log(`${s.id.slice(0,22)} | ${s.metadata?.clerkUserId?'Y':'-'} | ${s.client_reference_id?'Y':'-'} | ${cust} | ${prov}`);
}
