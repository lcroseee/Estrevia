// Engagement deep-dive: opens, clicks, and delayed delivery investigation.
import { config } from 'dotenv';
config({ path: '.env' });
import { Resend } from 'resend';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const resend = new Resend(process.env.RESEND_API_KEY);

const list = await resend.emails.list({ limit: 100 });
const rows = list?.data?.data ?? [];

// 1. Pick 12+ hour old emails — they've had time to be opened
const TWELVE_H = 12 * 3600 * 1000;
const old = rows.filter((e) => Date.now() - new Date(e.created_at).getTime() > TWELVE_H);
console.log(`Found ${old.length} emails older than 12h (have had time for opens/clicks)\n`);

// 2. Deep-fetch them
console.log('=== Engagement on 12+ hour old emails ===');
let opened = 0, clicked = 0, delivered = 0, delayed = 0, other = 0;
const sample = [];
for (const e of old.slice(0, 30)) {
  const r = await resend.emails.get(e.id).catch(() => null);
  const d = r?.data;
  if (!d) continue;
  if (d.last_event === 'delivered') delivered++;
  else if (d.last_event === 'delivery_delayed') delayed++;
  else other++;
  if (d.opened_at) opened++;
  if (d.clicked_at) clicked++;
  if (sample.length < 15) {
    sample.push({
      id: e.id.slice(0, 12),
      to: (Array.isArray(e.to) ? e.to[0] : String(e.to)).slice(0, 24),
      created: e.created_at.slice(5, 16),
      age_h: Math.round((Date.now() - new Date(e.created_at).getTime()) / (3600 * 1000)),
      status: d.last_event,
      opened: d.opened_at ? d.opened_at.slice(5, 16) : '–',
      clicked: d.clicked_at ? d.clicked_at.slice(5, 16) : '–',
    });
  }
}
console.table(sample);
console.log(`Aggregate of ${Math.min(old.length, 30)} aged emails: delivered=${delivered}, delayed=${delayed}, other=${other}`);
console.log(`Opens:  ${opened}/${Math.min(old.length, 30)} (${(opened*100/Math.min(old.length,30)).toFixed(1)}%)`);
console.log(`Clicks: ${clicked}/${Math.min(old.length, 30)} (${(clicked*100/Math.min(old.length,30)).toFixed(1)}%)`);

// 3. Investigate the 3 delivery_delayed
console.log('\n=== delivery_delayed investigation ===');
const delayedRows = rows.filter((e) => e.last_event === 'delivery_delayed');
for (const e of delayedRows) {
  const r = await resend.emails.get(e.id).catch(() => null);
  console.log({
    id: e.id.slice(0, 12),
    to: Array.isArray(e.to) ? e.to[0] : String(e.to),
    created: e.created_at,
    last_event: r?.data?.last_event,
    bounced_at: r?.data?.bounced_at,
    complained_at: r?.data?.complained_at,
  });
}

// 4. Find the MFR1 Meta lead by various means
console.log('\n=== Hunting the MFR1 trial ===');
const subsWithUtm = await sql`
  SELECT u.id, u.email, u.stripe_subscription_status, u.created_at, u.utm_source, u.utm_campaign, u.utm_content,
         u.stripe_customer_id, u.stripe_subscription_id
  FROM users u
  WHERE u.stripe_subscription_status IN ('trialing','active')
     OR u.stripe_customer_id IS NOT NULL
  ORDER BY u.created_at DESC
`;
console.log(`Users with Stripe presence (any state): ${subsWithUtm.length}`);
console.table(subsWithUtm.map((u) => ({
  id: u.id?.slice(0, 12),
  email: u.email?.slice(0, 24),
  status: u.stripe_subscription_status,
  created: u.created_at?.toISOString?.().slice(0, 16),
  utm: `${u.utm_source ?? '-'}/${u.utm_campaign ?? '-'}/${(u.utm_content ?? '-').slice(0, 24)}`,
  stripe_cust: u.stripe_customer_id?.slice(0, 12),
})));

// 5. Search email_leads for the suspected MFR1 lead_id
const leadHunt = await sql`
  SELECT id, email, locale, created_at, converted_to_user_id, utm_source, utm_campaign, utm_content
  FROM email_leads
  WHERE id LIKE '10yyJJib%' OR utm_content LIKE '10yyJJib%' OR utm_campaign LIKE '%lead_en%'
  ORDER BY created_at DESC
  LIMIT 10
`;
console.log('\n=== email_leads matching MFR1 patterns ===');
console.table(leadHunt.map((l) => ({
  id: l.id?.slice(0, 12),
  email: l.email?.slice(0, 24),
  locale: l.locale,
  utm: `${l.utm_source ?? '-'}/${l.utm_campaign ?? '-'}/${(l.utm_content ?? '-').slice(0, 16)}`,
  converted: l.converted_to_user_id ? '✓' : '–',
  created: l.created_at?.toISOString?.().slice(0, 16),
})));

// 6. anonymous_checkout_tickets table check
const tablesCheck = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public'
    AND (table_name LIKE '%anon%' OR table_name LIKE '%ticket%' OR table_name LIKE '%checkout%' OR table_name LIKE '%session%')
`;
console.log('\n=== Anonymous-checkout related tables ===');
console.table(tablesCheck);
