// Verify all migrations 0007-0011 are deployed (founder owed list).
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

// Drizzle stores deployed migration hashes
const applied = await sql`
  SELECT hash, created_at
  FROM drizzle.__drizzle_migrations
  ORDER BY created_at DESC
  LIMIT 15
`;
console.log('Drizzle applied migrations (DESC):');
console.table(applied.map((m) => ({ hash: m.hash?.slice(0, 16), at: m.created_at })));

// Tables that should exist per recent shipments
const requiredTables = ['email_leads', 'sent_lead_emails', 'sent_emails', 'chart_readings', 'natal_charts', 'users', 'lead_subscribers', 'temp_charts'];
for (const t of requiredTables) {
  const r = await sql`
    SELECT COUNT(*)::int AS n
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${t}
  `;
  console.log(`  ${t.padEnd(22)} ${r[0]?.n > 0 ? 'EXISTS' : 'MISSING'}`);
}

// Conversion table — see if chart_readings has data
try {
  const cr = await sql`SELECT COUNT(*)::int AS n FROM chart_readings`;
  console.log(`\nchart_readings rows: ${cr[0]?.n}`);
} catch (e) {
  console.log(`\nchart_readings query failed: ${e.message?.slice(0, 60)}`);
}

// User → lead → conversion check
const conv30 = await sql`
  WITH lead_users AS (
    SELECT email FROM email_leads
    WHERE created_at >= NOW() - INTERVAL '30 days'
  )
  SELECT
    (SELECT COUNT(*)::int FROM users u WHERE EXISTS (SELECT 1 FROM lead_users l WHERE l.email = u.email)) AS users_from_leads,
    (SELECT COUNT(*)::int FROM email_leads WHERE created_at >= NOW() - INTERVAL '30 days') AS leads_30d,
    (SELECT COUNT(*)::int FROM users WHERE created_at >= NOW() - INTERVAL '30 days') AS users_30d
`;
console.log('\nLead→User conversion 30d:');
console.table(conv30);
