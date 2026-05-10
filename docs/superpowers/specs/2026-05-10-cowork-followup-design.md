# Cowork patches followup — Phase 1 + Phase 2 feed-only + Phase 3

**Date:** 2026-05-10
**Author:** Claude Opus 4.7 (1M context) with founder
**Source brief:** `outputs/cowork-handoff-2026-05-10/06-next-claude-code-session.md`
**Previous spec (upstream):** `docs/superpowers/specs/2026-05-10-cowork-audit-roadmap-design.md`

## Background

A previous Cowork session shipped 5 commits implementing the cowork-audit patches
(commits `83b43c0` through `ce1961c` on `main`). This spec covers the follow-up
session that completes Phases 1–3 of the handoff. Phase 4 (real
`ClaudeBrandVoiceClient`) is deferred to a future session.

The handoff was written against an outdated snapshot of the repo. Before this
spec landed, the actual state was verified:

| Handoff assumption | Reality (2026-05-10) |
|---|---|
| All 12 `ANCHOR_BLOBS` are `<HASH>` placeholders | All 12 URLs already point to `zproaddipyjwfa81.public.blob.vercel-storage.com` |
| 6 stories `AnchorRecord`s are stubbed `// ...` | All 12 records are fully populated in the script |
| 12 PNG uploads to Vercel Blob still pending | 6 feed PNGs are live on Blob (HTTP 200); 6 stories return HTTP 404 because the Story-format Canva designs were never created in Brand Kit `kAGT_ANQrn8` |
| Helper script `_upload-canva-anchors-to-blob.mts` exists | Does not exist |
| `seed-canva-anchor-creatives.ts` has `--dry-run` flag | Does not — calls `seed()` directly on import-as-main |
| PNG sources findable in `outputs/estrevia-meta-ads-v2/` | Only `README.md` is there; PNG files are gone |

`BLOB_READ_WRITE_TOKEN` is set in `.env`. `@vercel/blob ^2.3.3` is installed.

The mismatch means Phase 2 ships in a **feed-only** variant: 6 feed anchors
seed into the DB; 6 stories anchors remain in the script as
`ANCHORS_STORIES_PENDING` (code preserved, not iterated) until the founder
creates the Canva designs in a future session.

## Goals

1. **Verify the 5 cowork-audit commits don't regress** the typecheck/test/lint suite.
2. **Prepare 6 feed Canva-anchor creatives for seeding** without performing the
   production `INSERT` (founder runs that manually after reviewing the approval doc).
3. **Rewrite Patch 04 with correct signatures** so a future apply-session can
   land the Cowork visibility layer (read-only `/status` + `/digest` endpoints
   plus Telegram tier classification) without further code archaeology.

## Non-goals

- No production `INSERT` of the 6 feed anchors (session stops at the approval pause).
- No new code in `src/` for Phase 3 — markdown proposal only.
- No upload of new PNGs to Vercel Blob (the 6 feed URLs already live; stories deferred).
- No Cowork-side scheduled-task creation (that happens after Patch 04 is applied
  in a future session).
- No `ClaudeBrandVoiceClient` implementation (Phase 4 of the handoff — deferred).

## Hard constraints (apply throughout)

- Advertising agent is LIVE in production. Mutations require explicit approval pauses.
- Do NOT push, force-push, or open PRs without explicit founder approval.
- Do NOT modify or delete the existing 5 cowork-audit commits.
- Do NOT run `advertising:generate-launch-batch`, `advertising:publish-approved`,
  or any other script that creates real ad spend.
- Do NOT bypass `ADVERTISING_AGENT_DRY_RUN` flags.
- AI Content Label: every Meta upload path mutation must respect the flag set
  in commit `83b43c0`; never weaken it. (Phase 2 doesn't touch upload-client.)
- Geo policy: never propose targeting Argentina, UK, or Ireland.
- Brand voice rules from `docs/editorial-style-guide.md`: no fortune-telling,
  no medical/financial/legal advice claims, no Frieda Harris Thoth, sign names
  in Latin form in both EN and ES (Cáncer and Virgo are correct), Spanish uses
  `tú` not `usted`.

## Architecture & sequencing

Single timestamp captured at session start: `phase1-verification-<UTC-YYYYMMDD-HHMMSS>`.
All artifacts written under `.cowork-meta/<TIMESTAMP>/`. Naming follows handoff
convention (Phase-1-rooted directory name even though Phases 2 and 3 also write there).

```
Phase 1 (verify) ──┬─→ checkpoint 01-summary.md
                   │   • on P0 fail: write 00-final-summary.md and HALT entirely.
                   │   • on P1/P2 fail: log, continue.
                   ▼
Phase 2 (seed)   ──┬─→ checkpoint 02-anchor-seed-state.md
                   ├─→ edit scripts/advertising/seed-canva-anchor-creatives.ts
                   │    (split ANCHORS → ANCHORS_FEED + ANCHORS_STORIES_PENDING; --dry-run flag)
                   ├─→ checkpoint 04-seed-dryrun.txt
                   ├─→ checkpoint 05-ready-to-seed.md  (approval pause document)
                   ▼ COMMIT: chore(advertising/anchors): split feed/stories + dry-run support
Phase 3 (Patch 04) ─┬─→ Agent Teams: 5 parallel Explore-agents verify signatures
                    ├─→ consolidate → 06-signatures-reference.md
                    ├─→ write outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md
                    ├─→ create outputs/cowork-handoff-2026-05-10/README.md  (NEW)
                    ▼ COMMIT: docs(advertising/cowork-audit): Patch 04 revised + handoff README
Phase 5 final summary ─→ 00-final-summary.md (always written, even on halt)
```

## Phase 1 — verification

### Inputs
- Repo HEAD at `ce1961c` (5 cowork-audit commits + earlier work).

### Commands
```bash
npm run typecheck
npm test -- src/modules/advertising
npm run lint -- src/modules/advertising
npm test          # full suite
npm run lint      # full lint
```

### Outputs (under `.cowork-meta/<TIMESTAMP>/`)
- `typecheck.txt`
- `test-advertising.txt`
- `test-full.txt`
- `lint-advertising.txt`
- `lint-full.txt`
- `01-summary.md` with the per-handoff template (status table + risk classification).

### Risk classification (from handoff)
- **P0** (HALT): failures touching `meta-graph-api/upload-client.ts`, `creative-gen/safety/checks.ts`, or `shared/types/advertising/creative.ts`.
- **P1** (continue + flag): `creative-gen/templates/hooks-{en,es}.ts`, `decide/brand-voice-audit.ts`.
- **P2** (continue + note): everything else.

### Halt behavior on P0
1. Finish `01-summary.md` with the failures.
2. Write `00-final-summary.md` summarizing the halt.
3. Do NOT run Phase 2 or Phase 3.
4. Do NOT commit anything in this session (the cowork-audit commits already on `main` stay untouched).

## Phase 2 — anchor creatives seed (feed-only)

### Step 2.1 — Inspect & document state

Write `02-anchor-seed-state.md` reproducing the discrepancy table from the
"Background" section above, with one addition: HEAD-check results for the 6
feed Blob URLs (must all be 200; if any non-200, halt before script edit).

The 6 feed Blob URLs to verify (already confirmed for `feed_es_accuracy`):
- `feed_es_accuracy`, `feed_es_passport`, `feed_es_freechart`
- `feed_en_accuracy`, `feed_en_passport`, `feed_en_freechart`

### Step 2.2 — Skip Vercel Blob upload

The handoff's Step 2.2 (upload PNGs) does not apply: feed PNGs are already on
Blob; stories PNGs cannot be uploaded because the source designs don't exist
in Canva. No `upload-canva-anchors-to-blob.ts` helper is created.

### Step 2.3 — Edit seed script

File: `scripts/advertising/seed-canva-anchor-creatives.ts`

Changes:

1. Split `ANCHOR_BLOBS` into two maps:
   - `ANCHOR_BLOBS_FEED` — 6 live URLs.
   - `ANCHOR_BLOBS_STORIES_PENDING` — 6 known-broken URLs. Add header
     comment explaining that Story-format Canva designs in Brand Kit
     `kAGT_ANQrn8` do not exist; future founder action required.
2. Rename `export const ANCHORS` → split into two exports:
   - `export const ANCHORS_FEED: AnchorRecord[]` — first 6 records (one per
     locale × theme).
   - `export const ANCHORS_STORIES_PENDING: AnchorRecord[]` — remaining 6
     records. Add header comment: "Not seeded until Canva Story designs are
     created. Do not iterate from seed()."
3. Update `seed()`:
   ```ts
   export async function seed(opts: { dryRun?: boolean } = {}): Promise<void> {
     const db = getDb();
     console.log(`Seeding ${ANCHORS_FEED.length} anchor creatives (feed only)…`);
     if (opts.dryRun) {
       console.log('--- DRY RUN — no INSERT performed ---');
       console.log(JSON.stringify(ANCHORS_FEED, null, 2));
       console.log(`WOULD SKIP: ${ANCHORS_STORIES_PENDING.length} stories anchors (deferred)`);
       return;
     }
     for (const anchor of ANCHORS_FEED) {
       await db.insert(advertisingCreatives).values(anchor).onConflictDoNothing();
       console.log(`  ✓ ${anchor.id}`);
     }
     console.log('Done. Stories anchors deferred until Canva designs created.');
   }
   ```
4. Update bottom-of-file entrypoint:
   ```ts
   if (import.meta.url === `file://${process.argv[1]}`) {
     const dryRun = process.argv.includes('--dry-run');
     seed({ dryRun }).catch((e) => { console.error(e); process.exit(1); });
   }
   ```
5. Update file-level JSDoc to reflect the feed-only split.

### Step 2.4 — Dry-run

```bash
npx tsx scripts/advertising/seed-canva-anchor-creatives.ts --dry-run
```

Capture output to `.cowork-meta/<TIMESTAMP>/04-seed-dryrun.txt`. Verify the 6
records look correct, all hookTemplateIds resolve in `creative-gen/templates/hooks-{en,es}.ts`,
and the "WOULD SKIP" line is present.

### Step 2.5 — Approval pause

Write `.cowork-meta/<TIMESTAMP>/05-ready-to-seed.md` with the founder-approval
template from the handoff (modified for feed-only):

```markdown
# Ready to seed 6 anchor creatives (feed only) — founder approval needed

## What will be inserted
- 6 rows in `advertisingCreatives` table (feed format, ES + EN, themes:
  accuracy / passport / freechart).
- All status='approved', generator='canva', approvedBy=$FOUNDER_EMAIL,
  approvedAt='2026-05-10T00:00:00Z'.
- safetyChecks pre-populated with 5 PASS checks.
- Idempotent: onConflictDoNothing protects re-runs.

## Stories anchors deferred (6 of 12)
- Story-format Canva designs in Brand Kit kAGT_ANQrn8 do not exist.
- Records preserved in script as ANCHORS_STORIES_PENDING.
- No INSERT, no Blob HEAD check passes — these are not ready to ship.

## Dry-run output
See `04-seed-dryrun.txt`.

## Verification
- [x] All 6 feed IDs unique
- [x] All hook_template_ids resolve in current hooks-{en,es}.ts
- [x] All 6 feed Blob URLs HTTP 200 (HEAD-checked at <TIMESTAMP>)
- [x] AI Content Label: upload-client sets creative_source='AI_GENERATED' for
      generator='canva' (verified — commit 83b43c0)

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
```

### Step 2.6 — Commit (no push)

```bash
git add scripts/advertising/seed-canva-anchor-creatives.ts
git commit -m "chore(advertising/anchors): split feed/stories + dry-run support"
```

Stop. No push. No real INSERT.

## Phase 3 — Patch 04 revised

### Step 3.1 — Parallel signature verification via Agent Teams

Source for Patch 04: `outputs/cowork-handoff-2026-05-10/06-next-claude-code-session.md`
(Step 3.1 + Step 3.2). Original Patch 04 lives only in the previous Cowork
session output at `~/Library/Application Support/Claude/.../local_90ec26dd-.../outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer.md`.

Launch 5 `Explore` sub-agents in a single tool-call (one message, 5 parallel
Agent invocations). Agent Teams infrastructure (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, tmux mode) is enabled in `.claude/settings.json`.

Sub-agent tasks:

| Agent | Target | Deliverable |
|---|---|---|
| signatures-meta-insights | `src/modules/advertising/perceive/meta-insights.ts` | Exact export shape of `fetchMetaInsights`, args, return type, line numbers |
| signatures-recon-state | `src/modules/advertising/perceive/recon-state-store.ts` | Exact export shape of `getReconState`, `ReconState` type fields, line numbers |
| signatures-decisions | `src/shared/lib/schema.ts` | Columns of `advertisingDecisions` table (real names: id, timestamp, adId, action, deltaBudgetUsd, reason, reasoningTier, confidence, metricsSnapshot, applied, appliedAt, applyError, metaResponse) with line numbers |
| signatures-brand-voice | Codebase grep for `BrandVoiceScore` usages | Where `BrandVoiceScore[]` is persisted (NOT `safetyChecks`); the actual storage column/table; how a Patch 04 readback should query it |
| signatures-alerts-env | `src/modules/advertising/alerts/telegram-bot.ts`, `src/app/admin/lib/admin-auth.ts`, `.env.example` | `sendAlert` current signature; `requireAdmin` signature; whether `ADVERTISING_STATUS_BEARER` already exists in `.env.example` |

Consolidate all 5 reports into `.cowork-meta/<TIMESTAMP>/06-signatures-reference.md`.

If two agents report contradictory signatures (e.g., different column names for
`advertisingDecisions`), halt and surface to founder — do not write the revised
patch until contradictions resolved.

### Step 3.2 — Write revised patch

Output: `outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`.

Requirements:

1. **Use `fetchMetaInsights({ apiClient, dateFrom, dateTo })`** instead of
   `getMetaInsights`. Show in the route how `apiClient` is constructed
   (probably via `MetaGraphApiBase` or similar — sub-agent reports actual
   constructor).
2. **Use `getReconState()` returning `ReconState`** with fields
   `{ suspended, suspendedAt, suspendReason, autoResumeAt, lastDriftPct }`.
   Map the patch's `last_run` and `delta_pct` to these actual fields. If
   some have no equivalent, mark them as omitted with a comment explaining why.
3. **Use `advertisingDecisions.{adId, reasoningTier, timestamp}`** instead of
   `targetId`, `tier`, `createdAt`. Update all `.from(advertisingDecisions)` queries.
4. **Move brand_voice scoring lookup** to its actual storage location (sub-agent
   reports where). Update the `brand_voice` branch of `/status` accordingly.
5. **Refactor digest extraction**: `buildDigestData(): Promise<DailyDigestReport>`
   as the single data source, with separate renderers `formatTelegram(report)`
   and `formatMarkdown(report)`. Both `TelegramBot.sendDailyDigest()` and
   `/api/admin/advertising/digest` call the same builder.
6. **Backward-compatible `sendAlert`**: instead of changing the positional
   signature `sendAlert(severity, message)`, extend with optional third arg:
   `sendAlert(severity, message, opts?: { tier?: 1 | 2 })`. Tier defaults to
   1 (current behavior preserved). Tier-2 gating uses
   `ADVERTISING_TIER2_VIA_DIGEST` env flag (off by default → no behavior
   change at deploy time).

Every code block in the revised patch references real line numbers from HEAD
(`<file>:<line>` format) and uses `diff` fences for change blocks.

### Step 3.3 — Create handoff README

`outputs/cowork-handoff-2026-05-10/README.md` does not exist locally; create it:

```markdown
# Cowork handoff — 2026-05-10

Inventory of files in this directory:

- `04-cowork-visibility-layer-revised.md` — Patch 04 (revised). Apply this.
  Original 04 (pre-correction) lives only in the previous Cowork session output
  and is superseded.
- `06-next-claude-code-session.md` — handoff for the Claude Code follow-up
  session (Phases 1–4). Phases 1–3 are now complete (this session).

## Apply order (future sessions)
1. Patch 04 (revised): apply diffs to src/ after founder review.
2. Phase 4 (brandVoiceScore client): see handoff Phase 4 — separate session.
3. Stories anchors: only after Canva Story designs created in Brand Kit kAGT_ANQrn8.
```

### Step 3.4 — Commit Phase 3 (no push)

```bash
git add outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md \
        outputs/cowork-handoff-2026-05-10/README.md
git commit -m "docs(advertising/cowork-audit): Patch 04 revised + handoff README"
```

## Phase 5 — final summary

Write `.cowork-meta/<TIMESTAMP>/00-final-summary.md` per handoff template:

```markdown
# Session summary — <TIMESTAMP>

## What was done
- Phase 1: verification — <X> passed, <Y> failed
- Phase 2: anchor seed — script split + dry-run validated; production INSERT pending founder approval
- Phase 3: Patch 04 revised — file at outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md
- Phase 4: brandVoiceScore client — deferred to future session

## What's blocking
- Stories Canva designs not in Brand Kit kAGT_ANQrn8 — stories anchors stay in code as ANCHORS_STORIES_PENDING.
- <if any P0/P1/P2 test failures need founder review, list them>

## What's pending founder action
1. Run `npx tsx scripts/advertising/seed-canva-anchor-creatives.ts` to perform real INSERT of 6 feed anchors (after reviewing `05-ready-to-seed.md`).
2. Review revised Patch 04 (`outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`); apply in a future Claude Code session.
3. Push the 2 new local commits to main:
   ```
   git log --oneline origin/main..HEAD
   git push origin main
   ```

## Push checklist
- [ ] Reviewed `01-summary.md` (Phase 1 results)
- [ ] Reviewed `05-ready-to-seed.md` (Phase 2 approval doc)
- [ ] Reviewed `04-cowork-visibility-layer-revised.md` (Phase 3 deliverable)
- [ ] `git push origin main`
```

Print one-line console summary at the end:

```
Session complete. <PHASES_DONE>/3 phases finished.
Founder action items in .cowork-meta/<TIMESTAMP>/00-final-summary.md
```

## Halt criteria summary

| Condition | Action |
|---|---|
| Phase 1: P0 verification fails | Write 01-summary.md + 00-final-summary.md; no Phase 2/3; no commits. |
| Phase 1: P1/P2 verification fails | Note in 01-summary.md; continue. |
| Phase 2: any of 6 feed Blob URLs non-200 | Halt before script edit; write incident in 02-anchor-seed-state.md. |
| Phase 2: dry-run output diverges from expected shape | Halt; write diff in 04-seed-dryrun.txt; do not commit script edit. |
| Phase 3: sub-agents report contradictory signatures | Halt before writing revised patch; surface to founder. |
| Phase 3: sub-agent discovers signature mismatch handoff did not anticipate | Extend `06-signatures-reference.md`; fold into revised patch (no halt). |

## Testing strategy

- **Phase 1 IS the test layer** for the 5 cowork-audit commits already on `main`.
- **No new `src/` code** in this session → no new vitest files.
- **Phase 2 script edit** is verified via the dry-run output (self-test); no automated test added for a one-off seed.
- **Phase 3 deliverable** is markdown documentation → no executable tests.

## Effort estimate

| Phase | Wall-clock |
|---|---|
| 1 | 10-15 min (typecheck + tests + lint runs in parallel where possible) |
| 2 | 20-30 min (inspection, HEAD checks, script edit, dry-run, approval doc, commit) |
| 3 | 45-60 min (5 parallel sub-agents + consolidation + revised patch write + README + commit) |
| 5 | 5 min (final summary) |
| **Total** | **~1.5-2h** |

## Out of scope

- Real `INSERT` of 6 feed anchors into prod DB (founder runs manually after approval).
- 6 stories anchors (deferred until Canva designs created).
- Applying Patch 04 to `src/` (future apply-session).
- `ClaudeBrandVoiceClient` implementation (handoff Phase 4, future session).
- Pushing commits to `origin/main` (founder reviews + pushes manually).
- Touching the 5 existing cowork-audit commits.
