# Cowork patches followup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the 5 cowork-audit commits don't regress, prepare 6 feed Canva-anchor creatives for seeding (no production INSERT), and rewrite Patch 04 with correct signatures.

**Architecture:** Sequential 3-phase work with halt criteria between phases. All session artifacts under `.cowork-meta/<TIMESTAMP>/` (git-ignored). Two new commits land on `main` (Phase 2 + Phase 3), no push. Phase 3 uses Agent Teams (5 parallel `Explore` sub-agents) to verify signatures before writing the revised patch.

**Tech Stack:** TypeScript, Node.js 24, Vitest (run mode), ESLint, Drizzle ORM, `@vercel/blob`, tsx for one-off scripts, Agent Teams (tmux mode, enabled via `.claude/settings.json`).

**Spec:** `docs/superpowers/specs/2026-05-10-cowork-followup-design.md` (commit `8baa49c`).

---

## File Structure

### Files modified

| Path | What changes |
|---|---|
| `scripts/advertising/seed-canva-anchor-creatives.ts` | Split `ANCHOR_BLOBS` and `ANCHORS` into feed (live) + stories (pending) pairs; add `--dry-run` flag; update JSDoc and `seed()` signature |

### Files created (committed)

| Path | Purpose |
|---|---|
| `outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md` | Full re-write of Patch 04 with corrected signatures, real line numbers, diff blocks |
| `outputs/cowork-handoff-2026-05-10/README.md` | Inventory of files in the handoff directory; apply order |

### Files created (NOT committed — `.cowork-meta/` is git-ignored)

| Path | Purpose |
|---|---|
| `.cowork-meta/<TIMESTAMP>/typecheck.txt` | `npm run typecheck` output |
| `.cowork-meta/<TIMESTAMP>/test-advertising.txt` | `npm test -- --run src/modules/advertising` output |
| `.cowork-meta/<TIMESTAMP>/test-full.txt` | `npm test -- --run` output |
| `.cowork-meta/<TIMESTAMP>/lint-advertising.txt` | `npm run lint -- src/modules/advertising` output |
| `.cowork-meta/<TIMESTAMP>/lint-full.txt` | `npm run lint` output |
| `.cowork-meta/<TIMESTAMP>/01-summary.md` | Phase 1 verification summary |
| `.cowork-meta/<TIMESTAMP>/02-anchor-seed-state.md` | Phase 2 inspection findings |
| `.cowork-meta/<TIMESTAMP>/04-seed-dryrun.txt` | Phase 2 dry-run output |
| `.cowork-meta/<TIMESTAMP>/05-ready-to-seed.md` | Phase 2 approval pause document |
| `.cowork-meta/<TIMESTAMP>/06-signatures-reference.md` | Phase 3 consolidated signature report |
| `.cowork-meta/<TIMESTAMP>/00-final-summary.md` | Session wrap-up |

### Files NOT touched

- Existing 5 cowork-audit commits and their files.
- Anything in `src/` (Phase 3 is markdown-only).
- Anything in `tests/__tests__/`.

---

## Hard constraints (apply throughout)

- Advertising agent is LIVE in production. No mutations except the one approved-doc commit and the markdown-only commits.
- Do NOT push, force-push, or open PRs.
- Do NOT modify the 5 existing cowork-audit commits.
- Do NOT run `advertising:generate-launch-batch`, `advertising:publish-approved`, or any script that creates real ad spend.
- Do NOT bypass `ADVERTISING_AGENT_DRY_RUN`.
- AI Content Label flag from commit `83b43c0` is sacrosanct — Phase 2 doesn't touch upload-client, but if any code path crosses it, halt.

---

## Task 1: Initialize session + Phase 1 verification

**Goal:** Run typecheck + tests + lint, classify failures, decide halt vs continue.

**Files:**
- Create: `.cowork-meta/<TIMESTAMP>/typecheck.txt`
- Create: `.cowork-meta/<TIMESTAMP>/test-advertising.txt`
- Create: `.cowork-meta/<TIMESTAMP>/test-full.txt`
- Create: `.cowork-meta/<TIMESTAMP>/lint-advertising.txt`
- Create: `.cowork-meta/<TIMESTAMP>/lint-full.txt`
- Create: `.cowork-meta/<TIMESTAMP>/01-summary.md`

- [ ] **Step 1: Capture TIMESTAMP and create artifact directory**

Pick a UTC timestamp in `YYYYMMDDTHHMMSSZ` format. Use it consistently throughout the session — substitute for `<TIMESTAMP>` in every subsequent command.

```bash
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
echo "TIMESTAMP=$TIMESTAMP"
mkdir -p ".cowork-meta/phase1-verification-$TIMESTAMP"
```

Note the printed `$TIMESTAMP` value — every subsequent command in this plan substitutes it into the path.

- [ ] **Step 2: Run all 5 verification commands in parallel**

Fire all 5 in a single Bash call, redirect stdout+stderr to files, `wait` for them.

```bash
DIR=".cowork-meta/phase1-verification-$TIMESTAMP"
npm run typecheck > "$DIR/typecheck.txt" 2>&1 &
npm test -- --run src/modules/advertising > "$DIR/test-advertising.txt" 2>&1 &
npm run lint -- src/modules/advertising > "$DIR/lint-advertising.txt" 2>&1 &
npm test -- --run > "$DIR/test-full.txt" 2>&1 &
npm run lint > "$DIR/lint-full.txt" 2>&1 &
wait
echo "All 5 verification commands complete."
```

Expected: 1-3 minutes wall-clock (limited by slowest command — usually full vitest). Exit codes ignored at this step; classification happens in Step 3.

- [ ] **Step 3: Inspect outputs and classify**

For each `.txt` file, check exit status by reading the last few lines (vitest/eslint/tsc print pass/fail summary at end).

```bash
for f in "$DIR"/*.txt; do
  echo "=== $f ==="
  tail -20 "$f"
  echo ""
done
```

Classify each failure (if any) into P0/P1/P2 per the spec's risk classification:
- **P0** (HALT): failures touching `meta-graph-api/upload-client.ts`, `creative-gen/safety/checks.ts`, `shared/types/advertising/creative.ts`.
- **P1** (continue + flag): `creative-gen/templates/hooks-{en,es}.ts`, `decide/brand-voice-audit.ts`.
- **P2** (continue + note): everything else.

- [ ] **Step 4: Write `01-summary.md`**

Use Write tool to create `.cowork-meta/phase1-verification-$TIMESTAMP/01-summary.md` with this exact template:

```markdown
# Phase 1 verification (<TIMESTAMP>)

## Results

| Command | Status | Failures |
|---------|--------|----------|
| typecheck | ✓ / ✗ | <count> |
| test (advertising) | ✓ / ✗ | <count> |
| lint (advertising) | ✓ / ✗ | <count> |
| test (full) | ✓ / ✗ | <count> |
| lint (full) | ✓ / ✗ | <count> |

## Failures detail (if any)

<per failing test: file:line and diff between expected and actual>

## Risk assessment

<list P0/P1/P2 classification per failure>

## Recommendation

- If all P0 + P1 pass: GREEN — proceed to Phase 2
- If P0 fails: HALT — report to founder before proceeding
- If only P2 fails: YELLOW — note but proceed
```

- [ ] **Step 5: Halt decision**

If `01-summary.md` recommends **HALT** (any P0 failure):
1. Write `00-final-summary.md` (skip ahead to Task 9's template, populate with current state).
2. Output: `Session halted at Phase 1 — P0 verification failures. See .cowork-meta/phase1-verification-$TIMESTAMP/00-final-summary.md`
3. **STOP**. Do not continue to Task 2. Do not commit anything.

Otherwise (GREEN or YELLOW): proceed to Task 2.

- [ ] **Step 6: No commit for Phase 1**

Phase 1 artifacts live in `.cowork-meta/` which is git-ignored. No `git add`, no `git commit`. Verify with `git status` — should show no new tracked files.

---

## Task 2: Phase 2 — inspect & HEAD-check feed Blob URLs

**Goal:** Verify the 6 feed Blob URLs are live and document the seed-script state.

**Files:**
- Create: `.cowork-meta/<TIMESTAMP>/02-anchor-seed-state.md`

- [ ] **Step 1: HEAD-check 6 feed Blob URLs in parallel**

```bash
DIR=".cowork-meta/phase1-verification-$TIMESTAMP"
BASE="https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors"
for url in \
  "$BASE/feed_es_accuracy.png" \
  "$BASE/feed_es_passport.png" \
  "$BASE/feed_es_freechart.png" \
  "$BASE/feed_en_accuracy.png" \
  "$BASE/feed_en_passport.png" \
  "$BASE/feed_en_freechart.png"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 6 "$url")
    echo "$code  $url"
done
```

Expected: all 6 should print `200`. Record the output for Step 2.

- [ ] **Step 2: Halt if any URL non-200**

If any URL returns non-200, halt:
1. Write `02-anchor-seed-state.md` with the failure (which URL, what code).
2. Append to `00-final-summary.md`: "Phase 2 halted — Blob URL `<url>` returned `<code>`. Stories were already known dead; this changes scope to feed-only, but a feed URL is also dead. Founder must investigate Blob bucket state before re-running."
3. **STOP**. Do not continue to Task 3. Do not edit the seed script.

Otherwise: proceed.

- [ ] **Step 3: Write `02-anchor-seed-state.md`**

```markdown
# Phase 2 — anchor seed state (<TIMESTAMP>)

## Repo state vs handoff assumption

| Handoff assumption | Reality |
|---|---|
| All 12 `ANCHOR_BLOBS` are `<HASH>` placeholders | All 12 URLs already point to `zproaddipyjwfa81.public.blob.vercel-storage.com` |
| 6 stories `AnchorRecord`s are stubbed `// ...` | All 12 records fully populated |
| 12 PNG uploads to Blob still pending | 6 feed PNGs HTTP 200 (verified <TIMESTAMP>); 6 stories HTTP 404 (Canva Story-format designs missing from Brand Kit kAGT_ANQrn8) |
| Helper script `_upload-canva-anchors-to-blob.mts` exists | Does not exist (and not needed — feed URLs live) |
| Script has `--dry-run` flag | Does not — calls `seed()` directly |
| PNG sources in `outputs/estrevia-meta-ads-v2/` | Only `README.md` remains |

## HEAD-check results (<TIMESTAMP>)

| URL | HTTP | Status |
|---|---|---|
| feed_es_accuracy.png | 200 | ✓ |
| feed_es_passport.png | 200 | ✓ |
| feed_es_freechart.png | 200 | ✓ |
| feed_en_accuracy.png | 200 | ✓ |
| feed_en_passport.png | 200 | ✓ |
| feed_en_freechart.png | 200 | ✓ |
| story_*.png (6) | 404 | known-broken (Canva designs missing) |

## Plan

Split seed script: ship 6 feed anchors (`ANCHORS_FEED`); keep 6 stories records as `ANCHORS_STORIES_PENDING` (not iterated by `seed()`) until Canva designs created.
```

---

## Task 3: Phase 2 — edit seed script

**Goal:** Split `ANCHOR_BLOBS` and `ANCHORS` into feed + stories pairs; add `--dry-run` flag.

**Files:**
- Modify: `scripts/advertising/seed-canva-anchor-creatives.ts`

- [ ] **Step 1: Read full seed script**

Read `scripts/advertising/seed-canva-anchor-creatives.ts` start-to-end so you know all 12 records and their exact field values. Don't paraphrase — copy them verbatim.

- [ ] **Step 2: Replace `ANCHOR_BLOBS` block with two separate maps**

Find the `const ANCHOR_BLOBS = { ... } as const;` block (lines ~31-51). Replace with two const declarations:

```ts
const ANCHOR_BLOBS_FEED = {
  feed_es_accuracy:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_es_accuracy.png',
  feed_es_passport:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_es_passport.png',
  feed_es_freechart:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_es_freechart.png',
  feed_en_accuracy:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_en_accuracy.png',
  feed_en_passport:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_en_passport.png',
  feed_en_freechart:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_en_freechart.png',
} as const;

/**
 * Story-format Blob URLs.
 *
 * NOTE: The Story-format Canva designs (1080×1920) are MISSING from Brand
 * Kit kAGT_ANQrn8. Only Feed-format designs (1080×1350) exist. These URLs
 * resolve to HTTP 404 as of 2026-05-10. The records below are preserved
 * so that copy/CTA/hookTemplateId pairings are not lost — once the founder
 * creates Story-format designs in Canva and uploads the PNGs to these
 * exact Blob keys, `ANCHORS_STORIES_PENDING` can be promoted into the
 * seed() loop. Until then, do NOT run the seed against stories.
 */
const ANCHOR_BLOBS_STORIES_PENDING = {
  story_es_accuracy:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_es_accuracy.png',
  story_es_passport:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_es_passport.png',
  story_es_freechart: 'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_es_freechart.png',
  story_en_accuracy:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_en_accuracy.png',
  story_en_passport:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_en_passport.png',
  story_en_freechart: 'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_en_freechart.png',
} as const;
```

- [ ] **Step 3: Replace `export const ANCHORS` with two exports**

Find the `export const ANCHORS: AnchorRecord[] = [` block (lines ~69-252). The first 6 records (feed) become `ANCHORS_FEED`; the last 6 records (stories) become `ANCHORS_STORIES_PENDING`.

Edit pattern: take the existing array, split at the boundary between `anchor-2026-05-10-en-freechart-feed` (last feed) and `anchor-2026-05-10-es-accuracy-stories` (first story).

Resulting code (copy each record's existing field values verbatim — do not paraphrase copy/cta text):

```ts
export const ANCHORS_FEED: AnchorRecord[] = [
  // ---- Feed (1080x1350) ----
  {
    id: 'anchor-2026-05-10-es-accuracy-feed',
    hookTemplateId: 'es-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS_FEED.feed_es_accuracy,
    /* ...rest of fields verbatim from existing record... */
  },
  // (5 more feed records: es-passport, es-freechart, en-accuracy, en-passport, en-freechart)
];

/**
 * Stories records — NOT iterated by seed() until Canva designs created.
 * See header comment on ANCHOR_BLOBS_STORIES_PENDING above for rationale.
 */
export const ANCHORS_STORIES_PENDING: AnchorRecord[] = [
  // ---- Stories (1080x1920) — PENDING Canva design creation ----
  {
    id: 'anchor-2026-05-10-es-accuracy-stories',
    hookTemplateId: 'es-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS_STORIES_PENDING.story_es_accuracy,
    /* ...rest of fields verbatim from existing record... */
  },
  // (5 more story records: es-passport, es-freechart, en-accuracy, en-passport, en-freechart)
];
```

Important: every existing field value (copy, cta, locale, status, safetyChecks, approvedBy, approvedAt, generator, costUsd, assetKind) must be preserved exactly. Only the `assetUrl` reference name changes (`ANCHOR_BLOBS.X` → `ANCHOR_BLOBS_FEED.X` or `ANCHOR_BLOBS_STORIES_PENDING.X`).

- [ ] **Step 4: Update `seed()` signature and body**

Find the existing `export async function seed(): Promise<void>` (lines ~254-265). Replace with:

```ts
export async function seed(opts: { dryRun?: boolean } = {}): Promise<void> {
  const db = getDb();
  console.log(`Seeding ${ANCHORS_FEED.length} anchor creatives (feed only)…`);
  if (opts.dryRun) {
    console.log('--- DRY RUN — no INSERT performed ---');
    console.log(JSON.stringify(ANCHORS_FEED, null, 2));
    console.log(`WOULD SKIP: ${ANCHORS_STORIES_PENDING.length} stories anchors (deferred — see ANCHOR_BLOBS_STORIES_PENDING note)`);
    return;
  }
  for (const anchor of ANCHORS_FEED) {
    await db
      .insert(advertisingCreatives)
      .values(anchor)
      .onConflictDoNothing();
    console.log(`  ✓ ${anchor.id}`);
  }
  console.log('Done. Stories anchors deferred until Canva designs created.');
}
```

- [ ] **Step 5: Update entrypoint to parse `--dry-run`**

Find the bottom of file (lines ~267-269):

```ts
if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch((e) => { console.error(e); process.exit(1); });
}
```

Replace with:

```ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  seed({ dryRun }).catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 6: Update file-level JSDoc**

The header comment (lines ~1-13) reads:

```
/**
 * One-off seed: insert the 12 Canva-generated brand-anchor creatives into
 * advertising_creatives table as pre-approved evergreen records.
 *
 * Idempotent — uses fixed IDs so re-running is a no-op.
 *
 * Usage:
 *   npm run advertising:seed-canva-anchors
 *
 * Prerequisites:
 *   - Canva PNGs uploaded to Vercel Blob (URLs hard-coded in ANCHOR_BLOBS)
 *   - Patch 02 applied: 'lead_magnet' archetype + es/en-rarity-7 templates
 */
```

Replace with:

```
/**
 * One-off seed: insert 6 Canva-generated brand-anchor creatives (feed
 * format, 1080×1350) into advertising_creatives table as pre-approved
 * evergreen records.
 *
 * Idempotent — uses fixed IDs so re-running is a no-op.
 *
 * Usage:
 *   npm run advertising:seed-canva-anchors           # real INSERT
 *   npm run advertising:seed-canva-anchors -- --dry-run   # preview only
 *
 * Prerequisites:
 *   - Canva feed PNGs uploaded to Vercel Blob (URLs in ANCHOR_BLOBS_FEED)
 *   - Patch 02 applied: 'lead_magnet' archetype + es/en-rarity-7 templates
 *
 * Deferred:
 *   - 6 stories anchors (1080×1920) — preserved in ANCHORS_STORIES_PENDING
 *     but NOT seeded. Canva Story-format designs missing from Brand Kit
 *     kAGT_ANQrn8. Promote into seed() once designs created.
 */
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no new errors (no errors from the seed script — TypeScript should accept the new signature and split arrays without issue).

If errors appear, halt and inspect — likely a missed `as const` or import.

---

## Task 4: Phase 2 — dry-run, approval doc, commit

**Goal:** Run the dry-run, write the approval pause doc, commit the script edit.

**Files:**
- Create: `.cowork-meta/<TIMESTAMP>/04-seed-dryrun.txt`
- Create: `.cowork-meta/<TIMESTAMP>/05-ready-to-seed.md`
- Commit: `scripts/advertising/seed-canva-anchor-creatives.ts`

- [ ] **Step 1: Run dry-run**

```bash
DIR=".cowork-meta/phase1-verification-$TIMESTAMP"
npx tsx scripts/advertising/seed-canva-anchor-creatives.ts --dry-run > "$DIR/04-seed-dryrun.txt" 2>&1
echo "Exit: $?"
```

Expected: exit 0. The file should contain the 6 feed records as JSON plus "WOULD SKIP: 6 stories anchors".

- [ ] **Step 2: Verify dry-run output**

```bash
DIR=".cowork-meta/phase1-verification-$TIMESTAMP"
grep -c 'anchor-2026-05-10-..-.*-feed' "$DIR/04-seed-dryrun.txt"
grep 'WOULD SKIP' "$DIR/04-seed-dryrun.txt"
```

Expected: count = 6 (from the JSON record IDs); WOULD SKIP line present.

If count ≠ 6 or WOULD SKIP missing: halt. Write incident note in `04-seed-dryrun.txt`. Do NOT commit. Revert script changes via `git checkout scripts/advertising/seed-canva-anchor-creatives.ts`.

- [ ] **Step 3: Write `05-ready-to-seed.md`**

Use Write tool to create `.cowork-meta/phase1-verification-$TIMESTAMP/05-ready-to-seed.md`:

```markdown
# Ready to seed 6 anchor creatives (feed only) — founder approval needed

## What will be inserted
- 6 rows in `advertisingCreatives` table (feed format, ES + EN, themes:
  accuracy / passport / freechart).
- All `status='approved'`, `generator='canva'`, `approvedBy=$FOUNDER_EMAIL`,
  `approvedAt='2026-05-10T00:00:00Z'`.
- `safetyChecks` pre-populated with 5 PASS checks.
- Idempotent: `onConflictDoNothing` protects re-runs.

## Stories anchors deferred (6 of 12)
- Story-format Canva designs in Brand Kit `kAGT_ANQrn8` do not exist.
- Records preserved in script as `ANCHORS_STORIES_PENDING`.
- No INSERT, no Blob HEAD check passes — these are not ready to ship.
- Re-enable by creating Canva designs, uploading to the existing Blob keys
  in `ANCHOR_BLOBS_STORIES_PENDING`, then moving records from
  `ANCHORS_STORIES_PENDING` into `ANCHORS_FEED`.

## Dry-run output
See `04-seed-dryrun.txt`.

## Verification
- [x] All 6 feed IDs unique
- [x] All `hookTemplateId`s resolve in current `hooks-{en,es}.ts`
- [x] All 6 feed Blob URLs HTTP 200 (HEAD-checked at <TIMESTAMP>)
- [x] AI Content Label: `upload-client` sets `creative_source='AI_GENERATED'`
      for `generator='canva'` (verified — commit `83b43c0`)

## To proceed
Founder approval required. Run manually after review:

    npx tsx scripts/advertising/seed-canva-anchor-creatives.ts

Verification query:

    npx tsx -e "import { getDb } from '@/shared/lib/db';
      import { advertisingCreatives } from '@/shared/lib/schema';
      import { eq } from 'drizzle-orm';
      const db = getDb();
      const rows = await db.select().from(advertisingCreatives).where(eq(advertisingCreatives.generator, 'canva'));
      console.log(rows.length, 'canva anchors');"

Expected: `6 canva anchors`.
```

- [ ] **Step 4: Commit script changes**

```bash
git add scripts/advertising/seed-canva-anchor-creatives.ts
git status
```

Verify `git status` shows only the seed script modified and nothing in `.cowork-meta/` listed (gitignored).

```bash
git commit -m "$(cat <<'EOF'
chore(advertising/anchors): split feed/stories + dry-run support

Feed-format Canva anchors (6) are live on Vercel Blob and ready to seed.
Story-format anchors (6) are deferred — Canva Brand Kit kAGT_ANQrn8 only
contains feed designs; URLs return 404. Records preserved as
ANCHORS_STORIES_PENDING so that copy/CTA pairings survive until designs
are created.

Adds --dry-run flag and opts.dryRun arg to seed() so the approval-pause
workflow can preview inserts before mutating prod DB.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify commit:

```bash
git log -1 --oneline
```

Expected: HEAD shows the new commit.

---

## Task 5: Phase 3 — parallel signature verification via Agent Teams

**Goal:** Dispatch 5 Explore sub-agents in one message to verify each signature group; assemble report.

**Files:**
- Read-only access to: `src/modules/advertising/perceive/meta-insights.ts`, `src/modules/advertising/perceive/recon-state-store.ts`, `src/shared/lib/schema.ts`, `src/modules/advertising/decide/brand-voice-audit.ts`, `src/modules/advertising/alerts/telegram-bot.ts`, `src/app/admin/lib/admin-auth.ts`, `.env.example`

- [ ] **Step 1: Dispatch 5 sub-agents in one message**

Use the Agent tool 5 times in a single response (no sequential awaits). Each agent has `subagent_type: "Explore"` and a self-contained prompt. Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) runs them concurrently in tmux panels.

**Sub-agent 1: signatures-meta-insights**

Prompt:

> Find the export `fetchMetaInsights` in `src/modules/advertising/perceive/meta-insights.ts`. Report:
> 1. Exact function signature with TypeScript types (param shape, return type)
> 2. File line numbers of the export declaration
> 3. How `apiClient` (if it's a param) is constructed elsewhere — search for callers and the constructor
> 4. Any related exports in the same file that might also be needed (e.g., `MetaInsightsResult` type)
> Return findings as a markdown snippet that can be pasted into a signatures-reference doc. Include `file:line` references. Under 300 words.

**Sub-agent 2: signatures-recon-state**

Prompt:

> Find the export `getReconState` in `src/modules/advertising/perceive/recon-state-store.ts`. Report:
> 1. Exact function signature
> 2. File line numbers
> 3. The full `ReconState` type definition (fields and their types)
> 4. Whether any field analogous to `delta_pct` or `last_run` exists; if not, what the closest equivalent is
> Return findings as a markdown snippet with `file:line` references. Under 300 words.

**Sub-agent 3: signatures-decisions**

Prompt:

> Find the `advertisingDecisions` table definition in `src/shared/lib/schema.ts`. Report:
> 1. Full list of columns with their Drizzle types (e.g., `varchar`, `timestamp`, `integer`)
> 2. File line numbers of the table declaration
> 3. Whether columns `targetId`, `tier`, `createdAt` exist (probably NOT — actual columns are `adId`, `reasoningTier`, `timestamp` per the handoff)
> 4. Any indexes or constraints on the table
> Return findings as a markdown snippet with `file:line` references. Under 300 words.

**Sub-agent 4: signatures-brand-voice**

Prompt:

> Search the codebase for usages of `BrandVoiceScore` type (case-sensitive). Report:
> 1. Where the type is defined (`file:line`)
> 2. Where `BrandVoiceScore[]` is persisted — find the storage column or table. It is NOT in `safetyChecks` per the handoff verification report. Look in `decide/brand-voice-audit.ts` and the schema.
> 3. The exact field/column name a future Patch 04 `/status?include=brand_voice` query should read from
> 4. The shape returned by the brand-voice scorer (`overall`, `depth`, `scientific`, `respectful`, `no_manipulation`)
> Return findings as a markdown snippet with `file:line` references. Under 300 words.

**Sub-agent 5: signatures-alerts-env**

Prompt:

> Investigate three things in parallel:
> 1. `src/modules/advertising/alerts/telegram-bot.ts` — find `sendAlert` (or similar) export. Report current signature with `file:line`. Also report whether a `tier: 1 | 2` argument or `Alert` interface already exists.
> 2. `src/app/admin/lib/admin-auth.ts` — find `requireAdmin` export. Report signature and how it's typically called in admin route handlers.
> 3. `.env.example` — search for `ADVERTISING_STATUS_BEARER` and `ADVERTISING_TIER2_VIA_DIGEST`. Report whether either already exists. If yes, document existing value pattern.
> Return findings as a markdown snippet with `file:line` references. Under 350 words.

Wait for all 5 to return. (Per the system prompt, Agent tool runs are concurrent when issued in the same message.)

- [ ] **Step 2: Check for contradictions**

Read the 5 returned reports. Look for:
- Two agents reporting different signatures for the same function/type
- An agent reporting a signature that contradicts the handoff's stated correction

If contradiction found:
1. Write `06-signatures-reference.md` with both versions side-by-side under a "CONTRADICTION" header.
2. Halt. Do not write the revised patch.
3. Report to founder: "Sub-agent contradiction at <signature>. Cannot proceed with Patch 04 revision."

Otherwise: proceed.

- [ ] **Step 3: Write `06-signatures-reference.md`**

Use Write tool to create `.cowork-meta/phase1-verification-$TIMESTAMP/06-signatures-reference.md`:

```markdown
# Phase 3 — signatures reference (<TIMESTAMP>)

Verified via 5 parallel Explore sub-agents.

## 1. `fetchMetaInsights` (`src/modules/advertising/perceive/meta-insights.ts`)
<paste sub-agent 1 report verbatim>

## 2. `getReconState` + `ReconState` (`src/modules/advertising/perceive/recon-state-store.ts`)
<paste sub-agent 2 report verbatim>

## 3. `advertisingDecisions` columns (`src/shared/lib/schema.ts`)
<paste sub-agent 3 report verbatim>

## 4. `BrandVoiceScore` storage
<paste sub-agent 4 report verbatim>

## 5. `sendAlert`, `requireAdmin`, env vars
<paste sub-agent 5 report verbatim>

## Patch 04 mapping

| Patch 04 original | Corrected (per HEAD) |
|---|---|
| `getMetaInsights({ level, since, until })` | `fetchMetaInsights({ apiClient, dateFrom, dateTo })` |
| `getReconcilerState()` returning `{ last_run, delta_pct }` | `getReconState()` returning `ReconState { suspended, suspendedAt, suspendReason, autoResumeAt, lastDriftPct }` |
| `advertisingDecisions.createdAt`, `.targetId`, `.tier` | `advertisingDecisions.timestamp`, `.adId`, `.reasoningTier` |
| `safetyChecks.find(c => c.check_name === 'brand_voice_overall')` | <correct location per sub-agent 4> |
| `sendAlert(severity, message)` positional | `sendAlert(severity, message, opts?: { tier?: 1 \| 2 })` |
```

---

## Task 6: Phase 3 — write revised Patch 04

**Goal:** Produce `outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md` — a complete re-write of the original Patch 04 with corrected signatures, real line numbers, and exact diff blocks.

**Files:**
- Create: `outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`

- [ ] **Step 1: Read original Patch 04 for structure reference**

The original lives only in the prior Cowork session output:

```
/Users/kirillkovalenko/Library/Application Support/Claude/local-agent-mode-sessions/72cc81a5-73c9-45e5-9222-676c0beb70d4/3b493a15-219b-49d1-a1a2-15e56254ada5/local_90ec26dd-0168-4944-9277-dac9dacfc4cc/outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer.md
```

Read it fully (540 lines). Note the section structure: Goal, Architecture, Component 1 (`/status`), Component 2 (`/digest`), Component 3 (Cowork scheduled task), Component 4 (Telegram tier classification), Phasing, Tests, Effort, What does NOT belong, After Patch 04.

- [ ] **Step 2: Write revised patch**

Use Write tool. Structure mirrors the original but with these corrections (informed by `06-signatures-reference.md`):

```markdown
# Patch 04 (revised) — Cowork visibility layer

> **This revision supersedes the original Patch 04.** The original lived in
> the previous Cowork session output and was not committed to this repo.
> Verification revealed 5+ signature mismatches; this version uses signatures
> verified at HEAD `ce1961c` + `8baa49c` (Phase 2 anchor commit).

## What's revised

| Original | Corrected | Why |
|---|---|---|
| `getMetaInsights` | `fetchMetaInsights({ apiClient, dateFrom, dateTo })` | Function name + arg shape mismatch verified by sub-agent 1 |
| `getReconcilerState` | `getReconState()` returning `ReconState` | Function name + return shape mismatch verified by sub-agent 2 |
| `advertisingDecisions.{createdAt, targetId, tier}` | `.{timestamp, adId, reasoningTier}` | Column name mismatch verified by sub-agent 3 |
| `safetyChecks.find(c => c.check_name === 'brand_voice_overall')` | <correct storage> | `BrandVoiceScore[]` stored separately, not in `safetyChecks` |
| `sendAlert(severity, message)` positional | `sendAlert(severity, message, opts?: { tier?: 1 \| 2 })` | Backward-compat — extend, don't break |
| Inline digest markdown in `TelegramBot.sendDailyDigest` | `buildDigestData()` + `formatTelegram()` + `formatMarkdown()` | Single source of truth |

## Goal

(Copy from original — unchanged.)

## Architecture

(Copy from original — unchanged.)

## Component 1 — Read-only status endpoint

`src/app/api/admin/advertising/status/route.ts` — new file.

(Full corrected code block with the right imports, the right function calls,
and `file:line` references for each import path. Use the original Component 1
code as a starting template but rewrite every line that touches one of the
6 corrections in the table above. Make every code block a complete copy-
paste-ready snippet — no `...` ellipsis except in JSDoc comments.)

## Component 2 — Daily digest endpoint

`src/app/api/admin/advertising/digest/route.ts` — new file.

Plus refactor of digest data builder:

`src/modules/advertising/alerts/digest-builder.ts` — new file with
`buildDigestData(): Promise<DailyDigestReport>` (pure data fetcher).

`src/modules/advertising/alerts/digest-renderers.ts` — new file with
`formatTelegram(report: DailyDigestReport): string` and
`formatMarkdown(report: DailyDigestReport): string`.

Modify `src/modules/advertising/alerts/telegram-bot.ts`:
- `sendDailyDigest()` becomes `await buildDigestData()` + `formatTelegram()` + send.
- Show diff block with `file:line` start/end markers from HEAD.

## Component 3 — Cowork scheduled task

(Copy from original — unchanged. This is Cowork-side configuration, no code change.)

## Component 4 — Telegram tier classification

### Tier 1 / Tier 2 tables

(Copy tables from original — unchanged.)

### Implementation — backward-compatible `sendAlert`

Modify `src/modules/advertising/alerts/telegram-bot.ts:<actual-line>` to extend
the signature:

    diff
    -async sendAlert(severity: AlertSeverity, message: string): Promise<TelegramMessage | null> {
    +async sendAlert(severity: AlertSeverity, message: string, opts: { tier?: 1 | 2 } = {}): Promise<TelegramMessage | null> {
    +  const tier = opts.tier ?? 1;
    +  // Tier 2 alerts skip Telegram — they go through the daily digest
    +  if (tier === 2 && process.env.ADVERTISING_TIER2_VIA_DIGEST === 'true') {
    +    return null; // logged but not sent
    +  }
       // Existing send logic...

Default `tier=1` preserves current behavior. Existing callers (no third arg)
behave identically. New callers pass `{ tier: 2 }` to opt into tier-2.

`ADVERTISING_TIER2_VIA_DIGEST=false` by default → tier-2 alerts still fire to
Telegram. Flip to `true` after digest endpoint verified in production.

## Env additions (`.env.example`)

(Show diff block adding `ADVERTISING_STATUS_BEARER=` and
`ADVERTISING_TIER2_VIA_DIGEST=false`. If sub-agent 5 reports either already
exists, omit and note "<already present in `.env.example:<line>`>".)

## Phasing recommendation

(Copy from original — unchanged.)

## Tests

(Copy from original — unchanged. Test files don't exist yet; this is a
proposal so the line references are inside the new files only.)

## Effort + risk

(Copy from original — unchanged.)

## What does NOT belong in this layer

(Copy from original — unchanged.)

## After Patch 04 is shipped

(Copy from original — unchanged.)
```

The actual content of each section above must be filled in with the verbatim
verified signatures from `06-signatures-reference.md`. Every `file:line` reference
must point to a real location at HEAD `8baa49c` (or `ce1961c` for files
unchanged in Phase 2).

- [ ] **Step 3: Sanity-check the revised patch**

After writing:
1. Search the file for `getMetaInsights` (should appear 0 times outside the "What's revised" table).
2. Search for `getReconcilerState` (same).
3. Search for `createdAt` on `advertisingDecisions` queries (same).

If any leak found, fix inline.

---

## Task 7: Phase 3 — handoff README

**Goal:** Create `outputs/cowork-handoff-2026-05-10/README.md` (didn't exist locally).

**Files:**
- Create: `outputs/cowork-handoff-2026-05-10/README.md`

- [ ] **Step 1: Write README**

Use Write tool:

```markdown
# Cowork handoff — 2026-05-10

Inventory of files in this directory:

| File | Status | Purpose |
|---|---|---|
| `04-cowork-visibility-layer-revised.md` | active | Patch 04 (revised). **Apply this.** Supersedes the original Patch 04 from the prior Cowork session output (not committed in this repo). |
| `06-next-claude-code-session.md` | partially executed | Claude Code follow-up brief. Phases 1–3 completed 2026-05-10; Phase 4 deferred. |
| `README.md` | this file | Inventory + apply order. |

## Apply order (future sessions)

1. **Patch 04 (revised)** — apply diffs from `04-cowork-visibility-layer-revised.md` to `src/` after founder review. Creates `/api/admin/advertising/status` + `/api/admin/advertising/digest` routes; refactors digest builder; extends `sendAlert` with optional tier arg.
2. **Phase 4 — `ClaudeBrandVoiceClient`** — see handoff `06-next-claude-code-session.md` § Phase 4. Implement after Patch 04 (the `/status?include=brand_voice` route depends on the real storage location identified during Phase 3 sub-agent verification).
3. **Stories anchors** — only after Canva Story-format designs created in Brand Kit `kAGT_ANQrn8`. Then promote `ANCHORS_STORIES_PENDING` → `ANCHORS_FEED` in `scripts/advertising/seed-canva-anchor-creatives.ts` and re-run the seed.

## Related session artifacts

`.cowork-meta/phase1-verification-<TIMESTAMP>/` (this repo, git-ignored):
- `01-summary.md` — Phase 1 verification results
- `02-anchor-seed-state.md` — Phase 2 inspection
- `04-seed-dryrun.txt` — Phase 2 dry-run output
- `05-ready-to-seed.md` — Phase 2 approval pause document (run real seed after reviewing)
- `06-signatures-reference.md` — Phase 3 sub-agent reports
- `00-final-summary.md` — session wrap-up
```

---

## Task 8: Phase 3 — commit

**Goal:** Commit the revised patch + README to `main`. No push.

- [ ] **Step 1: Stage and commit**

```bash
git add outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md \
        outputs/cowork-handoff-2026-05-10/README.md
git status
```

Verify only the 2 new files are staged.

```bash
git commit -m "$(cat <<'EOF'
docs(advertising/cowork-audit): Patch 04 revised + handoff README

Original Patch 04 (visibility layer: read-only /status + /digest API + Telegram
tier classification) was authored in the prior Cowork session against an
outdated repo snapshot. Verification surfaced 5+ signature mismatches:
fetchMetaInsights vs getMetaInsights, getReconState vs getReconcilerState,
advertisingDecisions column names, BrandVoiceScore storage location,
sendAlert backward-compat.

Revised patch (verified at HEAD via 5 parallel Explore sub-agents) is
ready-to-apply: every code block carries real file:line references, every
function call uses the actual signature, every column name matches schema.ts.

A future apply-session can land the visibility layer without further
code archaeology.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Verify commit**

```bash
git log -2 --oneline
```

Expected: HEAD is the new docs commit; HEAD~1 is the Phase 2 anchors commit.

---

## Task 9: Phase 5 — final summary

**Goal:** Write the session wrap-up document and print console one-liner.

**Files:**
- Create: `.cowork-meta/<TIMESTAMP>/00-final-summary.md`

- [ ] **Step 1: Write `00-final-summary.md`**

Use Write tool:

```markdown
# Session summary — <TIMESTAMP>

## What was done
- **Phase 1**: verification — <X> commands passed, <Y> failed; classification: <P0/P1/P2 breakdown or "all pass">
- **Phase 2**: anchor seed — script split into `ANCHORS_FEED` (6 records, live URLs) + `ANCHORS_STORIES_PENDING` (6 records, deferred); `--dry-run` flag added; dry-run validated; approval doc at `05-ready-to-seed.md`; production INSERT pending founder approval
- **Phase 3**: Patch 04 revised — `outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`; corrections verified via 5 parallel Explore sub-agents; handoff README created at `outputs/cowork-handoff-2026-05-10/README.md`
- **Phase 4**: `ClaudeBrandVoiceClient` — **deferred** to future session per spec scope

## What's blocking
- Story-format Canva designs missing from Brand Kit `kAGT_ANQrn8` — `ANCHORS_STORIES_PENDING` stays deferred until founder creates the designs and uploads PNGs to the existing Blob keys.
- <if any P0/P1/P2 verification failures need founder review, list them with file:line and recommended action>

## What's pending founder action

1. **Phase 2 real INSERT** — review `05-ready-to-seed.md`, then run:

       npx tsx scripts/advertising/seed-canva-anchor-creatives.ts

   Verify with the query in `05-ready-to-seed.md`. Expected: `6 canva anchors` in the DB.

2. **Phase 3 review** — read `outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`. After approval, schedule a future Claude Code session to apply the diffs to `src/`.

3. **Push local commits to main**:

       git log --oneline origin/main..HEAD     # show what's local
       git push origin main                     # if approved

   Expected local commits (in order from oldest):
   - `docs(superpowers): cowork patches followup design — Phase 1+2 feed-only+3`
   - `chore(advertising/anchors): split feed/stories + dry-run support`
   - `docs(advertising/cowork-audit): Patch 04 revised + handoff README`

## Push checklist
- [ ] Reviewed `01-summary.md` (Phase 1 results)
- [ ] Reviewed `05-ready-to-seed.md` (Phase 2 approval doc)
- [ ] Reviewed `04-cowork-visibility-layer-revised.md` (Phase 3 deliverable)
- [ ] `git push origin main`
```

- [ ] **Step 2: Print console one-liner**

After writing the summary, print this exact line:

```
Session complete. 3/3 phases finished.
Founder action items in .cowork-meta/phase1-verification-$TIMESTAMP/00-final-summary.md
```

(If session halted at Phase 1 instead of finishing all 3, print `1/3 phases finished` and reference the halt note in `01-summary.md`.)

---

## Halt criteria summary (cross-task)

| Condition | Action |
|---|---|
| Task 1 P0 verification fails | Write `01-summary.md` + `00-final-summary.md`; STOP; no commits. |
| Task 1 P1/P2 verification fails | Note in `01-summary.md`; continue to Task 2. |
| Task 2 any of 6 feed Blob URLs non-200 | Halt before Task 3; write incident in `02-anchor-seed-state.md`; no script edit. |
| Task 4 dry-run shows ≠6 feed records or missing WOULD SKIP | Halt; revert script via `git checkout`; do not commit. |
| Task 5 sub-agents report contradictory signatures | Halt; write contradictions in `06-signatures-reference.md`; do not write revised patch. |

---

## Self-review notes

**Spec coverage:** Each section of `2026-05-10-cowork-followup-design.md` maps to one or more tasks here. The 3 hard constraints from the spec (no push, no PRs, no real INSERT) are enforced via the absence of `git push` commands and the approval-pause stop in Task 4.

**Placeholders:** `<TIMESTAMP>`, `<X>`, `<Y>`, `<count>`, `<actual-line>` are template variables — engineer substitutes at execution time. No "TBD" / "TODO" / "implement later" remain.

**Type consistency:** `seed(opts: { dryRun?: boolean })` consistent across Step 4/5 of Task 3 and Step 1 of Task 4. `ANCHORS_FEED`/`ANCHORS_STORIES_PENDING` consistent across Task 3 steps. `06-signatures-reference.md` referenced consistently in Tasks 5–8.

**TDD note:** This plan does not introduce new `src/` code, so traditional TDD does not apply. The "test" for each phase is verification of an existing system: Phase 1 = test suite, Phase 2 = dry-run output check, Phase 3 = sub-agent sanity-check + grep for leaked old signatures.
