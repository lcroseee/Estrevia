/**
 * CRO audit 2026-07-10 — DB sector follow-up #2. STRICTLY READ-ONLY.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const h = (t) => console.log(`\n\n═══════════ ${t} ═══════════`);

const PAYER = 'user_3En2Ff54f6ZIqpwNlPdpIK5ml0N';
const TRIALER = 'user_3FDqWz50ZvS4mg1VGORx7kQWaEG';

h('1. Did any email_lead link to the two anon-provisioned users?');
const links = await sql`
  SELECT id, email, locale, converted_to_user_id, converted_at
  FROM email_leads WHERE converted_to_user_id IN (${PAYER}, ${TRIALER})
`;
console.log(JSON.stringify(links.map((l) => ({ ...l, email: l.email.replace(/^(.{3}).*(@.*)$/, '$1***$2') })), null, 2));

h('2. All sent_emails rows for the two anon-provisioned users');
const se = await sql`
  SELECT user_id, email_type, sent_at, resend_message_id IS NOT NULL AS has_msgid
  FROM sent_emails WHERE user_id IN (${PAYER}, ${TRIALER}) ORDER BY sent_at
`;
console.table(se.map((r) => ({ user: r.user_id.slice(0, 14), type: r.email_type, sent: r.sent_at, msgid: r.has_msgid })));

h('3. re_engagement_28d recipients — any placeholder emails?');
const re = await sql`
  SELECT s.sent_at, u.email LIKE '%placeholder.invalid' AS placeholder, u.subscription_status
  FROM sent_emails s JOIN users u ON u.id = s.user_id
  WHERE s.email_type = 're_engagement_28d' ORDER BY s.sent_at
`;
console.table(re);

h('4. Product usage of the two anon-provisioned users');
const nc = await sql`
  SELECT user_id, COUNT(*)::int AS charts, MAX(created_at) AS last_chart
  FROM natal_charts WHERE user_id IN (${PAYER}, ${TRIALER}) GROUP BY user_id
`;
console.table(nc);

h('5. All users created since 2026-05-30 — provenance of the 7 new accounts');
const newUsers = await sql`
  SELECT id, email LIKE '%placeholder.invalid' AS placeholder, subscription_tier, subscription_status,
    plan, locale, created_at, last_seen_at,
    (SELECT COUNT(*)::int FROM natal_charts nc WHERE nc.user_id = u.id) AS charts
  FROM users u WHERE created_at >= '2026-05-30' ORDER BY created_at
`;
console.table(newUsers.map((r) => ({
  id: r.id.slice(0, 20), placeholder: r.placeholder, tier: r.subscription_tier,
  status: r.subscription_status, plan: r.plan, created: r.created_at, last_seen: r.last_seen_at, charts: r.charts,
})));

h('6. Divinelyguided billing timeline sanity (DB view)');
const [dg] = await sql`
  SELECT updated_at, current_period_end, subscription_status FROM users WHERE id = 'user_3EBHoi8zRm3qM2e5UiEhpfai3jT'
`;
console.log(JSON.stringify(dg));

console.log('\nDONE (read-only).');
