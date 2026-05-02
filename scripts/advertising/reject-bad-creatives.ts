/**
 * One-off script: flip 2 known-bad creatives to status='rejected'.
 *
 * Bad creatives:
 *   QgVH83CNEv1unzbRdOKJC — EN authority-1, sky artifact
 *   V8a1sQF5SwR1P-OGOIrfo — ES identity-reveal-3, off-prompt planet collage
 *
 * Usage:
 *   npx tsx scripts/advertising/reject-bad-creatives.ts
 *
 * Idempotent: re-running after both rows are already 'rejected' is safe.
 */

import 'dotenv/config';
import { inArray } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';

const BAD_IDS = [
  'QgVH83CNEv1unzbRdOKJC', // EN authority-1, sky artifact
  'V8a1sQF5SwR1P-OGOIrfo', // ES identity-reveal-3, off-prompt planet collage
];

async function main() {
  const db = getDb();

  const before = await db
    .select({ id: advertisingCreatives.id, status: advertisingCreatives.status })
    .from(advertisingCreatives)
    .where(inArray(advertisingCreatives.id, BAD_IDS));

  console.log('Before:', before);

  if (before.length === 0) {
    console.log('No matching rows found — nothing to update.');
    process.exit(0);
  }

  await db
    .update(advertisingCreatives)
    .set({ status: 'rejected' })
    .where(inArray(advertisingCreatives.id, BAD_IDS));

  const after = await db
    .select({ id: advertisingCreatives.id, status: advertisingCreatives.status })
    .from(advertisingCreatives)
    .where(inArray(advertisingCreatives.id, BAD_IDS));

  console.log('After:', after);

  const allRejected = after.every((r) => r.status === 'rejected');
  if (!allRejected) {
    console.error('ERROR: some rows did not transition to rejected');
    process.exit(1);
  }

  console.log('Done — both creatives are now rejected.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
