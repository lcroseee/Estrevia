# Marketing-psychology Archetypes — Design

**Date:** 2026-05-11
**Status:** Approved (pending implementation)
**Owner:** Advertising agent — creative-gen pipeline
**Related audit:** `.cowork-meta/skills-audit-2026-05-11/proposals/augment-marketing-psychology.md`
**Related runbook:** `docs/advertising/launch-runbook.md`
**Brand voice source:** `docs/editorial-style-guide.md`, `docs/marketing.md` § Brand Voice Drift Detection

---

## Goal

Add three new hook archetypes — `reciprocity`, `peer_discovery`, `accuracy_gap` — to
the creative-generation pipeline so Bayesian decisioning has more diversity during
the Meta Ads learning phase. New copy must respect Estrevia brand voice (no
fortune-telling, no personal claims, no mocking tropical astrology, no translated
sign names, español neutro LATAM with `tú`/impersonal forms).

Six new EN templates + six new ES templates (12 total), bringing the archetype
union from 3 values to 6 and the template count from 36 to 48.

## Non-goals

- Per-archetype rubric in `decide/brand-voice-audit.ts` — deferred, existing
  single-rubric LLM audit continues archetype-agnostic for ≥30 days.
- Per-archetype tracking in `senior-buyer/metric-history.ts` — deferred.
- Per-archetype digest section in `alerts/digest-builder.ts` — deferred.
- New file `templates/archetype-rules.ts` — not needed; existing
  `HookTemplate.policy_constraints: string[]` carries per-template rules.
- Dynamic `{count}` substitution in `peer_discovery` copy — copy is static.
- Adding the four other psychology principles considered in the audit
  (`commitment_consistency`, `unity_principle`, `precession_frame`,
  `tradition_lineage`) — deferred to a second wave after ≥30 days of data on
  the first three archetypes.
- Modifying `creative-gen/safety/checks.ts` — existing `PERSONAL_CLAIM_PATTERNS`
  regex covers all new copy.
- Schema migrations — none.

## Constraints discovered during brainstorming

| Constraint | Source | Implication |
|---|---|---|
| `peer_discovery` claim ("thousands") requires verifiable backing | Skill anti-pattern: false social-proof; `editorial-style-guide.md` "no absolutism without backing" | Templates blocked from pipeline until ≥2000 PostHog `chart_calculated` events accumulate. Gate via env var `PEER_DISCOVERY_ENABLED`. |
| Meta policy forbids mocking tropical astrology | `safety/checks.ts` Meta policy prompt; `docs/marketing.md` § Brand Voice | New copy frames tropical as historical ("standardised over 2,000 years ago", "before Galileo"), not as wrong. |
| Brand voice forbids second-person personal claims | `safety/checks.ts` `PERSONAL_CLAIM_PATTERNS` | All 12 templates use third-person/impersonal framing. |
| Spanish must be español neutro LATAM, `tú` form, sign names untranslated | `feedback_spanish_style` memory; CLAUDE.md i18n rules | ES copy reviewed against existing `PERSONAL_CLAIM_PATTERNS` regex (`usted`, translated sign names already blocked). |
| Existing hook authors curate copy — not LLM-drafted | Inspection of `hooks-en.ts` voice ("Earth's axial precession has shifted the celestial sphere ~24°...") | New copy hand-authored by founder, regex-validated by tests. |
| Production agent is LIVE | Memory `project_advertising_v3b_shipped`; live in production | Pure-additive changes only. No mutations to brand-voice-audit / safety/checks / senior-buyer / generators. |

## Architecture

### High-level flow

```
[creative-gen pipeline existing flow]
    │
    │ template selection: getHooksByLocale(locale)
    │   ┃
    │   ┃ CHANGE: callsites that face Meta upload migrate to
    │   ▼        getEligibleHooks(locale)
    │
    │ getEligibleHooks(locale, env=process.env)
    │   ├─ if env.PEER_DISCOVERY_ENABLED !== 'true':
    │   │     filter out archetype === 'peer_discovery'
    │   └─ else: include all
    │
    │ rest of pipeline unchanged
    ▼
[Gemini / Claude generators] → [safety/checks runAllChecks] → [Meta upload]
```

### File layout

Modified files:

```
src/shared/types/advertising.ts
  HookTemplate.archetype: extend union
    + 'reciprocity' | 'peer_discovery' | 'accuracy_gap'

src/modules/advertising/creative-gen/templates/hooks-en.ts
  + 6 EN templates (2 per new archetype)

src/modules/advertising/creative-gen/templates/hooks-es.ts
  + 6 ES templates (2 per new archetype)

src/modules/advertising/creative-gen/templates/index.ts
  + getEligibleHooks(locale, env): HookTemplate[]
    (~10 lines, filters peer_discovery when env-gate off)

.env.example
  + PEER_DISCOVERY_ENABLED=false
```

New files:

```
src/modules/advertising/creative-gen/templates/__tests__/
  archetype-coverage.test.ts   (~50 lines, vitest)
```

Callsite migration (1-line each, exact list pending grep `getHooksByLocale`):

```
src/modules/advertising/creative-gen/batch/*.ts
src/modules/advertising/creative-gen/generators/*.ts
```

Implementation note: writing-plans phase will run `git grep getHooksByLocale src/`
to enumerate exact callsites. Internal helpers that don't reach Meta (e.g. test
fixtures, internal coverage tools) may keep the original `getHooksByLocale`
call — only paths that emit creatives to upload need to switch.

### Component: archetype copy

#### Archetype 1: `reciprocity`

Frames Estrevia's free chart calculator as reciprocal value. Pairs cleanly with
the Cosmic Passport share loop — recipient gets a real free tool, not a
preview-then-paywall.

| ID | copy_template |
|---|---|
| `en-reciprocity-1` | `A sidereal natal chart, calculated from where the planets actually appear in the sky. Free, no signup.` |
| `en-reciprocity-2` | `The same Swiss Ephemeris algorithm professional astronomers use — opened up as a free chart calculator.` |
| `es-reciprocity-1` | `Una carta natal sidérea, calculada desde donde los planetas realmente aparecen en el cielo. Gratis, sin registro.` |
| `es-reciprocity-2` | `El mismo algoritmo Swiss Ephemeris que usan los astrónomos profesionales — abierto como calculadora de carta gratuita.` |

`policy_constraints` per template:
- factual offer (no fortune-telling, no predictive language)
- no signup-wall after click (the landing page must actually be free per ad
  truth-in-advertising rule)
- Swiss Ephemeris claim must be inline-citable (it's verifiable — the lib is
  open source)
- ES: español neutro LATAM, no `usted`

`visual_mood`: inviting cosmic gradient with gentle star field, no human figures.
`aspect_ratios`: `['9:16', '1:1', '4:5']`. `duration_sec`: 15.

#### Archetype 2: `peer_discovery` (env-gated)

Frames sidereal calculation as discovery already happening — social proof
without specific numeric claims (qualitative "thousands"/"many"). Activates
only after PostHog confirms ≥2000 lifetime `chart_calculated` events.

| ID | copy_template |
|---|---|
| `en-peer-discovery-1` | `Thousands have run their sidereal natal chart in the last weeks. Most popular apps still use tropical positions standardised over 2,000 years ago.` |
| `en-peer-discovery-2` | `Many sidereal practitioners report their tropical sun sign differs from the position calculated tonight.` |
| `es-peer-discovery-1` | `Miles han calculado su carta natal sidérea en las últimas semanas. La mayoría de apps populares siguen usando posiciones tropicales estandarizadas hace más de 2.000 años.` |
| `es-peer-discovery-2` | `Muchos practicantes siderales descubren que su signo solar tropical difiere de la posición calculada esta noche.` |

`policy_constraints` per template:
- requires `PEER_DISCOVERY_ENABLED=true` — env-gated, default off
- qualitative count only ("thousands", "many", "miles", "muchos") — never a
  specific number that could become false-advertising if traffic dips
- no manipulative scarcity, no time-limited fake urgency
- not mocking tropical astrology — historical framing only
- ES: español neutro LATAM, no `usted`

`visual_mood`: discovery-revelation gradient with subtle star field, no human
faces.
`aspect_ratios`: `['9:16', '1:1', '4:5']`. `duration_sec`: 15.

#### Archetype 3: `accuracy_gap`

Frames the 2000-year tropical-sidereal drift as a cost the user is currently
paying through outdated apps — loss aversion via accuracy framing. No env gate
required.

| ID | copy_template |
|---|---|
| `en-accuracy-gap-1` | `The ~24° axial precession between ancient tropical astrology and tonight's sky never made it into most popular sun-sign apps.` |
| `en-accuracy-gap-2` | `Tropical sun-sign apps were standardised before Galileo. Sidereal calculation uses the stars as they are tonight.` |
| `es-accuracy-gap-1` | `La precesión axial de ~24° entre la astrología tropical antigua y el cielo de esta noche no ha llegado a la mayoría de apps populares de signo solar.` |
| `es-accuracy-gap-2` | `Las apps de signo solar tropical fueron estandarizadas antes de Galileo. El cálculo sidéreo usa las estrellas como están esta noche.` |

`policy_constraints` per template:
- factual astronomical figure (24° axial precession is verified)
- factual historical anchor (Galileo died 1642 — well before the tropical
  zodiac was last standardised in popular software)
- no mocking tropical astrology — historical framing only
- no fortune-telling, no predictive language
- ES: español neutro LATAM, no `usted`

`visual_mood`: split-screen historical-to-modern transition; star precession
diagram is acceptable.
`aspect_ratios`: `['9:16', '1:1', '4:5']`. `duration_sec`: 18.

### Component: `getEligibleHooks`

```typescript
// src/modules/advertising/creative-gen/templates/index.ts (added)

export function getEligibleHooks(
  locale: 'en' | 'es',
  env: { PEER_DISCOVERY_ENABLED?: string } = process.env,
): HookTemplate[] {
  const all = getHooksByLocale(locale);
  const peerDiscoveryEnabled = env.PEER_DISCOVERY_ENABLED === 'true';
  return peerDiscoveryEnabled
    ? all
    : all.filter(h => h.archetype !== 'peer_discovery');
}
```

The function is injectable for tests (`env` parameter defaults to `process.env`).
Fail-safe semantics: anything other than the literal string `'true'` means off.
This matches the existing pattern in `safety/kill-switch.ts`.

### Component: tests

`creative-gen/templates/__tests__/archetype-coverage.test.ts` covers:

1. Each of `['reciprocity', 'peer_discovery', 'accuracy_gap']` has ≥1 EN
   template and ≥1 ES template (locale parity).
2. Every new template's `copy_template` passes `personalClaimCheck` from
   `safety/checks.ts` (no regex hit).
3. Every new template's `policy_constraints` array is non-empty.
4. `getEligibleHooks('en', { PEER_DISCOVERY_ENABLED: 'false' })` excludes
   `peer_discovery`.
5. `getEligibleHooks('en', {})` (no env) excludes `peer_discovery`.
6. `getEligibleHooks('en', { PEER_DISCOVERY_ENABLED: 'true' })` includes
   `peer_discovery`.
7. `reciprocity` and `accuracy_gap` are always present regardless of env.

Approximate ~30 assertions across 4-5 describe blocks. Total runtime <1s.

## Data flow

This is a content-and-type-extension change. No new data flows, no new external
calls, no new persistent state. Data already in motion:

1. `getEligibleHooks(locale)` is called by creative-gen pipeline at batch
   construction time (existing pattern via `getHooksByLocale`).
2. Selected templates feed `generators/` (Gemini / Claude) — unchanged.
3. Generated creatives pass `safety/checks.runAllChecks` — unchanged.
4. Approved creatives upload to Meta via `creative-gen/upload/` — unchanged.
5. Post-launch, weekly `brand-voice-audit.auditTopCreatives` scores top-10 by
   spend — unchanged, archetype-agnostic.

## Error handling

No new failure modes introduced:

- Missing `PEER_DISCOVERY_ENABLED` env var → defaults to "off" → templates not
  emitted → safe.
- Malformed env var value (any non-`'true'`) → defaults to "off" → safe.
- Tests run in CI without env var → defaults to "off" → safe.

The single new code path (`getEligibleHooks`) has no async, no IO, no parsing —
it's a typed filter. There is no runtime failure surface to handle.

## Testing strategy

- Vitest, mirroring existing `creative-gen/templates/__tests__/` conventions
  (synthetic data, no Claude/Gemini mocks needed, no DB).
- Test data is the production template arrays themselves — proves the actual
  shipped copy passes its own gates.
- Pre-merge: `npm run typecheck`, `npm run lint`,
  `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/`.

## Acceptance criteria

Pre-merge (PR review):

- [ ] `npm run typecheck` clean (union extension compiles across all consumers)
- [ ] `npm run lint` clean
- [ ] `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/`
      — all assertions green
- [ ] `git grep "getHooksByLocale" src/` — all Meta-facing callsites migrated
      to `getEligibleHooks` or explicitly documented as internal-only
- [ ] PR description lists new template IDs and the env var change

Post-deploy (production smoke, within 24h):

- [ ] `vercel env ls production | grep PEER_DISCOVERY_ENABLED` returns `false`
      (no accidental flip)
- [ ] No new Sentry errors originating from `creative-gen/templates/`
- [ ] Next `triage-daily` cron tick runs to completion
- [ ] Manual `npm run advertising:generate-launch-batch` (dry-run):
      `reciprocity` and `accuracy_gap` template IDs appear in output;
      `peer_discovery` does not

Post-deploy (weekly review, 7 days after launch):

- [ ] Telegram weekly retro shows new archetypes' weighted brand-voice score
      ≥ 7.5 (same threshold as identity_reveal)
- [ ] No Meta disapproval rate spike attributable to new archetypes
      (`/admin/advertising/decisions`)

peer_discovery activation (separate, weeks later — not part of this spec's
merge):

- [ ] PostHog `chart_calculated` event count ≥ 2000 (manual check in
      PostHog UI)
- [ ] `vercel env add PEER_DISCOVERY_ENABLED production` → `true` + redeploy
- [ ] Next batch generation includes `peer_discovery` templates

## Rollback procedures

| Symptom | Rollback |
|---|---|
| Tests fail in CI or typecheck breaks | `git revert <commit>` — the change is pure-additive, no broken intermediate state |
| Post-deploy Sentry errors trace to creative-gen | `git revert` + redeploy. Production agent is `DRY_RUN=true` per default — no auto-publish risk during rollback window |
| Weekly brand-voice score for a new archetype < 6 | Remove the failing template entries via direct commit; pipeline continues with the remaining archetypes |
| `peer_discovery` shipped live and underperforms | `vercel env rm PEER_DISCOVERY_ENABLED production` (or set to `false`) → next batch excludes peer_discovery; no other action needed |
| Meta disapproves a specific new template | `disapproval-notify.ts` triggers Telegram alert → founder pauses the specific template ID in `/admin/advertising`; if pattern is systemic across an archetype, `git revert` the archetype entries |

Worst case (all 6 templates unfit): `git revert` the PR. Production agent
returns to 3-archetype taxonomy in one deploy (~2 minutes). No schema state
to clean up.

## Implementation effort

- Type union extension: 1 file, 1 line
- Template additions (12 entries): 2 files, ~12 × 12-line blocks = ~150 lines
- `getEligibleHooks` + index export: 1 file, ~10 lines
- Test file: 1 new file, ~50 lines
- Callsite migration: 1-2 files, 1 line each
- `.env.example`: 1 line + comment block

Total: ~250 lines added, ~3-5 hours including review.

## Future work (explicit deferral)

After ≥30 days of production data on these 3 archetypes:

1. Second wave archetypes from the audit proposal: `commitment_consistency`,
   `unity_principle`, `precession_frame`, `tradition_lineage`. Same MVP-light
   approach.
2. Per-archetype brand-voice-audit rubric (audit proposal section 3) — only
   worth building if the weekly retro shows different drift rates across
   archetypes.
3. Per-archetype CR tracking in `senior-buyer/metric-history.ts` — only if
   Bayesian decisioning needs per-archetype priors.
4. Dynamic `{count}` substitution in `peer_discovery` from live PostHog — only
   if the static "thousands" framing underperforms despite ≥2000 backing.

None of the above are required to merge this spec.
