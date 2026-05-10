# Cowork Audit Roadmap — Design

**Date:** 2026-05-10
**Author:** Kirill (founder) + Claude
**Status:** Approved (sections 1-4)

## Context

The Cowork session on 2026-05-10 produced four patch proposals against the production advertising agent at `src/modules/advertising/`. A read-only verification audit of those patches (see `outputs/cowork-handoff-2026-05-10/05-verification-report.md`) identified **5 showstoppers, 8 significant concerns, and 9 minor adjustments**.

The most consequential finding is **AI Content Label compliance gap (P0)**: zero references to `is_ai_generated`, `creative_source`, or `AI_GENERATED` exist anywhere in `src/` or `scripts/`. Marketing API in production is `v22.0`. Every AI-generated ad creative uploaded by the agent since this pipeline went live (around 2026-04-26) is theoretically at policy risk under Meta's March 2026 AI Content Label rule. The other findings range from regex correctness traps (Cáncer/Virgo false positives) to a missing real `brandVoiceScore` Anthropic client to multiple compile-time errors in Patch 04's status route.

This spec defines a **single-week roadmap** to ship the safe, audit-validated subset of the Cowork work, while explicitly deferring two patches that need more thinking (`Patch 1.3` brand-voice scorer client, `Patch 04` Cowork visibility layer).

## Goal

Within one week (2026-05-10 → 2026-05-17), ship to `main`:

1. **AI Content Label** on all new non-Satori Meta uploads, closing the P0 compliance gap before any other work.
2. **Patch 01 fixes** to safety regex, Meta policy prompt, and brand palette — with the audit's corrections applied (no `Cáncer`/`Virgo` false positives, `BRAND_PROMPT` reordered to match new palette indices, no `Patch 1.3`).
3. **Patch 02 templates** — `lead_magnet` archetype + 6 new hook templates (3 EN + 3 ES).
4. **Patch 03 anchors** — 12 Canva-generated brand-anchor creatives seeded as `pre_approved` in `advertising_creatives`, with assets uploaded to Vercel Blob via Canva MCP automation.

## Non-goals (this week)

- `Patch 1.3` brand-voice scorer Claude prompt — requires implementing a real `brandVoiceScore` Anthropic client first (only the test mock at `__tests__/mocks/claude.ts:5` exists). Separate spec, separate week.
- `Patch 04` Cowork visibility layer — three function-signature mismatches and three column-name mismatches make it a structural rewrite rather than an apply-as-is. Separate spec, separate week.
- AI Content Label backfill for ads uploaded before this fix lands. New uploads carry the flag; old ads stay as-is unless Meta enforces retroactively.
- Phase A archetype weighting (proposed in Patch 02 commentary) — would belong in `creative-gen/batch/generate-launch-set.ts`, not `senior-buyer/policies/phase-a.ts`. Out of scope.
- Anchor-flag column or `is_anchor` schema migration (proposed in Patch 03 commentary) — anchors flow through normal pause/scale logic in this iteration; special-handling is deferred until performance data justifies it.

## Out of scope / Backlog (next iterations)

- **Patch 1.3 — brandVoiceScore real client.** Build Anthropic API call, response parsing, integrate with `decide/brand-voice-audit.ts`, then ship the prompt from the patch.
- **Patch 04 — Cowork visibility layer.** Rewrite status route against actual `fetchMetaInsights` / `getReconState` / `advertisingDecisions` schemas; refactor `sendDailyDigest` extraction as `buildDigestData()` + parallel `formatTelegram()` / `formatMarkdown()` renderers; preserve `sendAlert` backward compat.
- **AI Content Label backfill.** Bulk-update existing `advertising_creatives.metaAdId` rows where `generator !== 'satori'` via Marketing API. Decide if/when based on whether Meta enforces retroactively.

## Architecture

### Two-step structure

```
Step 1 (sequential, P0)              Step 2 (3 parallel tracks)
─────────────────────────────        ──────────────────────────────────────

  AI Content Label fix               Track A: Patch 01 fixes
  in upload-client.ts                (safety regex + palette)
        │                                    │
        ▼                                    ▼
  smoke-test against            Track B: Patch 02 templates
  test ad creation                     (lead_magnet + 6 hooks)
        │                                    │
        ▼                                    │
  commit + push + deploy           Track C: Patch 03 anchors
        │                              (Canva MCP → Vercel Blob → seed)
        │                                    │
        └─────────────► main ◄───────────────┘
                         (3 separate commits, serialized on shared file)
```

### Coordination model

- **Step 1** ships first as a single commit. Compliance is closed before any other work touches the upload pipeline.
- **Step 2** runs three subagents in parallel via git worktrees (`isolation: 'worktree'` on each `Agent` invocation). This gives each track a clean copy of the repo with no shared file state during work.
- **Shared file `src/shared/types/advertising/creative.ts`**: Track B touches `HookArchetype`; Track C touches `GeneratedAsset.generator`. To avoid merge conflicts, **Track C commits after Track B is merged into `main`**. Track C's worktree must `git pull` before its final commit.
- **All other files are disjoint** between tracks — no other coordination needed.

## Step 1 — AI Content Label fix

### Pre-implementation (micro-step 0)

- WebFetch Meta Marketing API v22.0 documentation to confirm the canonical AI Content Label field name. Candidates seen in field reports:
  - `creative_source: "AI_GENERATED"` on the AdCreative object
  - `degrees_of_freedom_spec.creative_features_spec.standard_enhancements.enroll_status`
  - A nested field under `object_story_spec.link_data`
- Lock the field name before writing code. Document the chosen field in the commit message for future reference.

### Code changes

**1. Extend `MetaApiClient` interface** at `src/modules/advertising/creative-gen/upload/meta-upload.ts:9-17`:

```ts
export interface MetaApiClient {
  uploadCreative(opts: {
    asset_url: string;
    copy: string;
    cta: string;
    locale: string;
    tracking: TrackingParams;
    is_ai_generated: boolean;  // NEW
  }): Promise<{ creative_id: string; ad_id: string }>;
}
```

**2. Implement field in `MetaUploadClient.uploadCreative`** at `src/modules/advertising/meta-graph-api/upload-client.ts:21-86`:

In the `creativeRes` POST body (currently lines 52-71), add the AI Content Label field at the location indicated by Meta docs (likely on the AdCreative object alongside `name` and `object_story_spec`, or nested in `object_story_spec`):

```ts
const creativeRes = await this.request<MetaIdResponse>(
  'POST',
  `/${this.adAccountId}/adcreatives`,
  {
    name: `creative_${opts.tracking.utm_content}`,
    // ... AI Content Label field per Meta docs, gated on is_ai_generated ...
    object_story_spec: { ... },
  },
);
```

When `is_ai_generated === false` (Satori), the field is either omitted or set to the explicit non-AI value per Meta's spec.

**3. Caller-site `publish-batch/route.ts:81-86`** — extend `selectApproved()` SELECT to include `generator`, propagate through `ApprovedRow`, pass `is_ai_generated: row.generator !== 'satori'` to `uploadCreative()`:

```ts
async selectApproved(): Promise<ApprovedRow[]> {
  const rows = await db.select({
    id: advertisingCreatives.id,
    copy: ...,
    generator: advertisingCreatives.generator,  // NEW
    // ... existing fields
  }).from(advertisingCreatives).where(...);
  return rows.map(r => ({ ...r, locale, assetKind })); // type stays compatible
},
async uploadCreative(row) {
  return uploadClient!.uploadCreative({
    asset_url: row.assetUrl, copy: row.copy, cta: row.cta, locale: row.locale,
    tracking: buildTracking(row),
    is_ai_generated: row.generator !== 'satori',  // NEW
  });
},
```

**4. Extend `ApprovedRow` type** at `src/modules/advertising/meta-graph-api/publish-approved-service.ts:3-12`:

```ts
export interface ApprovedRow {
  // ... existing fields
  generator: string;  // NEW — drives is_ai_generated decision in caller
}
```

**5. Update `scripts/advertising/publish-approved.ts`** — uses the same upload code path; update consistently with the route handler.

### Logic (single source of truth)

`is_ai_generated = (generator !== 'satori')`. Satori is deterministic templating — not AI. All other generators in the union (`imagen-*`, `nano-banana-*`, `ideogram-3`, `veo-3-1-lite`, `runway-gen-4`, future `'canva'`) are AI-generated.

### Tests

- Unit (`meta-graph-api/__tests__/upload-client.test.ts`): two cases — `is_ai_generated: true` (field present in request body) and `false` (field absent or explicit non-AI value).
- Manual smoke: one test creative through `POST /api/admin/creatives/publish-batch?dry_run=1` (verify request shape in logs), then `dry_run=0` against a test ad set, verify in Meta Ads Manager UI that the AI Content Label badge is visible on the creative.

### Commit

`fix(advertising/upload): set AI Content Label on Meta creative upload`

Single commit. Push. Vercel auto-deploys. Verify smoke test passes in production before starting Step 2.

## Step 2 — Three parallel tracks

### Track A — Patch 01 fixes (safety hardening)

**Files touched:**
- `src/modules/advertising/creative-gen/safety/checks.ts`
- `src/modules/advertising/creative-gen/safety/__tests__/checks.test.ts`

**Changes:**

1. **Extend `PERSONAL_CLAIM_PATTERNS`** (line 32):
   - EN fortune-telling: `\bfate\b`, `\bdestiny\b`, `\bwhat awaits you\b`, `\bawaits you\b`, `\bpredict your\b`, `\bforetell\b`
   - ES predictive: `\bpredice tu\b`, `\btu futuro\b`, `\btu destino\b`, `\bte espera\b`, `\badivina\b`
   - EN absolutism: `\b(all|every) (aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b`, `\bevery person with this\b`
   - ES absolutism (masculine + feminine): `\btodos los (aries|...)\b`, `\btodas las (aries|...)\b`
   - ES "usted" form: `\busted\b`
   - Translated sign names (forms that diverge from Latin): `\btauro\b`, `\bgéminis\b`, `\bescorpio\b`, `\bsagitario\b`, `\bcapricornio\b`, `\bacuario\b`, `\bpiscis\b`
   - **Explicitly NOT added**: `\bcáncer\b` and `\bvirgo\b`. Rationale: the audit identified that `Cáncer` and `Virgo` are the canonical Latin forms required in both EN and ES per CLAUDE.md. Blocking them would auto-reject every Cancer/Virgo creative.

2. **Extend `META_POLICY_PROMPT`** (line 64) with the additions from the patch: fluff phrases (`cosmic dance`, `stars whisper`, `celestial tapestry`), apologizing language (`some believe`, `according to astrologers`, `whether you believe`), mocking tropical astrology, Title Case in headings, Book of Thoth content (copyright until 2039), James Eshelman direct quotation.

3. **Update `BRAND_PALETTE`** (line 132) to the four canonical colors verified against `docs/design.md`:

   ```ts
   export const BRAND_PALETTE = [
     '#0A0A0F',  // Deep Space — primary background
     '#12121A',  // Dark Navy — surface
     '#F0F0F5',  // Ivory — primary text
     '#FFD700',  // Gold — accent
   ] as const;
   ```

4. **Update `BRAND_PROMPT`** (line 134-139) so the positional interpolation (`${BRAND_PALETTE[0]}` etc.) matches the new index meaning. The current prompt hardcodes color names (`gold`, `silver`, `deep purple`, `dark navy`); rewrite to use new names (`background`, `surface`, `text`, `accent`):

   ```ts
   const BRAND_PROMPT = `Does this image use the Estrevia astrology brand palette? \
   Approved colors: deep space (${BRAND_PALETTE[0]}), dark navy (${BRAND_PALETTE[1]}), \
   ivory (${BRAND_PALETTE[2]}), gold (${BRAND_PALETTE[3]}). ...`;
   ```

**Tests:**
- Positive cases for each new regex pattern in `personalClaimCheck`.
- Explicit negative cases that MUST pass: `"Cáncer es emocional"`, `"Virgo placement"`, `"Aries can be impulsive at times"`, `"explore your sidereal placements"`.
- META_POLICY_PROMPT prompt-text test (verify prompt contains new substrings).
- BRAND_PROMPT test verifying the new color labels match the new palette indices.

**Commit:** `feat(advertising/safety): brand-policy regex hardening + canonical palette`

### Track B — Patch 02 templates

**Files touched:**
- `src/shared/types/advertising/creative.ts` (HookArchetype union)
- `src/modules/advertising/creative-gen/templates/hooks-en.ts` (4 new entries)
- `src/modules/advertising/creative-gen/templates/hooks-es.ts` (4 new entries)
- `src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts` (create or extend)
- `src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts` (create or extend)
- `src/modules/advertising/creative-gen/batch/__tests__/generate-launch-set.test.ts` (extend if distribution test fails on new archetype)

**Changes:**

1. `HookArchetype` += `'lead_magnet'`. No exhaustive switch sites exist (verified by grep across `src/` + `scripts/`), so this is purely additive.

2. **EN templates** (append to `hooks-en.ts`): `en-rarity-7` (Cosmic Passport variant), `en-lead-magnet-1` (Free Sidereal Chart), `en-lead-magnet-2` (Map Your Sky), `en-lead-magnet-3` (Not a Horoscope) — copy as in patch 02.

3. **ES templates** (append to `hooks-es.ts`): `es-rarity-7`, `es-lead-magnet-1`, `es-lead-magnet-2`, `es-lead-magnet-3` — copy as in patch 02. Verified to contain no `usted` and no translated sign names (forbidden forms).

**Tests:**
- Each new template: assert `archetype` value, locale, and `policy_constraints` non-empty.
- ES templates: `expect(template.copy_template).not.toMatch(/\busted\b/i)` and `expect(template.copy_template).not.toMatch(/\b(tauro|géminis|escorpio|sagitario|capricornio|acuario|piscis)\b/i)`.
- Distribution test in `generate-launch-set.test.ts`: verify `lead_magnet` archetype is selectable from the matrix.

**Out of scope (this week):** Phase A archetype weighting. Belongs in `creative-gen/batch/generate-launch-set.ts`, not `senior-buyer/policies/phase-a.ts`. Backlog.

**Commit:** `feat(advertising/templates): add lead_magnet archetype + 6 hook templates (EN/ES)`

### Track C — Patch 03 anchors

**Files touched:**
- `src/shared/types/advertising/creative.ts` (GeneratedAsset.generator) — **shared with Track B**
- `scripts/advertising/seed-canva-anchor-creatives.ts` (new file)
- `package.json` (new npm script)
- `scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts` (new file)

**Coordination:** Track C waits for Track B's commit to land in `main`, then `git pull` in its worktree before adding `'canva'` to the union and committing.

**Workflow:**

1. **Type extension:** `GeneratedAsset.generator` += `'canva'`. DB column is plain `text`, no enum migration needed; zero exhaustive switches on generator (verified).

2. **Canva MCP discovery (subagent first action):**
   - Call `mcp__claude_ai_Canva__list-brand-kits` to verify access to Brand Kit `kAGT_ANQrn8`. If access denied, halt and surface the error to the founder for credential fix.
   - Call `mcp__claude_ai_Canva__search-designs` to find the 12 anchor designs from prior Cowork work (6 feed-format `1080x1350`, 6 stories-format `1080x1920`).
   - For each design, call `mcp__claude_ai_Canva__export-design` (PNG, highest resolution available) → receive a Canva signed URL (~24h validity).

3. **Vercel Blob upload (subagent action via one-shot script):**
   - Write a temporary helper script that uses `@vercel/blob`'s `put()` to fetch each Canva PNG and upload to Vercel Blob with `access: 'public'`, capture the permanent URLs.
   - 12 permanent Vercel Blob URLs returned. Hard-code into `seed-canva-anchor-creatives.ts`.

4. **Seed script `seed-canva-anchor-creatives.ts`:**
   - 12 anchor records: 6 feed + 6 stories, each with EN or ES locale, mapped to `hook_template_id` per patch 03 (e.g., `es-rarity-7`, `en-lead-magnet-1`, plus synthetic IDs like `en-identity-reveal-7-anchor` for the accuracy concept that has no template equivalent — these are valid because `hook_template_id` has no FK constraint).
   - Each record: `status: 'approved'`, `generator: 'canva'`, `costUsd: 0`, `approvedBy: process.env.FOUNDER_EMAIL`, `approvedAt: new Date('2026-05-10T00:00:00Z')`, `safetyChecks: PRE_APPROVED_CHECKS` (all five marked passed with `severity: 'info'`).
   - Use `.onConflictDoNothing()` for idempotency (matches existing usage at `webhooks/stripe/route.ts:146`).

5. **`package.json` script:** `"advertising:seed-canva-anchors": "tsx scripts/advertising/seed-canva-anchor-creatives.ts"`. Matches naming convention of existing `advertising:*` scripts.

6. **Execute seed against production DB:** subagent runs `npm run advertising:seed-canva-anchors` against prod DATABASE_URL. Idempotent; safe to re-run.

7. **Verification:** subagent runs `psql` (or equivalent) `SELECT COUNT(*), generator FROM advertising_creatives WHERE generator='canva' GROUP BY generator` → expects `12, 'canva'`.

**Tests:**
- Unit test for the seed script with mocked DB — verify 12 records constructed with correct shape, `status='approved'`, `generator='canva'`, all five safety checks passed.

**Commit:** `feat(advertising/anchors): seed 12 Canva brand anchors as pre-approved creatives`

## Testing strategy

### Pre-commit checklist

Each subagent — and the Step 1 commit — runs before committing:

```sh
npm run typecheck
npm run lint
npm test
```

Green pipeline is a precondition for committing. Per CLAUDE.md "Test before done" rule.

### Smoke tests (manual, post-deploy)

| Step | Smoke test |
|---|---|
| Step 1 | `POST /api/admin/creatives/publish-batch?dry_run=1` then `dry_run=0` with one test creative; verify AI Content Label badge in Meta Ads Manager UI |
| Track A | Run `npx vitest run src/modules/advertising/creative-gen/safety/__tests__/checks.test.ts`; eyeball negative cases (Cáncer/Virgo) pass |
| Track B | `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/`; spot-check ES templates for `usted` / translated sign names |
| Track C | `psql -c "SELECT COUNT(*), status, generator FROM advertising_creatives WHERE generator='canva' GROUP BY status, generator"` → expects 12, `approved`, `canva` |

## Rollback strategy

Direct-to-main + Vercel auto-deploy means each commit is live in production immediately.

| Step | Rollback |
|---|---|
| Step 1 | `git revert <sha>` → push → redeploy. AI Content Label field removed from request body. No urgency. |
| Track A | `git revert <sha>` → push. Regex / palette / prompt revert to pre-patch state. |
| Track B | `git revert <sha>` → push. Templates revert; batch generator falls back to existing 36 templates. |
| Track C | `git revert <sha>` → push. **Plus** manual DB cleanup: `DELETE FROM advertising_creatives WHERE generator='canva'`. Vercel Blob objects can be left (low cost) or deleted via dashboard. |

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Marketing API v22.0 AI Content Label field name differs from initial guess | Medium | Step 1 micro-step 0: WebFetch Meta docs; lock field name before writing code |
| Canva MCP lacks access to Brand Kit `kAGT_ANQrn8` | Low | Track C subagent first action: `list-brand-kits` access check; halt + escalate if denied |
| Track C completes Blob upload but seed insert fails | Low | Idempotent on re-run via `.onConflictDoNothing()`; Blob URLs hard-coded so re-run does not re-upload |
| New BRAND_PALETTE breaks existing creatives' brand_consistency check | Low | `brandConsistencyCheck` returns `severity: 'warning'`, not `'block'` (`checks.ts:170-175`); no upload-blocker |
| New regex blocks an already-approved creative in pending_review | Very low | `personalClaimCheck` runs only on upload, not on existing approved rows |
| Subagent in Track B/C fails partway, leaves repo in inconsistent state | Low | Worktree isolation: failed subagent's worktree can be discarded without affecting `main` or other tracks |
| Meta enforces AI Content Label retroactively on existing ads | Low-Medium | Backfill is in backlog; if Meta sends a strike notice, prioritize backlog item immediately |

## Acceptance criteria

Definition of done for the week:

1. AI Content Label field present in request body for all new non-Satori uploads — verified in Meta Ads Manager UI smoke test
2. `PERSONAL_CLAIM_PATTERNS` extended with all new bilingual regex (excluding `\bcáncer\b` and `\bvirgo\b`)
3. `BRAND_PALETTE` = `['#0A0A0F', '#12121A', '#F0F0F5', '#FFD700']` and `BRAND_PROMPT` rewritten to match new index semantics
4. `META_POLICY_PROMPT` extended with fluff/apologizing/Title Case/Thoth/Eshelman clauses
5. `HookArchetype` includes `'lead_magnet'`
6. 8 new hook templates in repo: `en-rarity-7`, `en-lead-magnet-1/2/3`, `es-rarity-7`, `es-lead-magnet-1/2/3`
7. `GeneratedAsset.generator` includes `'canva'`
8. 12 anchor records in `advertising_creatives` with `status='approved'`, `generator='canva'`, all `safetyChecks` pre-passed
9. All 4 commits in `main`; `npm run typecheck`, `npm run lint`, `npm test` all green
10. Backlog items recorded: AI Content Label backfill, Patch 1.3 brandVoiceScore client, Patch 04 visibility layer

## Observability during the change window

The advertising agent is live with active campaigns. During this week:

- **Telegram tier-1 alerts continue as normal.** Kill-switch, account-emergency, pixel/CAPI failure, and reconciler critical-drift alerts are not touched.
- **Sentry** automatically captures upload errors. Watch for any spike correlated with the Step 1 deploy.
- **Per-commit verification**: after each push, run `npm run advertising:verify-prod-state` if available, or manual SQL spot-check on `advertising_creatives` and `advertising_decisions`.
- **AI Content Label visibility check**: 24h after Step 1 deploys, confirm in Meta Ads Manager that newly-uploaded creatives carry the badge. If they don't, the field name was wrong — revert and re-investigate.
