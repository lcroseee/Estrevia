// READ-ONLY probe: ES ad creatives (message match vs landing hero)
import { config } from 'dotenv';
config({ path: '.env' });

const TOK = process.env.META_ACCESS_TOKEN;
const ACCT = 'act_1435842067150024';

console.log('=== META: campaigns + adsets (status) ===');
{
  const u = new URL(`https://graph.facebook.com/v21.0/${ACCT}/campaigns`);
  u.searchParams.set('fields', 'name,status,effective_status,updated_time,adsets{name,effective_status,daily_budget,targeting{geo_locations}}');
  u.searchParams.set('limit', '25');
  u.searchParams.set('access_token', TOK);
  const j = await (await fetch(u)).json();
  if (j.error) console.log('ERR', j.error.message);
  else for (const c of j.data ?? []) {
    console.log(`CAMPAIGN ${c.name} — ${c.effective_status} (upd ${c.updated_time})`);
    for (const a of c.adsets?.data ?? []) {
      const geo = a.targeting?.geo_locations?.countries?.join(',') ?? '?';
      console.log(`  adset ${a.name} — ${a.effective_status} $${(a.daily_budget ?? 0) / 100}/d geo=[${geo}]`);
    }
  }
}

console.log('\n=== META: all ads w/ creative bodies (looking for ES ads) ===');
{
  const u = new URL(`https://graph.facebook.com/v21.0/${ACCT}/ads`);
  u.searchParams.set('fields', 'name,effective_status,adset{name},creative{title,body,object_story_spec,asset_feed_spec}');
  u.searchParams.set('limit', '50');
  u.searchParams.set('access_token', TOK);
  const j = await (await fetch(u)).json();
  if (j.error) console.log('ERR', j.error.message);
  else for (const ad of j.data ?? []) {
    const c = ad.creative ?? {};
    const spec = c.object_story_spec?.link_data ?? {};
    const afs = c.asset_feed_spec;
    console.log(`\nAD "${ad.name}" [${ad.effective_status}] adset=${ad.adset?.name}`);
    if (c.title || spec.name) console.log(`  headline: ${c.title ?? spec.name}`);
    if (c.body || spec.message) console.log(`  body: ${(c.body ?? spec.message ?? '').slice(0, 300)}`);
    if (spec.link) console.log(`  link: ${spec.link}`);
    if (spec.call_to_action?.type) console.log(`  cta: ${spec.call_to_action.type}`);
    if (afs) {
      console.log(`  afs titles: ${(afs.titles ?? []).map(t => t.text).join(' | ').slice(0, 200)}`);
      console.log(`  afs bodies: ${(afs.bodies ?? []).map(t => t.text).join(' || ').slice(0, 400)}`);
      console.log(`  afs links: ${(afs.link_urls ?? []).map(l => l.website_url).join(' | ')}`);
    }
  }
}
