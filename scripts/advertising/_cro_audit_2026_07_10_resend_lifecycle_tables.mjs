// CRO audit 2026-07-10 — Resend sector part 3. READ-ONLY.
// Audit the two send-log tables not covered by the 05-29 audit: sent_emails,
// sent_trial_emails (+ dunning engagement). Join to Resend last_event.
import { config } from 'dotenv';
config({ path: '.env' });
import { Resend } from 'resend';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const resend = new Resend(process.env.RESEND_API_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Columns of the two tables
for (const t of ['sent_emails', 'sent_trial_emails']) {
  const cols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = ${t} ORDER BY ordinal_position`;
  console.log(`\n=== ${t} columns ===`);
  console.log(cols.map((c) => `${c.column_name}(${c.data_type})`).join(', '));
}

// Pull Resend map again (needed for last_event join)
const byId = new Map();
let after;
for (let i = 0; i < 20; i++) {
  const opts = { limit: 100 };
  if (after) opts.after = after;
  const list = await resend.emails.list(opts).catch(() => null);
  const rows = list?.data?.data ?? [];
  if (rows.length === 0) break;
  for (const r of rows) byId.set(r.id, r.last_event);
  after = rows[rows.length - 1].id;
  if (rows[rows.length - 1].created_at < '2026-05-21') break;
  if (rows.length < 100) break;
  await sleep(600);
}
console.log(`\nResend map: ${byId.size} records`);

const ev = (id) => (id ? byId.get(id) ?? 'UNMATCHED' : 'NO_MSGID');

// sent_trial_emails rows
const trial = await sql`SELECT * FROM sent_trial_emails ORDER BY sent_at`;
console.log(`\n=== sent_trial_emails: ${trial.length} rows ===`);
for (const r of trial) {
  const email = r.recipient ?? r.email ?? '(via user_id ' + (r.user_id ?? '?') + ')';
  console.log(`  ${(r.sent_at?.toISOString?.() ?? String(r.sent_at)).slice(0, 16)} step=${r.reminder_step ?? r.email_type ?? '?'} user=${r.user_id ?? ''} msg=${r.resend_message_id?.slice(0, 12) ?? 'NULL'} last_event=${ev(r.resend_message_id)}`);
}
// join to users for recipient email
try {
  const trialJoin = await sql`
    SELECT t.sent_at, t.resend_message_id, u.email
    FROM sent_trial_emails t JOIN users u ON u.id = t.user_id ORDER BY t.sent_at`;
  console.log('  recipients:');
  for (const r of trialJoin)
    console.log(`    ${(r.sent_at?.toISOString?.() ?? '').slice(0, 16)} -> ${r.email.slice(0, 60)} | ${ev(r.resend_message_id)}`);
} catch (e) {
  console.log('  join failed:', e.message);
}

// sent_emails rows (winback?)
const sentEmails = await sql`SELECT * FROM sent_emails ORDER BY sent_at DESC LIMIT 60`;
console.log(`\n=== sent_emails (latest 60) ===`);
const seCount = await sql`SELECT count(*)::int AS n, min(sent_at) AS first, max(sent_at) AS last FROM sent_emails`;
console.log(`total=${seCount[0].n} (${seCount[0].first} .. ${seCount[0].last})`);
const typeCounts = await sql`
  SELECT email_type, count(*)::int AS n FROM sent_emails GROUP BY email_type ORDER BY n DESC`.catch(() => null);
if (typeCounts) console.table(typeCounts);
for (const r of sentEmails.slice(0, 40)) {
  const keys = Object.keys(r);
  console.log(`  ${JSON.stringify(Object.fromEntries(keys.map((k) => [k, r[k] instanceof Date ? r[k].toISOString().slice(0, 16) : (typeof r[k] === 'string' && r[k].length > 44 ? r[k].slice(0, 44) : r[k])])))} | last_event=${ev(r.resend_message_id)}`);
}

// dunning engagement (non-placeholder recipients)
const dun = await sql`
  SELECT d.dunning_step, d.sent_at, d.resend_message_id, u.email
  FROM sent_dunning_emails d JOIN users u ON u.id = d.user_id
  WHERE d.sent_at > '2026-05-29'::timestamptz ORDER BY d.sent_at`;
console.log(`\n=== dunning since 05-29: ${dun.length} ===`);
for (const r of dun)
  console.log(`  ${(r.sent_at?.toISOString?.() ?? '').slice(0, 16)} ${r.dunning_step} -> ${r.email.slice(0, 46)} | ${ev(r.resend_message_id)}`);

console.log('\nREAD-ONLY complete.');
