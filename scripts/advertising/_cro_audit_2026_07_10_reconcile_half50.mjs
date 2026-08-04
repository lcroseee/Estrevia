// RECONCILE #7 — HALF50 stale-link behavior + reachability. STRICTLY READ-ONLY.
// SQL SELECT only; Stripe GET only; Resend GET only.
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';

config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const out = {};

// ---------- 1. DB: does the blast table exist? what emails were actually sent since 05-20? ----------
out.blastTable = await sql`SELECT to_regclass('public.sent_discount_blast_emails') AS reg`;

out.sentLeadEmailTypes = await sql`
  SELECT email_type, COUNT(*)::int AS n
  FROM sent_lead_emails
  WHERE sent_at >= '2026-05-20'
  GROUP BY 1 ORDER BY 1`;

out.sentTrialEmailSteps = await sql`
  SELECT step, COUNT(*)::int AS n
  FROM sent_trial_emails
  GROUP BY 1 ORDER BY 1`;

// cart-abandon table (TEASER20 link carrier) — name check first
out.cartAbandonTable = await sql`SELECT to_regclass('public.sent_cart_abandon_emails') AS reg`;
if (out.cartAbandonTable[0].reg) {
  out.cartAbandonCount = await sql`SELECT COUNT(*)::int AS n FROM sent_cart_abandon_emails`;
}

// ---------- 2. Stripe: HALF50 coupon + promo state (GET only) ----------
try {
  const c = await stripe.coupons.retrieve('HALF50');
  out.half50Coupon = {
    id: c.id, valid: c.valid, percent_off: c.percent_off, duration: c.duration,
    redeem_by: c.redeem_by ? new Date(c.redeem_by * 1000).toISOString() : null,
    times_redeemed: c.times_redeemed,
    created: new Date(c.created * 1000).toISOString(),
  };
} catch (e) {
  out.half50Coupon = { error: e.message };
}
try {
  const promos = await stripe.promotionCodes.list({ code: 'HALF50', limit: 5 });
  out.half50Promo = promos.data.map((p) => ({
    id: p.id, code: p.code, active: p.active, times_redeemed: p.times_redeemed, coupon: p.coupon?.id,
  }));
} catch (e) {
  out.half50Promo = { error: e.message };
}

// ---------- 3. Resend: any sent email since 05-20 with a discount-blast/HALF50 subject? ----------
// Resend list API (GET /emails) — paginate a few pages, grep subjects.
async function listResendEmails(limitPages = 25) {
  const rows = [];
  let url = 'https://api.resend.com/emails?limit=100';
  for (let i = 0; i < limitPages; i++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!res.ok) return { error: `${res.status} ${await res.text()}`, rows };
    const body = await res.json();
    const data = body.data ?? body.emails ?? [];
    rows.push(...data);
    if (!body.has_more && !body.next_page_token) break;
    // Resend cursor pagination via `after` = last id (per API docs)
    const last = data[data.length - 1];
    if (!last) break;
    url = `https://api.resend.com/emails?limit=100&after=${last.id}`;
  }
  return { rows };
}
const resend = await listResendEmails();
if (resend.error) {
  out.resend = { listError: resend.error, fetched: resend.rows.length };
} else {
  const since = resend.rows.filter((r) => (r.created_at ?? '') >= '2026-05-20');
  const bySubject = {};
  for (const r of since) bySubject[r.subject] = (bySubject[r.subject] ?? 0) + 1;
  out.resend = {
    fetchedTotal: resend.rows.length,
    since0520: since.length,
    oldestFetched: resend.rows.length ? resend.rows[resend.rows.length - 1].created_at : null,
    subjects: bySubject,
    half50Hits: since.filter((r) => /half50|50\s*%|descuento|discount/i.test(r.subject ?? '')).map((r) => ({ id: r.id, subject: r.subject, created_at: r.created_at })),
  };
}

console.log(JSON.stringify(out, null, 2));
