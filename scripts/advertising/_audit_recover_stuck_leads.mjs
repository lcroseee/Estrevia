/**
 * ONE-OFF — recover T+0 chart emails for leads whose 2026-05-17 first-attempt
 * silently failed at Resend (data:null,error:… without throwing) and left
 * sent_lead_emails.resend_message_id = NULL.
 *
 * Standalone .mjs (not the production email.ts pipeline because that path
 * imports `server-only` which throws in plain Node). We replicate the minimal
 * shape of the lead_chart email + reuse the same Resend idempotencyKey so
 * `${leadId}:lead_chart` keeps duplicate-detection on Resend's side intact:
 *   - if the original send DID reach the inbox, Resend returns the cached
 *     message id — we just update sent_lead_emails and stop.
 *   - if it didn't, Resend processes anew and the recipient gets the email.
 *
 * Run:
 *   DRY_RUN=true node scripts/advertising/_audit_recover_stuck_leads.mjs
 *   node scripts/advertising/_audit_recover_stuck_leads.mjs
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { Resend } from 'resend';
import { neon } from '@neondatabase/serverless';
import { createHmac } from 'node:crypto';

const DRY = process.env.DRY_RUN === 'true';
const sql = neon(process.env.DATABASE_URL);
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Estrevia <hello@estrevia.app>';
const SITE = 'https://estrevia.app';
const UNSUB_SECRET = process.env.EMAIL_UNSUBSCRIBE_SECRET;

const SUBJECT = {
  en: (sun) => `Your sidereal chart — Sun in ${sun ?? 'the stars'}`,
  es: (sun) => `Tu carta sideral — Sol en ${sun ?? 'las estrellas'}`,
};

const COPY = {
  en: ({ sun, moon, asc, chartUrl, unsubUrl }) => `
    <div style="font-family:Georgia,serif;color:#0F0F17;max-width:560px;padding:24px;line-height:1.7;">
      <h2 style="font-weight:300;color:#3B2566;margin:0 0 16px 0;">Your sidereal chart is ready</h2>
      <p>Hi — sorry for the delay. Here's the snapshot we promised when you submitted your birth data:</p>
      <ul style="list-style:none;padding:0;margin:20px 0;">
        ${sun ? `<li>☉ <strong>Sun in ${sun}</strong> — your sidereal core identity</li>` : ''}
        ${moon ? `<li style="margin-top:8px;">☽ <strong>Moon in ${moon}</strong> — emotional landscape</li>` : ''}
        ${asc ? `<li style="margin-top:8px;">↑ <strong>Rising in ${asc}</strong> — the lens others see you through</li>` : ''}
      </ul>
      <p style="margin-top:24px;">
        <a href="${chartUrl}" style="background:#3B2566;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">View your full chart</a>
      </p>
      <p style="font-size:12px;color:#999;margin-top:32px;">
        You're getting this because you submitted your birth data at estrevia.app. <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>.
      </p>
    </div>
  `,
  es: ({ sun, moon, asc, chartUrl, unsubUrl }) => `
    <div style="font-family:Georgia,serif;color:#0F0F17;max-width:560px;padding:24px;line-height:1.7;">
      <h2 style="font-weight:300;color:#3B2566;margin:0 0 16px 0;">Tu carta sideral está lista</h2>
      <p>Hola — perdona el retraso. Acá está el resumen que te prometimos cuando dejaste tus datos:</p>
      <ul style="list-style:none;padding:0;margin:20px 0;">
        ${sun ? `<li>☉ <strong>Sol en ${sun}</strong> — tu identidad sideral central</li>` : ''}
        ${moon ? `<li style="margin-top:8px;">☽ <strong>Luna en ${moon}</strong> — tu paisaje emocional</li>` : ''}
        ${asc ? `<li style="margin-top:8px;">↑ <strong>Ascendente en ${asc}</strong> — la lente con que otros te ven</li>` : ''}
      </ul>
      <p style="margin-top:24px;">
        <a href="${chartUrl}" style="background:#3B2566;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Ver tu carta completa</a>
      </p>
      <p style="font-size:12px;color:#999;margin-top:32px;">
        Recibes esto porque dejaste tus datos en estrevia.app. <a href="${unsubUrl}" style="color:#999;">Darme de baja</a>.
      </p>
    </div>
  `,
};

function pickSigns(chart) {
  if (!chart || typeof chart !== 'object') return { sun: null, moon: null, asc: null };
  const planets = Array.isArray(chart.planets) ? chart.planets : [];
  const sun = planets.find((p) => p.planet === 'Sun')?.sign ?? null;
  const moon = planets.find((p) => p.planet === 'Moon')?.sign ?? null;
  const houses = Array.isArray(chart.houses) ? chart.houses : null;
  const asc = houses?.[0]?.sign ?? null;
  return { sun, moon, asc };
}

function signLeadUnsubToken(leadId) {
  // Mirrors src/shared/lib/unsubscribe-token.ts:signTyped — payload is
  // `lead.${id}.${expMs}` then base64url-encoded; sig is HMAC-SHA256 over the
  // RAW payload string (not the base64-encoded version) and base64url'd.
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `lead.${leadId}.${exp}`;
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', UNSUB_SECRET ?? '').update(payload).digest('base64url');
  return `${payloadB64}.${sig}`;
}

const stuck = await sql`
  SELECT l.id, l.email, l.locale, l.chart_id, nc.chart_data
  FROM email_leads l
  JOIN sent_lead_emails s ON s.lead_id = l.id AND s.email_type = 'lead_chart'
  LEFT JOIN natal_charts nc ON nc.id = l.chart_id
  WHERE s.resend_message_id IS NULL
    AND l.unsubscribed_at IS NULL
    AND l.email_undeliverable = false
  ORDER BY l.created_at ASC
`;

console.log(`Found ${stuck.length} stuck leads (no resend_message_id).`);
if (DRY) console.log('DRY_RUN=true — no Resend calls will be made.\n');
if (!DRY && !UNSUB_SECRET) {
  console.error('UNSUBSCRIBE_HMAC_SECRET missing in .env — required for real send.');
  process.exit(2);
}

let sent = 0;
let already = 0;
let failed = 0;

for (const lead of stuck) {
  const { sun, moon, asc } = pickSigns(lead.chart_data);
  const email28 = lead.email.slice(0, 28).padEnd(28);
  const locTag = `[${lead.locale}]`;
  const chartTag = lead.chart_data ? '✓chart' : '–chart';
  const sigSummary = `Sun=${sun ?? '–'} Moon=${moon ?? '–'} Asc=${asc ?? '–'}`;

  if (DRY) {
    console.log(`  [DRY] ${email28} ${locTag} ${chartTag}  ${sigSummary}`);
    continue;
  }

  try {
    const unsubUrl = `${SITE}/${lead.locale === 'es' ? 'es/' : ''}unsubscribe?token=${signLeadUnsubToken(lead.id)}`;
    const chartUrl = lead.chart_id
      ? `${SITE}/${lead.locale === 'es' ? 'es/' : ''}chart?chartId=${lead.chart_id}&utm_source=lead-nurture-recovery&utm_campaign=t0_recovery`
      : `${SITE}/${lead.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture-recovery&utm_campaign=t0_recovery`;

    const html = COPY[lead.locale]({ sun, moon, asc, chartUrl, unsubUrl });
    const subject = SUBJECT[lead.locale](sun);

    const result = await resend.emails.send(
      {
        from: FROM,
        to: lead.email,
        subject,
        html,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      },
      { idempotencyKey: `${lead.id}:lead_chart` },
    );

    if (result.error) {
      throw new Error(`Resend rejected: ${result.error.message ?? result.error.name ?? 'unknown'}`);
    }

    const msgId = result.data?.id ?? null;
    if (msgId) {
      await sql`UPDATE sent_lead_emails SET resend_message_id = ${msgId} WHERE lead_id = ${lead.id} AND email_type = 'lead_chart'`;
      sent++;
      console.log(`  ✓ ${email28} ${locTag} ${chartTag}  → sent  msgid=${msgId.slice(0, 12)}`);
    } else {
      already++;
      console.log(`  • ${email28} ${locTag} ${chartTag}  → no msgid in response`);
    }
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${email28} ${locTag} ${chartTag}  → ${msg.slice(0, 80)}`);
  }

  await new Promise((r) => setTimeout(r, 1100));
}

console.log(`\nSummary: sent=${sent}  no_msgid=${already}  failed=${failed}  total=${stuck.length}`);
process.exit(failed > 0 && sent === 0 ? 1 : 0);
