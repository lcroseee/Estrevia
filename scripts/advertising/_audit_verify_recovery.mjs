import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const r = await sql`
  SELECT
    COUNT(*) FILTER (WHERE resend_message_id IS NOT NULL)::int AS with_msgid,
    COUNT(*) FILTER (WHERE resend_message_id IS NULL)::int AS without_msgid,
    COUNT(*)::int AS total
  FROM sent_lead_emails
  WHERE email_type = 'lead_chart'
`;
console.log('Post-recovery sent_lead_emails[lead_chart]:');
console.table(r);
