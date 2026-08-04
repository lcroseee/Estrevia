// Cross-check Resend dashboard vs sent_lead_emails.
import { config } from 'dotenv';
config({ path: '.env' });
import { Resend } from 'resend';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const resend = new Resend(process.env.RESEND_API_KEY);

// 1. Resend dashboard: list last 50 emails (covers today's window)
const list = await resend.emails.list?.({ limit: 100 }).catch((e) => ({ error: e.message }));
if (list?.error) {
  console.log('Resend list error (probably API perm):', list.error);
}
console.log('Resend.emails.list type/structure:', typeof list, Object.keys(list ?? {}));
if (list?.data?.data?.length) {
  console.log(`Resend returned ${list.data.data.length} emails`);
  console.table(list.data.data.slice(0, 25).map((e) => ({
    id: e.id?.slice(0, 12),
    to: Array.isArray(e.to) ? e.to[0]?.slice(0, 24) : String(e.to).slice(0, 24),
    subj: (e.subject ?? '').slice(0, 32),
    created: e.created_at?.slice(5, 16),
    status: e.last_event ?? '?',
  })));
}

// 2. Cross-check the 1 lead with msgid against Resend
const withMsg = await sql`
  SELECT lead_id, resend_message_id, sent_at FROM sent_lead_emails
  WHERE email_type='lead_chart' AND resend_message_id IS NOT NULL
`;
console.log('\nThe 1 lead with msgid:');
console.table(withMsg);

// 3. The 32 without msgid — emails so we can manually verify in Resend dashboard
const without = await sql`
  SELECT s.lead_id, s.sent_at, l.email, l.locale
  FROM sent_lead_emails s
  JOIN email_leads l ON l.id = s.lead_id
  WHERE s.email_type='lead_chart' AND s.resend_message_id IS NULL
  ORDER BY s.sent_at DESC
  LIMIT 10
`;
console.log('\n10 most-recent leads WITHOUT msgid (suspect):');
console.table(without.map((r) => ({
  lead: r.lead_id?.slice(0, 10),
  email: r.email?.slice(0, 28),
  loc: r.locale,
  sent: new Date(r.sent_at).toISOString().slice(5, 16),
})));

// 4. Try fetching a specific Resend email by id if we have one
if (withMsg[0]?.resend_message_id) {
  const detail = await resend.emails.get(withMsg[0].resend_message_id).catch((e) => ({ error: e.message }));
  console.log('\nResend detail for the 1 known msgid:');
  console.log(detail.error ?? JSON.stringify(detail.data ?? detail, null, 2).slice(0, 800));
}

// 5. Existing users table — what's the schema?
const userCols = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('subscriptions','users','user_subscriptions','stripe_subscriptions')
`;
console.log('\nSub-related tables:', userCols);
