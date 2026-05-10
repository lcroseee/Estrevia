# Next-session implementation — Estrevia advertising patches followup

> Paste the contents of this file as a single prompt into Claude Code,
> opened in `~/Documents/Projects/Estrevia/`.

---

Context: A previous Claude Code session shipped 5 commits implementing the
Cowork handoff patches (commits 83b43c0 through ce1961c on main). The
AI Content Label fix is now live in `src/modules/advertising/meta-graph-api/upload-client.ts`,
brand-policy regex is hardened with the Cáncer/Virgo exclusion, lead_magnet
archetype + 8 templates are in, and `scripts/advertising/seed-canva-anchor-creatives.ts`
is staged.

This session completes the remaining work in 4 phases. Each phase produces
a checkpoint document; pause between phases if needed.

## Hard constraints (apply throughout)

- The advertising agent is LIVE in production. Mutations require explicit
  approval pause points (defined per phase).
- DO NOT push, force-push, or open PRs without explicit founder approval.
- DO NOT modify or delete the existing 5 cowork-audit commits.
- DO NOT run `advertising:generate-launch-batch`, `advertising:publish-approved`,
  or any other script that creates real ad spend.
- DO NOT bypass `ADVERTISING_AGENT_DRY_RUN` flags.
- Brand voice rules (`docs/editorial-style-guide.md`): no fortune-telling,
  no medical/financial/legal advice claims, no Frieda Harris Thoth, sign
  names in Latin form in both EN and ES (Aries, Taurus, ..., Pisces;
  Cáncer and Virgo are correct), Spanish uses tú not usted.
- Geo policy: never propose targeting Argentina, UK, or Ireland.
- AI Content Label: every Meta upload path mutation must respect the flag
  set in commit 83b43c0; never weaken it.

## Phase 1 — Verify the 5 commits ship clean

Run the test / typecheck / lint suite. Output a checkpoint document
listing any failures. Do NOT attempt to fix failures in this phase — just
catalog them. If you find production-blocking issues, halt and report
before continuing to Phase 2.

Commands to run (in order):

```bash
npm run typecheck
npm test -- src/modules/advertising
npm run lint -- src/modules/advertising
```

Plus full-suite versions if time permits:

```bash
npm test
npm run lint
```

Save output of each command to:

```
~/Documents/Projects/Estrevia/.cowork-meta/phase1-verification-<TIMESTAMP>/
  ├── typecheck.txt
  ├── test-advertising.txt
  ├── test-full.txt
  ├── lint-advertising.txt
  └── lint-full.txt
```

Then write a summary at
`.cowork-meta/phase1-verification-<TIMESTAMP>/01-summary.md`:

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

Per failing test, give the file:line and the diff between expected and
actual that's worth flagging to the founder.

## Risk assessment

If any failure touches:
- meta-graph-api/upload-client.ts → P0 — AI Content Label may be affected
- creative-gen/safety/checks.ts → P0 — brand policy enforcement
- creative-gen/templates/hooks-{en,es}.ts → P1 — new templates
- decide/brand-voice-audit.ts → P1 — scorer interface
- shared/types/advertising/creative.ts → P0 — union extensions

For everything else, classify as P2.

## Recommendation

- If all P0 + P1 pass: GREEN — proceed to Phase 2
- If P0 fails: HALT — report to founder before proceeding
- If only P2 fails: YELLOW — note but proceed
```

Halt at red; proceed at green/yellow.

## Phase 2 — Complete the anchor creatives seed

The seed script at `scripts/advertising/seed-canva-anchor-creatives.ts`
exists but probably has placeholder ANCHOR_BLOBS (the patch left them as
`https://blob.vercel-storage.com/<HASH>/...` URLs that don't resolve).
This phase does the real work.

### Step 2.1 — Inspect the seed script state

Open `scripts/advertising/seed-canva-anchor-creatives.ts` and check:

- Are ANCHOR_BLOBS URLs real Vercel Blob URLs or still placeholders?
- Is the script idempotent (`onConflictDoNothing`)?
- Does it include all 12 records (6 feed + 6 stories) or are 6 stories
  still stubbed with a `// ...` comment per the original patch?

Report findings to
`.cowork-meta/phase1-verification-<TIMESTAMP>/02-anchor-seed-state.md`.

### Step 2.2 — Vercel Blob upload (if needed)

If ANCHOR_BLOBS URLs are placeholders, this phase needs to upload the
12 PNG files first.

Find the source PNGs. They were generated in a Cowork session and would
live at one of:

- `~/Documents/Projects/Estrevia/outputs/estrevia-meta-ads-v2/*.png`
- `~/Library/Application Support/Claude/local-agent-mode-sessions/.../outputs/estrevia-meta-ads-v2/*.png`
- Canva web URLs in the patch (signed URLs expire after 24h — likely
  already dead by now)

If PNGs are NOT findable locally:

- Halt Phase 2. Report to founder: "Source PNGs not found. Re-export
  the 12 designs from Canva using IDs in
  `outputs/cowork-handoff-2026-05-10/03-anchor-creatives-seed.md`, then
  rerun Phase 2."
- Do NOT attempt to re-generate via Canva MCP — the AI Content Label
  was not part of the original generation, and the prompts may have
  drifted.

If PNGs ARE found locally:

Write an upload helper script at
`scripts/advertising/upload-canva-anchors-to-blob.ts`. It should:

1. Read 12 PNG paths from a sourceDir (passed as CLI arg or default to
   the local PNG location).
2. For each PNG, call Vercel Blob's `put()` function from `@vercel/blob`
   (verify package is installed by checking `package.json`; add to
   dependencies if missing, install via `npm install @vercel/blob`).
3. Use deterministic blob keys like
   `advertising-anchors/2026-05-10/01-es-sidereal-accuracy-feed.png`
   so re-runs are idempotent.
4. Print a JSON object with the resulting blob URLs that can be pasted
   into the ANCHOR_BLOBS constant in `seed-canva-anchor-creatives.ts`.
5. Set `access: 'public'` (these are ad creatives, no PII).

Auth: requires `BLOB_READ_WRITE_TOKEN` env var in `.env` or Vercel CLI.
Check `.env` / `.env.local` for it. If missing, halt and ask.

Run the helper script. Capture output to
`.cowork-meta/phase1-verification-<TIMESTAMP>/03-blob-urls.json`.

### Step 2.3 — Fill ANCHOR_BLOBS + complete stories records

Update `scripts/advertising/seed-canva-anchor-creatives.ts`:

- Replace ANCHOR_BLOBS placeholders with real URLs from `03-blob-urls.json`
- If 6 stories records were stubbed `// ...`, enumerate them now using
  the same structure as the 6 feed records, with:
  - `hook_template_id` matching the new templates (see commit 739274f for
    actual ID strings — pull via `git show 739274f -- src/modules/advertising/creative-gen/templates/`)
  - `id` like `anchor-2026-05-10-{es,en}-{accuracy,passport,freechart}-stories`
  - `copy` and `cta` matching the Cowork-generated copy in
    `outputs/estrevia-meta-ads-v2/README.md` (read the Stories sections)

Commit the updated script:

```bash
git add scripts/advertising/seed-canva-anchor-creatives.ts \
        scripts/advertising/upload-canva-anchors-to-blob.ts
git commit -m "chore(advertising/anchors): wire real Blob URLs + complete stories records"
```

(Do NOT push yet.)

### Step 2.4 — Dry-run the seed script BEFORE actual insert

Add a `--dry-run` flag handler in the seed script if it doesn't already
have one. In dry-run mode it should print what it WOULD insert (anchor IDs,
URLs, hook_template_ids) without calling `.values(...)`.

Run dry-run:

```bash
npx tsx scripts/advertising/seed-canva-anchor-creatives.ts --dry-run
```

Output to `.cowork-meta/phase1-verification-<TIMESTAMP>/04-seed-dryrun.txt`.

Verify the 12 records look correct.

### Step 2.5 — APPROVAL PAUSE before real insert

Halt and write
`.cowork-meta/phase1-verification-<TIMESTAMP>/05-ready-to-seed.md`:

```markdown
# Ready to seed 12 anchor creatives — founder approval needed

## What will be inserted
- 12 rows in `advertisingCreatives` table
- All status='approved', generator='canva', approvedBy='<email>',
  approvedAt='2026-05-10T...'
- safetyChecks pre-populated with 5 PASS checks
- Idempotent: onConflictDoNothing protects re-runs

## Dry-run output
See 04-seed-dryrun.txt

## Verification
- [ ] All 12 IDs unique and don't collide with existing rows
- [ ] All hook_template_ids resolve in current hooks-{en,es}.ts
- [ ] Blob URLs are accessible (curl -I returns 200)
- [ ] AI Content Label: anchors are AI-generated (Canva) so upload-client
  will set creative_source='AI_GENERATED' when these are published via
  publishApprovedService — verified

## To proceed
Founder approval required. Reply in Cowork "seed anchors" to authorize.
Do NOT run the actual insert until the founder confirms.
```

After founder confirms (in a follow-up session or directly), run:

```bash
npx tsx scripts/advertising/seed-canva-anchor-creatives.ts
```

Capture output. Verify 12 rows inserted via:

```bash
npx tsx -e "import { getDb } from '@/shared/lib/db'; import { advertisingCreatives } from '@/shared/lib/schema'; import { eq } from 'drizzle-orm'; const db = getDb(); const rows = await db.select().from(advertisingCreatives).where(eq(advertisingCreatives.generator, 'canva')); console.log(rows.length, 'canva anchors');"
```

Commit the seed run timestamp marker:

```bash
git commit --allow-empty -m "chore(advertising/anchors): seeded 12 Canva brand anchors in DB (<DATE>)"
```

## Phase 3 — Patch 04 revision (status + digest API)

The original Patch 04 had 4 showstoppers identified in the verification
report (function signature mismatches). This phase rewrites Patch 04 as
a markdown proposal — NOT applied directly to `src/`.

### Step 3.1 — Locate the corrected signatures

Read in order:

- `src/modules/advertising/perceive/meta-insights.ts` (export
  `fetchMetaInsights`, not `getMetaInsights`)
- `src/modules/advertising/perceive/recon-state-store.ts` (export
  `getReconState`, not `getReconcilerState`; returns ReconState shape)
- `src/shared/lib/schema.ts` (find `advertisingDecisions` definition —
  columns are `id, timestamp, adId, action, deltaBudgetUsd, reason,
  reasoningTier, confidence, metricsSnapshot, applied, appliedAt,
  applyError, metaResponse`)
- `src/app/admin/lib/admin-auth.ts` (verify `requireAdmin` signature)
- `.env.example` (verify proposed env vars don't conflict)

Document actual function shapes in
`.cowork-meta/phase1-verification-<TIMESTAMP>/06-signatures-reference.md`.

### Step 3.2 — Write the revised patch

Output to
`~/Documents/Projects/Estrevia/outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer-revised.md`.

The revised patch should:

1. Use `fetchMetaInsights({ apiClient, dateFrom, dateTo })` instead of
   the assumed `getMetaInsights`. Show in the route how to construct
   `apiClient` (likely via `MetaGraphApiBase` or similar).
2. Use `getReconState()` returning `ReconState` with fields
   `{ suspended, suspendedAt, suspendReason, autoResumeAt, lastDriftPct }`.
   Map patch's `last_run` and `delta_pct` to these actual fields (or
   admit that some have no equivalent).
3. Use `advertisingDecisions.{adId, reasoningTier, timestamp}` instead
   of the wrong field names. Update all references.
4. Move brand_voice scoring lookup to its actual storage location (the
   verification report flagged it doesn't live in `safetyChecks`; find
   where `BrandVoiceScore[]` is persisted — search for usages of the
   `BrandVoiceScore` type).
5. Refactor digest extraction as `buildDigestData()` returning
   structured `DailyDigestReport`, with separate `formatTelegram()` and
   `formatMarkdown()` renderers (per verification feedback).
6. Use backward-compatible `sendAlert(severity, message, opts?)` shape
   instead of changing the positional signature.

Include `diff` blocks showing exact file changes. Reference real line
numbers from the codebase as of HEAD.

Do NOT apply this patch to `src/` in this session — it's a proposal for
founder review and a future apply-session.

### Step 3.3 — Update handoff README

Edit `outputs/cowork-handoff-2026-05-10/README.md` to reflect:

- Patch 04 has a revised version at `04-cowork-visibility-layer-revised.md`
- Original 04 superseded
- Apply order updated

## Phase 4 — Real brandVoiceScore client (stretch goal — only if time)

This phase only runs if Phase 1-3 finish with time remaining AND founder
hasn't paused the session. Otherwise defer to a future session.

The audit report flagged that `brandVoiceScore` is mock-only — Patch 1.3
(brand voice prompt enhancement) can't ship until a real client exists.

### Step 4.1 — Implement ClaudeBrandVoiceClient

Mirror the existing `ClaudeSafetyClient` pattern at
`src/modules/advertising/creative-gen/clients/claude-safety-client.ts`.

Create:

- `src/modules/advertising/creative-gen/clients/claude-brand-voice-client.ts`
- `src/modules/advertising/creative-gen/clients/__tests__/claude-brand-voice-client.test.ts`

Interface (matches `ClaudeClientForBrandVoice` in `brand-voice-audit.ts`):

```ts
export class ClaudeBrandVoiceClient {
  async brandVoiceScore(adId: string, copy: string): Promise<{
    depth: number;
    scientific: number;
    respectful: number;
    no_manipulation: boolean;
    overall: number;
  }>;
}
```

Implementation:

- Use Anthropic API directly (same pattern as `ClaudeSafetyClient`)
- Model: `claude-haiku-4-5` (cheap, scores don't need top-tier)
- Use the system prompt proposed in Patch 01.3 — but adapted to JSON-only
  output mode
- Parse response, extract `{ depth, scientific, respectful, no_manipulation }`,
  compute `overall` via `computeWeightedOverall()` from `brand-voice-audit.ts`
- Error handling: same fail-shut pattern as `ClaudeSafetyClient`
  ("treat invalid response as `needs_review=true`" — surface up to scorer)

Tests:

- Mock fetch
- Verify request shape (system prompt contains Brand Guidelines rules)
- Verify response parsing handles valid JSON
- Verify error cases (HTTP 4xx, malformed JSON, missing fields) return
  `needs_review=true` via fallback
- Cover happy path with mock scoring (depth=8, scientific=7, etc.)

Commit:

```bash
git add src/modules/advertising/creative-gen/clients/claude-brand-voice-client.ts \
        src/modules/advertising/creative-gen/clients/__tests__/claude-brand-voice-client.test.ts \
        src/modules/advertising/creative-gen/clients/index.ts
git commit -m "feat(advertising/clients): real ClaudeBrandVoiceClient implementation"
```

### Step 4.2 — Wire into orchestrator (proposal only)

Don't wire it in yourself. Write a markdown proposal at
`outputs/cowork-handoff-2026-05-10/07-brand-voice-wireup-proposal.md`,
describing:

- Where to instantiate `ClaudeBrandVoiceClient`
- Which orchestrator call site receives the real client (replacing the
  mock)
- Env var needed (`ANTHROPIC_API_KEY` likely already exists)
- Feature flag suggestion (e.g., `BRAND_VOICE_SCORER_ENABLED`) to gate
  rollout

Founder reviews and applies wireup in a future session.

## Phase 5 — Final summary + decision document

Write
`~/Documents/Projects/Estrevia/.cowork-meta/phase1-verification-<TIMESTAMP>/00-final-summary.md`:

```markdown
# Session summary — <TIMESTAMP>

## What was done
- Phase 1: verification — X passed, Y failed
- Phase 2: anchor seed — completed / blocked at upload / blocked at insert
- Phase 3: Patch 04 revised — file at outputs/.../04-revised.md
- Phase 4: brandVoiceScore client — implemented / deferred

## What's blocking
- <if Vercel Blob token missing, list it>
- <if PNGs not found locally, list it>
- <if test failures need founder review, list them>

## What's pending founder action
1. Approve seed insert (Phase 2.5)
2. Review Patch 04 revised (Phase 3)
3. Review brandVoiceScore implementation (Phase 4)
4. Push commits to main

## Push checklist (founder runs after review)
git log --oneline origin/main..HEAD  # show what's local
git push origin main                  # if approved
```

Print one-line summary at end:

```
Session complete. <PHASES_DONE>/4 phases finished.
Founder action items in .cowork-meta/phase1-verification-<TIMESTAMP>/00-final-summary.md
```

## Reminders before you start

- Use vitest for any new test files (matches existing convention)
- Add MIT/AGPL attribution comments where importing third-party patterns
- Tests should mirror existing `__tests__/` folder structure
- Read `CLAUDE.md` before each phase if you've context-paged
- The 5 commits already on main are good — don't try to "improve" them
  without explicit ask
- This is a production system. When in doubt, halt and write a checkpoint
  document; don't guess.
