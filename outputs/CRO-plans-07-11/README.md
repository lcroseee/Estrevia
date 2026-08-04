# CRO Plans — snapshot 2026-07-11

Copies of the implementation plans produced from the CRO audit (`outputs/cro-audit-2026-07-10/REPORT.md`). Canonical versions live in `docs/superpowers/plans/` — edit there, not here.

## Execution order

1. **`2026-07-10-cro-phase0-relaunch-blockers.md`** — 17 tasks; gates ANY Meta re-spend. Its deploy gate ships the 6 unpushed HALF50 commits (env vars incl. `COMPANY_POSTAL_ADDRESS` + migration 0018 BEFORE push).
2. **`2026-07-10-sp-a-postpurchase-activation.md`** — checkout return routing + post-purchase onboarding.
3. In parallel after SP-A:
   - **`2026-07-10-sp-c-drip-repair-save-offer.md`** — drip engine repair + SAVE50 save offer (needs Phase 0 P0-1 first).
   - **`2026-07-10-sp-d-product-trust-retention.md`** — honest chart (time:null), email gate UX, session recordings with PII scrub.
   - **`2026-07-10-sp-e-landing-pricing-message-match.md`** — visible first paint + hook echo + pricing CRO.
   - **`2026-07-10-sp-f-consent-compliance-hygiene.md`** — consent-gated Meta Pixel + drizzle journal repair.
4. **`2026-07-10-sp-b-es-latam-conversion.md`** — gates ES re-spend.

Related (not copied): specs in `docs/superpowers/specs/2026-07-10-*.md`, roadmap `docs/superpowers/specs/2026-07-10-cro-audit-roadmap.md`, relaunch runbook `docs/runbooks/2026-07-relaunch.md`.

Execute with `superpowers:subagent-driven-development`; plans warn about cross-plan line drift — locate edits by symbol/key name, not line number.
