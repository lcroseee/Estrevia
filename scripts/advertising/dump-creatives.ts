import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '@/shared/lib/db';
import { sql } from 'drizzle-orm';

const OUT_DIR = path.resolve(process.cwd(), 'tmp', 'creatives-review');

interface CreativeRow {
  id: string;
  hook_template_id: string;
  asset_url: string;
  asset_kind: string;
  generator: string;
  cost_usd: number;
  copy: string;
  cta: string;
  locale: string;
  status: string;
  safety_checks: unknown;
  meta_ad_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const db = getDb();
  const raw = await db.execute(sql`
    SELECT id, hook_template_id, asset_url, asset_kind, generator, cost_usd,
           copy, cta, locale, status, safety_checks, meta_ad_id, approved_by,
           to_char(approved_at, 'YYYY-MM-DD HH24:MI:SS') AS approved_at,
           to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
    FROM advertising_creatives
    ORDER BY locale, created_at
  `);

  const rows = ((raw as { rows?: CreativeRow[] }).rows ?? (raw as CreativeRow[])) as CreativeRow[];

  const jsonPath = path.join(OUT_DIR, 'creatives.json');
  await writeFile(jsonPath, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} creatives → ${jsonPath}`);

  console.log('\n=== summary by hook_template_id × locale ===');
  const buckets = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.hook_template_id} | ${r.locale}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  for (const [k, v] of [...buckets.entries()].sort()) {
    console.log(`  ${k}  →  ${v}`);
  }

  console.log('\n=== creatives (compact) ===');
  for (const r of rows) {
    console.log(
      `\n[${r.locale.toUpperCase()}] ${r.id}  (${r.hook_template_id})`,
    );
    console.log(`  copy: ${r.copy}`);
    console.log(`  cta:  ${r.cta}`);
    console.log(`  url:  ${r.asset_url}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
