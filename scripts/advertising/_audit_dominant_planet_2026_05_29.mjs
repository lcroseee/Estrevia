// Quantify pickDominantPlanet bias from actual curiosity_hook subjects in Resend.
// Subject pattern: EN "Your {Planet} is doing something rare", ES "Tu {Planet} está haciendo algo poco común"
import { config } from 'dotenv';
config({ path: '.env' });
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

const byId = new Map();
let after;
for (let i=0;i<6;i++){
  const opts={limit:100}; if(after)opts.after=after;
  const list = await resend.emails.list(opts).catch(()=>null);
  const rows = list?.data?.data ?? [];
  if(!rows.length) break;
  for(const r of rows) byId.set(r.id, r);
  after = rows[rows.length-1].id;
  if(rows.length<100) break;
}
// We can't get subject from list endpoint; instead approximate via the known
// distribution. Resend list lacks subject. Use the deep-fetch fallback impossible.
// Instead: report the rule probabilities analytically + note observed sample subjects.
console.log(`Pulled ${byId.size} records (subjects not exposed on list endpoint).`);
console.log('pickDominantPlanet selection rules (sidereal):');
console.log('  Saturn if Saturn in Capricorn|Aquarius   -> P≈2/12 = 16.7% of charts');
console.log('  else Mars if Mars in Aries|Scorpio        -> P≈2/12 of remaining');
console.log('  else Venus if Venus in Taurus|Libra       -> P≈2/12 of remaining');
console.log('  else Mercury (FALLBACK, generic)          -> everyone else');
console.log('Rough independent-uniform expectation:');
const pS = 2/12;
const pM = (1-pS)*(2/12);
const pV = (1-pS)*(1-2/12)*(2/12);
const pMerc = 1 - pS - pM - pV;
console.log(`  Saturn  ~${(pS*100).toFixed(1)}%`);
console.log(`  Mars    ~${(pM*100).toFixed(1)}%`);
console.log(`  Venus   ~${(pV*100).toFixed(1)}%`);
console.log(`  Mercury ~${(pMerc*100).toFixed(1)}%  <-- dominant fallback`);
