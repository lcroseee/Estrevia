import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const counts = await sql`
  SELECT status, locale, COUNT(*)::int AS n
  FROM advertising_creatives
  GROUP BY status, locale
  ORDER BY status, locale
`;
console.log('=== advertising_creatives by status/locale ===');
console.table(counts);

const recent = await sql`
  SELECT id, locale, status, asset_kind, cta, generator, meta_ad_id,
         LEFT(copy, 60) AS copy_preview,
         LEFT(asset_url, 80) AS asset_url
  FROM advertising_creatives
  WHERE status IN ('approved', 'uploaded', 'live')
  ORDER BY created_at DESC
  LIMIT 30
`;
console.log('\n=== Approved/uploaded/live creatives (latest 30) ===');
console.table(recent);

const totalCount = await sql`SELECT COUNT(*)::int AS n FROM advertising_creatives`;
console.log('\nTotal rows:', totalCount[0].n);
