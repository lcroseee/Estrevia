// Check what chart data is available for the 32 stuck T+0 leads.
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name LIKE '%chart%'
  ORDER BY table_name
`;
console.log('Chart-related tables:', tables.map((t) => t.table_name));

const leadCols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'email_leads' AND column_name LIKE '%chart%'
`;
console.log('email_leads chart-related cols:', leadCols.map((c) => c.column_name));

const stuck = await sql`
  SELECT
    LEFT(l.id,12) AS lead_id,
    LEFT(l.email,28) AS email,
    l.locale,
    l.chart_id IS NOT NULL AS has_chart_id,
    LEFT(COALESCE(l.chart_id,'–'),12) AS chart_id,
    TO_CHAR(l.created_at,'MM-DD HH24:MI') AS created
  FROM email_leads l
  JOIN sent_lead_emails s ON s.lead_id = l.id AND s.email_type='lead_chart'
  WHERE s.resend_message_id IS NULL
    AND l.unsubscribed_at IS NULL
    AND l.email_undeliverable = false
  ORDER BY l.created_at DESC
`;
console.log(`\n${stuck.length} stuck leads (no resend_message_id):`);
console.table(stuck);

// For those with chart_id, check if natal_charts has them
const withChart = stuck.filter((s) => s.has_chart_id);
if (withChart.length > 0) {
  const ids = withChart.map((s) => `'${s.chart_id.replace(/'/g, '')}%'`).slice(0, 5);
  const charts = await sql`
    SELECT id, LEFT(id,12) AS short_id, sun_sign, moon_sign, asc_sign
    FROM natal_charts
    WHERE id LIKE ANY(ARRAY[${sql.unsafe(ids.join(','))}]::text[])
    LIMIT 10
  `.catch((e) => `query failed: ${e.message?.slice(0, 80)}`);
  console.log('\nSample natal_charts rows:');
  console.log(charts);
}

// Bigger picture — schema of natal_charts to know how to fetch
const ncCols = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name='natal_charts' ORDER BY ordinal_position
`;
console.log('\nnatal_charts cols:');
console.table(ncCols);
