// Temp diagnostic — find what's keeping leads stuck at step=0 after T+0 send.
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

// 1. resend_message_id populated?
const sentByMsgId = await sql`
  SELECT
    COUNT(*) FILTER (WHERE resend_message_id IS NOT NULL)::int AS with_msgid,
    COUNT(*) FILTER (WHERE resend_message_id IS NULL)::int AS without_msgid,
    COUNT(*)::int AS total
  FROM sent_lead_emails
  WHERE email_type = 'lead_chart'
`;
console.log('sent_lead_emails[lead_chart] msgid presence:');
console.table(sentByMsgId);

// 2. Cross-tab: nurture_step vs sent_lead_emails presence
const cross = await sql`
  SELECT
    l.nurture_step,
    COUNT(*)::int AS leads,
    COUNT(*) FILTER (WHERE s.lead_id IS NOT NULL)::int AS had_t0_email,
    COUNT(*) FILTER (WHERE s.resend_message_id IS NOT NULL)::int AS had_msgid,
    COUNT(*) FILTER (WHERE l.nurture_next_at IS NULL)::int AS nextat_null,
    COUNT(*) FILTER (WHERE l.created_at >= NOW() - INTERVAL '24 hours')::int AS recent_24h
  FROM email_leads l
  LEFT JOIN sent_lead_emails s ON s.lead_id = l.id AND s.email_type = 'lead_chart'
  GROUP BY l.nurture_step
  ORDER BY l.nurture_step
`;
console.log('\nCross-tab nurture_step × T+0 sent:');
console.table(cross);

// 3. Stuck details
const stuck = await sql`
  SELECT
    LEFT(l.id, 10) AS lead_id,
    LEFT(l.email, 24) AS email,
    l.nurture_step AS step,
    s.resend_message_id IS NOT NULL AS has_msgid,
    TO_CHAR(l.created_at, 'MM-DD HH24:MI') AS created,
    TO_CHAR(s.sent_at, 'MM-DD HH24:MI') AS sent,
    EXTRACT(EPOCH FROM (NOW() - l.created_at))/60 AS age_min
  FROM email_leads l
  LEFT JOIN sent_lead_emails s ON s.lead_id = l.id AND s.email_type = 'lead_chart'
  WHERE l.nurture_step = 0 AND l.nurture_next_at IS NULL
  ORDER BY l.created_at DESC
  LIMIT 14
`;
console.log('\n14 stuck (step=0, nextAt=NULL):');
console.table(stuck);

// 4. Funnel last 30d
const funnel = await sql`
  SELECT 'email_leads_30d' AS t, COUNT(*)::int AS n FROM email_leads WHERE created_at >= NOW() - INTERVAL '30 days'
  UNION ALL
  SELECT 'email_leads_today', COUNT(*)::int FROM email_leads WHERE created_at >= NOW() - INTERVAL '1 day'
  UNION ALL
  SELECT 'users_30d', COUNT(*)::int FROM users WHERE created_at >= NOW() - INTERVAL '30 days'
  UNION ALL
  SELECT 'leads_converted_30d', COUNT(*)::int FROM email_leads WHERE converted_to_user_id IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days'
  UNION ALL
  SELECT 'pro_subs_active_total', COUNT(*)::int FROM subscriptions WHERE status = 'active'
`;
console.log('\n30d funnel:');
console.table(funnel);

// 5. Daily breakdown
const dayBreakdown = await sql`
  SELECT
    TO_CHAR(DATE(created_at), 'MM-DD') AS d,
    COUNT(*)::int AS leads,
    COUNT(*) FILTER (WHERE utm_source = 'meta')::int AS meta,
    COUNT(*) FILTER (WHERE utm_source IS NULL OR utm_source = '')::int AS organic,
    COUNT(*) FILTER (WHERE locale='es')::int AS es,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int AS conv
  FROM email_leads
  WHERE created_at >= NOW() - INTERVAL '14 days'
  GROUP BY DATE(created_at)
  ORDER BY DATE(created_at) DESC
`;
console.log('\n14d daily breakdown:');
console.table(dayBreakdown);
