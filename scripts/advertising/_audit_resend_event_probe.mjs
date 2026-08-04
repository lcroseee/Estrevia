// Quick probe: do we see ANY opened_at / clicked_at in Resend right now?
// Including pre-cutoff (those should have opens too via inline pixel even
// if no domain tracking — Resend tracks via image pixel regardless).
import { config } from 'dotenv';
config({ path: '.env' });
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

// Pull a fresh batch and look at raw response shape
const list = await resend.emails.list({ limit: 100 });
const rows = list?.data?.data ?? [];
console.log(`Pulled ${rows.length} rows from Resend list endpoint`);

// Status distribution
const statusCount = {};
for (const r of rows) {
  statusCount[r.last_event ?? '?'] = (statusCount[r.last_event ?? '?'] || 0) + 1;
}
console.log('Status distribution:', statusCount);

// Find first email with opened or clicked event
let probedOpen = false;
let probedClick = false;
const seen = [];

for (const r of rows.slice(0, 30)) {
  const d = await resend.emails.get(r.id).catch(() => null);
  const data = d?.data;
  if (!data) continue;
  seen.push({
    id: r.id.slice(0, 10),
    created: r.created_at.slice(5, 16),
    last_event: data.last_event,
    opened_at: data.opened_at,
    clicked_at: data.clicked_at,
    has_events: Array.isArray(data.events),
    events_count: Array.isArray(data.events) ? data.events.length : 0,
  });
  if (data.opened_at && !probedOpen) {
    probedOpen = true;
    console.log('\n=== Found OPENED — full record ===');
    console.log(JSON.stringify(data, null, 2));
  }
  if (data.clicked_at && !probedClick) {
    probedClick = true;
    console.log('\n=== Found CLICKED — full record ===');
    console.log(JSON.stringify(data, null, 2));
  }
}

console.log('\nFirst 30 records:');
console.table(seen);
console.log(`opened_at found: ${probedOpen}`);
console.log(`clicked_at found: ${probedClick}`);

// Try the events endpoint if available
console.log('\n=== Raw single-email fetch shape ===');
if (rows[0]) {
  const sample = await resend.emails.get(rows[0].id);
  console.log('Keys:', Object.keys(sample?.data ?? {}));
  console.log('Full:', JSON.stringify(sample?.data, null, 2));
}
