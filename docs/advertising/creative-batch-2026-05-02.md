# Creative Generation — Launch Batch (2026-05-02)

This file logs the targeted creative-generation runs ahead of paid Meta Ads launch. Each batch corresponds to a tasking session in `docs/superpowers/plans/2026-05-02-meta-graph-api-launch.md`.

## Batch A — identity_reveal expansion (2026-05-02)

| Template | EN | ES | Cost | Note |
|---|---|---|---|---|
| identity-reveal-1 (precession fact, 24°) | 1 | 1 | ~$0.12 | Bonus from initial misfire — kept |
| identity-reveal-2 (axis shift + competitive frame) | 0 | 0 | ~$0.24 (rejected) | **Systematic Claude safety rejection (4 attempts × 0 pending). Trigger: "Most sun-sign apps never updated" reads as competitive predictive framing. Founder action: review template at `src/modules/advertising/creative-gen/templates/hooks-en.ts:38-53` and ES equivalent. Either rewrite without competitive frame, or drop from launch set.** |
| identity-reveal-6 (80% statistic) | 0 | 0 | ~$0.24 (rejected) | **Systematic rejection (4 attempts × 0 pending). Trigger: "About 80% of people have a different sun sign" reads as predictive personal claim. Founder action: review template at `hooks-en.ts:104-118` and ES equivalent. Either reframe without personal-stat claim, or drop.** |
| identity-reveal-1 misfire duplicates | — | — | $0.12 | 2 duplicate `en-authority-1` + `en-rarity-1` creatives from initial `=` syntax misfire — moved to status='rejected' as redundant variants of already-approved templates |

**Total Task 8 spend: ~$0.72**, **2 net new pending_review** (`identity-reveal-1` EN+ES).

### Run timeline (2026-05-02 ~15:34–15:49 UTC)

1. **Initial parallel batch** — `--templates=...` (with `=` syntax) ran. CLI parser at `scripts/advertising/generate-launch-batch.ts:106` requires space-separated `--templates <list>`; saw the `=` form as an unrecognized arg and fell through to **default archetype-rotation mode** (countPerLocale=3, locales=['en','es']). Result: 3 EN pending_review (`en-identity-reveal-1`, `en-authority-1`, `en-rarity-1`) + 1 ES pending_review (`es-identity-reveal-1`) + 2 ES quota failures (HTTP 429 on per-minute Gemini limit, hit due to overlap with concurrent task-9 batch). Cost: $0.24.
2. **Misfire triage** — `en-identity-reveal-1` and `es-identity-reveal-1` kept (legitimate bonus variants). `en-authority-1` and `en-rarity-1` rejected via `tmp/reject-task8-misfire.ts` (duplicates of templates with multiple approved variants live).
3. **Sequential retry of the 8 target jobs** — `for tpl in en-identity-reveal-2 es-identity-reveal-2 en-identity-reveal-6 es-identity-reveal-6; do` × 2 samples × 5 s sleep, paced after task-9 completion. Result: **0 pending_review, 8 rejected** — every run blocked by the Claude `meta_ad_policy` check (severity: block). No 429s. Cost: $0.48.

`identity-reveal-2` and `identity-reveal-6` final tally across both locales: **4 attempts each × 0 pending, 4 rejected each.** Reproducible — not a transient flake.

### Pattern notice

Both Task 8 (`identity-reveal-2`, `identity-reveal-6`) and Task 9 (`rarity-3`) hit Claude `meta_ad_policy` safety-check rejection. Common signature: copy with **competitive framing** ("most apps never updated") OR **personal-stat claims** ("80% have a different sign"). Templates that pass: pure factual neutral statements (`identity-reveal-1`, `-3`; `authority-1`, `-3`; `rarity-1`, `-5`). Founder may want to review the safety prompt for over-strictness once launch stabilizes — current behaviour blocks legitimate sidereal-astrology framing if it reads as "predictive personal claim".

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
