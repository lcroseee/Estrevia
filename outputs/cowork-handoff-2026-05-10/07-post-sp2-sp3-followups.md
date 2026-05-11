# Post-SP2+SP3 Follow-ups — Handoff to Cowork

**Source session:** main @ `9a2ce43`
**Upstream:** SP2 (Patch 04 apply) + SP3 (brand voice scorer) shipped in 6 commits (`7bba792`..`9a2ce43`). Advertising suite: 1022/1022 tests green across 97 files.

> Apply this doc strictly. Verify each step before reporting done. If something doesn't match repo state, stop and report — do not improvise.

---

## Apply order

1. **Founder-A** — prod migration `0009` (blocks #4–6)
2. **Founder-B** — Vercel env: `ADVERTISING_STATUS_BEARER`, verify `ANTHROPIC_API_KEY` (blocks #5–6)
3. **Cowork-A** — Tier-2 `sendAlert` marking (1 candidate, code work)
4. **Founder-C** — Configure Cowork scheduled task → `/digest?type=daily` at 9:00
5. **Founder-D** — Flip `BRAND_VOICE_SCORER_ENABLED=true` (after #1+#2)
6. **Founder-E** — Flip `ADVERTISING_TIER2_VIA_DIGEST=true` (after #3 shipped + 1–2 weeks of digest verification)
7. **SP1 Stories re-seed** — blocked on founder Canva work

---

## Founder-only (manual ops)

### Founder-A — Apply prod migration

File: `drizzle/0009_ambitious_lady_mastermind.sql` (already in repo at HEAD)

Adds table `advertising_brand_voice_scores` for SP3 weekly scoring runs.

**Steps:**
- Apply to prod Neon (drizzle migrate or your usual flow)
- Verify `advertising_brand_voice_scores` exists in prod schema

### Founder-B — Vercel prod env

```bash
# Generate bearer token
openssl rand -hex 32
```

Add to Vercel prod env:
- `ADVERTISING_STATUS_BEARER=<generated>` — protects `/api/admin/advertising/status` + `/digest`
- Verify `ANTHROPIC_API_KEY=<already-set>` — required by SP3-A `ClaudeBrandVoiceClient`

**Mirror `ADVERTISING_STATUS_BEARER` into Cowork's env** so Cowork's scheduled task can hit the endpoints.

### Founder-C — Cowork scheduled task

After Founder-B, create a Cowork scheduled task:

- **Schedule:** Daily at 09:00 (founder timezone)
- **HTTP call:** `GET https://estrevia.com/api/admin/advertising/digest?type=daily`
- **Header:** `Authorization: Bearer ${ADVERTISING_STATUS_BEARER}`
- **Action:** post the response body to Cowork's monitoring channel

### Founder-D — Enable brand voice scorer

After Founder-A + Founder-B done:

Set Vercel prod env: `BRAND_VOICE_SCORER_ENABLED=true`

This unlocks weekly Claude-scored brand-voice rubric in the `retro-weekly` cron. Cold-ship default is `false`.

### Founder-E — Flip tier-2 digest routing

**Only after Cowork-A shipped AND 1–2 weeks of verified Cowork digest.**

Set Vercel prod env: `ADVERTISING_TIER2_VIA_DIGEST=true`

This makes `sendAlert(..., { tier: 2 })` return `null` instead of pushing to Telegram immediately. Tier-2 alerts accumulate and surface via the daily digest only.

---

## Cowork-doable (code work)

### Cowork-A — Tier-2 `sendAlert` marking

**Context:** SP2-C extended `sendAlert(severity, message, { tier?: 1 | 2 })` via TypeScript overloads. 2-arg calls keep non-null return (tier-1 behavior). 3-arg calls with `{ tier: 2 }` return `null` once `ADVERTISING_TIER2_VIA_DIGEST=true` (Founder-E).

**Step 1 — Grep call sites:**

```bash
grep -rn '\.sendAlert(' src/modules/advertising/ --include='*.ts' | grep -v test
```

Expected output (as of `9a2ce43`):
```
src/modules/advertising/alerts/drop-off-monitor.ts:273:  await telegram.sendAlert('warning', message);
src/modules/advertising/alerts/weekly-account-health.ts:64:  const message: TelegramMessage = await telegram.sendAlert(
```

If grep returns different lines, STOP — repo state diverged, report back.

**Step 2 — Classify:**

| Call site | Current | Target | Reason |
|---|---|---|---|
| `drop-off-monitor.ts:273` | 2-arg (tier-1) | **tier-2** | Daily funnel-anomaly summary, fed by cron — batched-digest material, not page-worthy |
| `weekly-account-health.ts:64` | 2-arg (tier-1) | **stay tier-1** | Destructures `TelegramMessage` from return — making it nullable would require call-site refactor; weekly health summary warrants immediate visibility anyway |

**Step 3 — Edit `drop-off-monitor.ts:273`:**

```ts
// Before
await telegram.sendAlert('warning', message);

// After
await telegram.sendAlert('warning', message, { tier: 2 });
```

**Step 4 — Verify:**

```bash
npm run typecheck
npm test -- src/modules/advertising/alerts/
```

Both must pass.

**Step 5 — Commit:**

```bash
git add src/modules/advertising/alerts/drop-off-monitor.ts
git commit -m "feat(advertising/alerts): mark drop-off monitor as tier-2 sendAlert

Drop-off anomaly warnings are daily digest material, not push-page material.
Routes through ADVERTISING_TIER2_VIA_DIGEST gate once founder flips the flag.

🤖 Generated with Claude Code (Cowork)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Acceptance:**
- Single 1-line diff in `drop-off-monitor.ts`
- Typecheck + tests green
- `weekly-account-health.ts` untouched (still tier-1)
- No test changes required

---

## SP1 — Stories re-seed (BLOCKED, no Cowork action)

**Plan:** `docs/superpowers/plans/2026-05-10-stories-reseed.md` (committed `1fe4623`, unstarted).

**Blocked on founder Canva work:**
1. Create 6 Story-format Canva designs (1080×1920) in Brand Kit `kAGT_ANQrn8`
2. Export PNGs to `tmp/canva-stories-2026-05-10/` with exact filenames:
   - `story_es_accuracy.png`
   - `story_es_passport.png`
   - `story_es_freechart.png`
   - `story_en_accuracy.png`
   - `story_en_passport.png`
   - `story_en_freechart.png`

When designs ready → **main Claude Code session** picks up SP1, not Cowork (involves Blob uploads + atomic seed merge).

---

## References

**Memory:**
- `~/.claude/.../memory/project_cowork_followup_sp2_sp3_shipped.md` — what was shipped in SP2+SP3
- `~/.claude/.../memory/project_cowork_followup_3_subproject_plans.md` — overview of 3 plans
- `~/.claude/.../memory/feedback_meta_learning_phase.md` — refreshed 2026-05-10 to reflect current state (`LEARNING_PHASE_DAYS=7` already in code)

**Specs / plans:**
- `docs/superpowers/specs/2026-05-10-cowork-visibility-apply-design.md` + plan
- `docs/superpowers/specs/2026-05-10-brand-voice-scorer-design.md` + plan
- `docs/superpowers/specs/2026-05-10-stories-reseed-design.md` + plan

**Commits (main):**
```
9a2ce43  feat(advertising/cowork): sendAlert tier extension          ← SP2-C
183f3a8  feat(advertising/cowork): wire brand voice scorer + reader  ← SP3-C
586005b  feat(advertising/cowork): digest endpoint + refactor        ← SP2-B
b1cace0  feat(advertising/cowork): /status read-only endpoint        ← SP2-A
5cdd1ec  feat(advertising/storage): brand_voice_scores table         ← SP3-B
7bba792  feat(advertising/clients): real ClaudeBrandVoiceClient      ← SP3-A
```
