/**
 * RECONCILE #8 — canonical count of lifecycle emails to placeholder addresses.
 * STRICTLY READ-ONLY: SQL SELECT, Resend GET, Stripe GET only.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';

const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
const RESEND_KEY = process.env.RESEND_API_KEY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resendGet(id) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.resend.com/emails/${id}`, {
      headers: { Authorization: `Bearer ${RESEND_KEY}` },
    });
    if (res.status === 429) { await sleep(1200); continue; }
    if (!res.ok) return { error: `${res.status}` };
    return res.json();
  }
  return { error: 'rate_limited' };
}

// ── 1. list every sent_* table in prod ──────────────────────────────
const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name LIKE 'sent%'
  ORDER BY table_name`;
console.log('── sent_* tables in prod ──');
console.log(tables.map((t) => t.table_name).join('\n'));

// ── 2. placeholder users ────────────────────────────────────────────
const phUsers = await sql`
  SELECT id, email, created_at, subscription_status, subscription_tier
  FROM users WHERE email LIKE '%placeholder.invalid%' ORDER BY created_at`;
console.log('\n── users with placeholder emails ──');
console.table(phUsers);

// ── 3. enumerate every lifecycle row addressed to a placeholder user ─
// user_id-keyed tables (recipient = users.email at send time; never overwritten)
const trialRows = await sql`
  SELECT 'sent_trial_emails' AS tbl, t.step AS template, t.sent_at, u.email AS recipient,
         t.resend_message_id, t.subscription_id, t.user_id
  FROM sent_trial_emails t JOIN users u ON u.id = t.user_id
  WHERE u.email LIKE '%placeholder.invalid%' AND t.sent_at >= '2026-05-29'
  ORDER BY t.sent_at`;

const dunningRows = await sql`
  SELECT 'sent_dunning_emails' AS tbl, d.dunning_step AS template, d.sent_at, u.email AS recipient,
         d.resend_message_id, d.subscription_id, d.user_id, d.error
  FROM sent_dunning_emails d JOIN users u ON u.id = d.user_id
  WHERE u.email LIKE '%placeholder.invalid%' AND d.sent_at >= '2026-05-29'
  ORDER BY d.sent_at`;

const sentEmailsRows = await sql`
  SELECT 'sent_emails' AS tbl, s.email_type AS template, s.sent_at, u.email AS recipient,
         s.resend_message_id, s.user_id
  FROM sent_emails s JOIN users u ON u.id = s.user_id
  WHERE u.email LIKE '%placeholder.invalid%' AND s.sent_at >= '2026-05-29'
  ORDER BY s.sent_at`;

// lead-keyed tables — check no placeholder leads exist
const phLeadDrip = await sql`
  SELECT 'sent_lead_emails' AS tbl, sle.email_type AS template, sle.sent_at, el.email AS recipient,
         sle.resend_message_id
  FROM sent_lead_emails sle JOIN email_leads el ON el.id = sle.lead_id
  WHERE el.email LIKE '%placeholder.invalid%' AND sle.sent_at >= '2026-05-29'`;
const phCart = await sql`
  SELECT 'sent_cart_abandon_emails' AS tbl, 'cart_abandon' AS template, c.sent_at, el.email AS recipient,
         c.resend_message_id
  FROM sent_cart_abandon_emails c JOIN email_leads el ON el.id = c.lead_id
  WHERE el.email LIKE '%placeholder.invalid%' AND c.sent_at >= '2026-05-29'`;

let phBlast = [];
try {
  phBlast = await sql`
    SELECT 'sent_discount_blast_emails' AS tbl, coupon_code AS template, sent_at, recipient, resend_message_id
    FROM sent_discount_blast_emails WHERE recipient LIKE '%placeholder.invalid%'`;
} catch (e) {
  console.log(`\nsent_discount_blast_emails: ${e.message.slice(0, 80)} (table absent in prod?)`);
}

const all = [...trialRows, ...dunningRows, ...sentEmailsRows, ...phLeadDrip, ...phCart, ...phBlast]
  .sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));

console.log(`\n── ALL lifecycle rows to placeholder recipients since 2026-05-29: ${all.length} rows ──`);

// ── 4. join each to Resend by message id ────────────────────────────
for (const row of all) {
  if (row.resend_message_id) {
    const r = await resendGet(row.resend_message_id);
    row.last_event = r.error ? `ERR:${r.error}` : r.last_event;
    row.resend_to = r.to ? [].concat(r.to).join(',') : null;
    row.subject = r.subject ? r.subject.slice(0, 60) : null;
    await sleep(550);
  } else {
    row.last_event = '(no msg id — Resend never accepted)';
  }
}
for (const row of all) {
  console.log(
    [
      row.tbl,
      row.template,
      new Date(row.sent_at).toISOString().slice(0, 16),
      row.recipient,
      row.resend_message_id ? row.resend_message_id.slice(0, 12) : 'NULL',
      row.last_event,
      row.error ? `db_err=${row.error}` : '',
    ].join(' | '),
  );
}
const withId = all.filter((r) => r.resend_message_id);
const bounced = withId.filter((r) => r.last_event === 'bounced');
console.log(`\nTotals: ${all.length} rows dispatched; ${withId.length} Resend-accepted (msg id present); ` +
  `${bounced.length} last_event=bounced; ${all.length - withId.length} NULL msg id.`);
const byTbl = {};
for (const r of all) byTbl[`${r.tbl}/${r.template}`] = (byTbl[`${r.tbl}/${r.template}`] || 0) + 1;
console.table(byTbl);

// ── 5. blast radius: who are the 2 anon payers + lainiekayg reachability ──
console.log('\n── anon payer identities (Stripe GET) ──');
for (const u of phUsers) {
  const custs = await sql`
    SELECT stripe_customer_id, stripe_subscription_id FROM users WHERE id = ${u.id}`;
  console.log(u.id, JSON.stringify(custs[0] ?? {}));
  const custId = custs[0]?.stripe_customer_id;
  if (custId) {
    try {
      const c = await stripe.customers.retrieve(custId);
      console.log(`  stripe customer ${custId}: email=${c.email} name=${c.name ?? ''}`);
      u.real_email = c.email;
    } catch (e) {
      console.log(`  stripe err: ${e.message}`);
    }
  }
}

// lainiekayg — find via real email pattern
const lainie = phUsers.find((u) => (u.real_email || '').toLowerCase().includes('lainie'));
console.log('\n── lainiekayg reachability check ──');
if (lainie) {
  console.log(`lainiekayg = user ${lainie.id}, real email ${lainie.real_email}`);
  const lead = await sql`
    SELECT id, email, created_at, converted_to_user_id, nurture_step, unsubscribed_at, email_undeliverable
    FROM email_leads WHERE lower(email) = lower(${lainie.real_email})`;
  console.table(lead);
  if (lead.length) {
    const dripSends = await sql`
      SELECT email_type, sent_at, resend_message_id
      FROM sent_lead_emails WHERE lead_id = ${lead[0].id} ORDER BY sent_at`;
    for (const s of dripSends) {
      if (s.resend_message_id) {
        const r = await resendGet(s.resend_message_id);
        s.last_event = r.error ? `ERR:${r.error}` : r.last_event;
        await sleep(550);
      }
    }
    console.log('drip emails to lainiekayg real address (email_leads path):');
    console.table(dripSends.map((s) => ({
      email_type: s.email_type,
      sent_at: new Date(s.sent_at).toISOString().slice(0, 16),
      last_event: s.last_event ?? '(NULL msg id)',
    })));
    const cart = await sql`
      SELECT sent_at, resend_message_id FROM sent_cart_abandon_emails WHERE lead_id = ${lead[0].id}`;
    for (const s of cart) {
      if (s.resend_message_id) {
        const r = await resendGet(s.resend_message_id);
        s.last_event = r.error ? `ERR:${r.error}` : r.last_event;
        await sleep(550);
      }
    }
    if (cart.length) { console.log('cart-abandon emails:'); console.table(cart.map((s) => ({ sent_at: new Date(s.sent_at).toISOString().slice(0, 16), last_event: s.last_event }))); }
  } else {
    console.log('No email_leads row for the real address — zero emails ever attempted to the real address.');
  }
} else {
  console.log('Could not identify lainiekayg among placeholder users; listing all real emails found above.');
}

// which lifecycle templates NEVER attempted (blast radius completeness)
console.log('\n── lifecycle templates sent per anon payer (what reached vs never attempted) ──');
for (const u of phUsers.filter((x) => x.id.startsWith('user_'))) {
  const trial = await sql`SELECT step, sent_at FROM sent_trial_emails WHERE user_id = ${u.id} ORDER BY sent_at`;
  const dun = await sql`SELECT dunning_step, sent_at FROM sent_dunning_emails WHERE user_id = ${u.id} ORDER BY sent_at`;
  const se = await sql`SELECT email_type, sent_at, resend_message_id FROM sent_emails WHERE user_id = ${u.id} ORDER BY sent_at`;
  console.log(`\n${u.id} (${u.real_email ?? 'unknown real email'}):`);
  console.log('  sent_emails:', se.map((r) => `${r.email_type}@${new Date(r.sent_at).toISOString().slice(0, 10)}${r.resend_message_id ? '' : ' [NULL id]'}`).join(', ') || 'none');
  console.log('  trial:', trial.map((r) => `${r.step}@${new Date(r.sent_at).toISOString().slice(0, 10)}`).join(', ') || 'none');
  console.log('  dunning:', dun.map((r) => `${r.dunning_step}@${new Date(r.sent_at).toISOString().slice(0, 10)}`).join(', ') || 'none');
}
