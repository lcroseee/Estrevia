import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const recent = await sql`
  SELECT
    LEFT(email, 28) AS email,
    locale,
    source,
    COALESCE(utm_source, '-') AS utm_s,
    COALESCE(utm_campaign, '-') AS utm_c,
    COALESCE(utm_content, '-') AS utm_x,
    converted_to_user_id IS NOT NULL AS conv,
    TO_CHAR(created_at, 'MM-DD HH24:MI') AS ts
  FROM email_leads
  ORDER BY created_at DESC
  LIMIT 25
`;
console.log('Last 25 leads:');
console.table(recent);

try {
  const sent = await sql`SELECT COUNT(*)::int AS n FROM sent_lead_emails`;
  console.log('sent_lead_emails table EXISTS, rows:', sent[0]?.n);
  const byKind = await sql`
    SELECT kind, COUNT(*)::int AS n
    FROM sent_lead_emails
    GROUP BY kind ORDER BY kind
  `;
  console.table(byKind);
} catch (e) {
  console.log('sent_lead_emails table MISSING (migration 0011 not deployed):', e.message?.slice(0, 80));
}

const utmDist = await sql`
  SELECT
    COALESCE(utm_source, '-') AS utm_s,
    COALESCE(utm_campaign, '-') AS utm_c,
    COALESCE(utm_term, '-') AS utm_t,
    COUNT(*)::int AS n
  FROM email_leads
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY utm_s, utm_c, utm_t
  ORDER BY n DESC
  LIMIT 20
`;
console.log('\nUTM distribution last 7d:');
console.table(utmDist);

const bouncedActive = await sql`
  SELECT
    COUNT(*) FILTER (WHERE bounced_at IS NULL)::int AS active,
    COUNT(*) FILTER (WHERE bounced_at IS NOT NULL)::int AS bounced,
    COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS unsub
  FROM email_leads
  WHERE created_at >= NOW() - INTERVAL '30 days'
`;
console.log('\nLead health 30d:');
console.table(bouncedActive);
