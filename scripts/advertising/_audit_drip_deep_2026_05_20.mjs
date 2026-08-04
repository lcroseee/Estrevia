// Deep drip-state audit — 2026-05-20.
// Targets the two findings from the surface audit:
//   1. `lead_curiosity_hook` shows 0 rows in sent_lead_emails (but 168 leads
//      progressed past step=2 — should there be writes?).
//   2. 155 leads stuck on step=3; T+72h lead_paywall_teaser invisible.
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

console.log('═════ 1. enum email_type values (live DB) ═════');
const enumVals = await sql`
  SELECT t.typname, e.enumlabel, e.enumsortorder
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typname IN ('email_type', 'lead_email_type', 'sent_lead_emails_email_type', 'email_type_lead')
  ORDER BY t.typname, e.enumsortorder
`;
console.table(enumVals);

console.log('\n═════ 1b. column type — is email_type a CHECK or ENUM? ═════');
const colType = await sql`
  SELECT column_name, data_type, udt_name
  FROM information_schema.columns
  WHERE table_name = 'sent_lead_emails' AND column_name = 'email_type'
`;
console.table(colType);

console.log('\n═════ 1c. all distinct values ever seen in sent_lead_emails ═════');
const allTypes = await sql`
  SELECT email_type, COUNT(*)::int AS n,
    MIN(sent_at) AS first_sent, MAX(sent_at) AS last_sent
  FROM sent_lead_emails
  GROUP BY email_type
  ORDER BY n DESC
`;
console.table(allTypes);

console.log('\n═════ 2. step × nurture_next_at status ═════');
const stepNextAt = await sql`
  SELECT
    nurture_step,
    COUNT(*)::int AS leads,
    COUNT(*) FILTER (WHERE nurture_next_at IS NULL)::int AS nextat_null,
    COUNT(*) FILTER (WHERE nurture_next_at < NOW())::int AS overdue,
    COUNT(*) FILTER (WHERE nurture_next_at >= NOW())::int AS future,
    MIN(nurture_next_at) AS earliest_next,
    MAX(nurture_next_at) AS latest_next
  FROM email_leads
  WHERE converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
  GROUP BY nurture_step
  ORDER BY nurture_step
`;
console.table(stepNextAt);

console.log('\n═════ 3. overdue leads — by step, age of overdue ═════');
const overdueDetail = await sql`
  SELECT
    nurture_step,
    COUNT(*)::int AS overdue_leads,
    MIN(EXTRACT(EPOCH FROM (NOW() - nurture_next_at))/3600)::int AS min_overdue_h,
    MAX(EXTRACT(EPOCH FROM (NOW() - nurture_next_at))/3600)::int AS max_overdue_h,
    AVG(EXTRACT(EPOCH FROM (NOW() - nurture_next_at))/3600)::int AS avg_overdue_h
  FROM email_leads
  WHERE nurture_next_at IS NOT NULL
    AND nurture_next_at < NOW()
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
  GROUP BY nurture_step
  ORDER BY nurture_step
`;
console.table(overdueDetail);

console.log('\n═════ 4. 20 most-overdue leads ═════');
const overdueList = await sql`
  SELECT
    LEFT(id, 10) AS lead_id,
    locale,
    nurture_step AS step,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created,
    TO_CHAR(nurture_next_at, 'YYYY-MM-DD HH24:MI') AS next_at,
    ROUND(EXTRACT(EPOCH FROM (NOW() - nurture_next_at))/3600)::int AS overdue_h,
    utm_campaign
  FROM email_leads
  WHERE nurture_next_at IS NOT NULL
    AND nurture_next_at < NOW()
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
  ORDER BY nurture_next_at ASC
  LIMIT 20
`;
console.table(overdueList);

console.log('\n═════ 5. Step transition matrix — what emails has each step bucket received? ═════');
const matrix = await sql`
  WITH step_leads AS (
    SELECT id, nurture_step FROM email_leads
  ),
  lead_emails AS (
    SELECT lead_id, email_type FROM sent_lead_emails
  )
  SELECT
    sl.nurture_step,
    le.email_type,
    COUNT(*)::int AS n
  FROM step_leads sl
  LEFT JOIN lead_emails le ON le.lead_id = sl.id
  GROUP BY sl.nurture_step, le.email_type
  ORDER BY sl.nurture_step, COALESCE(le.email_type, '')
`;
console.table(matrix);

console.log('\n═════ 6. Unsubscribe + undeliverable tally ═════');
const unsubTally = await sql`
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS unsubscribed,
    COUNT(*) FILTER (WHERE email_undeliverable = true)::int AS undeliverable,
    COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL OR email_undeliverable = true)::int AS suppressed_total
  FROM email_leads
`;
console.table(unsubTally);

console.log('\n═════ 7. Conversion-by-step (which step did converts land at?) ═════');
const convByStep = await sql`
  SELECT
    nurture_step,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int AS converted,
    COUNT(*)::int AS total
  FROM email_leads
  GROUP BY nurture_step
  ORDER BY nurture_step
`;
console.table(convByStep);

console.log('\n═════ 8. utm_content presence (post-attribution fix) ═════');
const utmContent = await sql`
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE utm_content IS NOT NULL)::int AS with_utm_content,
    COUNT(*) FILTER (WHERE utm_content IS NULL)::int AS without_utm_content,
    COUNT(DISTINCT utm_content)::int AS distinct_contents
  FROM email_leads
`;
console.table(utmContent);

console.log('\n═════ 9. Most-recent migration applied ═════');
const migrations = await sql`
  SELECT id, hash, created_at
  FROM drizzle.__drizzle_migrations
  ORDER BY id DESC
  LIMIT 10
`;
console.table(migrations);
