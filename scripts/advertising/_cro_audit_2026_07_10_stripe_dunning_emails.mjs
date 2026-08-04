// READ-ONLY — 2026-07-10 — dunning/trial email ops vs Stripe failures
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

console.log('═══ sent_dunning_emails (all 25) ═══');
const dun = await sql`SELECT * FROM sent_dunning_emails ORDER BY sent_at ASC`;
for (const r of dun) console.log(' ', JSON.stringify(r));

console.log('\n═══ sent_trial_emails (all 21) ═══');
const tri = await sql`SELECT * FROM sent_trial_emails ORDER BY sent_at ASC`;
for (const r of tri) console.log(' ', JSON.stringify(r));

console.log('\n═══ sent_lead_emails for mpidarling90 lead (uLRT_1GEiiYZ7-Ss9OWo1) ═══');
const drips = await sql`SELECT step, sent_at, resend_message_id FROM sent_lead_emails WHERE lead_id = 'uLRT_1GEiiYZ7-Ss9OWo1' ORDER BY sent_at ASC`;
for (const r of drips) console.log(`  step=${r.step}  sent_at=${r.sent_at?.toISOString?.() || r.sent_at}`);

console.log('\n═══ sent_lead_emails for lainiekayg lead (p4-9KWBf1wRmaUAnOnG1z) ═══');
const drips2 = await sql`SELECT step, sent_at FROM sent_lead_emails WHERE lead_id = 'p4-9KWBf1wRmaUAnOnG1z' ORDER BY sent_at ASC`;
for (const r of drips2) console.log(`  step=${r.step}  sent_at=${r.sent_at?.toISOString?.() || r.sent_at}`);

console.log('\n— END —');
