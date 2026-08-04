// Adversarial: did the 2 failing cs_live_ sessions EVER provision? Read-only Stripe + DB.
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sql = neon(process.env.DATABASE_URL);

const SESSIONS = [
  'cs_live_b1wV9mOvGN5G13srjruYg1c8DU1jRqEEF2vJyg0nNLiM1yWs0B2Plch0Eb',
  'cs_live_b1dnWAbHt0J4AIpo5oAd4QOdR4VMidRuxzM8on28Kw95bqgpVSip4pbcAW',
];

for (const id of SESSIONS) {
  try {
    const s = await stripe.checkout.sessions.retrieve(id, { expand: ['subscription'] });
    console.log(`\n=== ${id} ===`);
    console.log('  payment_status:', s.payment_status, '| status:', s.status, '| mode:', s.mode);
    console.log('  customer:', typeof s.customer === 'string' ? s.customer : s.customer?.id);
    console.log('  customer_email:', s.customer_details?.email);
    console.log('  client_reference_id:', s.client_reference_id);
    console.log('  metadata keys:', Object.keys(s.metadata ?? {}));
    console.log('  metadata.clerkUserId:', s.metadata?.clerkUserId ?? '(none)');
    console.log('  metadata.signInTicket present:', !!s.metadata?.signInTicket);
    console.log('  metadata.anonymous_id:', s.metadata?.anonymous_id ?? '(none)');
    const sub = s.subscription;
    if (sub && typeof sub === 'object') {
      console.log('  subscription:', sub.id, '| status:', sub.status,
        '| cancel_at_period_end:', sub.cancel_at_period_end,
        '| canceled_at:', sub.canceled_at, '| ended_at:', sub.ended_at);
    } else {
      console.log('  subscription:', sub);
    }
    // Was a clerk user provisioned for this email?
    const email = s.customer_details?.email;
    if (email) {
      const rows = await sql`SELECT id, email, subscription_tier, subscription_status, stripe_customer_id, stripe_subscription_id, created_at, updated_at FROM users WHERE email = ${email} OR stripe_customer_id = ${typeof s.customer === 'string' ? s.customer : s.customer?.id}`;
      console.log('  DB users matching email/customer:', rows.length);
      for (const r of rows) console.log('   ', JSON.stringify(r));
    }
    // processed_stripe_events markers
    const markers = await sql`SELECT event_id, event_type, processed_at FROM processed_stripe_events WHERE event_id LIKE ${'recovery:' + id} OR event_id LIKE ${'%' + id + '%'}`;
    console.log('  recovery markers:', markers.length, JSON.stringify(markers));
  } catch (e) {
    console.log(`\n=== ${id} === ERROR:`, e.message);
  }
}

// How many webhook-delivery attempts did Stripe make? (events listing)
console.log('\n=== checkout.session.completed events (last 30d) ===');
const events = await stripe.events.list({ types: ['checkout.session.completed'], limit: 100, created: { gte: Math.floor(Date.now()/1000) - 30*86400 } });
for (const ev of events.data) {
  const s = ev.data.object;
  console.log(' ', new Date(ev.created*1000).toISOString(), ev.id,
    'session=', s.id?.slice(0,24), 'mode=', s.mode, 'webhooks_pending=', ev.pending_webhooks,
    'clerkUserId=', s.metadata?.clerkUserId ?? 'NONE');
}
