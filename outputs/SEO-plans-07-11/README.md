# SEO Remediation — Plans Bundle (2026-07-11)

Source-of-truth copies of the SEO audit remediation brainstorm + implementation plans, collected here for reading. The canonical versions live in `docs/superpowers/` (spec under `specs/`, plans under `plans/`) and are what execution reads.

**Origin:** the 47-agent SEO audit at `outputs/seo-audit-2026-07-06/REPORT.md` (21 ranked findings) → run through brainstorming → roadmap spec → per-phase plans.

## Read in this order

| # | File | What it is |
|---|------|-----------|
| 00 | `00-roadmap-spec.md` | The brainstorm/roadmap. Covers **all** audit items. Establishes the crawl-quality gate, the 3 phases, the 4 strategic decisions, and the deploy-isolation risk. Read this first. |
| 01 | `01-phase1-recrawl-unblock.md` | **Phase 1** — 9 TDD tasks. Tarot crash guard + SSR 78-card grid, compat noindex + sitemap drop, logo-404 fix, ES-essay JSON-LD locale fix, `/es/` title, FAQ regex + hreflang, plus founder-owned O1–O3 ops + the deploy-isolation reconciliation (Task 0). |
| 02 | `02-phase2-consolidate-deepen.md` | **Phase 2** — T7–T14 + a batch of cleanups. Enrich top compat pairs, CTR lift, ES internal-link mesh, token localization, honest dates/schema, soft-404 kills, founder `/about` + Person author, anonymous-page perf tax. |
| 03 | `03-phase3-gated-backlog.md` | **Phase 3** — T15–T19. Growth surfaces gated behind the crawl-quality gate: per-planet hour pages, synastry FAQ gap, tarot deck-bridge + depth, off-site brand anchors. |
| 04 | `04-clerk-routegroup-move.md` | Separate design+plan (its own spec because of auth blast-radius). Removes the `ClerkProvider` client-JS load from anonymous essay/tarot SEO pages — the biggest perf lever. |

## The organizing spine: crawl-quality gate

No new programmatic page types until the two defective cohorts resolve (tarot 112 URLs + compatibility 156 URLs = 312 URLs either indexed or noindexed, and GSC "Crawled — currently not indexed" trending down from its 188 baseline). Phase 1 unblocks; Phase 2 strengthens what Google now trusts; Phase 3 is hard-gated on the above.

## Two things needing a founder call

1. **T13 founder re-review gate (Phase 2):** publishing your name + switching Article author Organization→Person **reverses** the 2026-05-03 "авторство не нужно" decision. Confirm before it merges.
2. **Task 0 deploy-isolation (Phase 1):** the first deploy since 2026-05-30 ships *all* of `main` — including HALF50 + migrations 0013–0018. Reconcile before the first Phase-1 push.

## Verification status of the drafts

- **Adversarially verified** (draft → independent codebase re-check): Phase-1 tasks, T13, T16, T17.
- **Grounded draft, formal verify pending** (authored against real files with cited line numbers; second-pass verify died on a session usage limit): T7, T9, T10, T14, BATCH, T19, Clerk.
- Resume workflow `wf_605b7c99-eb0` after the usage-limit reset to run the pending verifies (completed drafts replay from cache).

*These are copies. Edit the originals in `docs/superpowers/` and re-copy, or treat these as a frozen 2026-07-11 snapshot.*
