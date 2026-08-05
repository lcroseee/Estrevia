# SP-C · Comparative Reflection — Design Spec

**Date:** 2026-08-04
**Depends on:** SP-0 (frame correctness) and SP-A (`projectChart`, the toggle). SP-B is independent of this spec.
**Landing zone:** `main`.

## Purpose

Give the toggle a meaning, not just a view. The founder's framing is the product:

> **Tropical — who you're becoming here. Sidereal — what you are beneath that.**

Two layers, deliberately split by cost and by gate:

1. **Free, deterministic.** A generated line stating the delta in plain language: *"Your incarnational Moon is in Pisces; your essential Moon is in Aquarius."* No LLM, no tokens, no latency, no hallucination surface. Every visitor who presses the toggle gets the payoff.
2. **Pro, generated.** A comparative section appended to the existing AI natal reading, reading the two layers against each other. This is the paid artefact — consistent with SP-A's decision to gate the reading rather than the view.

## Decisions taken before design

Put to the founder on 2026-08-04: **deterministic line free, LLM comparative section Pro.** Rejected: template-only (no depth, and the toggle stays a curiosity) and LLM-only (free users would press the toggle and find nothing explaining it, which is the failure mode SP-A's "all three states free" decision was meant to avoid).

## Blocking prerequisite: the model configuration is already stale

Found while scoping this spec, and it gates everything below.

`src/app/api/v1/chart/interpret/route.ts:134` (and the `model` column written at `:170`) calls **`claude-sonnet-4-20250514`**, which is deprecated. Its documented replacement is **`claude-sonnet-5`**.

**Sources disagree on whether it is retired.** The migration guide gives a retirement date of 2026-06-15; the model catalogue lists retirement as TBD. Today is 2026-08-04. If the first is right, the paid natal reading is already returning `AI_SERVICE_ERROR` in production and nobody has noticed — the route logs to `console.error` and returns a 502, with no alert path.

**Verify first, before any other work in this spec.** A metadata read, free, no inference:

```
GET https://api.anthropic.com/v1/models/claude-sonnet-4-20250514
  x-api-key: $ANTHROPIC_API_KEY
  anthropic-version: 2023-06-01
```

A 404 means the paid feature is down now and the model migration below stops being part of SP-C and becomes an immediate hotfix ahead of everything else — SP-0 included.

### The migration is not just the ID string

Three things carry over cleanly and one does not:

| Item | Status |
|---|---|
| `temperature` / `top_p` / `top_k` | Not set on this request — nothing to strip, no 400 risk |
| Assistant prefill | Not used (single user message) — no 400 risk |
| `output_format` | Not used |
| **`thinking` omitted** | **Breaking.** On Sonnet 5 an omitted `thinking` parameter runs **adaptive thinking**; on Sonnet 4 it meant no thinking. `max_tokens` caps thinking *and* response text together, so at the current `max_tokens: 2500` a swapped model ID silently truncates readings mid-sentence. |

The tokenizer also changed — the same prompt produces roughly 30% more tokens on Sonnet 5 — so a limit sized against Sonnet 4 output is tight even with thinking off.

**Resolution.** Keep this route's behaviour and cost profile explicit rather than inherited:

```ts
model: 'claude-sonnet-5',
max_tokens: 3400,                          // headroom for the new tokenizer
thinking: { type: 'disabled' },            // this is content generation, not reasoning
output_config: { effort: 'low' },          // documented sweet spot for thinking-off generation
```

`effort: 'low'` with thinking disabled is the configuration the migration guide names for chat and content generation, and it performs at or above Sonnet 4.5 without thinking — which is what this route is doing. `claude-opus-5` is available if reading quality later proves worth the tier change; that is a founder cost decision, not a migration requirement, so this spec keeps the Sonnet tier.

The `chart_readings.model` column must record the new ID, otherwise the cache cannot be reasoned about after the fact.

**Out of scope but worth stating:** the route calls `/v1/messages` with raw `fetch`. The official `@anthropic-ai/sdk` is the documented default for a TypeScript project and would bring typed errors and retry handling. Converting it is not required for this spec and is not included.

## Scope

### 1. Free layer — `frame-delta.ts`

New pure module, `src/modules/astro-engine/frame-delta.ts`. No LLM, no I/O, no clock.

```ts
export interface FrameDelta {
  planet: Planet;
  siderealSign: Sign;
  tropicalSign: Sign;
}

/** Bodies whose sign differs between frames. Empty when nothing differs. */
export function computeFrameDeltas(chart: ChartResult): FrameDelta[];
```

Rendered for the three bodies users recognise — Sun, Moon, Ascendant — and only where the sign actually differs. Roughly one body in twelve falls close enough to a boundary that both frames agree, so **the empty and partial cases are real and must render gracefully**, not as a blank panel. When nothing differs, the panel says so: that is itself an interesting fact about the chart, not an error.

Copy carries the founder's framing, EN + ES (español neutro LATAM, `tú`), sign names untranslated per CLAUDE.md. Shown under the wheel whenever the toggle is in `tropical` or `both`.

### 2. Pro layer — comparative section in the reading

`buildChartInterpretationPrompt(chart, locale)` gains a third parameter — the section variant. The comparative variant receives both frames' Sun, Moon and Ascendant and asks for the two-layer reading in the founder's terms: what incarnation is shaping, and what sits beneath it. It stays a pure function: same inputs, same string.

Prompt constraints inherited from the existing one and non-negotiable: no medical, financial or legal advice; the astrology-is-not-advice disclaimer; the same two locale branches.

### 3. Cache key — migration 0020

`chart_readings` is keyed `uniqueIndex('chart_readings_chart_locale_uniq').on(chartId, locale)`. A second section per chart per locale collides with it.

Add a `variant` column (`'natal' | 'comparative'`, default `'natal'`) and widen the unique index to `(chart_id, locale, variant)`. Existing rows become `'natal'` under the default, so no backfill is needed.

**Migration 0020, hand-trimmed.** `db:generate` diffs against a stale snapshot (0012) and re-emits whole tables; the generated SQL must be reduced to the actual delta with `IF NOT EXISTS` guards before it is applied. This is a known trap in this repo, not a hypothetical.

The interpret route's cache read and write both gain the variant, and the comparative variant is only requested when the user has engaged the toggle — so a user who never leaves sidereal never pays for a comparative generation.

### 4. Gating

The deterministic panel renders for everyone. The comparative section sits behind the same Pro gate as the existing reading, via `useSubscription` / `PaywallCta` — no new gating mechanism. For free users the section renders as a teaser with the paywall CTA, matching the pattern already used elsewhere in the app.

## Tests

- `computeFrameDeltas` returns only bodies whose sign genuinely differs; empty array when none do
- The empty and partial cases render a real message, not a blank panel
- Boundary case: a body within a degree of a sign cusp is classified consistently with `projectChart`
- `buildChartInterpretationPrompt` stays pure across both variants; the comparative variant names both frames' signs and carries the disclaimer and the no-advice constraints
- Cache: `(chart_id, locale, 'natal')` and `(chart_id, locale, 'comparative')` coexist; a repeat request for either is served from cache
- Migration 0020 is a pure delta — applying it to a database already at 0019 creates one column and one index and touches nothing else
- Gate: a free user gets the deterministic panel and the teaser; a Pro user gets the generated section
- i18n: every new string resolves in EN and ES

## Out of scope

- Comparative synastry readings.
- Converting the route to `@anthropic-ai/sdk`.
- Streaming the reading.
- Any model-tier change beyond the deprecation-driven migration above.
- Cosmic Passport and all SEO surfaces — sidereal, unchanged.

## Verification before "done"

- The model-availability check above, run **first**; if it 404s, stop and hotfix
- `npm test`, `npm run typecheck`, `npm run lint` clean
- One real generation per locale against `claude-sonnet-5`, confirming the reading is not truncated (`stop_reason` is `end_turn`, not `max_tokens`) — this is the specific failure the thinking-default change would cause
- Migration 0020 applied against a copy before production, with the row count of affected `chart_readings` reported to the founder
- Manual: free account sees panel + teaser; Pro account sees the generated comparative section; both locales
