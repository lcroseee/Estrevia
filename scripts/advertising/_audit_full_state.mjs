import { Pool } from '@neondatabase/serverless';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  // Check which tables exist
  const tables = await pool.query(`
    SELECT to_regclass(t) AS exists
    FROM unnest(ARRAY[
      'public.sent_lead_emails',
      'public.advertising_decisions',
      'public.chart_readings',
      'public.email_leads',
      'public.lead_chart',
      'public.advertising_feature_gates',
      'public.advertising_ad_set_state',
      'public.advertising_phase_transitions',
      'public.advertising_metric_history',
      'public.advertising_threshold_overrides',
      'public.advertising_spend_daily',
      'public.advertising_recon_state',
      'public.advertising_creatives',
      'public.advertising_brand_voice_scores'
    ]) AS t
  `);
  console.log('Table existence:');
  for (const r of tables.rows) console.log('  ', r.exists);

  // Row counts
  const counts = ['email_leads','sent_lead_emails','advertising_decisions','advertising_feature_gates','advertising_ad_set_state','chart_readings','advertising_creatives'];
  console.log('\nRow counts:');
  for (const tbl of counts) {
    try {
      const c = (await pool.query(`SELECT COUNT(*)::int AS n FROM ${tbl}`)).rows[0].n;
      console.log(`  ${tbl}: ${c}`);
    } catch (e) {
      console.log(`  ${tbl}: ERROR ${e.message}`);
    }
  }

  // sent_lead_emails distribution by email_type
  console.log('\nsent_lead_emails distribution by email_type:');
  const dist = (await pool.query('SELECT email_type, COUNT(*)::int AS n FROM sent_lead_emails GROUP BY email_type ORDER BY email_type')).rows;
  for (const r of dist) console.log(`  ${r.email_type}: ${r.n}`);

  // resend_message_id NULL count
  console.log('\nresend_message_id NULL audit:');
  const nullMsg = (await pool.query("SELECT email_type, COUNT(*) FILTER (WHERE resend_message_id IS NULL)::int AS nulls, COUNT(*)::int AS total FROM sent_lead_emails GROUP BY email_type ORDER BY email_type")).rows;
  for (const r of nullMsg) console.log(`  ${r.email_type}: ${r.nulls}/${r.total} NULL`);

  // email_leads nurture_step distribution
  console.log('\nemail_leads nurture_step distribution:');
  const steps = (await pool.query('SELECT nurture_step, COUNT(*)::int AS n FROM email_leads GROUP BY nurture_step ORDER BY nurture_step')).rows;
  for (const r of steps) console.log(`  step ${r.nurture_step}: ${r.n}`);

  // Feature gates
  console.log('\nadvertising_feature_gates:');
  const gates = (await pool.query('SELECT feature_id, mode FROM advertising_feature_gates ORDER BY feature_id')).rows;
  for (const r of gates) console.log(`  ${r.feature_id}: ${r.mode}`);

  // ad_set_state
  console.log('\nadvertising_ad_set_state:');
  try {
    const adsets = (await pool.query('SELECT ad_set_id, current_phase, data_maturity_mode, locale, conversions_total_meta FROM advertising_ad_set_state ORDER BY ad_set_id')).rows;
    for (const r of adsets) console.log(`  ${r.ad_set_id} | phase=${r.current_phase} | maturity=${r.data_maturity_mode} | locale=${r.locale} | conv=${r.conversions_total_meta}`);
  } catch (e) {
    console.log('  ERROR', e.message);
  }

  // Latest advertising_decisions sample
  console.log('\nLatest 5 advertising_decisions:');
  try {
    const dec = (await pool.query("SELECT ad_id, action, reason, reasoning_tier, created_at FROM advertising_decisions ORDER BY created_at DESC LIMIT 5")).rows;
    for (const r of dec) console.log(`  ${r.created_at?.toISOString?.() ?? r.created_at} | ${r.ad_id} | ${r.action} | ${r.reasoning_tier}`);
  } catch (e) {
    console.log('  ERROR', e.message);
  }

  // Recent leads sample (last 30d)
  console.log('\nemail_leads recent 30d count:');
  const recent = (await pool.query("SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int AS converted, COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS unsubs FROM email_leads WHERE created_at >= NOW() - INTERVAL '30 days'")).rows[0];
  console.log(`  count: ${recent.n}  converted: ${recent.converted}  unsubscribed: ${recent.unsubs}`);

  // Chart count
  console.log('\ntemp_charts recent 30d count:');
  try {
    const ch = (await pool.query("SELECT COUNT(*)::int AS n FROM temp_charts WHERE created_at >= NOW() - INTERVAL '30 days'")).rows[0];
    console.log(`  ${ch.n}`);
  } catch (e) {
    console.log('  ERROR', e.message);
  }

  // Spend daily
  console.log('\nadvertising_spend_daily last 5:');
  try {
    const sp = (await pool.query("SELECT date, spent_usd, cap_usd, triggered_halt FROM advertising_spend_daily ORDER BY date DESC LIMIT 5")).rows;
    for (const r of sp) console.log(`  ${r.date} | spent $${r.spent_usd} | cap $${r.cap_usd} | halt=${r.triggered_halt}`);
  } catch (e) {
    console.log('  ERROR', e.message);
  }

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
