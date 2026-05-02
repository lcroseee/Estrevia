# Creative Generation — Launch Batch (2026-05-02)

This file logs the targeted creative-generation runs ahead of paid Meta Ads launch. Each batch corresponds to a tasking session in `docs/superpowers/plans/2026-05-02-meta-graph-api-launch.md`.

<!-- Batch A — identity-reveal expansion (task-8) goes here. -->

## Batch B — authority + rarity expansion (2026-05-02)

| Template | EN | ES | Cost | Note |
|---|---|---|---|---|
| authority-3 (Lahiri ayanamsa) | 2 | 2 | ~$0.24 | OK |
| rarity-3 (Cosmic Passport showcase) | 0 | 0 | ~$0.30 (rejected) | **Systematic Claude safety rejection — 5 attempts × 0 pending. Content review required: `visual_mood` references UI mockup elements ("passport card fill", "share button") which may trigger the fake-screenshot moderator; or "Cosmic Passport" phrasing may trigger an identity-document filter. See rejected rows in `/admin/advertising/creatives/review?status=rejected`. Founder action: review and either fix template copy/`visual_mood` in `src/modules/advertising/creative-gen/templates/hooks-en.ts` (and `hooks-es.ts` equivalent), or drop `rarity-3` from launch set.** |
| rarity-5 (sharing mechanic) | 2 | 2 | ~$0.24 | OK |

Total: **8/12** ads in `pending_review`, ~$0.84 actual Gemini spend (vs $0.72 planned).

### Run timeline (2026-05-02 ~15:35–15:45 UTC)

1. **Initial parallel batch** — `--templates en-authority-3,es-authority-3,en-rarity-3,es-rarity-3,en-rarity-5,es-rarity-5 --samples 2` ran 12 jobs in parallel via `Promise.allSettled`. Result: 3 pending_review, 2 safety-rejected, 7 `GEMINI_QUOTA` HTTP 429 (per-minute rate limit hit due to concurrency=12 + concurrent task-8 batch). Cost: $0.30.
2. **Sequential retry of the 7 quota failures** — one `--templates X --samples 1` invocation per template+locale combo, 5 s sleep between. Result: 5 pending_review, 2 safety-rejected (`en-rarity-3`, `es-rarity-3`). Cost: $0.42.
3. **Make-good for the 2 safety rejections** — `en-rarity-3` and `es-rarity-3` retried once each. Both rejected again. Cost: $0.12.

`rarity-3` final tally: **5 attempts across both locales → 0 pending, 5 rejected.** Reproducible — not a transient safety-check flake.

### Operational note on the CLI

The plan's documented invocation `--template=<id> --locale=<x> --count=<n>` is not actually implemented in `scripts/advertising/generate-launch-batch.ts`. The supported flags are space-separated: `--templates <id1>,<id2>,…` (locale-prefixed IDs, plural) and `--samples <n>`. Future plan revisions and the launch runbook should reflect the working syntax. Targeted mode also fans out via `Promise.allSettled` — concurrency is bounded only by the number of jobs in the call, which can exceed Gemini per-minute quotas when multiple agents run in parallel. Consider adding a `--concurrency` flag to the CLI before the next multi-agent batch session.
