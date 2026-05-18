# Wave 2 Closeout Design

**Date:** 2026-05-17
**Status:** Spec — pending plan
**Author:** brainstorm session (Kirill + Claude Opus 4.7)
**Related:** [Wave 2 conversion foundation spec](./2026-05-17-wave-2-conversion-foundation-design.md) · session memory `project_lead_nurture_drip_fully_live` (not in repo)

## 1. Goal

Close out Wave 2 as a complete milestone. Wave 2 shipped technical foundation (useFeatureFlag hook, pricing CRO, 6-step nurture drip wiring, Sev1 result.error fix, migration 0012) but left six founder-owed items unaddressed. This design closes all six in a single coordinated execution.

The six items, as enumerated in [`project_advertising_audit_2026_05_17_wave2`](memory) and verified live:

1. **PostHog `wave2-demo-flag`** — flag must exist in PostHog project 407908 so `useFeatureFlag()` documentation example resolves
2. **`chart-keywords.ts` 72 strings** — current entries are engineer-placeholder generic ("pioneer energy", "sensual grounded feeling"); must be rewritten with Vedic-flavor anchors
3. **SaturnWeekly + SynastryTeaser email body copy** — current bodies are generic/lying ("Saturn rules discipline..." with no transit; recap line listing prior sends)
4. **ES translation review** — all new Wave 2 ES strings written by engineer/Claude; need native LATAM pass
5. **Vercel CLI upgrade** — 53.2.0 → 54.1.0+ (current version requires `--archive=tgz` workaround and has known `env add --yes` bug)
6. **Wave 1 T5 close** — baseline doc + 2 PostHog dashboards + smoke test + footer

## 2. Constraints

- Drip is **live in production** as of 2026-05-17 — content slop reaches real subscribers. Reputational risk on email channel.
- Founder has deep Vedic + native Spanish (LATAM) domain expertise; engineer-written content is presumptively slop.
- Founder is solo; sync-blocking workflow stalls the work. Asynchronous handoffs preferred.
- PostHog Personal API key already provisioned in Vercel env (`POSTHOG_PERSONAL_API_KEY`); can be pulled to local `.env` for scripted access.
- No production deploy required by this closeout — content changes ship on next deploy (next session or push trigger).

## 3. Architecture: Three Theme Tracks

Parallel execution across three independent tracks. Tracks share no mutable state, so they interleave with CPU-style time-slicing during the I-work session, then async on founder side.

```
Track A — Ops          [~5 min]
  ├─ A1: #2 PostHog flag (Claude via API)
  └─ A2: #6 Vercel CLI upgrade (founder, 30 sec)

Track B — Measurement  [~30 min Claude + ~10 min founder async]
  ├─ B1: baseline doc (Claude)
  ├─ B2: PostHog dashboards × 2 (Claude via API)
  ├─ B3: smoke test (founder async)
  └─ B4: close footer (Claude, after B3)

Track C — Content      [~45 min Claude strawman + ~20 min founder polish]
  ├─ C1: chart-keywords.ts 72-string rewrite (Claude strawman, founder polish)
  ├─ C2: SaturnWeekly evergreen rewrite (Claude strawman, founder polish)
  ├─ C3: SynastryTeaser recap-lie fix (Claude, small)
  └─ C4: ES review doc generation + apply (Claude generates, founder annotates, Claude applies)
```

## 4. Per-Item Designs

### Track A — Ops

#### A1: PostHog `wave2-demo-flag` (#2)

**Owner:** Claude (via REST API)

**Files affected:** None in repo. Side effect on PostHog project 407908.

**API contract:**
- Auth: `Authorization: Bearer ${POSTHOG_PERSONAL_API_KEY}` from `.env` (pull via `vercel env pull .env` first if missing)
- POST `https://us.posthog.com/api/projects/407908/feature_flags/`
- Body:
  ```json
  {
    "key": "wave2-demo-flag",
    "name": "Wave 2 demo flag (docs validation)",
    "filters": {"groups": [{"rollout_percentage": 0}]},
    "active": true
  }
  ```
- Idempotency: if `409 Conflict` or feature already exists, treat as success
- Verify: GET `https://us.posthog.com/api/projects/407908/feature_flags/?key=wave2-demo-flag` returns exactly 1 entry

**Exit criterion:** Flag exists in PostHog UI at https://us.posthog.com/project/407908/feature_flags. Calling `useFeatureFlag<boolean>('wave2-demo-flag', false)` in browser console resolves (not just fallback).

**Fail mode:** 403 (Personal API key scope wrong) → fall back to manual instructions written into baseline doc; founder creates in UI.

**Script:** `scripts/wave2-closeout/_seed_posthog_demo_flag.mjs` — inline-and-delete pattern (do not commit; deletes after success).

#### A2: Vercel CLI upgrade (#6)

**Owner:** Founder

**Steps:** `npm i -g vercel@latest` (or `pnpm add -g vercel@latest`). Then `vercel --version` to confirm ≥ 54.x.

**Exit criterion:** `vercel --version` outputs `54.1.0` or newer.

**Why now:** 53.2.0 requires `--archive=tgz` workaround for projects with >15k files (Estrevia has 31417); 53.x has known `env add preview --yes` silent-fail bug (memory `feedback_vercel_cli_preview_yes_bug`). 54.x may resolve both.

**Fail mode:** 54.x breaks something → revert to 53.2.0 via `npm i -g vercel@53.2.0`.

### Track B — Measurement (#7 Wave 1 T5 close)

#### B1: Baseline doc

**Owner:** Claude

**File:** `outputs/wave-1-checkpoint/00-baseline.md` (new)

**Content sections:**
1. **Header** — date, branch, deploy id (`dpl_HqTjJzr5taYtFiUniaKmWYjNoVBg`), git sha at deploy
2. **Funnel snapshot 2026-05-17** —
   - Charts calculated /30d: 137
   - Email-gate conversion rate: 28.5%
   - `email_leads` rows: live count from DB
   - `sent_lead_emails` rows by type: live count from DB
   - `chart_readings` rows: live count from DB
   - Lead → user conversion: stated as 0% with note "artifactual — drip shipped today, re-measure 2026-05-20"
   - Real paid subscriptions /30d: 0 (from `users.subscription_status`)
3. **Wave 2 deploy snapshot** —
   - Sev1 fix: commit `c94316f` shipped 2026-05-17 evening
   - Wave 2 cron extension: commit `74a67fc`
   - Migrations: 13 applied (0011 + 0012 added 2026-05-17)
   - Partial-index predicate: `nurture_step < 6`
4. **Smoke test placeholder** — empty section for founder fill-in post-B3
5. **Links** — to runbooks, PostHog dashboards (post-B2), related memories

**Data source:** Inline-and-delete one-shot Neon serverless client scripts (same pattern as `_verify_migration_0012.mjs` used earlier this session). Scripts go in `scripts/wave2-closeout/`, prefixed `_query_*.mjs`, deleted after run.

**Exit criterion:** File exists, all numeric values are live (not placeholders), commits referenced are real, smoke section explicitly empty awaiting B3.

#### B2: PostHog dashboards × 2

**Owner:** Claude (via REST API)

**Dashboards to create:**

1. **Full-funnel north-star** — source: `docs/posthog/full-funnel-north-star-runbook.md`
2. **Paywall-funnel** — source: paywall variant runbook in `docs/posthog/` (verify exact filename before starting)

**API contract:**
- POST `/api/projects/407908/dashboards/` with `{name, description, pinned: true}` → returns dashboard id
- For each chart in runbook: POST `/api/projects/407908/insights/` with insight spec (`{name, dashboards: [id], query: {...}, filters: {...}}`)
- Pacing: 1s between requests to stay under PostHog rate limit (60/min)
- Verify: GET `/api/projects/407908/dashboards/` lists both new entries

**Insight types in scope:** funnels, trends, retention (the basics covered by PostHog public API). For any insight type that PostHog API does not document cleanly, create a **skeleton dashboard** = dashboard entity exists with name + description set, but specific insight is omitted; baseline doc records "insight X must be added in UI: paste this query — `<exact PostHog query string>`".

**Exit criterion:** Both dashboards URL-accessible in PostHog UI; baseline doc references them by URL.

**Fail mode:** Insight API quirk → skeleton dashboard + manual-tuning note in baseline.

**Script:** `scripts/wave2-closeout/_seed_posthog_dashboards.mjs` — inline-and-delete; deletes after success.

#### B3: Smoke test

**Owner:** Founder (async)

**Runbook:** `docs/runbooks/founder-first-purchase-smoke.md` (verify exists; if missing, defer to ad-hoc and document the gap)

**Pre-requisite:** B1 + B2 complete so result has a baseline to land in.

**Steps as defined by runbook:** Real customer purchase flow end-to-end on production, real (or Stripe test mode) card, verify subscription appears, verify confirmation email lands, verify chart-readings record created.

**Exit criterion:** Founder writes outcome into baseline doc's smoke section. Outcome = pass / fail with details.

**Fail mode (real bug discovered):** New Sev1 spec opened, baseline-doc smoke section records "blocked by [link]", baseline still commits.

#### B4: Close footer

**Owner:** Claude (after B3)

**Steps:** Append "Wave 1 closed" section to baseline doc with smoke timestamp + outcome. Update `project_advertising_audit_2026_05_17_wave1` memory to mark T5 done. Create memory `project_wave2_closed_2026_05_17` linking baseline + all 9 commits.

**Exit criterion:** Baseline doc has explicit "closed" footer with date; memory entry created and indexed in `MEMORY.md`.

### Track C — Content

#### C1: chart-keywords.ts 72 strings × 2 locales

**Owner:** Claude strawman, founder polish

**File:** `src/shared/lib/chart-keywords.ts` (rewrite lines 26-55 in place)

**Constraints per entry:**
- Length: ≤ 80 chars (fits email template line)
- Voice: observation, not prescription. No "embrace", "unlock", "discover your inner". No horoscope-app generic.
- Anchor: each entry contains one named Vedic-flavor noun (Mars-impulse, chandra, saturnine, drekkana-shadow, sade-sati, ruler-of-1st, navamsa-echo, atmakaraka-thread). Flavor, not lecture — reader does not need to look it up.
- Pairing: Sun/Moon/Asc per sign should feel like three angles of the same person, not three independent statements.

**Strawman examples (EN) provided in brainstorm — illustrative, not final:**
```
aries.sun:  "the unspent Mars-impulse — a fire that needs to be aimed, not numbed"
cancer.moon: "the Moon at home — the tide that knows itself by what it shelters"
capricorn.asc: "the saturnine doorway through which strangers first feel your weight"
pisces.sun: "the dissolved self — boundary becomes the edge of the tide"
```

**ES strawman approach:** Claude writes ES draft for all 72 entries in the same C1 commit (not deferred to C4). C4 reviews the ES alongside other Wave 2 ES strings, but the ES strings exist in source from C1 commit forward. Style: `feedback_spanish_style` — LATAM neutro, tú form, sign names untranslated (`aries`, not `aries.es`), planet names translated (`Marte`, `Luna`, `Saturno`). Pre-commit verification: every ES entry must be present, ≤80 chars, and contain at least one Vedic-flavor anchor matching the EN entry's anchor (e.g., if EN says "Mars-impulse", ES says "impulso marciano" or "impulso de Marte").

**Exit criterion:** 72 EN + 72 ES strings. All ≤ 80 chars. All containing a named Vedic-flavor anchor. Schema tests pass: `npx vitest run src/shared/lib/__tests__/chart-keywords.test.ts` (existing 72-keyword schema tests; content quality is founder-call).

#### C2: SaturnWeeklyEmail evergreen rewrite

**Owner:** Claude strawman, founder polish

**File:** `src/emails/SaturnWeeklyEmail.tsx` (rewrite STRINGS objects, lines 11-30)

**Reframe:** Drop time-claim words ("this week", "right now", "today", "currently"). Anchor in **sade-sati** as well-known Vedic landmark — recognizable to anyone with Brihat Parashara Hora basics, comprehensible to non-experts via structural number references (12th → 1st → 2nd house).

**Subject line:** Change `"Your Saturn this week"` → `"A weekly note about Saturn"` (EN) and ES equivalent. "Weekly" describes cadence of the email, not astronomical claim.

**Strawman body length:** ~50 words body1 + ~30 words body2, matching existing structure. ES parallel.

**Exit criterion:** STRINGS rewritten EN + ES; no time-claim words; sade-sati or comparable Vedic concept present; render tests pass: `npx vitest run src/emails/__tests__/SaturnWeeklyEmail.test.tsx`.

#### C3: SynastryTeaserEmail recap-lie fix

**Owner:** Claude

**File:** `src/emails/SynastryTeaserEmail.tsx` (rewrite STRINGS body1, lines 11-30)

**Problem:** Body1 enumerates "We've sent you your sidereal chart, your Moon and Ascendant, a paywall teaser, and a weekly Saturn note." This is false for: (a) leads who hard-bounced between drips (rare but possible since `email_undeliverable` filter only fires after a recorded bounce, not the bounce itself), (b) any future audience-segmentation where T+21d sends without all prior steps.

**Recommended fix:** Remove the recap entirely. Replace with body1 that introduces synastry on its own merits without referencing prior sends.

**Strawman body1 (EN):**
> "Synastry is what we have not yet shown you — the chart comparison between two people. It's the oldest use of astrology, the one you actually do with friends: comparing where your Mars sits next to theirs, where your Moons echo or argue."

**ES parallel.**

**Exit criterion:** Body1 rewritten EN + ES, no recap of prior sends, no claims about email history; render tests pass: `npx vitest run src/emails/__tests__/SynastryTeaserEmail.test.tsx`.

#### C4: ES review doc generation + apply

**Owner:** Claude generates doc, founder annotates, Claude applies corrections

**Deliverable from Claude:** `outputs/wave-2-es-review/strings-to-review.md` (new)

**Format:**
- Markdown table per source file
- Columns: `file:key`, `EN source`, `ES draft (mine)`, `my note`, `your decision`
- `my note` column flags entries where Claude is unsure (e.g., "marciano vs de Marte?", "tránsito vs pasaje?")
- `your decision` column starts empty; founder writes `ok` or `→ rewrite to: ...`

**Scope of strings in doc:**
- All 72 ES strings from `chart-keywords.ts` (post-C1)
- SaturnWeekly ES body1, body2, subject (post-C2)
- SynastryTeaser ES body1 (post-C3)
- Any pricing ES i18n strings added earlier in Wave 2 (`src/i18n/messages/es.json` or equivalent — verify path; do not re-review pre-Wave 2 strings)

**Apply step:** Once founder returns annotated doc, Claude opens each file with `→ rewrite to: ...` decision and applies the new ES string. Generate one commit covering all corrections: `fix(wave2/es): apply native-review corrections from C4 doc`.

**Exit criterion:** Every row in doc has `your decision` filled; all `→ rewrite to:` decisions applied to source files; ES test pass `npx vitest run src/i18n/__tests__` (if any) + existing email render tests.

## 5. Sequencing

```
T+0    [Claude] A1 (PostHog flag) ∥ C3 (SynastryTeaser fix) ∥ B1 start (baseline doc)
T+15   [Claude] B1 done, B2 start (PostHog dashboards)
T+30   [Claude] B2 done, C1 start (chart-keywords EN+ES strawman)
T+55   [Claude] C1 done, C2 start (SaturnWeekly EN+ES)
T+65   [Claude] C2 done, C4 generate (ES review doc)
T+70   [Claude] I-work done — stop, await founder

[founder, any time]
   - A2 (Vercel CLI upgrade) — 30 sec, can do anytime
   - B3 (smoke test) — once B1+B2 done, async
   - C4 review — once C1+C2+C3 done, async

[Claude resumes]
   - C4 apply once founder returns doc
   - B4 close footer once founder finishes B3
   - Push to origin/main after founder ES sign-off
```

## 6. Commit Cadence

One logical commit per item. Branch: `main` (per `feedback_main_branch_workflow`). Commits stay local until founder ES sign-off, then pushed.

| Commit | Scope | Trigger |
|---|---|---|
| 1 | `chore(wave2/posthog): create wave2-demo-flag for docs validation` | A1 done |
| 2 | `docs(wave1-t5): baseline snapshot 2026-05-17` | B1 done |
| 3 | `chore(wave2/posthog): seed full-funnel + paywall-funnel dashboards` | B2 done |
| 4 | `fix(wave2/synastry-teaser): remove recap-lie, stand on own copy` | C3 done |
| 5 | `feat(wave2/chart-keywords): Vedic-anchored mini-reading vocabulary` | C1 done |
| 6 | `feat(wave2/saturn-weekly): evergreen sade-sati framing, no time-claims` | C2 done |
| 7 | `docs(wave2/es-review): collect ES strings for native review` | C4 doc generated |
| 8 | `fix(wave2/es): apply native-review corrections from C4 doc` | C4 founder + apply done |
| 9 | `docs(wave1-t5): close Wave 1 with smoke result + final baseline` | B4 done |

Push: after commit 8 (founder ES sign-off). Commit 9 may push together if B4 completes before push window.

## 7. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| PostHog API 403 (key scope wrong) | Med | Fall-back: write UI instructions into baseline doc; founder creates in PostHog UI |
| PostHog dashboards API undocumented for some insight types | Med | Skeleton dashboard + manual-tuning note in baseline; do not block on perfect chart |
| Strawman content quality unworkable | Med-High | This is the whole point of strawman-first. Founder cuts liberally; worst case revert to founder-from-scratch |
| Existing email tests fail on new STRINGS | Low | Tests check render structure not content; run `vitest` after each file edit |
| Vercel CLI 54.x breaks production deploy flow | Very low | Founder task; not on critical path; can revert to 53.2.0 |
| Smoke test reveals real customer-flow bug | Low-Med | This is the feature. New Sev1 spec opens; baseline records "blocked by [link]" |
| Untracked `scripts/advertising/_audit_*.mjs` (28 files) leak into commits | Already-present | Target file paths explicitly when staging; do not use `git add .` or `git add -A` |
| Memory becomes stale during multi-step execution | Low | Update memory only at "Wave 2 closed" milestone, not per-step |

## 8. Testing Strategy

Per-item verification:

| Item | Verification |
|---|---|
| A1 | GET `/api/projects/407908/feature_flags/?key=wave2-demo-flag` → 1 result |
| A2 | `vercel --version` ≥ 54.x |
| B1 | Human read-through; numeric values cross-checked against live DB queries during write |
| B2 | GET `/api/projects/407908/dashboards/` lists both new entries; URL click loads |
| B3 | Founder manual prod flow; result documented |
| C1 | `npx vitest run src/shared/lib/__tests__/chart-keywords.test.ts` |
| C2 | `npx vitest run src/emails/__tests__/SaturnWeeklyEmail.test.tsx` |
| C3 | `npx vitest run src/emails/__tests__/SynastryTeaserEmail.test.tsx` |
| C4 | `npx vitest run src/emails/__tests__/` + i18n tests if present |
| B4 | Baseline doc has footer; memory entry indexed |

Final gate before push: `npm run lint && npm run typecheck && npm test` all green.

## 9. "Done" Definition for Wave 2 Milestone

All of the following true:

- [ ] Commits 1-8 staged locally (commit 9 may be pending B3 async)
- [ ] `outputs/wave-1-checkpoint/00-baseline.md` exists, numbers live
- [ ] 2 PostHog dashboards URL-accessible in project 407908
- [ ] `wave2-demo-flag` exists in PostHog UI
- [ ] `npm run lint && npm run typecheck && npm test` green
- [ ] Memory `project_wave2_closed_2026_05_17` created and indexed in `MEMORY.md`
- [ ] Founder ES sign-off received (C4 doc returned annotated)
- [ ] Push to `origin/main` completed
- [ ] (Async) B3 smoke result recorded; B4 footer applied; commit 9 pushed

## 10. Memory Updates Post-Close

- **New:** `project_wave2_closed_2026_05_17.md` — what closed, what deferred to Wave 3, links to baseline + spec + plan
- **Update:** `project_advertising_audit_2026_05_17_wave2.md` — mark items 1-7 done or explicitly deferred
- **Update:** `project_advertising_audit_2026_05_17_wave1.md` — mark T5 done
- **Possibly new:** `feedback_inline_delete_one_shot_scripts.md` — pattern used 3+ times this session (verify_migration_0012, check_migrations_state, posthog API seeds): write inline to `scripts/wave2-closeout/_<name>.mjs`, run once, delete; never commit

## 11. Out of Scope (Deferred to Wave 3 or Later)

- **Saturn transit-aware content** — explicitly chose evergreen; transit personalization is Wave 3+ if data shows demand
- **Conditional synastry recap based on `sent_lead_emails` lookup** — recommended fix is to remove recap; conditional adds 5 LOC + DB round-trip per send
- **Server-side feature flag evaluation** — current `useFeatureFlag` is client-only; SSR flags wait for first real experiment requiring them
- **Wave 2 demo flag wired to actual UI logic** — flag exists for docs validation only; first real flag-gated component lives in Wave 3
- **Comprehensive paid-conversion baseline** — current real paid /30d = 0; meaningful baseline awaits 2-4 weeks of drip data per [`project_conversion_baseline_2026_05_17`](memory)
- **Hard-bounce handling beyond `email_undeliverable` flag** — Resend webhook already updates flag; deeper bounce categorization deferred

## 12. Implementation Handoff

This spec hands off to `superpowers:writing-plans` skill for plan generation. Plan execution will use `superpowers:subagent-driven-development` (per founder direction) — one fresh subagent per commit, review between commits.

Subagent task boundaries follow the 9-commit table in Section 6. Each subagent receives:
- Full spec (this document)
- Single task description (per-item design from Section 4)
- Test command to run before claiming done
- Commit message scope
- Anti-slop reminders for content tasks (per Section 4 C1/C2 constraints)
