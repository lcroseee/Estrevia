# Stories Re-seed Design

> **Sub-project 1 of 3** in the cowork-followup brainstorm series (2026-05-10).
> Sub-project 2 (Patch 04 apply) and Sub-project 3 (Phase 4 `ClaudeBrandVoiceClient`) follow.
>
> **Status:** Brainstorming complete. Implementation plan to be written via `superpowers:writing-plans` after spec approval.

## Goal

Complete the 12-anchor brand-anchor seed by adding 6 Story-format (1080×1920) Canva anchor creatives to `advertising_creatives`. Unblocks Stories placement targeting in future Meta Ads launches (currently feed-only).

## Background

On 2026-05-10 the Cowork followup session seeded 6 Feed-format (1080×1350) Canva anchor creatives into `advertising_creatives` (commit `ce1961c`). The matching 6 Story-format records were preserved in `scripts/advertising/seed-canva-anchor-creatives.ts` as `ANCHORS_STORIES_PENDING` (lines 181–273), explicitly skipped by `seed()` because the corresponding Canva Brand Kit `kAGT_ANQrn8` does not contain Story-format designs and the blob keys at `ANCHOR_BLOBS_STORIES_PENDING` (lines 58–65) currently 404.

This spec describes the work required after the founder creates the 6 Story-format Canva designs and exports the PNGs locally. The work has 4 components: one new upload helper script, modifications to the existing seed script, synchronous test updates, and a single manual production seed run.

## Architecture

```
[Canva web UI]                                              ← founder creates 6 designs in Brand Kit kAGT_ANQrn8
     │
     ▼
tmp/canva-stories-2026-05-10/                               ← gitignored (tmp/ in .gitignore:37)
  story_es_accuracy.png    story_en_accuracy.png
  story_es_passport.png    story_en_passport.png
  story_es_freechart.png   story_en_freechart.png
     │
     ▼
scripts/advertising/upload-canva-stories-to-blob.ts          ← Component 1 (new, one-off)
     • reads 6 PNG paths from tmp/canva-stories-2026-05-10/
     • @vercel/blob put() with deterministic keys matching
       ANCHOR_BLOBS_STORIES_PENDING values
     • access: 'public', addRandomSuffix: false, allowOverwrite: true
     • prints resulting URLs (must match ANCHOR_BLOBS_STORIES_PENDING)
     ▼
Vercel Blob (zproaddipyjwfa81.public.blob.vercel-storage.com)
     │
     ▼
scripts/advertising/seed-canva-anchor-creatives.ts           ← Component 2 (modify)
     • merge ANCHOR_BLOBS_FEED + ANCHOR_BLOBS_STORIES_PENDING → ANCHOR_BLOBS (12 keys)
     • merge ANCHORS_FEED + ANCHORS_STORIES_PENDING → ANCHORS (12 records)
     • rewrite header comment (drop "feed only" / "deferred" narrative)
     • seed() iterates the single ANCHORS array
     │
     ├─→ __tests__/seed-canva-anchor-creatives.test.ts        ← Component 3 (sync)
     │     • 8 tests: replace ANCHORS_FEED + ANCHORS_STORIES_PENDING with ANCHORS
     │     • 2 tests rewritten:
     │       - "exports 6 feed + 6 deferred (12 total)" → "exports 12 anchors"
     │       - "inserts only 6 feed records (stories deferred)" → "inserts 12"
     │
     └─→ Production seed run                                   ← Component 4 (manual, idempotent)
           npx tsx scripts/advertising/seed-canva-anchor-creatives.ts
           • onConflictDoNothing protects existing 6 feed rows
           • inserts 6 new stories rows
           • DB end state: 12 canva anchors
```

## Components

### Component 1 — `scripts/advertising/upload-canva-stories-to-blob.ts` (new)

**Purpose:** One-off helper to upload 6 Story-format PNGs to Vercel Blob at the deterministic keys already wired into the seed script (`ANCHOR_BLOBS_STORIES_PENDING`).

**Interface:**

```ts
// Hardcoded source directory (one-off):
const SOURCE_DIR = 'tmp/canva-stories-2026-05-10';

// Hardcoded filename → blob key map (mirrors ANCHOR_BLOBS_STORIES_PENDING in seed script):
const UPLOAD_MAP: Record<string, string> = {
  'story_es_accuracy.png':  'advertising/canva-anchors/story_es_accuracy.png',
  'story_es_passport.png':  'advertising/canva-anchors/story_es_passport.png',
  'story_es_freechart.png': 'advertising/canva-anchors/story_es_freechart.png',
  'story_en_accuracy.png':  'advertising/canva-anchors/story_en_accuracy.png',
  'story_en_passport.png':  'advertising/canva-anchors/story_en_passport.png',
  'story_en_freechart.png': 'advertising/canva-anchors/story_en_freechart.png',
};
```

**Behavior:**
- Reads `BLOB_READ_WRITE_TOKEN` from `process.env`. Exits 1 with clear message if missing.
- Reads each PNG via `fs.readFile`. Exits 1 with the missing filename if any file absent.
- Calls `put(blobKey, buffer, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/png' })` from `@vercel/blob`.
- Prints resulting URLs as a JSON object. Every URL must exactly match the corresponding `ANCHOR_BLOBS_STORIES_PENDING[key]` literal in the seed script.

**Idempotency:** `allowOverwrite: true` + deterministic keys = re-running is a safe no-op when files unchanged (re-uploads the same content to the same key).

**Header comment:** One short block (≤8 lines): marks the script as one-off, references this spec, notes it can be deleted after stories ship. No multi-paragraph docstring.

### Component 2 — `scripts/advertising/seed-canva-anchor-creatives.ts` (modify)

**Changes:**

1. **Merge blob maps:** Replace `ANCHOR_BLOBS_FEED` + `ANCHOR_BLOBS_STORIES_PENDING` with single `ANCHOR_BLOBS` (12 keys). Keep alphabetical order within each format (feed first, stories second) to minimize diff size.
2. **Merge anchor arrays:** Replace `export const ANCHORS_FEED` + `export const ANCHORS_STORIES_PENDING` with single `export const ANCHORS: AnchorRecord[]` (12 records). Order: 6 feed (existing) + 6 stories (from pending).
3. **Update references:** `seed()` body iterates `ANCHORS` instead of `ANCHORS_FEED`.
4. **Simplify dry-run output:** Drop the "WOULD SKIP: stories deferred" line.
5. **Rewrite header comment:** From "One-off seed: insert 6 Canva-generated brand-anchor creatives (feed format, 1080×1350)" → "One-off seed: insert 12 Canva-generated brand-anchor creatives (6 feed 1080×1350 + 6 stories 1080×1920)". Drop "Deferred" section. Keep "Idempotent — uses fixed IDs so re-running is a no-op." line.

**Out of scope:** Anchor record contents (copy, CTA, hookTemplateId) are unchanged — they were finalized in the original Cowork-audit session and committed in `739274f` + `ce1961c`.

### Component 3 — `scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts` (sync)

**Atomic with Component 2** — both land in the same commit.

**Changes per test:**

| Test name (current) | New name | What changes |
|---|---|---|
| `exports 6 feed anchors and 6 deferred story anchors (12 total)` | `exports 12 anchors` | Import `ANCHORS` (single). Assert length 12. Drop the two-array assertion. |
| `inserts only 6 feed records when seed() runs (stories deferred)` | `inserts 12 records when seed() runs` | `expect(mockInsert.mock.calls).toHaveLength(12)` instead of 6. |
| `seed() with dryRun=true performs no INSERTs` | (unchanged) | No code change; still asserts INSERT mock not called. |
| `every anchor (feed + stories) has status=approved, generator=canva, costUsd=0` | `every anchor has status=approved, generator=canva, costUsd=0` | Iterate `ANCHORS` (single array) instead of `[...ANCHORS_FEED, ...ANCHORS_STORIES_PENDING]`. |
| `every anchor has all five safety checks pre-passed with severity=info` | (unchanged title) | Same iteration change. |
| `6 anchors have locale=en and 6 have locale=es across both arrays` | `6 anchors have locale=en and 6 have locale=es` | Same iteration change. |
| `anchor IDs are unique across feed + stories` | `all 12 anchor IDs are unique` | Same iteration change. |
| `every assetUrl is a Vercel Blob URL` | (unchanged title) | Same iteration change. |

**Expected:** 8/8 tests pass after change. No new tests added.

### Component 4 — Production seed run (manual)

**When:** After Components 1+2+3 land AND Component 1 has been run successfully (PNGs uploaded, URLs verified to match `ANCHOR_BLOBS` constants).

**Command:**

```bash
npx tsx scripts/advertising/seed-canva-anchor-creatives.ts
```

**Expected output:** 12 lines `✓ anchor-2026-05-10-{locale}-{theme}-{feed|stories}`. The 6 feed rows are `onConflictDoNothing` no-ops; the 6 stories rows are real inserts.

**Verification:** Same pattern as the previous session — temporary `_verify-canva-count.ts` script that queries `db.select().from(advertisingCreatives).where(eq(advertisingCreatives.generator, 'canva'))` and prints count + IDs. Expected: `12 canva anchors` with all 12 IDs listed. Delete temp script after use.

**Marker commit:** Empty commit after verification: `chore(advertising/anchors): seeded 6 stories anchors in DB`.

## Data flow

1. **Founder:** Creates 6 Story-format designs in Canva Brand Kit `kAGT_ANQrn8`, exports PNGs → `tmp/canva-stories-2026-05-10/story_*.png` (6 files).
2. **Claude Code:** Runs Component 1 (`upload-canva-stories-to-blob.ts`) → 6 PNGs land at Vercel Blob keys matching `ANCHOR_BLOBS_STORIES_PENDING`.
3. **Verification:** Founder OR Claude Code `curl -I` against any one of the 6 URLs → expects HTTP 200.
4. **Claude Code:** Lands Component 2+3 commit (seed merge + tests sync). CI green on 8/8 tests.
5. **Claude Code:** Runs Component 4 (production seed) → DB now has 12 canva anchors.
6. **Claude Code:** Lands Component 4 marker commit. Push.

## Error handling

| Failure | Detection | Response |
|---|---|---|
| PNG missing in `tmp/canva-stories-2026-05-10/` | Component 1 `fs.readFile` ENOENT | Exit 1 with filename. Halt — founder re-exports from Canva. |
| `BLOB_READ_WRITE_TOKEN` not set | Component 1 startup check | Exit 1 with env var name. Halt — founder sets env. |
| Blob `put()` HTTP error | Component 1 catch block | Propagate (no silent skip). Exit 1. |
| Component 1 returned URL ≠ `ANCHOR_BLOBS_STORIES_PENDING` constant | Manual visual diff of script output | Halt before Component 2 commit. Investigate key mismatch. |
| Component 2 + 3 commit lands before Component 1 PNG upload | Tests still pass (mock DB), but production seed would insert 404 URLs | Plan ordering enforces upload before merge commit; founder verifies in plan checkpoint. |
| Production seed fails (DB error) | Component 4 throws | No marker commit. Investigate. Re-run after fix (idempotent). |
| Verification shows < 12 canva anchors | Manual count | Investigate `onConflictDoNothing` behavior (likely existing ID collision). |

## Testing

**Unit tests (Component 3):**
- 8 tests updated in `__tests__/seed-canva-anchor-creatives.test.ts`. All pass post-edit.
- Run via `npx vitest run scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts`.

**Manual (Component 1, 4):**
- Component 1: dry-run by inspecting `console.log` output before `put()` calls (no built-in dry-run flag — script is short enough that visual diff suffices).
- Component 4: dry-run via `npx tsx scripts/advertising/seed-canva-anchor-creatives.ts --dry-run` (existing flag) before real seed.
- Post-seed verification: temp `_verify-canva-count.ts` (see Component 4 section).

**No new test files added.** Component 1 is one-off and not in scope for permanent test coverage.

## Commit sequence

```
1.  feat(advertising/anchors): upload-canva-stories-to-blob one-off helper
    └─ Component 1 only. Can ship before founder creates Canva designs.

2.  feat(advertising/anchors): merge 6 stories into 12-anchor seed + sync tests
    └─ Components 2+3 atomic.
    └─ MUST NOT land before PNGs in Blob (production seed would point at 404).

3.  chore(advertising/anchors): seeded 6 stories anchors in DB
    └─ Empty marker commit after manual Component 4 run.
```

## Out of scope

- **Anchor record contents** (copy, CTA, hookTemplateId, locale). Already finalized; not editable in this work.
- **Canva design creation.** Founder-driven manual work in Canva web UI. This spec describes the post-design workflow.
- **`@vercel/blob` dependency.** Already in `package.json:36` at `^2.3.3`. No new deps.
- **Generic anchor batch uploader.** Approach B in brainstorm was rejected (YAGNI — no 3rd batch planned). If 3rd batch appears, parameterize at that point.
- **Stories placement targeting in launch script.** Separate concern (`scripts/advertising/setup-meta-campaign.ts` or similar). This spec only adds the creative rows; launch logic is downstream.
- **AI Content Label on Stories creatives.** This spec only inserts rows into `advertising_creatives` (DB-only operation). The AI Content Label is set later by `publishApprovedService` when a creative is uploaded to Meta via `meta-graph-api/upload-client.ts` (label fix landed in commit `83b43c0`). The 6 new stories rows have `generator: 'canva'`, so `isAiGenerated()` returns `true`, so the upload pipeline will tag them correctly when publish time comes — but that's downstream of this spec.

## Pre-conditions

The plan generated from this spec assumes:
1. Founder has created 6 Story-format Canva designs in Brand Kit `kAGT_ANQrn8` AND exported PNGs to `tmp/canva-stories-2026-05-10/` with filenames matching `UPLOAD_MAP` keys. (Component 1 is harmless to run before this — it just fails with a clear error.)
2. `BLOB_READ_WRITE_TOKEN` is set in `.env` (already required for production; not new).
3. `outputs/cowork-handoff-2026-05-10/` cowork artifacts are committed (they are — commit `dc80a45`).

## Halt criteria

Halt the plan and report if:
- Any `tmp/canva-stories-2026-05-10/story_*.png` is missing after Component 1 startup file-check.
- Any Component 1 returned URL diverges from `ANCHOR_BLOBS_STORIES_PENDING` constants (key naming drift).
- Any of the 8 test updates in Component 3 fail unexpectedly (e.g., a 9th test exists that the spec missed).
- Production seed (`npx tsx scripts/advertising/seed-canva-anchor-creatives.ts`) reports more than 6 inserts (means existing IDs collided or schema changed since 2026-05-10).
- Post-seed verification count is not exactly 12.

In all halt cases: write a checkpoint document under `.cowork-meta/stories-reseed-<TIMESTAMP>/` with the failure detail. Do NOT push commits without founder review.
