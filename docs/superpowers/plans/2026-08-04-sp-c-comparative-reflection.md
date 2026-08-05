# SP-C · Comparative Reflection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the toggle a meaning, not just a view — a free deterministic line stating the delta between the two frames, and a Pro-gated AI section reading the two layers against each other.

**Architecture:** Two layers split by cost and gate. The free layer is a pure `computeFrameDeltas(chart)` — no LLM, no I/O, no latency, no hallucination surface. The Pro layer is a `variant` parameter on the existing interpretation prompt, cached under a widened unique key. The founder's framing is the product: **tropical = who you're becoming here; sidereal = what you are beneath that.**

**Tech Stack:** TypeScript 6 (strict), React 19, Next.js 16, Drizzle ORM + Neon Postgres, next-intl, Anthropic Messages API, vitest.

**Spec:** `docs/superpowers/specs/2026-08-04-sp-c-comparative-reflection-design.md`
**Depends on:** SP-0 (frame correctness) and SP-A (`projectChart`, the toggle). Independent of SP-B.

## Blocking prerequisite — RESOLVED before this plan was written

The spec opens with a check on `claude-sonnet-4-20250514`. **It was run: `GET /v1/models/claude-sonnet-4-20250514` returned HTTP 404 `not_found_error`.** The model is retired.

The blast radius was wider than the spec recorded — **three** routes called it, not one, so the natal reading, the synastry analysis *and* the tarot interpretation were all returning 502 in production simultaneously. That was fixed ahead of this plan in commit `1b69fbf`, which introduced `src/shared/lib/anthropic.ts` as the single source of truth and moved all three callers onto `claude-sonnet-5` with `thinking: { type: 'disabled' }`, `output_config: { effort: 'low' }` and raised token limits. Verified live: both locales generate with `stop_reason=end_turn`.

**Therefore this plan does not repeat the migration.** It consumes `buildMessagesRequest` from that module. One item remains outstanding and is Task 4 below: the DB-level default on `chart_readings.model` still reads the retired ID.

## Global Constraints

- **i18n:** all copy through `next-intl`, EN + ES. Spanish = español neutro LATAM, `tú`. **Sign names stay untranslated.**
- **Astrology ≠ advice.** Every generated section must carry the "not medical/financial/legal advice" disclaimer. The existing prompt's constraints are inherited and non-negotiable.
- **Drizzle snapshots 0013–0017 are stale.** `npm run db:generate` diffs from the 0012 snapshot and re-emits whole tables. **The generated SQL must be hand-trimmed to the actual delta with `IF NOT EXISTS` guards before it is applied.** This is a known trap in this repo, not a hypothetical.
- Secrets via `process.env` only. Never log decrypted PII.
- Zero failing tests / zero type errors — this touches a payment-gated path, where that policy is strictest.
- `npm run lint`: filter `.claude/worktrees/`.
- **Never `git add -A`.** Stage only named files.
- Commit scope: `feat(astro-engine/SP-C): ...`.

## File Structure

| File | Responsibility |
|---|---|
| `src/modules/astro-engine/frame-delta.ts` | **New.** Pure delta computation, free layer |
| `src/modules/astro-engine/components/FrameDeltaPanel.tsx` | **New.** Renders the deterministic line |
| `src/modules/astro-engine/lib/chart-interpretation-prompt.ts` | Gains a `variant` parameter |
| `src/app/api/v1/chart/interpret/route.ts` | Accepts and caches by `variant` |
| `src/shared/lib/schema.ts` | `chart_readings.variant` + widened unique index |
| `drizzle/0020_reading_variant.sql` | **New, hand-trimmed.** |
| `src/modules/astro-engine/components/ChartReadingSection.tsx` | Requests the comparative variant when the toggle is engaged |
| `messages/en.json`, `messages/es.json` | `chart.frameDelta.*` keys |

---

### Task 1: `frame-delta.ts` — the free layer

**Files:**
- Create: `src/modules/astro-engine/frame-delta.ts`
- Test: `src/modules/astro-engine/__tests__/frame-delta.test.ts`

**Interfaces:**
- Consumes: `projectChart` (SP-A Task 1).
- Produces: `interface FrameDelta { planet: Planet; siderealSign: Sign; tropicalSign: Sign }` and `computeFrameDeltas(chart: ChartResult): FrameDelta[]` — consumed by Tasks 2 and 5.

- [ ] **Step 1: Write the failing test**

Create `src/modules/astro-engine/__tests__/frame-delta.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateChart } from '../chart';
import { projectChart } from '../zodiac-frame';
import { computeFrameDeltas } from '../frame-delta';
import { HouseSystem, Planet } from '@/shared/types/astrology';

// Synthetic birth data — no real person, no PII.
const chart = calculateChart({
  date: '1990-06-15',
  time: '14:30',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York',
  houseSystem: HouseSystem.Placidus,
});

describe('computeFrameDeltas', () => {
  it('covers only Sun, Moon and Ascendant', () => {
    const deltas = computeFrameDeltas(chart);
    const allowed = new Set([Planet.Sun, Planet.Moon, Planet.Ascendant]);
    for (const d of deltas) expect(allowed.has(d.planet)).toBe(true);
  });

  it('never reports a body whose sign is the same in both frames', () => {
    for (const d of computeFrameDeltas(chart)) {
      expect(d.siderealSign).not.toBe(d.tropicalSign);
    }
  });

  it('agrees with projectChart on every sign it reports', () => {
    const trop = projectChart(chart, 'tropical');
    for (const d of computeFrameDeltas(chart)) {
      const sid = d.planet === Planet.Ascendant
        ? chart.ascendant!
        : chart.planets.find((p) => p.planet === d.planet)!;
      const tro = d.planet === Planet.Ascendant
        ? trop.ascendant!
        : trop.planets.find((p) => p.planet === d.planet)!;
      expect(d.siderealSign).toBe(sid.sign);
      expect(d.tropicalSign).toBe(tro.sign);
    }
  });

  it('returns an empty array rather than throwing when nothing differs', () => {
    // Roughly one body in twelve sits close enough to a boundary that both
    // frames agree, so the empty and partial cases are real, not theoretical.
    const stub = {
      ...chart,
      planets: chart.planets.map((p) => ({ ...p, tropicalDegree: p.absoluteDegree })),
      ascendant: { ...chart.ascendant!, tropicalDegree: chart.ascendant!.absoluteDegree },
      ayanamsa: 0,
    };
    expect(computeFrameDeltas(stub)).toEqual([]);
  });

  it('omits the Ascendant when there is no birth time', () => {
    const noTime = calculateChart({
      date: '1990-06-15', time: null, latitude: 40.7128, longitude: -74.006,
      timezone: 'America/New_York', houseSystem: HouseSystem.Placidus,
    });
    expect(noTime.ascendant).toBeNull();
    const deltas = computeFrameDeltas(noTime);
    expect(deltas.some((d) => d.planet === Planet.Ascendant)).toBe(false);
  });

  it('is pure — repeated calls return equal results', () => {
    expect(computeFrameDeltas(chart)).toEqual(computeFrameDeltas(chart));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/astro-engine/__tests__/frame-delta.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/modules/astro-engine/frame-delta.ts`:

```ts
import type { ChartResult, Sign } from '@/shared/types/astrology';
import { Planet } from '@/shared/types/astrology';
import { projectChart } from './zodiac-frame';

export interface FrameDelta {
  planet: Planet;
  siderealSign: Sign;
  tropicalSign: Sign;
}

/**
 * The three bodies users recognise. Reporting all twelve would bury the
 * insight in a list; these are the ones a reader can hold in mind at once.
 */
const REPORTED: readonly Planet[] = [Planet.Sun, Planet.Moon, Planet.Ascendant];

/**
 * Bodies whose sign differs between the two zodiac frames.
 *
 * Pure: no LLM, no I/O, no clock. Returns an empty array when the frames
 * agree on all three — which happens often enough to be a normal outcome
 * rather than an error, so callers must render that case as a real message.
 */
export function computeFrameDeltas(chart: ChartResult): FrameDelta[] {
  const tropical = projectChart(chart, 'tropical');
  const deltas: FrameDelta[] = [];

  for (const planet of REPORTED) {
    const sid = planet === Planet.Ascendant
      ? chart.ascendant
      : chart.planets.find((p) => p.planet === planet);
    const tro = planet === Planet.Ascendant
      ? tropical.ascendant
      : tropical.planets.find((p) => p.planet === planet);

    if (!sid || !tro) continue;            // no birth time → no Ascendant
    if (sid.sign === tro.sign) continue;   // frames agree on this body

    deltas.push({ planet, siderealSign: sid.sign, tropicalSign: tro.sign });
  }

  return deltas;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/modules/astro-engine/__tests__/frame-delta.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/frame-delta.ts src/modules/astro-engine/__tests__/frame-delta.test.ts
git commit -m "feat(astro-engine/SP-C): add pure frame-delta computation"
```

---

### Task 2: The free panel

**Files:**
- Create: `src/modules/astro-engine/components/FrameDeltaPanel.tsx`
- Modify: `messages/en.json`, `messages/es.json`
- Test: `src/modules/astro-engine/components/__tests__/FrameDeltaPanel.test.tsx`

- [ ] **Step 1: Add the strings**

`messages/en.json`, inside `"chart"`:

```json
"frameDelta": {
  "title": "Two readings of the same sky",
  "intro": "Tropical is who you're becoming here. Sidereal is what you are beneath that.",
  "line": "Your incarnational {body} is in {tropical}; your essential {body} is in {sidereal}.",
  "bodySun": "Sun",
  "bodyMoon": "Moon",
  "bodyAscendant": "Ascendant",
  "identical": "Both zodiacs place your Sun, Moon and Ascendant in the same signs — a chart that reads the same either way. That is unusual, and it means the two layers of you are speaking with one voice.",
  "partial": "Where a body isn't listed, both zodiacs agree on it."
}
```

`messages/es.json`:

```json
"frameDelta": {
  "title": "Dos lecturas del mismo cielo",
  "intro": "El tropical es en quién te estás convirtiendo aquí. El sideral es lo que eres por debajo de eso.",
  "line": "Tu {body} encarnado está en {tropical}; tu {body} esencial está en {sidereal}.",
  "bodySun": "Sol",
  "bodyMoon": "Luna",
  "bodyAscendant": "Ascendente",
  "identical": "Ambos zodiacos ubican tu Sol, tu Luna y tu Ascendente en los mismos signos: una carta que se lee igual de cualquier manera. Es poco común, y significa que tus dos capas hablan con una sola voz.",
  "partial": "Si un cuerpo no aparece en la lista, ambos zodiacos coinciden en él."
}
```

Planet names are translated (per the project's i18n rule); **sign names are interpolated untranslated**.

- [ ] **Step 2: Write the failing test**

Create `src/modules/astro-engine/components/__tests__/FrameDeltaPanel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { FrameDeltaPanel } from '../FrameDeltaPanel';
import { Planet } from '@/shared/types/astrology';
import en from '../../../../../messages/en.json';

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>
);

describe('FrameDeltaPanel', () => {
  it('states each delta in the founder-framed wording', () => {
    render(wrap(<FrameDeltaPanel deltas={[
      { planet: Planet.Moon, siderealSign: 'Aquarius', tropicalSign: 'Pisces' },
    ]} />));
    expect(screen.getByText(/incarnational Moon is in Pisces/)).toBeInTheDocument();
    expect(screen.getByText(/essential Moon is in Aquarius/)).toBeInTheDocument();
  });

  it('renders a real message rather than a blank panel when nothing differs', () => {
    // Not an error state — a chart where both frames agree is a fact about
    // that chart, and saying so is more interesting than showing nothing.
    render(wrap(<FrameDeltaPanel deltas={[]} />));
    expect(screen.getByText(en.chart.frameDelta.identical)).toBeInTheDocument();
  });

  it('explains the omission when only some bodies differ', () => {
    render(wrap(<FrameDeltaPanel deltas={[
      { planet: Planet.Sun, siderealSign: 'Gemini', tropicalSign: 'Cancer' },
    ]} />));
    expect(screen.getByText(en.chart.frameDelta.partial)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/FrameDeltaPanel.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `src/modules/astro-engine/components/FrameDeltaPanel.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Planet } from '@/shared/types/astrology';
import type { FrameDelta } from '../frame-delta';

const BODY_KEY: Partial<Record<Planet, string>> = {
  [Planet.Sun]: 'bodySun',
  [Planet.Moon]: 'bodyMoon',
  [Planet.Ascendant]: 'bodyAscendant',
};

interface FrameDeltaPanelProps {
  deltas: FrameDelta[];
}

/**
 * The free, deterministic payoff for pressing the toggle.
 *
 * No LLM: no tokens, no latency, no hallucination surface. Every visitor who
 * engages the control gets an explanation, which is what keeps the toggle
 * from reading as a curiosity.
 */
export function FrameDeltaPanel({ deltas }: FrameDeltaPanelProps) {
  const t = useTranslations('chart.frameDelta');
  const complete = deltas.length === 3;

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-sm font-medium text-white/80">{t('title')}</h3>
      <p className="mt-1 text-xs text-white/50">{t('intro')}</p>

      {deltas.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-white/70">{t('identical')}</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {deltas.map((d) => (
              <li key={d.planet} className="text-sm leading-relaxed text-white/70">
                {t('line', {
                  body: t(BODY_KEY[d.planet] as 'bodySun'),
                  tropical: d.tropicalSign,   // sign names untranslated
                  sidereal: d.siderealSign,
                })}
              </li>
            ))}
          </ul>
          {!complete && (
            <p className="mt-2 text-xs text-white/40">{t('partial')}</p>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/FrameDeltaPanel.test.tsx`

Expected: PASS, 3 tests.

- [ ] **Step 6: Render it from `ChartDisplay`**

Show it whenever the toggle is in `tropical` or `both`. In `ChartDisplay.tsx`:

```tsx
  const frameDeltas = useMemo(
    () => (chart && frame !== 'sidereal' ? computeFrameDeltas(chart) : []),
    [chart, frame],
  );
```

and, below the wheel:

```tsx
        {frame !== 'sidereal' && <FrameDeltaPanel deltas={frameDeltas} />}
```

Note `chart`, not `view` — `computeFrameDeltas` projects internally and needs the sidereal original.

- [ ] **Step 7: Verify key parity and commit**

```bash
node -e "
const en=require('./messages/en.json'), es=require('./messages/es.json');
const a=Object.keys(en.chart.frameDelta).sort(), b=Object.keys(es.chart.frameDelta).sort();
console.log(JSON.stringify(a)===JSON.stringify(b)?'KEYS MATCH':'MISMATCH');
"

git add src/modules/astro-engine/components/FrameDeltaPanel.tsx \
        src/modules/astro-engine/components/__tests__/FrameDeltaPanel.test.tsx \
        src/modules/astro-engine/components/ChartDisplay.tsx \
        messages/en.json messages/es.json
git commit -m "feat(astro-engine/SP-C): add the free deterministic frame-delta panel"
```

---

### Task 3: The `variant` parameter on the prompt

**Files:**
- Modify: `src/modules/astro-engine/lib/chart-interpretation-prompt.ts`
- Test: `src/modules/astro-engine/lib/__tests__/chart-interpretation-prompt.test.ts`

**Interfaces:**
- Produces: `type ReadingVariant = 'natal' | 'comparative'` and the widened signature `buildChartInterpretationPrompt(chart: ChartResult, locale: 'en' | 'es', variant?: ReadingVariant): string`. The parameter is optional and defaults to `'natal'`, so every existing caller compiles unchanged.

- [ ] **Step 1: Write the failing test**

Append to the prompt test file:

```ts
import { projectChart } from '@/modules/astro-engine/zodiac-frame';

describe('comparative variant', () => {
  const chart = calculateChart({
    date: '1990-06-15', time: '14:30', latitude: 40.7128, longitude: -74.006,
    timezone: 'America/New_York', houseSystem: HouseSystem.Placidus,
  });

  it('defaults to the natal variant, so existing callers are unaffected', () => {
    expect(buildChartInterpretationPrompt(chart, 'en'))
      .toBe(buildChartInterpretationPrompt(chart, 'en', 'natal'));
  });

  it('names both frames signs in the comparative variant', () => {
    const trop = projectChart(chart, 'tropical');
    const prompt = buildChartInterpretationPrompt(chart, 'en', 'comparative');
    expect(prompt).toContain(chart.ascendant!.sign);
    expect(prompt).toContain(trop.ascendant!.sign);
    expect(prompt).toContain('sidereal');
    expect(prompt).toContain('tropical');
  });

  it('carries the founder framing into the comparative variant', () => {
    const prompt = buildChartInterpretationPrompt(chart, 'en', 'comparative');
    expect(prompt.toLowerCase()).toContain('becoming');
    expect(prompt.toLowerCase()).toContain('beneath');
  });

  it('keeps the no-advice constraint in both variants', () => {
    for (const v of ['natal', 'comparative'] as const) {
      const prompt = buildChartInterpretationPrompt(chart, 'en', v);
      expect(prompt.toLowerCase()).toMatch(/not.*(medical|financial|legal)/);
    }
  });

  it('honours the Spanish locale branch in the comparative variant', () => {
    const prompt = buildChartInterpretationPrompt(chart, 'es', 'comparative');
    expect(prompt).toContain('español neutro LATAM');
  });

  it('is pure — same inputs, same string', () => {
    expect(buildChartInterpretationPrompt(chart, 'en', 'comparative'))
      .toBe(buildChartInterpretationPrompt(chart, 'en', 'comparative'));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/astro-engine/lib/__tests__/chart-interpretation-prompt.test.ts`

Expected: FAIL — the function takes two parameters.

- [ ] **Step 3: Implement**

In `chart-interpretation-prompt.ts`, export the variant type and widen the signature:

```ts
export type ReadingVariant = 'natal' | 'comparative';

export function buildChartInterpretationPrompt(
  chart: ChartResult,
  locale: 'en' | 'es',
  variant: ReadingVariant = 'natal',
): string {
```

Immediately before the existing `return \`You are an expert sidereal astrologer...\``, branch:

```ts
  if (variant === 'comparative') {
    const tropical = projectChart(chart, 'tropical');
    const pair = (planet: Planet, label: string): string => {
      const sid = planet === Planet.Ascendant
        ? chart.ascendant
        : chart.planets.find((p) => p.planet === planet);
      const tro = planet === Planet.Ascendant
        ? tropical.ascendant
        : tropical.planets.find((p) => p.planet === planet);
      if (!sid || !tro) return `${label}: unknown`;
      return `${label}: sidereal ${sid.sign}, tropical ${tro.sign}`;
    };

    return `You are an expert astrologer writing for a reader who has just discovered that their chart reads differently in two zodiac systems.

The two systems differ by a constant offset (the Lahiri ayanamsa, ${chart.ayanamsa.toFixed(2)}° at this moment). The aspects and house numbers are identical in both — only the sign each body falls in can change.

Frame this as two layers of one person, not as two competing claims:
- The TROPICAL placement describes who they are becoming here — the shaping that incarnation, season and earthly life do to them.
- The SIDEREAL placement describes what they are beneath that shaping — the fixed-star reckoning, what they were before and under the incarnational layer.

Their placements:
${pair(Planet.Sun, 'Sun')}
${pair(Planet.Moon, 'Moon')}
${pair(Planet.Ascendant, 'Ascendant')}

Write 3 short sections — one per body, skipping any marked unknown. For each, read the two placements against each other: what the incarnational layer is shaping, and what sits underneath it. Where both systems agree on a body, say so plainly and treat that agreement as meaningful rather than as an absence.

${localeInstruction}

Constraints:
- Never present this as one system being more correct than the other. They answer different questions.
- Do not give medical, financial, legal or psychiatric advice, and do not imply any of it.
- End with one sentence noting this is a tool for self-reflection and symbolic insight, not professional, medical, financial or legal advice.
- No headings beyond the three body names. No bullet lists. Plain prose.`;
  }
```

Add the imports this needs: `projectChart` from `../zodiac-frame`, and `Planet` if not already imported.

**Note** that `localeInstruction` is computed earlier in the function and is reused here deliberately — the two variants must not drift apart on locale handling.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/modules/astro-engine/lib/`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/lib/chart-interpretation-prompt.ts \
        src/modules/astro-engine/lib/__tests__/chart-interpretation-prompt.test.ts
git commit -m "feat(astro-engine/SP-C): add the comparative variant to the interpretation prompt"
```

---

### Task 4: Migration 0020 — the cache key

`chart_readings` is keyed `uniqueIndex('chart_readings_chart_locale_uniq').on(chartId, locale)`. A second section per chart per locale collides with it.

**Files:**
- Modify: `src/shared/lib/schema.ts`
- Create: `drizzle/0020_reading_variant.sql`

- [ ] **Step 1: Update the Drizzle schema**

In `src/shared/lib/schema.ts`, inside `chartReadings`:

```ts
    body: text('body').notNull(),
    /**
     * Which section this row holds. 'natal' is the original single reading;
     * 'comparative' is the sidereal/tropical two-layer section from SP-C.
     */
    variant: text('variant', { enum: ['natal', 'comparative'] })
      .notNull()
      .default('natal'),
    model: text('model').notNull().default(ANTHROPIC_MODEL),
```

and widen the index:

```ts
  (t) => ({
    uniqChartLocaleVariant: uniqueIndex('chart_readings_chart_locale_variant_uniq').on(
      t.chartId,
      t.locale,
      t.variant,
    ),
  }),
```

- [ ] **Step 2: Write the migration by hand — do not ship generator output**

`npm run db:generate` diffs against the stale 0012 snapshot and re-emits whole tables. Running it here is fine as a *reference*, but the file that ships must be the delta. Create `drizzle/0020_reading_variant.sql`:

```sql
-- SP-C: a second reading section per (chart, locale) needs the variant in the key.
-- Hand-written delta. `db:generate` diffs from a stale 0012 snapshot and would
-- re-emit whole tables; see feedback_drizzle_snapshot_stale.

ALTER TABLE "chart_readings"
  ADD COLUMN IF NOT EXISTS "variant" text NOT NULL DEFAULT 'natal';

-- Existing rows are natal readings and are covered by the column default,
-- so no backfill is required.

DROP INDEX IF EXISTS "chart_readings_chart_locale_uniq";

CREATE UNIQUE INDEX IF NOT EXISTS "chart_readings_chart_locale_variant_uniq"
  ON "chart_readings" ("chart_id", "locale", "variant");

-- Carried over from the Sonnet 4 retirement (commit 1b69fbf): the application
-- always supplies `model` explicitly, but the column default still named the
-- retired model.
ALTER TABLE "chart_readings"
  ALTER COLUMN "model" SET DEFAULT 'claude-sonnet-5';
```

- [ ] **Step 3: Verify it is a pure delta**

Read the file and confirm it contains **only** `ALTER TABLE`, `DROP INDEX`, `CREATE UNIQUE INDEX` — no `CREATE TABLE`, no statement touching any table other than `chart_readings`. If `db:generate` was run and left a generated `.sql` beside yours, delete the generated one.

- [ ] **Step 4: Dry-run against a copy, not production**

Report to the founder before applying:
- the current row count of `chart_readings`
- confirmation that dropping `chart_readings_chart_locale_uniq` and creating the three-column index cannot fail on existing data (it cannot: all existing rows get `variant = 'natal'`, so the widened key is unique wherever the old one was)

**Do not apply to production without explicit approval.** Migrations are a shared-state action.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/schema.ts drizzle/0020_reading_variant.sql
git commit -m "feat(astro-engine/SP-C): migration 0020 — variant column and widened reading cache key"
```

---

### Task 5: Route and gating

**Files:**
- Modify: `src/app/api/v1/chart/interpret/route.ts`
- Modify: `src/modules/astro-engine/components/ChartReadingSection.tsx`
- Test: `src/app/api/v1/chart/interpret/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `ReadingVariant` (Task 3), `buildMessagesRequest` (already in `src/shared/lib/anthropic.ts` from commit `1b69fbf`), the `variant` column (Task 4).

- [ ] **Step 1: Write the failing tests**

Append to `src/app/api/v1/chart/interpret/__tests__/route.test.ts`, following the existing mocking style in that file:

```ts
  it('defaults to the natal variant when the body omits it', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([{ body: 'cached natal' }]);

    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.reading).toBe('cached natal');
  });

  it('rejects an unknown variant', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    const { POST } = await import('../route');
    const res = await POST(
      makeRequest({ chartId: 'abc', locale: 'en', variant: 'horoscope' }),
    );
    expect(res.status).toBe(400);
  });

  it('caches the comparative variant separately from the natal one', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]);   // comparative not cached
    mockSelectNatalChart.mockResolvedValueOnce([{ id: 'abc', chartData: FIXTURE_CHART_DATA }]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'comparative body' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    );

    const { POST } = await import('../route');
    const res = await POST(
      makeRequest({ chartId: 'abc', locale: 'en', variant: 'comparative' }),
    );
    expect(res.status).toBe(200);
    expect(mockInsertChartReading).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'comparative' }),
    );
    fetchSpy.mockRestore();
  });
```

Reuse the `chartData` literal already present in the existing `'generates and caches on cache miss + chart found'` test — hoist it to a `FIXTURE_CHART_DATA` const rather than duplicating it.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/api/v1/chart/interpret/__tests__/route.test.ts`

Expected: the two new variant tests FAIL; the pre-existing ones still pass.

- [ ] **Step 3: Accept the variant in the route**

Widen the zod schema:

```ts
  variant: z.enum(['natal', 'comparative']).optional().default('natal'),
```

Add `variant` to the cache-read `where` clause alongside `chartId` and `locale`, pass it into `buildChartInterpretationPrompt(chartData, body.locale, body.variant)`, and include it in the insert values.

The Anthropic call itself needs no change — it already goes through `buildMessagesRequest`.

- [ ] **Step 4: Request the comparative section from the client**

In `ChartReadingSection.tsx`, add an optional prop:

```ts
interface ChartReadingSectionProps {
  chartId: string | null;
  chart: ChartResult;
  /** When true, request the sidereal/tropical comparative section instead. */
  comparative?: boolean;
}
```

Include `variant: comparative ? 'comparative' : 'natal'` in the POST body, and add it to the `useCallback` dependency array beside `chartId` and `locale`.

In `ChartDisplay.tsx`, render a second `<ChartReadingSection chartId={chartId} chart={chart} comparative />` **only when `frame !== 'sidereal'`**. A user who never leaves sidereal therefore never triggers a comparative generation and never pays for one.

Note this still passes `chart` — the raw sidereal result — exactly as SP-A requires. `buildChartInterpretationPrompt` projects internally.

- [ ] **Step 5: Confirm the gate**

`ChartReadingSection` already gates on `useSubscription().isPro` and renders `PaywallCta` for free users. The comparative section inherits that with no new mechanism. Verify by reading the component that no early return bypasses the gate when `comparative` is set.

- [ ] **Step 6: Run everything**

```bash
npx vitest run src/app/api/v1/chart/ src/modules/astro-engine/
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/v1/chart/interpret/route.ts \
        src/app/api/v1/chart/interpret/__tests__/route.test.ts \
        src/modules/astro-engine/components/ChartReadingSection.tsx \
        src/modules/astro-engine/components/ChartDisplay.tsx
git commit -m "feat(astro-engine/SP-C): serve and cache the comparative reading variant"
```

---

### Task 6: Full verification

- [ ] **Step 1: Run everything**

```bash
npm test
npm run typecheck
npm run lint 2>&1 | grep -v '.claude/worktrees/'
```

- [ ] **Step 2: One real generation per locale**

Generate a comparative reading in EN and in ES against `claude-sonnet-5` and confirm `stop_reason` is `end_turn`, not `max_tokens`. This is the specific failure the thinking-default change would cause, and it must be re-checked for the comparative prompt because it is a different length from the natal one.

- [ ] **Step 3: Manual pass**

- **Free account:** press the toggle → the deterministic panel appears; the comparative section shows as a teaser with the paywall CTA
- **Pro account:** the generated comparative section appears; pressing the toggle again does not regenerate it (served from cache)
- **Both locales**, and a chart **without a birth time** (no Ascendant line, no crash)
- A chart where both frames agree on all three bodies renders the "identical" message, not a blank panel

- [ ] **Step 4: Report the migration to the founder**

Report the `chart_readings` row count and request approval before applying 0020 to production.

---

## Self-Review

**Spec coverage:** Blocking prerequisite → resolved ahead of the plan, recorded at the top with the commit SHA. §1 free layer → Tasks 1–2. §2 Pro layer → Task 3. §3 cache key / migration 0020 → Task 4. §4 gating → Task 5 Steps 4–5. Test list → Tasks 1, 2, 3, 5, 6. The spec's "out of scope" items (comparative synastry, SDK conversion, streaming, tier changes) have no tasks, correctly.

**Placeholders:** none. Task 5 Step 1 asks for a fixture to be hoisted rather than restated, which is a concrete instruction against a named existing test.

**Type consistency:** `FrameDelta { planet, siderealSign, tropicalSign }` (Task 1) is consumed under those exact names by `FrameDeltaPanel` (Task 2). `ReadingVariant = 'natal' | 'comparative'` (Task 3) is the same union used by the zod enum (Task 5) and the Drizzle column enum (Task 4) — all three must stay in sync, and the route test asserts the rejection path for anything else.
