// What leads are due to receive an email in the next batches?
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const now = new Date();
console.log(`Now (UTC):       ${now.toISOString()}`);
console.log(`Now (US Georgia, EDT UTC-4): ${new Date(now.getTime() - 4 * 3600 * 1000).toISOString().replace('Z', ' EDT')}`);
console.log('');

// Leads due in the next 12 hours
console.log('═══ A. Leads due in next 12h ═══');
const due = await sql`
  SELECT
    nurture_step,
    DATE_TRUNC('hour', nurture_next_at)::timestamp AS due_hour,
    COUNT(*)::int AS leads,
    MIN(nurture_next_at)::timestamp AS earliest,
    MAX(nurture_next_at)::timestamp AS latest
  FROM email_leads
  WHERE nurture_next_at IS NOT NULL
    AND nurture_step < 7
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
    AND nurture_next_at < NOW() + INTERVAL '12 hours'
  GROUP BY 1, 2
  ORDER BY 2
`;
if (due.length === 0) {
  console.log('  (no leads due in next 12h)');
}
for (const r of due) {
  const utcStr = r.due_hour.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const edtDate = new Date(r.due_hour.getTime() - 4 * 3600 * 1000);
  const edtStr = edtDate.toISOString().replace('T', ' ').slice(0, 16) + ' EDT';
  const nextEmailType = {
    0: 'lead_chart',          // T+0 send
    1: 'lead_curiosity_hook', // T+1h
    2: 'lead_moon_asc',       // T+24h
    3: 'lead_paywall_teaser', // T+72h ← first time this fires
    4: 'lead_saturn_weekly',  // T+7d
    5: 'lead_mini_reading',   // T+14d
    6: 'lead_synastry_teaser',// T+21d
  }[r.nurture_step] || 'unknown';
  console.log(`  step=${r.nurture_step} (next email: ${nextEmailType})`);
  console.log(`    ${utcStr}  =  ${edtStr}`);
  console.log(`    leads due in this hour: ${r.leads}`);
  console.log('');
}

console.log('═══ B. Next single fire (any lead) ═══');
const nextSingle = await sql`
  SELECT id, nurture_step, nurture_next_at, email, utm_source, utm_campaign
  FROM email_leads
  WHERE nurture_next_at IS NOT NULL
    AND nurture_step < 7
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
  ORDER BY nurture_next_at ASC
  LIMIT 5
`;
for (const r of nextSingle) {
  const utc = new Date(r.nurture_next_at).toISOString();
  const edt = new Date(new Date(r.nurture_next_at).getTime() - 4 * 3600 * 1000).toISOString().replace('Z', ' EDT');
  console.log(`  lead=${r.id.slice(0,16)}  step=${r.nurture_step}  email=${(r.email || '').padEnd(28)}`);
  console.log(`    UTC: ${utc}`);
  console.log(`    EDT: ${edt}`);
}

console.log('\n═══ C. Total queue by step ═══');
const queue = await sql`
  SELECT nurture_step, COUNT(*)::int AS leads, MIN(nurture_next_at)::timestamp AS earliest
  FROM email_leads
  WHERE nurture_step < 7
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
  GROUP BY 1
  ORDER BY 1
`;
for (const r of queue) {
  const earliest = r.earliest ? new Date(r.earliest.getTime() - 4 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' EDT' : 'N/A';
  console.log(`  step=${r.nurture_step}  leads=${String(r.leads).padStart(4)}  earliest_due=${earliest}`);
}

console.log('\n═══ D. Cron schedule ═══');
console.log('  /api/cron/lead-nurture runs at minute 0 of every hour UTC');
console.log('  Each fire selects leads where nurture_next_at < NOW(), batch_limit=100');
console.log('  Pacing: 1.1s between sends (Resend rate limit)');
