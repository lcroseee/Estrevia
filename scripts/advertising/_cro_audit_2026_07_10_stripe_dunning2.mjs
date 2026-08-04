// READ-ONLY — 2026-07-10 — dunning emails since June + drip touches for the two new subs
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

console.log('═══ sent_dunning_emails sent_at >= 2026-06-01 ═══');
const dun = await sql`SELECT user_id, subscription_id, stripe_invoice_id, dunning_step, sent_at, error FROM sent_dunning_emails WHERE sent_at >= '2026-06-01' ORDER BY sent_at ASC`;
for (const r of dun) console.log(`  ${r.sent_at?.toISOString?.().slice(0,16)}  step=${r.dunning_step}  sub=${r.subscription_id.slice(0,14)}  inv=${r.stripe_invoice_id.slice(0,14)}  user=${r.user_id.slice(0,20)}  err=${r.error || '—'}`);
console.log(`  count=${dun.length}`);

console.log('\n═══ drip emails to mpidarling90 lead ═══');
const a = await sql`SELECT email_type, sent_at FROM sent_lead_emails WHERE lead_id = 'uLRT_1GEiiYZ7-Ss9OWo1' ORDER BY sent_at ASC`;
for (const r of a) console.log(`  ${r.sent_at?.toISOString?.().slice(0,16)}  ${r.email_type}`);

console.log('\n═══ drip emails to lainiekayg lead ═══');
const b = await sql`SELECT email_type, sent_at FROM sent_lead_emails WHERE lead_id = 'p4-9KWBf1wRmaUAnOnG1z' ORDER BY sent_at ASC`;
for (const r of b) console.log(`  ${r.sent_at?.toISOString?.().slice(0,16)}  ${r.email_type}`);

console.log('\n═══ users rows count for divinelyguided (dup orphan check) ═══');
const c = await sql`SELECT id, email, subscription_tier, stripe_customer_id FROM users WHERE id IN ('18e16e3a-4432-4abe-9ee6-481cf1d16b22','user_3EBHoi8zRm3qM2e5UiEhpfai3jT')`;
for (const r of c) console.log(`  ${r.id}  ${r.email}  tier=${r.subscription_tier}  cus=${r.stripe_customer_id}`);

console.log('\n— END —');
