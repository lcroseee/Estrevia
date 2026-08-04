// Full Resend health audit — uses new full-access key.
import { config } from 'dotenv';
config({ path: '.env' });
import { Resend } from 'resend';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const resend = new Resend(process.env.RESEND_API_KEY);

const list = await resend.emails.list?.({ limit: 100 }).catch((e) => ({ error: e.message }));
const rows = list?.data?.data ?? [];
if (list?.error) {
  console.log('Resend list error:', list.error);
  process.exit(1);
}
console.log(`Fetched ${rows.length} most-recent emails from Resend.\n`);

// ── 1. Status distribution
const byStatus = {};
for (const e of rows) byStatus[e.last_event ?? '?'] = (byStatus[e.last_event ?? '?'] || 0) + 1;
console.log('=== Status distribution (last 100) ===');
console.table(byStatus);

// ── 2. Email type distribution (by subject prefix heuristic)
const SUBJECT_TO_TYPE = (s) => {
  if (!s) return 'unknown';
  if (s.includes('sidereal chart is ready') || s.includes('carta sideral está lista')) return 'T+0 lead_chart';
  if (s.includes('Moon in') || s.includes('Luna en')) return 'T+24h lead_moon_asc';
  if (s.includes('Paywall') || s.includes('Premium') || s.includes('Synastry') || s.toLowerCase().includes('locked')) return 'T+72h lead_paywall_teaser';
  if (s.toLowerCase().includes('saturn') || s.toLowerCase().includes('sade') || s.toLowerCase().includes('saturno')) return 'T+7d lead_saturn_weekly';
  if (s.toLowerCase().includes('mini') || s.toLowerCase().includes('breve')) return 'T+14d lead_mini_reading';
  if (s.toLowerCase().includes('synastry') || s.toLowerCase().includes('sinastr')) return 'T+21d lead_synastry_teaser';
  return 'unknown:' + s.slice(0, 30);
};
const byType = {};
for (const e of rows) {
  const t = SUBJECT_TO_TYPE(e.subject);
  byType[t] = (byType[t] || 0) + 1;
}
console.log('\n=== Email type distribution (last 100) ===');
console.table(byType);

// ── 3. Locale distribution by subject language
const byLocale = { en: 0, es: 0, '?': 0 };
for (const e of rows) {
  const s = e.subject ?? '';
  if (s.match(/Luna|carta|qué|Tu/)) byLocale.es++;
  else if (s.match(/Moon|chart|your|Your/)) byLocale.en++;
  else byLocale['?']++;
}
console.log('\n=== Locale distribution (heuristic) ===');
console.table(byLocale);

// ── 4. Time range
const ts = rows.map((e) => new Date(e.created_at)).sort((a, b) => a - b);
console.log(`\n=== Time window ===\nFirst: ${ts[0]?.toISOString()}\nLast:  ${ts.at(-1)?.toISOString()}\nSpan:  ${Math.round((ts.at(-1) - ts[0]) / (3600 * 1000))}h`);

// ── 5. Deep-fetch first 20 to get open/click counts
console.log('\n=== Deep status (first 20: opens/clicks) ===');
const detail = [];
for (const e of rows.slice(0, 20)) {
  const r = await resend.emails.get(e.id).catch(() => null);
  detail.push({
    id: e.id.slice(0, 12),
    to: (Array.isArray(e.to) ? e.to[0] : String(e.to)).slice(0, 24),
    type: SUBJECT_TO_TYPE(e.subject).slice(0, 20),
    status: r?.data?.last_event ?? e.last_event ?? '?',
    opened: r?.data?.opened_at ? '✓' : '–',
    clicked: r?.data?.clicked_at ? '✓' : '–',
  });
}
console.table(detail);

// ── 6. Cross-check: how many sent_lead_emails rows do NOT match a Resend email by msgid
const dbMsgids = (await sql`
  SELECT resend_message_id, email_type, sent_at FROM sent_lead_emails
  WHERE resend_message_id IS NOT NULL
  ORDER BY sent_at DESC
  LIMIT 200
`).map((r) => r.resend_message_id);
const resendIds = new Set(rows.map((r) => r.id));
const overlap = dbMsgids.filter((id) => resendIds.has(id)).length;
console.log(`\n=== DB vs Resend list overlap ===`);
console.log(`DB has ${dbMsgids.length} msgids; Resend list (last 100) covers ${overlap} of them.`);
console.log(`(Outside coverage means older than Resend's last 100, not missing — increase limit if needed.)`);

// ── 7. Count of email_type in last 24h (DB side)
const byTypeDB = await sql`
  SELECT email_type, COUNT(*)::int AS n
  FROM sent_lead_emails
  WHERE sent_at > NOW() - INTERVAL '24 hours'
  GROUP BY email_type
  ORDER BY n DESC
`;
console.log('\n=== sent_lead_emails by type (last 24h) ===');
console.table(byTypeDB);

// ── 8. Lead → user → trial mapping for the famous Meta EN lead
const metaLead = await sql`
  SELECT id, email, locale, created_at, converted_to_user_id, utm_source, utm_campaign, utm_content
  FROM email_leads
  WHERE id = '10yyJJib6xRab1oOCGh0r'
`;
console.log('\n=== The MFR1 Meta lead 10yyJJib6xRab1oOCGh0r ===');
console.table(metaLead);
