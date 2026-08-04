// READ-ONLY probe: verify whether resend.emails.get(id) exposes opened_at/clicked_at
// for records that LIST reports as last_event=opened/clicked. Adversarial check of
// finding R1 root cause. No mutations.
import { config } from 'dotenv';
config({ path: '.env' });
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// 1. Pull one page from list, find a few opened + clicked + delivered ids.
const list = await resend.emails.list({ limit: 100 });
const rows = list?.data?.data ?? [];
console.log(`list page rows: ${rows.length}`);

function pick(ev, n) {
  return rows.filter((r) => r.last_event === ev).slice(0, n);
}
const samples = [
  ...pick('clicked', 2),
  ...pick('opened', 2),
  ...pick('delivered', 1),
];
console.log('sampling last_events:', samples.map((r) => r.last_event));

for (const row of samples) {
  const r = await resend.emails.get(row.id).catch((e) => ({ _err: e.message }));
  const d = r?.data;
  console.log('\n---', row.last_event, row.id.slice(0, 12), '---');
  if (r?._err) { console.log('  GET ERROR:', r._err); continue; }
  if (!d) { console.log('  GET returned null/undefined data. raw keys:', Object.keys(r ?? {})); continue; }
  console.log('  data keys:', Object.keys(d));
  console.log('  last_event:', d.last_event);
  console.log('  opened_at :', JSON.stringify(d.opened_at));
  console.log('  clicked_at:', JSON.stringify(d.clicked_at));
  console.log('  bounced_at:', JSON.stringify(d.bounced_at));
  console.log('  has events[]:', Array.isArray(d.events), Array.isArray(d.events) ? d.events.length : '');
}
console.log('\n=== probe done ===');
