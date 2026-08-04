import { config } from 'dotenv';
config({ path: '/Users/kirillkovalenko/Documents/Projects/Estrevia/.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const [u] = await sql`SELECT id FROM users WHERE id LIKE 'user_3FDqWz50ZvS4mg1%'`;
console.log('full TRIALER id:', u.id);

const links = await sql`
  SELECT id, locale, utm_source, created_at, converted_at, converted_to_user_id
  FROM email_leads WHERE converted_to_user_id = ${u.id}
`;
console.log('leads linked to TRIALER:', JSON.stringify(links, null, 2));

const se = await sql`
  SELECT email_type, sent_at, resend_message_id IS NOT NULL AS has_msgid
  FROM sent_emails WHERE user_id = ${u.id} ORDER BY sent_at
`;
console.log('sent_emails for TRIALER:', JSON.stringify(se, null, 2));
