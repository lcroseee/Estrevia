import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

// 1) Earliest lead + total
const range = await sql`
  SELECT
    MIN(created_at) AS first_lead,
    MAX(created_at) AS last_lead,
    COUNT(*)::int AS total
  FROM email_leads
`;
console.log('email_leads range:');
console.table(range);

// 2) Full per-day breakdown
const byDay = await sql`
  SELECT
    TO_CHAR(created_at, 'YYYY-MM-DD') AS day,
    COUNT(*)::int AS leads,
    COUNT(*) FILTER (WHERE utm_source = 'meta')::int AS from_meta,
    COUNT(*) FILTER (WHERE utm_source = 'chatgpt.com')::int AS from_chatgpt,
    COUNT(*) FILTER (WHERE utm_source IS NULL)::int AS no_utm,
    STRING_AGG(DISTINCT locale, ',' ORDER BY locale) AS locales
  FROM email_leads
  GROUP BY day
  ORDER BY day
`;
console.log('\nLeads per day, full history:');
console.table(byDay);

// 3) Leads created BEFORE Resend started sending (18:26 UTC today)
const cutoff = new Date('2026-05-17T18:26:00.000Z');
const beforeAfter = await sql`
  SELECT
    COUNT(*) FILTER (WHERE created_at < ${cutoff.toISOString()})::int AS before_resend,
    COUNT(*) FILTER (WHERE created_at >= ${cutoff.toISOString()})::int AS after_resend
  FROM email_leads
`;
console.log('\nBefore vs after Resend wired (cutoff 2026-05-17 18:26 UTC):');
console.table(beforeAfter);

// 4) For the before-Resend cohort: did they get the chart email today (backfill)?
const backfill = await sql`
  SELECT
    el.id,
    LEFT(el.email, 24) AS email,
    TO_CHAR(el.created_at, 'MM-DD HH24:MI') AS lead_created,
    TO_CHAR(sle.sent_at, 'MM-DD HH24:MI') AS email_sent,
    sle.email_type,
    ROUND(EXTRACT(EPOCH FROM (sle.sent_at - el.created_at)) / 3600, 1) AS hours_delay
  FROM email_leads el
  LEFT JOIN sent_lead_emails sle ON sle.lead_id = el.id AND sle.email_type = 'lead_chart'
  WHERE el.created_at < ${cutoff.toISOString()}
  ORDER BY el.created_at
`;
console.log('\nPre-Resend leads + whether they received chart email after deploy:');
console.table(backfill);

// 5) Check if there's any OTHER email-capture table we might be missing
const tables = await sql`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name ILIKE '%email%' OR table_name ILIKE '%lead%' OR table_name ILIKE '%subscriber%' OR table_name ILIKE '%waitlist%')
  ORDER BY table_name
`;
console.log('\nAll email/lead-related tables in DB:');
console.table(tables);
