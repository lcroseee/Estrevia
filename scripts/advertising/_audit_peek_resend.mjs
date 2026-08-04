import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const TRACK_START = '2026-05-21 20:25:00 UTC';
const cutoff = await sql`SELECT TIMESTAMP WITH TIME ZONE '2026-05-21 20:25:00+00' AS t`;
console.log('cutoff:', cutoff[0].t.toISOString());
const now = new Date();
console.log('now:', now.toISOString());

// Top-line: count of sends since tracking enabled
const sinceCutoff = await sql`
  SELECT email_type, COUNT(*)::int AS n, COUNT(resend_message_id)::int AS msgids
  FROM sent_lead_emails
  WHERE sent_at > '2026-05-21 20:25:00+00'::timestamptz
  GROUP BY email_type
  ORDER BY n DESC
`;
console.log('\n=== sends since 2026-05-21 20:25 UTC (engagement-eligible) ===');
console.table(sinceCutoff);

// Same for last 14d (for context)
const last14d = await sql`
  SELECT email_type, COUNT(*)::int AS n
  FROM sent_lead_emails
  WHERE sent_at > NOW() - INTERVAL '14 days'
  GROUP BY email_type
  ORDER BY n DESC
`;
console.log('\n=== sends last 14d (all) ===');
console.table(last14d);

const last48h = await sql`
  SELECT email_type, COUNT(*)::int AS n
  FROM sent_lead_emails
  WHERE sent_at > NOW() - INTERVAL '48 hours'
  GROUP BY email_type
  ORDER BY n DESC
`;
console.log('\n=== sends last 48h ===');
console.table(last48h);

// Min/max sent_at since cutoff
const range = await sql`
  SELECT MIN(sent_at) AS mn, MAX(sent_at) AS mx, COUNT(*)::int AS n
  FROM sent_lead_emails
  WHERE sent_at > '2026-05-21 20:25:00+00'::timestamptz
`;
console.log('\n=== range since cutoff ===');
console.log(range[0]);
