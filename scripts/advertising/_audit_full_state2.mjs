import { Pool } from '@neondatabase/serverless';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  // List ALL public tables for inventory
  const all = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  console.log('All public tables (' + all.length + '):');
  for (const r of all) console.log('  ', r.tablename);

  // advertising_decisions actual schema
  console.log('\nadvertising_decisions columns:');
  const cols = (await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='advertising_decisions' ORDER BY ordinal_position")).rows;
  for (const r of cols) console.log(`  ${r.column_name}: ${r.data_type}`);

  // sent_lead_emails columns
  console.log('\nsent_lead_emails columns:');
  const cols2 = (await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='sent_lead_emails' ORDER BY ordinal_position")).rows;
  for (const r of cols2) console.log(`  ${r.column_name}: ${r.data_type}`);

  // email_leads columns
  console.log('\nemail_leads columns:');
  const cols3 = (await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='email_leads' ORDER BY ordinal_position")).rows;
  for (const r of cols3) console.log(`  ${r.column_name}: ${r.data_type}`);

  // Sample latest leads
  console.log('\nLatest 3 email_leads:');
  const recent = (await pool.query("SELECT id, email_undeliverable, converted_to_user_id, unsubscribed_at, nurture_step, nurture_next_at, created_at FROM email_leads ORDER BY created_at DESC LIMIT 3")).rows;
  for (const r of recent) console.log('  ', JSON.stringify(r));

  // Latest sent_lead_emails
  console.log('\nLatest 5 sent_lead_emails:');
  const sle = (await pool.query("SELECT lead_id, email_type, resend_message_id, sent_at FROM sent_lead_emails ORDER BY sent_at DESC LIMIT 5")).rows;
  for (const r of sle) console.log('  ', JSON.stringify(r));

  // Latest advertising decisions (try multiple sort columns)
  console.log('\nLatest 5 advertising_decisions:');
  try {
    const dec = (await pool.query("SELECT * FROM advertising_decisions ORDER BY 1 DESC LIMIT 5")).rows;
    for (const r of dec) console.log('  ', JSON.stringify(r));
  } catch (e) {
    console.log('  ERROR', e.message);
  }

  // Latest advertising_creatives sample
  console.log('\nLatest 3 advertising_creatives:');
  try {
    const cr = (await pool.query("SELECT * FROM advertising_creatives ORDER BY 1 DESC LIMIT 3")).rows;
    for (const r of cr) console.log('  ', JSON.stringify(r).slice(0, 300));
  } catch (e) {
    console.log('  ERROR', e.message);
  }

  // Advertising spend daily
  console.log('\nadvertising_spend_daily all rows:');
  try {
    const sp = (await pool.query("SELECT * FROM advertising_spend_daily ORDER BY date DESC LIMIT 10")).rows;
    for (const r of sp) console.log('  ', JSON.stringify(r));
  } catch (e) {
    console.log('  ERROR', e.message);
  }

  // Latest charts (temp_charts may not exist; try alternative table name)
  console.log('\nCharts/birth_charts table check:');
  const chTables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE '%chart%' OR tablename LIKE '%birth%')")).rows;
  for (const r of chTables) console.log('  ', r.tablename);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
