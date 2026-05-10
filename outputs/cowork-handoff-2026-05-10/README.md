# Cowork handoff — 2026-05-10

Inventory of files in this directory:

| File | Status | Purpose |
|---|---|---|
| `04-cowork-visibility-layer-revised.md` | active | Patch 04 (revised). **Apply this.** Supersedes the original Patch 04 from the prior Cowork session output (not committed in this repo). |
| `06-next-claude-code-session.md` | partially executed | Claude Code follow-up brief. Phases 1–3 completed 2026-05-10; Phase 4 deferred. |
| `README.md` | this file | Inventory + apply order. |

## Apply order (future sessions)

1. **Patch 04 (revised)** — apply diffs from `04-cowork-visibility-layer-revised.md` to `src/` after founder review. Creates `/api/admin/advertising/status` + `/api/admin/advertising/digest` routes; refactors digest builder; extends `sendAlert` with optional tier arg.
2. **Phase 4 — `ClaudeBrandVoiceClient`** — see handoff `06-next-claude-code-session.md` § Phase 4. Implement after Patch 04 (the `/status?include=brand_voice` route depends on the real storage location identified during Phase 3 sub-agent verification — currently mock-only, no DB persistence).
3. **Stories anchors** — only after Canva Story-format designs created in Brand Kit `kAGT_ANQrn8`. Then promote `ANCHORS_STORIES_PENDING` → `ANCHORS_FEED` in `scripts/advertising/seed-canva-anchor-creatives.ts` and re-run the seed.

## Related session artifacts

`.cowork-meta/phase1-verification-20260510T221911Z/` (this repo, git-ignored):
- `01-summary.md` — Phase 1 verification results (GREEN — all P0/P1 clean)
- `02-anchor-seed-state.md` — Phase 2 inspection (6 feed Blob URLs verified HTTP 200)
- `04-seed-dryrun.txt` — Phase 2 dry-run output (6 records + WOULD SKIP line)
- `05-ready-to-seed.md` — Phase 2 approval pause document (run real seed after reviewing)
- `06-signatures-reference.md` — Phase 3 consolidated signature reports (5 Explore sub-agents)
- `00-final-summary.md` — session wrap-up (written by Task 9)
