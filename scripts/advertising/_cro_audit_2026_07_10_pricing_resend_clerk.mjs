// READ-ONLY CRO audit probe — pricing/checkout sector — 2026-07-10
// (1) Resend GET /emails/{id} for trial+dunning emails since 5/29 — where did they go, last_event?
// (2) Clerk GET users — do the June anon payers have real emails + did they sign in?
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const RESEND = process.env.RESEND_API_KEY;
const CLERK = process.env.CLERK_SECRET_KEY;
const mask = (e) => (e ? String(e).replace(/^(..)[^@]*(@.*)$/, '$1***$2') : null);

console.log('=== Trial emails since 2026-05-29 — actual recipient + last_event (Resend) ===');
const rows = await sql`
  SELECT step, subscription_id, sent_at, resend_message_id
  FROM sent_trial_emails WHERE sent_at >= '2026-05-29' ORDER BY sent_at`;
for (const r of rows) {
  try {
    const res = await fetch(`https://api.resend.com/emails/${r.resend_message_id}`, {
      headers: { Authorization: `Bearer ${RESEND}` },
    });
    const j = await res.json();
    const to = Array.isArray(j.to) ? j.to.join(',') : j.to;
    const isPlaceholder = String(to).includes('placeholder.invalid');
    console.log(`  ${String(r.sent_at).slice(0, 10)} ${r.step} sub=${r.subscription_id.slice(0, 14)} → to=${isPlaceholder ? to : mask(to)} | last_event=${j.last_event}`);
  } catch (e) {
    console.log(`  ${r.step} ${r.resend_message_id}: ERR ${e.message}`);
  }
}

console.log('\n=== Dunning emails since 2026-05-29 (schema discovery first) ===');
try {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'sent_dunning_emails' ORDER BY ordinal_position`;
  console.log('  columns:', cols.map((c) => c.column_name).join(', '));
  const d = await sql`SELECT * FROM sent_dunning_emails ORDER BY 1 DESC LIMIT 10`;
  for (const row of d) {
    const copy = { ...row };
    for (const k of Object.keys(copy)) if (String(copy[k]).includes('@') && !String(copy[k]).includes('placeholder.invalid')) copy[k] = mask(copy[k]);
    console.log('  ', JSON.stringify(copy));
  }
} catch (e) { console.log('  ERR', e.message); }

console.log('\n=== Clerk state of the two June anon payers ===');
const ids = await sql`
  SELECT id FROM users
  WHERE email LIKE 'stripe-pending-%@placeholder.invalid' AND id LIKE 'user_%'`;
for (const { id } of ids) {
  const res = await fetch(`https://api.clerk.com/v1/users/${id}`, {
    headers: { Authorization: `Bearer ${CLERK}` },
  });
  if (!res.ok) { console.log(`  ${id.slice(0, 14)}…: HTTP ${res.status}`); continue; }
  const u = await res.json();
  console.log(
    `  ${id.slice(0, 14)}… | clerk_email=${mask(u.email_addresses?.[0]?.email_address)} | ` +
    `last_sign_in=${u.last_sign_in_at ? new Date(u.last_sign_in_at).toISOString().slice(0, 16) : 'NEVER'} | ` +
    `last_active=${u.last_active_at ? new Date(u.last_active_at).toISOString().slice(0, 10) : '-'} | ` +
    `created=${new Date(u.created_at).toISOString().slice(0, 10)}`,
  );
}
