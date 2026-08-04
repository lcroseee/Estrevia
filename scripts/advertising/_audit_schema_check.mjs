import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const leadCols = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'email_leads'
  ORDER BY ordinal_position
`;
console.log('email_leads FULL schema:');
console.table(leadCols);

const sentSample = await sql`
  SELECT email_type, COUNT(*)::int AS n, MIN(sent_at) AS first_sent, MAX(sent_at) AS last_sent
  FROM sent_lead_emails
  GROUP BY email_type
  ORDER BY n DESC
`;
console.log('\nsent_lead_emails by type:');
console.table(sentSample);

const nurtureState = await sql`
  SELECT nurture_step, COUNT(*)::int AS n
  FROM email_leads
  GROUP BY nurture_step
  ORDER BY nurture_step
`;
console.log('\nemail_leads.nurture_step distribution:');
console.table(nurtureState);

const dueNext = await sql`
  SELECT
    COUNT(*) FILTER (WHERE nurture_next_at IS NOT NULL AND nurture_next_at <= NOW())::int AS due_now,
    COUNT(*) FILTER (WHERE nurture_next_at IS NOT NULL AND nurture_next_at > NOW())::int AS scheduled,
    COUNT(*) FILTER (WHERE nurture_next_at IS NULL)::int AS none,
    COUNT(*) FILTER (WHERE email_undeliverable = true)::int AS bounced
  FROM email_leads
`;
console.log('\nNurture queue:');
console.table(dueNext);
