import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

console.log('═════ sent_emails ═════');
const seCols = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'sent_emails'
  ORDER BY ordinal_position
`;
console.log('Schema:');
console.table(seCols);

const seRange = await sql`
  SELECT
    MIN(sent_at) AS first,
    MAX(sent_at) AS last,
    COUNT(*)::int AS total
  FROM sent_emails
`;
console.log('Range:');
console.table(seRange);

const seByType = await sql`
  SELECT
    email_type,
    COUNT(*)::int AS n,
    TO_CHAR(MIN(sent_at), 'YYYY-MM-DD HH24:MI') AS first_sent,
    TO_CHAR(MAX(sent_at), 'YYYY-MM-DD HH24:MI') AS last_sent
  FROM sent_emails
  GROUP BY email_type
  ORDER BY n DESC
`;
console.log('By type:');
console.table(seByType);

// Any other place where email could be captured pre-Resend?
console.log('\n═════ Any table with an email column ═════');
const allEmailCols = await sql`
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name IN ('email', 'user_email', 'subscriber_email', 'contact_email')
  ORDER BY table_name
`;
console.table(allEmailCols);

// Check the users table for early signups (these had email captured via Clerk)
console.log('\n═════ users table — Clerk signups ═════');
const usersByDay = await sql`
  SELECT
    TO_CHAR(created_at, 'YYYY-MM-DD') AS day,
    COUNT(*)::int AS n
  FROM users
  GROUP BY day
  ORDER BY day
`;
console.table(usersByDay);
