import 'dotenv/config';
import { getDb } from '@/shared/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  const byStatusLocaleRaw = await db.execute(sql`
    SELECT status, locale, COUNT(*)::int AS count
    FROM advertising_creatives
    GROUP BY status, locale
    ORDER BY status, locale
  `);
  const byStatusLocale = (byStatusLocaleRaw as { rows?: unknown[] }).rows
    ?? (byStatusLocaleRaw as unknown[]);

  const totalRaw = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM advertising_creatives
  `);
  const totalRows = (totalRaw as { rows?: { count: number }[] }).rows
    ?? (totalRaw as { count: number }[]);
  const total = totalRows[0]?.count ?? 0;

  console.log('\n=== advertising_creatives by status × locale ===');
  if ((byStatusLocale as unknown[]).length === 0) {
    console.log('(empty table)');
  } else {
    console.table(byStatusLocale);
  }
  console.log(`\nTotal rows: ${total}`);

  const recentRaw = await db.execute(sql`
    SELECT id, status, locale, asset_kind, cost_usd,
           to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created,
           CASE WHEN approved_at IS NULL THEN '-'
                ELSE to_char(approved_at, 'YYYY-MM-DD HH24:MI') END AS approved,
           COALESCE(approved_by, '-') AS approver
    FROM advertising_creatives
    ORDER BY created_at DESC
    LIMIT 15
  `);
  const recent = (recentRaw as { rows?: unknown[] }).rows
    ?? (recentRaw as unknown[]);

  console.log('\n=== last 15 creatives ===');
  if ((recent as unknown[]).length === 0) {
    console.log('(no rows)');
  } else {
    console.table(recent);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
