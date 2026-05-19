// Read-only audit of the Resend bounce/complaint webhook wiring.
//
// Prints a 3-line status report:
//   Check 1 (local RESEND_WEBHOOK_SECRET): ✓ present | ✗ missing
//   Check 2 (Resend webhook endpoint):     ✓ configured | ✗ not found
//   Check 3 (recent deliveries):           ✓ N events | ⚠ no events | ✗ all failed
//
// Does NOT mutate Resend or any DB. Run with: node scripts/advertising/_audit_resend_webhook_wiring.mjs
import { config } from 'dotenv';
config({ path: '.env' });

const TARGET_URL_FRAGMENT = 'estrevia.app/api/webhooks/resend';
const REQUIRED_EVENTS = ['email.bounced', 'email.complained'];
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

function pad(label) {
  return label.padEnd(44, ' ');
}

// Check 1: local env presence
const check1 = RESEND_WEBHOOK_SECRET
  ? '✓ present'
  : '✗ missing — set in Vercel env and pull locally with `vercel env pull`';
console.log(`${pad('Check 1 (local RESEND_WEBHOOK_SECRET):')}${check1}`);

if (!RESEND_API_KEY) {
  console.log(`${pad('Check 2 (Resend webhook endpoint):')}✗ skipped — RESEND_API_KEY missing`);
  console.log(`${pad('Check 3 (recent deliveries):')}✗ skipped`);
  process.exit(0);
}

// Check 2: webhook configured via raw fetch (SDK may not expose webhooks.list)
let webhookId = null;
let webhookEvents = [];
try {
  const res = await fetch('https://api.resend.com/webhooks', {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  if (!res.ok) {
    console.log(`${pad('Check 2 (Resend webhook endpoint):')}✗ API ${res.status} — verify in https://resend.com/webhooks`);
    console.log(`${pad('Check 3 (recent deliveries):')}✗ skipped`);
    process.exit(0);
  }
  const body = await res.json();
  const hooks = body.data ?? body ?? [];
  const match = (Array.isArray(hooks) ? hooks : []).find((h) =>
    typeof h.endpoint === 'string' && h.endpoint.includes(TARGET_URL_FRAGMENT),
  );
  if (match) {
    webhookId = match.id;
    webhookEvents = Array.isArray(match.events) ? match.events : [];
    const missing = REQUIRED_EVENTS.filter((e) => !webhookEvents.includes(e));
    const tag = missing.length === 0
      ? '✓ configured'
      : `⚠ configured but missing events: ${missing.join(', ')}`;
    console.log(`${pad('Check 2 (Resend webhook endpoint):')}${tag}: ${webhookId} → /api/webhooks/resend`);
  } else {
    console.log(`${pad('Check 2 (Resend webhook endpoint):')}✗ not found — add at https://resend.com/webhooks → endpoint ${TARGET_URL_FRAGMENT}`);
    console.log(`${pad('Check 3 (recent deliveries):')}✗ skipped`);
    process.exit(0);
  }
} catch (err) {
  console.log(`${pad('Check 2 (Resend webhook endpoint):')}✗ ${err.message ?? 'unknown error'}`);
  console.log(`${pad('Check 3 (recent deliveries):')}✗ skipped`);
  process.exit(0);
}

// Check 3: recent deliveries for the matched webhook
// NOTE: Resend's REST API does not expose a delivery-log endpoint (GET /webhooks/:id/events
// returns 405 Method Not Allowed). Delivery history is only available in the Resend dashboard
// at https://resend.com/webhooks. We report the webhook status field instead as a proxy.
try {
  const res = await fetch(`https://api.resend.com/webhooks/${webhookId}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  if (!res.ok) {
    console.log(`${pad('Check 3 (recent deliveries):')}✗ API ${res.status} — inspect https://resend.com/webhooks`);
    process.exit(0);
  }
  const hook = await res.json();
  const status = hook.status ?? 'unknown';
  if (status === 'enabled') {
    console.log(`${pad('Check 3 (recent deliveries):')}✓ webhook status=enabled — delivery logs at https://resend.com/webhooks (REST API has no events endpoint)`);
  } else {
    console.log(`${pad('Check 3 (recent deliveries):')}⚠ webhook status=${status} — inspect https://resend.com/webhooks`);
  }
} catch (err) {
  console.log(`${pad('Check 3 (recent deliveries):')}✗ ${err.message ?? 'unknown error'}`);
}
