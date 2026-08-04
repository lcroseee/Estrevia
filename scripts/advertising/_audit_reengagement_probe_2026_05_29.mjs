import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sql = neon(process.env.DATABASE_URL);

const since = Math.floor(Date.now()/1000) - 14*86400;
let sessions = [], after;
for (let i=0;i<30;i++){
  const opts={limit:100,created:{gte:since}}; if(after) opts.starting_after=after;
  const p = await stripe.checkout.sessions.list(opts);
  sessions.push(...p.data); if(!p.has_more) break; after=p.data[p.data.length-1].id;
}
const drip = sessions.filter(s=>s.metadata?.utm_source==='lead-nurture');
console.log(`Total 14d sessions: ${sessions.length}; drip-attributed: ${drip.length}`);

// For each completed drip session, find the lead's email & each drip send time;
// compute gap from each send to session creation. TRUE re-engagement = converted
// >= 1h after the relevant drip email was sent (i.e. not same-session passthrough).
for (const s of drip) {
  const email = (s.customer_email || s.customer_details?.email || '').toLowerCase();
  const created = s.created;
  const camp = s.metadata?.utm_campaign;
  let sends = [];
  if (email) {
    sends = await sql`
      SELECT se.email_type, se.sent_at FROM sent_lead_emails se
      JOIN email_leads l ON l.id = se.lead_id
      WHERE LOWER(l.email)=${email} ORDER BY se.sent_at ASC`;
  }
  const campToType = {t0:'lead_chart',t1h:'lead_curiosity_hook',t24h:'lead_moon_asc',t72:'lead_paywall_teaser',t7d:'lead_saturn_weekly'};
  const matchType = campToType[camp];
  const matchSend = sends.find(x=>x.email_type===matchType);
  const gapMin = matchSend ? ((created*1000 - new Date(matchSend.sent_at).getTime())/60000) : null;
  console.log(`\n--- ${s.id.slice(0,20)} status=${s.status} camp=${camp} email=${email||'(none)'} ---`);
  console.log(`  session_created=${new Date(created*1000).toISOString().slice(0,16)}`);
  if (matchSend) console.log(`  matching ${matchType} sent=${new Date(matchSend.sent_at).toISOString().slice(0,16)} gap=${gapMin.toFixed(0)}min (${(gapMin/60).toFixed(1)}h)`);
  else console.log(`  no matching ${matchType} send found for this email`);
  if (s.status==='complete') {
    const reeng = gapMin!=null && gapMin>=60;
    console.log(`  >>> COMPLETED. true_reengagement(>=1h gap)=${reeng?'YES':'NO (same-session/passthrough)'}`);
  }
}

// Completed drip sessions detail
const completed = drip.filter(s=>s.status==='complete');
console.log(`\n=== Completed drip sessions: ${completed.length} ===`);
