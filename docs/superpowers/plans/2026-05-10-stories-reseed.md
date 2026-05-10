# Stories Re-seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 Story-format Canva anchor creatives to `advertising_creatives`, bringing the canva-anchor seed from 6 → 12 records.

**Architecture:** Three changes land in sequence. First, a one-off upload helper (`scripts/advertising/upload-canva-stories-to-blob.ts`) ships independently of founder action — it's harmless without PNGs. Second, the founder creates 6 Story-format Canva designs and exports them to `tmp/canva-stories-2026-05-10/`, then the helper uploads to Vercel Blob. Third, an atomic commit merges `ANCHOR_BLOBS_FEED + ANCHOR_BLOBS_STORIES_PENDING → ANCHOR_BLOBS` and `ANCHORS_FEED + ANCHORS_STORIES_PENDING → ANCHORS` in the seed script while updating the test file to match the new contract — both in the same commit because the test file imports the now-removed exports. Finally, a manual production seed run inserts the 6 new rows (existing 6 are `onConflictDoNothing` no-ops), followed by a verification temp-script and an empty marker commit.

**Tech Stack:** TypeScript, `@vercel/blob` `^2.3.3`, `tsx` for one-off execution, Drizzle ORM (`onConflictDoNothing`), Vitest for the seed tests, Neon Postgres (production seed target).

**Spec:** `docs/superpowers/specs/2026-05-10-stories-reseed-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/advertising/upload-canva-stories-to-blob.ts` | **Create** (one-off) | Reads 6 PNGs from `tmp/canva-stories-2026-05-10/`, uploads to Vercel Blob via `put()` at deterministic keys mirroring `ANCHOR_BLOBS_STORIES_PENDING`. Idempotent (`allowOverwrite: true`). Not under permanent test coverage per spec. |
| `scripts/advertising/seed-canva-anchor-creatives.ts` | **Modify** | Replace two pair of constants with single `ANCHOR_BLOBS` (12 keys) + `ANCHORS` (12 records). Simplify `seed()` to iterate one array. Rewrite header comment. |
| `scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts` | **Modify (atomic with seed)** | All 8 tests updated to import single `ANCHORS`. Two tests rewritten for new counts (12 anchors / 12 inserts). |
| `scripts/advertising/_verify-canva-count.ts` | **Create + delete** (operational, ephemeral) | Temporary verification: `SELECT * FROM advertising_creatives WHERE generator='canva'` and print count + IDs. Deleted after use. |

## Pre-conditions

Before starting Task 1, verify:

- [ ] **`@vercel/blob`** present at `^2.3.3` in `package.json:36` (no install needed).
- [ ] **`BLOB_READ_WRITE_TOKEN`** present in `.env` (already required for production).
- [ ] **Existing 6 feed anchors** already seeded in production via commit `ce1961c` (confirmed by previous session — see memory `project_cowork_followup_shipped.md`).
- [ ] **Working tree clean** on `main` (no uncommitted work from a different feature).

Task 3 has additional pre-conditions documented inline at its top.

---

## Task 1: Upload helper script

**Goal:** Create `scripts/advertising/upload-canva-stories-to-blob.ts` — a one-off helper that uploads 6 Story-format PNGs to Vercel Blob at deterministic keys.

**No TDD:** Per spec §Testing — "No new test files added. Component 1 is one-off and not in scope for permanent test coverage." YAGNI applies.

**Files:**
- Create: `scripts/advertising/upload-canva-stories-to-blob.ts`

- [ ] **Step 1: Create the helper script**

Create `scripts/advertising/upload-canva-stories-to-blob.ts` with these exact contents:

```ts
/**
 * One-off helper: upload 6 Story-format Canva PNGs to Vercel Blob at the
 * deterministic keys wired into seed-canva-anchor-creatives.ts. Idempotent
 * (allowOverwrite: true). Safe to delete after the 12-anchor seed lands.
 *
 * Spec: docs/superpowers/specs/2026-05-10-stories-reseed-design.md
 *
 * Usage:
 *   npx tsx scripts/advertising/upload-canva-stories-to-blob.ts
 *
 * Prerequisites:
 *   - 6 PNGs in tmp/canva-stories-2026-05-10/ matching UPLOAD_MAP keys.
 *   - BLOB_READ_WRITE_TOKEN set in .env.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { put } from '@vercel/blob';

const SOURCE_DIR = 'tmp/canva-stories-2026-05-10';

const UPLOAD_MAP: Record<string, string> = {
  'story_es_accuracy.png':  'advertising/canva-anchors/story_es_accuracy.png',
  'story_es_passport.png':  'advertising/canva-anchors/story_es_passport.png',
  'story_es_freechart.png': 'advertising/canva-anchors/story_es_freechart.png',
  'story_en_accuracy.png':  'advertising/canva-anchors/story_en_accuracy.png',
  'story_en_passport.png':  'advertising/canva-anchors/story_en_passport.png',
  'story_en_freechart.png': 'advertising/canva-anchors/story_en_freechart.png',
};

async function main(): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN is not set');
    process.exit(1);
  }

  const results: Record<string, string> = {};

  for (const [filename, blobKey] of Object.entries(UPLOAD_MAP)) {
    const filePath = join(SOURCE_DIR, filename);
    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch (err) {
      console.error(`Missing PNG: ${filePath}`);
      process.exit(1);
    }
    const { url } = await put(blobKey, buffer, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'image/png',
    });
    results[filename] = url;
    console.log(`  ✓ ${filename} → ${url}`);
  }

  console.log('\nUploaded URLs:');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Verify the script typechecks (no PNGs needed)**

Run: `npm run typecheck`

Expected: Exits 0 with no errors. If errors mention `@vercel/blob`, `Buffer`, or `node:fs/promises`, halt and read the error — these usually indicate a missing type dep, which is unexpected given `@vercel/blob` is already in `package.json`.

> **Note:** We don't smoke-run the script here. Without PNGs in `tmp/canva-stories-2026-05-10/` it would just exit 1 with a "Missing PNG" message — that runtime check is exercised in Task 3 Step 1.

- [ ] **Step 3: Verify the destination directory is gitignored**

Run: `grep -nE '^tmp/?$' .gitignore`

Expected: Output like `37:tmp/` (or similar line number). If the line is missing, halt — PNGs would be tracked. Memory `feedback_brief_vs_code_priority` applies: trust code over brief.

- [ ] **Step 4: Commit**

```bash
git add scripts/advertising/upload-canva-stories-to-blob.ts
git commit -m "$(cat <<'EOF'
feat(advertising/anchors): upload-canva-stories-to-blob one-off helper

Adds scripts/advertising/upload-canva-stories-to-blob.ts — uploads 6
Story-format PNGs from tmp/canva-stories-2026-05-10/ to Vercel Blob at
deterministic keys matching ANCHOR_BLOBS_STORIES_PENDING in the seed
script. Idempotent (allowOverwrite: true). Safe to delete after the
12-anchor seed lands.

Sub-project 1 / Component 1 of the cowork-followup brainstorm series
(2026-05-10). Spec:
docs/superpowers/specs/2026-05-10-stories-reseed-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then: `git push origin main`

Expected: Push succeeds.

---

## Task 2: Merge seed script + sync tests (atomic)

**Goal:** Replace `ANCHORS_FEED` + `ANCHORS_STORIES_PENDING` with a single `ANCHORS` array of 12 records, and update the test file to match — in one commit.

**TDD order:** Rewrite the tests first (red), then refactor the seed script (green), then run all 8 tests, then commit. Atomic because the test imports would crash on `main` otherwise.

**Files:**
- Modify: `scripts/advertising/seed-canva-anchor-creatives.ts` (lines 1-297)
- Modify: `scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts` (lines 1-88)

- [ ] **Step 1: Rewrite the test file to expect the new `ANCHORS` contract**

Replace the entire contents of `scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const valuesSpy = vi.fn().mockReturnValue({
  onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
});
const insertSpy = vi.fn().mockReturnValue({ values: valuesSpy });

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ insert: insertSpy }),
}));

vi.mock('@/shared/lib/schema', () => ({
  advertisingCreatives: { __tableName: 'advertising_creatives' },
}));

beforeEach(() => {
  valuesSpy.mockClear();
  insertSpy.mockClear();
  process.env.FOUNDER_EMAIL = 'founder@estrevia.app';
});

describe('seed-canva-anchor-creatives', () => {
  it('exports 12 anchors', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    expect(ANCHORS).toHaveLength(12);
  });

  it('inserts 12 records when seed() runs', async () => {
    const { seed } = await import('../seed-canva-anchor-creatives');
    await seed();
    expect(insertSpy).toHaveBeenCalledTimes(12);
  });

  it('seed() with dryRun=true performs no INSERTs', async () => {
    const { seed } = await import('../seed-canva-anchor-creatives');
    await seed({ dryRun: true });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('every anchor has status=approved, generator=canva, costUsd=0', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    for (const a of ANCHORS) {
      expect(a.status).toBe('approved');
      expect(a.generator).toBe('canva');
      expect(a.costUsd).toBe(0);
    }
  });

  it('every anchor has all five safety checks pre-passed with severity=info', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    for (const a of ANCHORS) {
      expect(a.safetyChecks).toHaveLength(5);
      const names = a.safetyChecks.map((c: { check_name: string }) => c.check_name);
      expect(names).toEqual(expect.arrayContaining([
        'personal_claim',
        'meta_ad_policy',
        'ocr_text_accuracy',
        'brand_consistency',
        'controversial_symbol',
      ]));
      for (const c of a.safetyChecks) {
        expect(c.passed).toBe(true);
        expect(c.severity).toBe('info');
      }
    }
  });

  it('6 anchors have locale=en and 6 have locale=es', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    expect(ANCHORS.filter((a) => a.locale === 'en')).toHaveLength(6);
    expect(ANCHORS.filter((a) => a.locale === 'es')).toHaveLength(6);
  });

  it('all 12 anchor IDs are unique', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    const ids = ANCHORS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every assetUrl is a Vercel Blob URL', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    for (const a of ANCHORS) {
      expect(a.assetUrl).toMatch(/blob\.vercel-storage\.com/);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail (red)**

Run: `npx vitest run scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts`

Expected: Multiple failures because `ANCHORS` is not yet exported. Likely error messages reference `Cannot read properties of undefined (reading 'toHaveLength')` or similar. This confirms the tests are wired correctly and waiting for the implementation.

- [ ] **Step 3: Rewrite the seed script header comment**

Replace `scripts/advertising/seed-canva-anchor-creatives.ts` lines 1-20 (the entire JSDoc block at file top) with:

```ts
/**
 * One-off seed: insert 12 Canva-generated brand-anchor creatives
 * (6 feed 1080x1350 + 6 stories 1080x1920) into advertising_creatives
 * as pre-approved evergreen records.
 *
 * Idempotent — uses fixed IDs so re-running is a no-op.
 *
 * Usage:
 *   npm run advertising:seed-canva-anchors           # real INSERT
 *   npm run advertising:seed-canva-anchors -- --dry-run   # preview only
 *
 * Prerequisites:
 *   - All 12 Canva PNGs uploaded to Vercel Blob (URLs in ANCHOR_BLOBS)
 *   - Patch 02 applied: 'lead_magnet' archetype + es/en-rarity-7 templates
 */
```

- [ ] **Step 4: Merge the blob-URL constants**

Replace the two constant declarations in `scripts/advertising/seed-canva-anchor-creatives.ts` — the `ANCHOR_BLOBS_FEED` block (lines 38-45 in current HEAD), the JSDoc block immediately following (lines 47-57), and the `ANCHOR_BLOBS_STORIES_PENDING` block (lines 58-65) — with a single `ANCHOR_BLOBS` constant:

```ts
const ANCHOR_BLOBS = {
  feed_es_accuracy:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_es_accuracy.png',
  feed_es_passport:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_es_passport.png',
  feed_es_freechart:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_es_freechart.png',
  feed_en_accuracy:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_en_accuracy.png',
  feed_en_passport:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_en_passport.png',
  feed_en_freechart:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_en_freechart.png',
  story_es_accuracy:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_es_accuracy.png',
  story_es_passport:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_es_passport.png',
  story_es_freechart: 'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_es_freechart.png',
  story_en_accuracy:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_en_accuracy.png',
  story_en_passport:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_en_passport.png',
  story_en_freechart: 'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_en_freechart.png',
} as const;
```

- [ ] **Step 5: Merge the anchor arrays + update references**

Replace the entire block `export const ANCHORS_FEED: AnchorRecord[] = [ ... ];` (lines 83-175 at HEAD), plus the JSDoc above `ANCHORS_STORIES_PENDING` (lines 177-180), plus `export const ANCHORS_STORIES_PENDING: AnchorRecord[] = [ ... ];` (lines 181-273), with a single combined `ANCHORS` export:

```ts
export const ANCHORS: AnchorRecord[] = [
  // ---- Feed (1080x1350) ----
  {
    id: 'anchor-2026-05-10-es-accuracy-feed',
    hookTemplateId: 'es-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.feed_es_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'No es horóscopo. Es tu carta natal real. Astrología sideral con precisión védica. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Descubre tu carta — gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-passport-feed',
    hookTemplateId: 'es-rarity-7',
    assetUrl: ANCHOR_BLOBS.feed_es_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Tu identidad sideral en una sola tarjeta. El Pasaporte Cósmico de Estrevia reúne tu Sol, Luna y Ascendente en signos reales — calculados con precisión védica. Compartible, precisa, tuya.',
    cta: 'Genera el tuyo gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-freechart-feed',
    hookTemplateId: 'es-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.feed_es_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calcula tu carta natal sideral sin costo. Precisión védica al ±0.01° contra Swiss Ephemeris. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Crear mi carta',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-accuracy-feed',
    hookTemplateId: 'en-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.feed_en_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: "Your real birth chart, calibrated to the actual sky — not the calendar's average. Sidereal astrology with Vedic precision (Lahiri ayanamsa, accurate to ±0.01° against the Swiss Ephemeris). No generic horoscopes, no predictions. A tool for reflection, not fortune-telling.",
    cta: 'See your chart — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-passport-feed',
    hookTemplateId: 'en-rarity-7',
    assetUrl: ANCHOR_BLOBS.feed_en_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Your sidereal identity, on a single card. The Estrevia Cosmic Passport gathers your Sun, Moon, and Ascendant in real signs — calculated with Vedic precision. Shareable, precise, yours.',
    cta: 'Generate yours — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-freechart-feed',
    hookTemplateId: 'en-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.feed_en_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calculate your sidereal birth chart, free. Vedic precision to ±0.01° against the Swiss Ephemeris. No sun-sign generalizations, no predictions — an honest look at your real sky.',
    cta: 'Create my chart',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  // ---- Stories (1080x1920) ----
  {
    id: 'anchor-2026-05-10-es-accuracy-stories',
    hookTemplateId: 'es-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.story_es_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'No es horóscopo. Es tu carta natal real. Astrología sideral con precisión védica. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Descubre tu carta — gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-passport-stories',
    hookTemplateId: 'es-rarity-7',
    assetUrl: ANCHOR_BLOBS.story_es_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Tu identidad sideral en una sola tarjeta. El Pasaporte Cósmico de Estrevia reúne tu Sol, Luna y Ascendente en signos reales — calculados con precisión védica. Compartible, precisa, tuya.',
    cta: 'Genera el tuyo gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-freechart-stories',
    hookTemplateId: 'es-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.story_es_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calcula tu carta natal sideral sin costo. Precisión védica al ±0.01° contra Swiss Ephemeris. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Crear mi carta',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-accuracy-stories',
    hookTemplateId: 'en-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.story_en_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: "Your real birth chart, calibrated to the actual sky — not the calendar's average. Sidereal astrology with Vedic precision (Lahiri ayanamsa, accurate to ±0.01° against the Swiss Ephemeris). No generic horoscopes, no predictions. A tool for reflection, not fortune-telling.",
    cta: 'See your chart — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-passport-stories',
    hookTemplateId: 'en-rarity-7',
    assetUrl: ANCHOR_BLOBS.story_en_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Your sidereal identity, on a single card. The Estrevia Cosmic Passport gathers your Sun, Moon, and Ascendant in real signs — calculated with Vedic precision. Shareable, precise, yours.',
    cta: 'Generate yours — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-freechart-stories',
    hookTemplateId: 'en-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.story_en_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calculate your sidereal birth chart, free. Vedic precision to ±0.01° against the Swiss Ephemeris. No sun-sign generalizations, no predictions — an honest look at your real sky.',
    cta: 'Create my chart',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
];
```

- [ ] **Step 6: Simplify `seed()` to iterate the single `ANCHORS` array**

Replace the existing `seed()` function (currently lines 275-292) and the entrypoint block (lines 294-297) with:

```ts
export async function seed(opts: { dryRun?: boolean } = {}): Promise<void> {
  const db = getDb();
  console.log(`Seeding ${ANCHORS.length} anchor creatives…`);
  if (opts.dryRun) {
    console.log('--- DRY RUN — no INSERT performed ---');
    console.log(JSON.stringify(ANCHORS, null, 2));
    return;
  }
  for (const anchor of ANCHORS) {
    await db
      .insert(advertisingCreatives)
      .values(anchor)
      .onConflictDoNothing();
    console.log(`  ✓ ${anchor.id}`);
  }
  console.log('Done.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  seed({ dryRun }).catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 7: Run the tests to verify they pass (green)**

Run: `npx vitest run scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts`

Expected: 8/8 tests pass. Output ends with `Tests  8 passed (8)` or similar. If any test fails, read the message and fix in place — do NOT proceed until green.

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`

Expected: Exits 0 with no errors. If errors mention `ANCHORS_FEED` or `ANCHORS_STORIES_PENDING`, halt — there's an external consumer the spec missed; investigate before continuing.

- [ ] **Step 9: Run the broader advertising test suite to confirm no regressions**

Run: `npx vitest run src/modules/advertising scripts/advertising`

Expected: All tests in scope pass. Per memory `project_cowork_followup_shipped.md` the baseline is green here.

- [ ] **Step 10: Sanity-check dry-run output**

Run: `npx tsx scripts/advertising/seed-canva-anchor-creatives.ts --dry-run | head -5`

Expected first line: `Seeding 12 anchor creatives…` (was `Seeding 6 anchor creatives (feed only)…` before this task). Confirms the count is now 12.

- [ ] **Step 11: Commit**

```bash
git add scripts/advertising/seed-canva-anchor-creatives.ts scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts
git commit -m "$(cat <<'EOF'
feat(advertising/anchors): merge 6 stories into 12-anchor seed + sync tests

Merges ANCHOR_BLOBS_FEED + ANCHOR_BLOBS_STORIES_PENDING into single
ANCHOR_BLOBS (12 keys) and ANCHORS_FEED + ANCHORS_STORIES_PENDING into
single ANCHORS export (12 records, 6 feed + 6 stories). seed() now
iterates one array. Tests updated atomically: 8/8 still green, two
test names rewritten for new counts (12 anchors / 12 inserts).

MUST NOT land before Story PNGs are at the deterministic Blob keys —
production seed would point at 404 otherwise. See spec halt criteria.

Sub-project 1 / Components 2+3 of the cowork-followup brainstorm series
(2026-05-10). Spec:
docs/superpowers/specs/2026-05-10-stories-reseed-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then: `git push origin main`

Expected: Push succeeds. CI on the push should be green (8/8 unit tests for this file plus the broader advertising suite).

---

## Task 3: Production seed run + marker commit (operational)

**Goal:** Insert the 6 new Story anchors into production `advertising_creatives` (existing 6 feed rows are `onConflictDoNothing` no-ops), verify the DB end-state is exactly 12 canva anchors, and land an empty marker commit.

**This task requires founder action between Task 2 and the seed run.** Steps 1-3 below are explicit halt-checkpoints; do not run Step 4 (real seed) until Steps 1-3 are confirmed.

**Files:**
- Create then delete: `scripts/advertising/_verify-canva-count.ts` (ephemeral)
- Commit (empty): marker commit for traceability

- [ ] **Step 1: HALT — Confirm Story PNGs are at the deterministic Blob keys**

This is a halt-checkpoint, NOT an automated step. Before continuing:

1. Founder must have created 6 Story-format designs in Canva Brand Kit `kAGT_ANQrn8`.
2. Founder must have exported PNGs to `tmp/canva-stories-2026-05-10/` with these exact filenames:
   - `story_es_accuracy.png`, `story_es_passport.png`, `story_es_freechart.png`
   - `story_en_accuracy.png`, `story_en_passport.png`, `story_en_freechart.png`
3. Run the upload helper:

```bash
npx tsx scripts/advertising/upload-canva-stories-to-blob.ts
```

Expected output: 6 ` ✓ story_*.png → <url>` lines, then a JSON block. Every URL must exactly match the corresponding `ANCHOR_BLOBS` value in `scripts/advertising/seed-canva-anchor-creatives.ts`.

4. Smoke-test ONE of the URLs is reachable:

```bash
curl -sI 'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_es_accuracy.png' | head -1
```

Expected: `HTTP/2 200`. If 404, halt and re-investigate.

**If any of the 4 sub-steps above fails, STOP. Write a checkpoint document under `.cowork-meta/stories-reseed-<TIMESTAMP>/` with the failure detail and report to founder. Do NOT proceed.**

- [ ] **Step 2: Dry-run the production seed**

Run: `npx tsx scripts/advertising/seed-canva-anchor-creatives.ts --dry-run | head -3`

Expected first line: `Seeding 12 anchor creatives…`. Confirms the merged constant is in place.

- [ ] **Step 3: Run the real production seed**

Run: `npx tsx scripts/advertising/seed-canva-anchor-creatives.ts`

Expected output: 12 lines `  ✓ anchor-2026-05-10-<locale>-<theme>-<feed|stories>`, then `Done.`. The 6 feed rows are `onConflictDoNothing` no-ops (already in production from commit `ce1961c`); the 6 story rows are real inserts.

If the script throws a DB error, halt — read the message before retrying. Idempotency means a clean re-run is safe after fixes.

- [ ] **Step 4: Create the verification temp-script**

Create `scripts/advertising/_verify-canva-count.ts` (the leading `_` marks it as ephemeral):

```ts
/**
 * Ephemeral verification: count + list canva-generator rows in
 * advertising_creatives. Delete after the 12-anchor seed is confirmed.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';

async function main(): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: advertisingCreatives.id })
    .from(advertisingCreatives)
    .where(eq(advertisingCreatives.generator, 'canva'));
  console.log(`${rows.length} canva anchors:`);
  for (const r of rows.sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`  ${r.id}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 5: Run the verification**

Run: `npx tsx scripts/advertising/_verify-canva-count.ts`

Expected output:

```
12 canva anchors:
  anchor-2026-05-10-en-accuracy-feed
  anchor-2026-05-10-en-accuracy-stories
  anchor-2026-05-10-en-freechart-feed
  anchor-2026-05-10-en-freechart-stories
  anchor-2026-05-10-en-passport-feed
  anchor-2026-05-10-en-passport-stories
  anchor-2026-05-10-es-accuracy-feed
  anchor-2026-05-10-es-accuracy-stories
  anchor-2026-05-10-es-freechart-feed
  anchor-2026-05-10-es-freechart-stories
  anchor-2026-05-10-es-passport-feed
  anchor-2026-05-10-es-passport-stories
```

If the count is not exactly 12, halt — investigate `onConflictDoNothing` behavior (likely ID collision with a manually-inserted row, or a row with a different `generator` field). Per spec halt criteria.

- [ ] **Step 6: Delete the verification temp-script**

Run: `rm scripts/advertising/_verify-canva-count.ts`

- [ ] **Step 7: Land the empty marker commit**

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(advertising/anchors): seeded 6 stories anchors in DB

Production seed run on $(date -u '+%Y-%m-%dT%H:%MZ'): 6 stories rows
inserted; 6 existing feed rows onConflictDoNothing no-ops; verified
12 total canva anchors via _verify-canva-count.ts (temp script,
deleted in same workflow).

Sub-project 1 / Component 4 of the cowork-followup brainstorm series
(2026-05-10). Closes the 12-anchor seed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then: `git push origin main`

Expected: Push succeeds. Sub-project 1 is complete.

---

## Halt criteria (reference)

Per spec §Halt criteria, halt the plan and write a checkpoint to `.cowork-meta/stories-reseed-<TIMESTAMP>/` if:

- Any `tmp/canva-stories-2026-05-10/story_*.png` is missing after the helper's file-check (Step 1.1 in Task 3).
- Any helper-returned URL diverges from `ANCHOR_BLOBS_STORIES_PENDING` constants (key naming drift) — Task 3 Step 1.
- Any of the 8 test updates in Task 2 Step 1 fail unexpectedly (e.g., a 9th test exists that was missed) — Task 2 Step 7.
- Production seed reports more than 6 inserts (means existing IDs collided or schema changed since 2026-05-10) — Task 3 Step 3.
- Post-seed verification count is not exactly 12 — Task 3 Step 5.

In every halt case: write the checkpoint and do NOT push commits without founder review.

---

## Self-review

**Spec coverage:**
- ✅ Component 1 (`upload-canva-stories-to-blob.ts`) — Task 1
- ✅ Component 2 (seed-script merge) — Task 2 Steps 3-6
- ✅ Component 3 (test-file sync) — Task 2 Step 1
- ✅ Component 4 (production seed + marker commit) — Task 3
- ✅ Data flow §1-6 — encoded in Task ordering (founder PNG export = Task 3 Step 1 pre-condition; upload = Task 3 Step 1.3; seed merge = Task 2; verify = Task 3 Step 5; marker = Task 3 Step 7).
- ✅ Error handling table — Halt criteria section + inline halt checks throughout Task 3.
- ✅ Testing (unit + manual) — Task 2 Step 7 unit run; Task 3 Steps 2-5 manual verification.
- ✅ Commit sequence (3 commits) — Task 1 Step 4, Task 2 Step 11, Task 3 Step 7.
- ✅ Out-of-scope items respected — anchor record contents unchanged (Task 2 Step 5 copies them verbatim from current HEAD); no new deps; no Stories placement targeting; no AI Content Label logic (that's downstream in `upload-client.ts`).
- ✅ Pre-conditions — listed under "Pre-conditions" heading + Task 3 Step 1 founder action.

**Placeholder scan:** No "TBD", "TODO", "implement later", "appropriate error handling", "similar to Task N", or unreferenced types. All exact paths, line numbers, code blocks, and commands present.

**Type consistency:** All references use the same names consistently — `ANCHOR_BLOBS` (constant, 12 keys), `ANCHORS` (export, 12 records), `AnchorRecord` (interface, unchanged from current HEAD), `seed(opts: { dryRun?: boolean })` (function signature, unchanged). `UPLOAD_MAP` in Task 1 mirrors `ANCHOR_BLOBS.story_*` keys in Task 2.

**Atomicity check:** Task 2 changes both the seed script and its test file in one commit (Step 11 stages both files). This avoids an intermediate broken state on `main`.

**Ordering check:** Task 1 (helper script) ships before founder action — harmless without PNGs. Task 2 (seed merge) is independent of PNGs at the code level (tests use mocks) but MUST NOT land before PNGs are uploaded because production seed would 404 — enforced by Task 3 Step 1 being a halt-checkpoint, not an automated step. Task 3 is gated on Steps 1-3 succeeding before Step 4 (real seed).
