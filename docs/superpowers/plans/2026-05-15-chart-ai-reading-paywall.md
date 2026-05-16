# Chart AI Reading + Paywall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the P0 Meta-ad conversion leak on `/chart` by inserting a new gated "AI Reading" section between Wheel/Table and Passport — deterministic teaser + blurred locked preview + PaywallCta for free; LLM-generated synthesis cached in Postgres for Pro.

**Architecture:** Mirror the celtic-cross 9-commit shipping pattern: one new `PaywallTrigger` value (`'natal-chart'`), one new Postgres table (`chart_readings`), one new premium endpoint (`POST /api/v1/chart/interpret`), one new client component (`ChartReadingSection`), reused `PaywallCta` + `PaywallModal` infrastructure. Direct-to-main per CLAUDE.md.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6 strict, Drizzle ORM + Neon Postgres, Upstash rate-limit, Clerk auth, Anthropic Claude API (`claude-sonnet-4-20250514`), Vitest + Playwright, next-intl.

**Spec:** `docs/superpowers/specs/2026-05-15-chart-ai-reading-paywall-design.md` (commit `e38c61b`)

---

## Pre-flight

Before starting any task, run:

```bash
git status --short
git log --oneline -5
ls drizzle/ | tail -3
npm run typecheck
```

Confirm:
- Working tree clean (modulo `outputs/cowork-handoff-*` and `.gitignore` left over from earlier session — leave alone)
- Latest commit on `main` is `e38c61b docs(chart-paywall): AI natal chart reading + paywall design spec` (or newer)
- Latest migration in `drizzle/` is `0009_ambitious_lady_mastermind.sql` (so new migration = `0010`)
- `typecheck` exits zero

If any of these fail, stop and resolve before starting Task 1.

---

## Task 1: Add `'natal-chart'` to `PaywallTrigger` union

**Files:**
- Modify: `src/shared/types/paywall.ts`
- Modify: `src/shared/components/__tests__/PaywallCta.test.tsx`

- [ ] **Step 1: Extend `PaywallCta` test for the new trigger value**

Open `src/shared/components/__tests__/PaywallCta.test.tsx`. Add this test inside the `describe('PaywallCta', ...)` block (right after the last existing test):

```tsx
  it('accepts trigger="natal-chart" and forwards it to PAYWALL_CTA_VIEWED', () => {
    render(<PaywallCta trigger="natal-chart" onClick={vi.fn()} />);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'PAYWALL_CTA_VIEWED',
      expect.objectContaining({ trigger: 'natal-chart', variant: 'card' }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/shared/components/__tests__/PaywallCta.test.tsx
```

Expected: TypeScript compile fails with something like `Type '"natal-chart"' is not assignable to type 'PaywallTrigger'`. (If TS errors don't fail the run, the test should still pass — in which case Step 3 is still needed to make the type union match the spec.)

- [ ] **Step 3: Add `'natal-chart'` to the union**

Edit `src/shared/types/paywall.ts`:

```ts
/**
 * Identifier for the paywall trigger surface — where the user clicked the
 * CTA. Used to (a) select contextual modal headline copy and (b) add a
 * `trigger` dimension to paywall analytics events for per-surface funnel
 * analysis.
 *
 * Kebab-case values match repo conventions for analytics props and UTM
 * parameters. In i18n keys, the dot-safe camelCase variant is used (e.g.
 * `paywall.contextualTitles.celticCross`).
 */
export type PaywallTrigger =
  | 'essay'
  | 'celtic-cross'
  | 'three-card'
  | 'synastry-ai'
  | 'natal-chart'
  | 'generic';
```

- [ ] **Step 4: Run test to verify it passes + typecheck clean**

```bash
npx vitest run src/shared/components/__tests__/PaywallCta.test.tsx
npm run typecheck
```

Expected: all tests pass (5 tests in PaywallCta.test.tsx, the original 4 + the new one). Typecheck: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/paywall.ts src/shared/components/__tests__/PaywallCta.test.tsx
git commit -m "$(cat <<'EOF'
feat(paywall/types): add natal-chart trigger

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `chart_readings` schema + migration

**Files:**
- Modify: `src/shared/lib/schema.ts` (insert chartReadings table after cosmicPassports block)
- Create: `drizzle/0010_chart_readings.sql`
- Create: `src/shared/lib/__tests__/schema.chart-readings.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `src/shared/lib/__tests__/schema.chart-readings.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { chartReadings, natalCharts } from '@/shared/lib/schema';
import { getTableColumns, getTableName } from 'drizzle-orm';

describe('chartReadings schema', () => {
  it('exports a Drizzle table named chart_readings', () => {
    expect(getTableName(chartReadings)).toBe('chart_readings');
  });

  it('has the expected columns', () => {
    const cols = getTableColumns(chartReadings);
    const names = Object.keys(cols).sort();
    expect(names).toEqual(
      ['body', 'chartId', 'generatedAt', 'id', 'locale', 'model'].sort(),
    );
  });

  it('chartId references natal_charts.id', () => {
    const cols = getTableColumns(chartReadings);
    const refs = cols.chartId.foreignKeys;
    // Drizzle exposes foreignKeys as an array of FK builder results; at least one
    // FK should target natal_charts (we check the referenced table name).
    const target = (refs as Array<{ reference?: () => { foreignTable?: unknown } }>)
      .map((fk) => fk.reference?.()?.foreignTable)
      .filter(Boolean) as unknown[];
    expect(target.some((t) => getTableName(t as Parameters<typeof getTableName>[0]) === 'natal_charts')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/shared/lib/__tests__/schema.chart-readings.test.ts
```

Expected: fails to import `chartReadings` (undefined export).

- [ ] **Step 3: Add `chartReadings` table to schema**

In `src/shared/lib/schema.ts`, locate the `cosmicPassports` table definition (around the section commented `// cosmic_passports`). Right after the `cosmicPassports` block (before `// waitlist_entries` or whatever section is next), insert:

```ts
// ---------------------------------------------------------------------------
// chart_readings — cached AI interpretations of natal charts.
// Keyed by (chart_id, locale) so EN + ES readings of the same chart coexist.
// Cascade-deletes when the underlying natal_chart is purged by the temp-chart
// cleanup cron (90-day retention via cleanup-temp-charts cron job).
// ---------------------------------------------------------------------------
export const chartReadings = pgTable(
  'chart_readings',
  {
    id: text('id').primaryKey(), // nanoid
    chartId: text('chart_id')
      .notNull()
      .references(() => natalCharts.id, { onDelete: 'cascade' }),
    locale: text('locale', { enum: ['en', 'es'] }).notNull(),
    body: text('body').notNull(), // LLM markdown output, ~10 KB typical
    model: text('model').notNull().default('claude-sonnet-4-20250514'),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqChartLocale: uniqueIndex('chart_readings_chart_locale_uniq').on(
      t.chartId,
      t.locale,
    ),
  }),
);

export type ChartReading = typeof chartReadings.$inferSelect;
```

If `uniqueIndex` is not yet imported at the top of `schema.ts`, add it to the existing drizzle-orm/pg-core import. Run `grep -n "^import" src/shared/lib/schema.ts` to find the right line; if you see `import { ..., uniqueIndex, ... } from 'drizzle-orm/pg-core'` already, you're done. Otherwise extend it.

- [ ] **Step 4: Generate the migration SQL**

```bash
npm run db:generate
```

Drizzle Kit produces a new file under `drizzle/`. The filename is auto-generated and prefixed with `0010_`. **Verify it exists** and **inspect it**:

```bash
ls drizzle/ | tail -3
cat drizzle/0010_*.sql
```

Expected SQL roughly:
```sql
CREATE TABLE "chart_readings" (
  "id" text PRIMARY KEY NOT NULL,
  "chart_id" text NOT NULL,
  "locale" text NOT NULL,
  "body" text NOT NULL,
  "model" text DEFAULT 'claude-sonnet-4-20250514' NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "chart_readings" ADD CONSTRAINT "chart_readings_chart_id_natal_charts_id_fk"
  FOREIGN KEY ("chart_id") REFERENCES "public"."natal_charts"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "chart_readings_chart_locale_uniq" ON "chart_readings" USING btree ("chart_id","locale");
```

If the locale CHECK constraint is missing from the generated SQL (Drizzle's `enum` mode does not always emit a CHECK on Postgres — it relies on the application layer), that's acceptable — schema-level CHECK is a defence-in-depth nicety, not required for correctness.

- [ ] **Step 5: Rename migration to `0010_chart_readings.sql`**

Drizzle's auto-generated suffix is fine if descriptive; if it's something like `0010_strange_titania.sql`, leave it. The number prefix is what matters. Run `ls drizzle/ | tail -1` and note the actual filename for the commit message.

- [ ] **Step 6: Run schema test to verify it passes**

```bash
npx vitest run src/shared/lib/__tests__/schema.chart-readings.test.ts
npm run typecheck
```

Expected: 3 tests pass; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/shared/lib/schema.ts drizzle/0010_*.sql drizzle/meta/ src/shared/lib/__tests__/schema.chart-readings.test.ts
git commit -m "$(cat <<'EOF'
feat(db/chart-readings): add chart_readings table + migration 0010

Cached LLM interpretations keyed by (chart_id, locale). Cascades on
natal_chart deletion so the 90-day temp-chart cleanup cron handles
retention automatically.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Note:** The actual prod migration deploy is the founder's responsibility (see spec § Post-deploy ops). Do NOT run `npm run db:migrate` against prod here. Local/staging is fine for smoke during dev.

---

## Task 3: `buildChartInterpretationPrompt` pure function

**Files:**
- Create: `src/modules/astro-engine/lib/chart-interpretation-prompt.ts`
- Create: `src/modules/astro-engine/lib/__tests__/chart-interpretation-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/astro-engine/lib/__tests__/chart-interpretation-prompt.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { ChartResult } from '@/shared/types';
import { buildChartInterpretationPrompt } from '../chart-interpretation-prompt';

const SAMPLE_CHART: ChartResult = {
  system: 'sidereal',
  houseSystem: 'Placidus',
  ayanamsa: 'lahiri',
  planets: [
    { planet: 'Sun',       sign: 'Aries',  longitude: 12.5,  signDegree: 12.5, house: 1, retrograde: false },
    { planet: 'Moon',      sign: 'Cancer', longitude: 95.0,  signDegree: 5.0,  house: 4, retrograde: false },
    { planet: 'Mercury',   sign: 'Pisces', longitude: 340.0, signDegree: 10.0, house: 12, retrograde: true },
    { planet: 'Venus',     sign: 'Taurus', longitude: 45.0,  signDegree: 15.0, house: 2, retrograde: false },
    { planet: 'Mars',      sign: 'Leo',    longitude: 130.0, signDegree: 10.0, house: 5, retrograde: false },
    { planet: 'Jupiter',   sign: 'Sagittarius', longitude: 250.0, signDegree: 10.0, house: 9, retrograde: false },
    { planet: 'Saturn',    sign: 'Capricorn', longitude: 290.0, signDegree: 20.0, house: 10, retrograde: false },
    { planet: 'Uranus',    sign: 'Aquarius', longitude: 310.0, signDegree: 10.0, house: 11, retrograde: false },
    { planet: 'Neptune',   sign: 'Pisces', longitude: 345.0, signDegree: 15.0, house: 12, retrograde: false },
    { planet: 'Pluto',     sign: 'Scorpio', longitude: 220.0, signDegree: 10.0, house: 8, retrograde: false },
    { planet: 'North Node', sign: 'Cancer', longitude: 100.0, signDegree: 10.0, house: 4, retrograde: true },
    { planet: 'Chiron',    sign: 'Virgo',  longitude: 160.0, signDegree: 10.0, house: 6, retrograde: false },
  ],
  houses: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
  aspects: [
    { planet1: 'Sun',  planet2: 'Moon',    type: 'square',   orb: 0.5, applying: true },
    { planet1: 'Venus', planet2: 'Mars',   type: 'trine',    orb: 2.0, applying: false },
    { planet1: 'Saturn', planet2: 'Pluto', type: 'sextile',  orb: 1.0, applying: true },
    { planet1: 'Sun',  planet2: 'Jupiter', type: 'opposition', orb: 4.0, applying: true },
    { planet1: 'Mercury', planet2: 'Venus', type: 'conjunction', orb: 5.5, applying: false },
  ],
};

describe('buildChartInterpretationPrompt', () => {
  it('produces an English prompt mentioning Sun, Moon, and Ascendant signs', () => {
    const prompt = buildChartInterpretationPrompt(SAMPLE_CHART, 'en');
    expect(prompt).toContain('Aries');
    expect(prompt).toContain('Cancer'); // Moon
    expect(prompt).toContain('Aries'); // Ascendant = house[0] = 0° → Aries
    expect(prompt.toLowerCase()).toContain('english');
    expect(prompt.toLowerCase()).not.toContain('journey'); // hard-banned word
  });

  it('produces a Spanish prompt with LATAM neutro instruction', () => {
    const prompt = buildChartInterpretationPrompt(SAMPLE_CHART, 'es');
    expect(prompt).toContain('español neutro LATAM');
    expect(prompt).toContain('tú');
  });

  it('selects top 3 aspects by orb tightness', () => {
    const prompt = buildChartInterpretationPrompt(SAMPLE_CHART, 'en');
    // Tightest 3 orbs: Sun-Moon square (0.5), Saturn-Pluto sextile (1.0), Venus-Mars trine (2.0)
    expect(prompt).toContain('Sun');
    expect(prompt).toContain('Moon');
    expect(prompt).toContain('Saturn');
    expect(prompt).toContain('Pluto');
    expect(prompt).toContain('Venus');
    expect(prompt).toContain('Mars');
    // 4th-tightest (Sun-Jupiter opposition, orb 4.0) and 5th (Mercury-Venus, 5.5) are dropped.
    // We can't assert their absence positively because Sun/Venus appear elsewhere, but we
    // can assert the prompt lists exactly 3 aspect entries via a stable marker.
    expect(prompt.match(/orb\s*\d/gi)?.length ?? 0).toBe(3);
  });

  it('omits house references when chart.houses is null', () => {
    const noHouses: ChartResult = { ...SAMPLE_CHART, houses: null };
    const prompt = buildChartInterpretationPrompt(noHouses, 'en');
    expect(prompt.toLowerCase()).toContain('birth time not provided');
    expect(prompt.toLowerCase()).not.toContain('1st house');
    expect(prompt.toLowerCase()).not.toContain('domain');
  });

  it('is deterministic for identical input', () => {
    const a = buildChartInterpretationPrompt(SAMPLE_CHART, 'en');
    const b = buildChartInterpretationPrompt(SAMPLE_CHART, 'en');
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/modules/astro-engine/lib/__tests__/chart-interpretation-prompt.test.ts
```

Expected: import error — `buildChartInterpretationPrompt` not found.

- [ ] **Step 3: Implement the prompt builder**

Create `src/modules/astro-engine/lib/chart-interpretation-prompt.ts`:

```ts
import type { ChartResult } from '@/shared/types';

/**
 * Maps an ecliptic longitude (0-360°) to its sidereal sign name.
 * Used to derive the Ascendant sign from house[0] (1st house cusp).
 */
const SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

function longitudeToSign(longitude: number): string {
  const normalised = ((longitude % 360) + 360) % 360;
  return SIGN_NAMES[Math.floor(normalised / 30)];
}

/**
 * Builds a deterministic LLM prompt for a natal-chart interpretation. Pure
 * function — same input always returns same string.
 *
 * Two locale branches: 'en' (English) and 'es' (español neutro LATAM, tú form).
 * Two structural branches: with houses (full life-domain reading) and without
 * (planets + aspects only).
 *
 * Top 3 major aspects by orb tightness are passed to the LLM; the rest are
 * dropped to keep the prompt focused and the response within max_tokens budget.
 */
export function buildChartInterpretationPrompt(
  chart: ChartResult,
  locale: 'en' | 'es',
): string {
  const planets = chart.planets;
  const find = (name: string) => planets.find((p) => p.planet === name);

  const sun = find('Sun');
  const moon = find('Moon');
  const mercury = find('Mercury');
  const venus = find('Venus');
  const mars = find('Mars');
  const jupiter = find('Jupiter');
  const saturn = find('Saturn');
  const uranus = find('Uranus');
  const neptune = find('Neptune');
  const pluto = find('Pluto');
  const northNode = find('North Node');
  const chiron = find('Chiron');

  const hasHouses = chart.houses !== null && chart.houses !== undefined;
  const ascSign = hasHouses ? longitudeToSign(chart.houses![0]) : null;

  // Major aspects only, sorted by orb tightness ascending, take 3.
  const MAJOR_TYPES = new Set(['conjunction', 'sextile', 'square', 'trine', 'opposition']);
  const topAspects = (chart.aspects ?? [])
    .filter((a) => MAJOR_TYPES.has(a.type))
    .slice()
    .sort((a, b) => Math.abs(a.orb) - Math.abs(b.orb))
    .slice(0, 3);

  const planetLine = (p: typeof sun, label: string): string => {
    if (!p) return `${label}: unknown`;
    const houseSuffix = hasHouses && p.house ? ` (house ${p.house})` : '';
    const retro = p.retrograde ? ' R' : '';
    return `${label}: ${p.sign} ${p.signDegree.toFixed(1)}°${retro}${houseSuffix}`;
  };

  const aspectLine = (a: { planet1: string; planet2: string; type: string; orb: number }): string =>
    `- ${a.planet1} ${a.type} ${a.planet2} (orb ${Math.abs(a.orb).toFixed(1)}°)`;

  const ascendantLine = hasHouses
    ? `Ascendant: ${ascSign}`
    : 'Ascendant: unknown — birth time not provided';

  const houseSection = hasHouses
    ? `\n\nLife domains (12 houses):\n${chart.houses!
        .map((cusp, i) => `- House ${i + 1}: cusp at ${longitudeToSign(cusp)} ${(cusp % 30).toFixed(1)}°`)
        .join('\n')}`
    : '';

  const localeInstruction =
    locale === 'es'
      ? 'Write in español neutro LATAM, using the tú form (not vosotros, not usted).'
      : 'Write in English.';

  const ascendantConstraint = hasHouses
    ? ''
    : '\n- Do not mention houses, life domains, or the Ascendant beyond noting the birth time is unknown.';

  return `You are an expert sidereal astrologer (Lahiri ayanamsa) interpreting a natal chart in the Hermetic-Kabbalistic-Thelemic tradition.

Chart placements:
${planetLine(sun, 'Sun')}
${planetLine(moon, 'Moon')}
${ascendantLine}
${planetLine(mercury, 'Mercury')}
${planetLine(venus, 'Venus')}
${planetLine(mars, 'Mars')}
${planetLine(jupiter, 'Jupiter')}
${planetLine(saturn, 'Saturn')}
${planetLine(uranus, 'Uranus')}
${planetLine(neptune, 'Neptune')}
${planetLine(pluto, 'Pluto')}
${planetLine(northNode, 'North Node')}
${planetLine(chiron, 'Chiron')}

Top 3 major aspects (tightest orbs):
${topAspects.map(aspectLine).join('\n')}${houseSection}

Provide a synthesis in 6-8 paragraphs covering:
1. Core identity — Sun, Moon, Ascendant interplay.
2. Mind and belief — Mercury and Jupiter.
3. Love and drive — Venus and Mars.
4. Challenges and transformation — Saturn and Pluto.
5. The top 3 aspects: how they wire these threads together.
${hasHouses ? '6. Life domains: which houses are most charged, what they reveal.' : ''}
${hasHouses ? '7' : '6'}. Synthesis: how do all these threads weave into one personality?

Constraints:
- ${localeInstruction}
- Do NOT use the word "journey".
- Do NOT give medical, financial, or legal advice.${ascendantConstraint}
- Close with a one-sentence reminder this reading is for self-reflection, not professional advice.
- Output as markdown — paragraph breaks only, no headings, no bullet lists. This renders inline.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/modules/astro-engine/lib/__tests__/chart-interpretation-prompt.test.ts
npm run typecheck
```

Expected: 5 tests pass; typecheck clean.

If the deterministic test fails because the prompt is, say, including a timestamp — debug by `console.log(prompt)` and confirm no `Date.now()` or `Math.random()` slipped in. The function must be pure.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/lib/chart-interpretation-prompt.ts src/modules/astro-engine/lib/__tests__/chart-interpretation-prompt.test.ts
git commit -m "$(cat <<'EOF'
feat(astro/prompt): chart interpretation prompt builder (en+es)

Pure function that maps a ChartResult + locale to a deterministic LLM
prompt. Branches on chart.houses for the no-birth-time case and selects
the top 3 major aspects by orb tightness.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `chart/interpret` rate-limit bucket

**Files:**
- Modify: `src/shared/lib/rate-limit.ts`

- [ ] **Step 1: Add the bucket**

Open `src/shared/lib/rate-limit.ts`. Find the `tarot/interpret` bucket (around line 99). Right after that block (before `chart/sun-sign` or whichever bucket follows), insert:

```ts
  'chart/interpret': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1m'),
    prefix: 'rl:chart/interpret',
  }),
```

This mirrors `tarot/interpret` exactly: 5 calls per minute per Clerk userId, both are LLM-bound Pro endpoints with similar abuse profile.

- [ ] **Step 2: Verify typecheck clean**

```bash
npm run typecheck
```

Expected: zero errors. The bucket map is keyed by string, so adding a new key compiles without ceremony.

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/rate-limit.ts
git commit -m "$(cat <<'EOF'
feat(rate-limit): add chart/interpret bucket

5 calls/min per userId — mirrors tarot/interpret. Both are LLM-bound
Pro endpoints with similar abuse profile.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `POST /api/v1/chart/interpret` endpoint

**Files:**
- Create: `src/app/api/v1/chart/interpret/route.ts`
- Create: `src/app/api/v1/chart/interpret/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/app/api/v1/chart/interpret/__tests__/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must declare before `import('../route')`.
// ---------------------------------------------------------------------------
const mockRequirePremium = vi.fn();
vi.mock('@/modules/auth/lib/premium', () => ({
  requirePremium: () => mockRequirePremium(),
}));

const mockLimit = vi.fn();
vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({ limit: (...args: unknown[]) => mockLimit(...args) }),
}));

const mockSelectChartReading = vi.fn();
const mockSelectNatalChart = vi.fn();
const mockInsertChartReading = vi.fn();

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (table: { _: { name?: string }; [s: symbol]: unknown }) => ({
        where: () => ({
          limit: () => {
            // Discriminate by table — schema.ts gives each pgTable a `_.name`.
            const name = (table as unknown as { _: { name?: string } })._.name;
            if (name === 'chart_readings') return mockSelectChartReading();
            if (name === 'natal_charts') return mockSelectNatalChart();
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => mockInsertChartReading(),
      }),
    }),
  }),
}));

vi.mock('nanoid', () => ({ nanoid: () => 'fixed-reading-id' }));

const ORIGINAL_ENV = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  mockLimit.mockResolvedValue({ success: true });
  mockInsertChartReading.mockResolvedValue(undefined);
});

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/chart/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/chart/interpret', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequirePremium.mockRejectedValueOnce(
      new Response(JSON.stringify({ success: false, data: null, error: 'UNAUTHORIZED' }), { status: 401 }),
    );
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated but not premium', async () => {
    mockRequirePremium.mockRejectedValueOnce(
      new Response(JSON.stringify({ success: false, data: null, error: 'FORBIDDEN' }), { status: 403 }),
    );
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid body', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    const { POST } = await import('../route');
    const res = await POST(makeRequest({})); // missing chartId
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 429 when rate-limited', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockLimit.mockResolvedValueOnce({ success: false });
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(429);
  });

  it('returns cached reading on cache hit and skips Anthropic call', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([{ body: 'cached-text' }]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ reading: 'cached-text', source: 'cache' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('returns 404 when chart_id not in natal_charts', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]);
    mockSelectNatalChart.mockResolvedValueOnce([]);
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'missing', locale: 'en' }));
    expect(res.status).toBe(404);
  });

  it('generates and caches on cache miss + chart found', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]);
    mockSelectNatalChart.mockResolvedValueOnce([
      {
        id: 'abc',
        chartData: {
          system: 'sidereal', houseSystem: 'Placidus', ayanamsa: 'lahiri',
          planets: [
            { planet: 'Sun', sign: 'Aries', longitude: 12, signDegree: 12, house: 1, retrograde: false },
            { planet: 'Moon', sign: 'Cancer', longitude: 95, signDegree: 5, house: 4, retrograde: false },
            { planet: 'Mercury', sign: 'Pisces', longitude: 340, signDegree: 10, house: 12, retrograde: true },
            { planet: 'Venus', sign: 'Taurus', longitude: 45, signDegree: 15, house: 2, retrograde: false },
            { planet: 'Mars', sign: 'Leo', longitude: 130, signDegree: 10, house: 5, retrograde: false },
            { planet: 'Jupiter', sign: 'Sagittarius', longitude: 250, signDegree: 10, house: 9, retrograde: false },
            { planet: 'Saturn', sign: 'Capricorn', longitude: 290, signDegree: 20, house: 10, retrograde: false },
            { planet: 'Uranus', sign: 'Aquarius', longitude: 310, signDegree: 10, house: 11, retrograde: false },
            { planet: 'Neptune', sign: 'Pisces', longitude: 345, signDegree: 15, house: 12, retrograde: false },
            { planet: 'Pluto', sign: 'Scorpio', longitude: 220, signDegree: 10, house: 8, retrograde: false },
            { planet: 'North Node', sign: 'Cancer', longitude: 100, signDegree: 10, house: 4, retrograde: true },
            { planet: 'Chiron', sign: 'Virgo', longitude: 160, signDegree: 10, house: 6, retrograde: false },
          ],
          houses: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
          aspects: [{ planet1: 'Sun', planet2: 'Moon', type: 'square', orb: 0.5, applying: true }],
        },
      },
    ]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'You are an Aries...' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reading).toBe('You are an Aries...');
    expect(body.data.source).toBe('generated');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockInsertChartReading).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('returns 502 when Anthropic returns non-OK', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]);
    mockSelectNatalChart.mockResolvedValueOnce([
      { id: 'abc', chartData: { planets: [], houses: null, aspects: [] } },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('upstream broken', { status: 500 }),
    );
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(502);
  });

  it('returns 503 when ANTHROPIC_API_KEY missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]);
    mockSelectNatalChart.mockResolvedValueOnce([
      { id: 'abc', chartData: { planets: [], houses: null, aspects: [] } },
    ]);
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(503);
    process.env.ANTHROPIC_API_KEY = 'sk-test';
  });

  it('still returns 200 when cache write fails (non-fatal)', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]);
    mockSelectNatalChart.mockResolvedValueOnce([
      {
        id: 'abc',
        chartData: { planets: [], houses: null, aspects: [] },
      },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    mockInsertChartReading.mockRejectedValueOnce(new Error('db down'));

    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(200); // cache write failure non-fatal
  });
});

if (ORIGINAL_ENV !== undefined) process.env.ANTHROPIC_API_KEY = ORIGINAL_ENV;
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/api/v1/chart/interpret/__tests__/route.test.ts
```

Expected: import error on `../route` (file doesn't exist).

- [ ] **Step 3: Implement the route**

Create `src/app/api/v1/chart/interpret/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import { requirePremium } from '@/modules/auth/lib/premium';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { chartReadings, natalCharts } from '@/shared/lib/schema';
import { buildChartInterpretationPrompt } from '@/modules/astro-engine/lib/chart-interpretation-prompt';
import type { ChartResult } from '@/shared/types';

const interpretSchema = z.object({
  chartId: z.string().min(1).max(64),
  locale: z.enum(['en', 'es']).default('en'),
});

/**
 * POST /api/v1/chart/interpret
 *
 * AI-powered natal chart interpretation. Pro feature only. Response is cached
 * in `chart_readings` keyed by (chart_id, locale) so revisits are free.
 */
export async function POST(request: Request) {
  // -----------------------------------------------------------------------
  // 1. Auth + premium check (single call; throws Response on failure)
  // -----------------------------------------------------------------------
  let userId: string;
  try {
    const user = await requirePremium();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { success: false, data: null, error: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  // -----------------------------------------------------------------------
  // 2. Rate limit (5/min per userId — mirrors tarot/interpret)
  // -----------------------------------------------------------------------
  const limiter = getRateLimiter('chart/interpret');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // -----------------------------------------------------------------------
  // 3. Parse + validate
  // -----------------------------------------------------------------------
  let body: z.infer<typeof interpretSchema>;
  try {
    const raw = await request.json();
    body = interpretSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, data: null, error: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const db = getDb();

  // -----------------------------------------------------------------------
  // 4. Cache hit?
  // -----------------------------------------------------------------------
  const cached = await db
    .select({ body: chartReadings.body })
    .from(chartReadings)
    .where(
      and(
        eq(chartReadings.chartId, body.chartId),
        eq(chartReadings.locale, body.locale),
      ),
    )
    .limit(1);

  if (cached.length > 0) {
    return NextResponse.json(
      { success: true, data: { reading: cached[0].body, source: 'cache' }, error: null },
      { status: 200 },
    );
  }

  // -----------------------------------------------------------------------
  // 5. Load chart data
  // -----------------------------------------------------------------------
  const rows = await db
    .select({ chartData: natalCharts.chartData })
    .from(natalCharts)
    .where(eq(natalCharts.id, body.chartId))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json(
      { success: false, data: null, error: 'CHART_NOT_FOUND' },
      { status: 404 },
    );
  }

  // -----------------------------------------------------------------------
  // 6. LLM call
  // -----------------------------------------------------------------------
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[chart/interpret] ANTHROPIC_API_KEY not configured');
    return NextResponse.json(
      { success: false, data: null, error: 'SERVICE_UNAVAILABLE' },
      { status: 503 },
    );
  }

  const chartData = rows[0].chartData as ChartResult;
  const prompt = buildChartInterpretationPrompt(chartData, body.locale);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      console.error('[chart/interpret] Anthropic API error:', response.status, errText);
      return NextResponse.json(
        { success: false, data: null, error: 'AI_SERVICE_ERROR' },
        { status: 502 },
      );
    }

    const result = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const reading = result.content?.find((c) => c.type === 'text')?.text ?? null;

    if (!reading) {
      return NextResponse.json(
        { success: false, data: null, error: 'EMPTY_RESPONSE' },
        { status: 502 },
      );
    }

    // -----------------------------------------------------------------------
    // 7. Cache write (best-effort; failure does NOT block the client response)
    // -----------------------------------------------------------------------
    try {
      await db
        .insert(chartReadings)
        .values({
          id: nanoid(),
          chartId: body.chartId,
          locale: body.locale,
          body: reading,
          model: 'claude-sonnet-4-20250514',
        })
        .onConflictDoNothing();
    } catch (err) {
      console.error('[chart/interpret] cache write failed:', err);
      // Don't fail the request — the user already has their reading.
    }

    return NextResponse.json(
      { success: true, data: { reading, source: 'generated' }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[chart/interpret] unexpected error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/api/v1/chart/interpret/__tests__/route.test.ts
npm run typecheck
```

Expected: 10 tests pass; typecheck clean.

If a test fails because the mocked `select(...).from(table)` discrimination doesn't match (Drizzle's table internal shape may differ from `_.name`), inspect the actual table object via a temporary `console.log` in the mock factory and adjust the discriminator. Alternative pattern: separate `mockSelectFn = vi.fn()` calls per query with `mockResolvedValueOnce` in test setup (use call ordering instead of table-name discrimination).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/chart/interpret/route.ts src/app/api/v1/chart/interpret/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(api/chart/interpret): premium endpoint with rate-limit + cache

POST /api/v1/chart/interpret — requirePremium gate, 5/min rate limit,
cache check in chart_readings keyed by (chart_id, locale), Anthropic
Claude Sonnet 4 call on miss, cache write best-effort.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: i18n EN + ES strings

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/es.json`

- [ ] **Step 1: Add EN keys**

Open `messages/en.json`. Locate the `"paywall"` object. Inside `"contextualTitles"`, add `"natalChart"`:

```json
"natalChart": "Get your full natal chart reading"
```

Inside `"cta": { "subline": { ... } }`, add `"natalChart"`:

```json
"natalChart": "An AI-crafted synthesis of all your planets, houses, and aspects — written for your chart, not a generic horoscope."
```

Then, at the top level of the JSON (alphabetically — likely after `"chartDisplay"` or `"chart"`), add a new `"chartReading"` namespace:

```json
"chartReading": {
  "eyebrow": "AI Reading · Pro",
  "heading": "Your natal chart reading",
  "teaserSub": "What your luminaries say:",
  "teaserSun": "Sun in {sign}",
  "teaserMoon": "Moon in {sign}",
  "teaserAscendant": "Ascendant in {sign}",
  "lockedLabelWithHouses": "10 more planets, houses & aspects",
  "lockedLabelNoHouses": "10 more planets & aspects",
  "generateButton": "Generate reading",
  "generating": "Reading the stars…",
  "regenerateButton": "Regenerate",
  "errorGeneric": "Could not generate your reading. Please try again.",
  "errorRateLimit": "Too many requests. Try in a minute.",
  "errorNetwork": "Network error. Check your connection.",
  "errorNotFound": "Chart not found. Recalculate to continue.",
  "signOneLiners": {
    "Aries": "Cardinal fire — the spark of initiation.",
    "Taurus": "Fixed earth — the rooted body of value.",
    "Gemini": "Mutable air — the curious mirror.",
    "Cancer": "Cardinal water — emotional roots.",
    "Leo": "Fixed fire — the radiant heart.",
    "Virgo": "Mutable earth — the discerning servant.",
    "Libra": "Cardinal air — the social mask.",
    "Scorpio": "Fixed water — the transformative deep.",
    "Sagittarius": "Mutable fire — the questing arrow.",
    "Capricorn": "Cardinal earth — the structured ascent.",
    "Aquarius": "Fixed air — the visionary outsider.",
    "Pisces": "Mutable water — the dissolving mystic."
  }
}
```

- [ ] **Step 2: Add ES keys**

Open `messages/es.json`. Mirror the same structure with LATAM neutro, `tú` form:

Inside `"paywall.contextualTitles"`:
```json
"natalChart": "Obtén la lectura completa de tu carta natal"
```

Inside `"paywall.cta.subline"`:
```json
"natalChart": "Síntesis hecha con IA de todos tus planetas, casas y aspectos — escrita para tu carta, no un horóscopo genérico."
```

Top-level `"chartReading"` namespace:
```json
"chartReading": {
  "eyebrow": "Lectura IA · Pro",
  "heading": "Tu lectura natal",
  "teaserSub": "Lo que dicen tus luminarias:",
  "teaserSun": "Sol en {sign}",
  "teaserMoon": "Luna en {sign}",
  "teaserAscendant": "Ascendente en {sign}",
  "lockedLabelWithHouses": "10 planetas, casas y aspectos más",
  "lockedLabelNoHouses": "10 planetas y aspectos más",
  "generateButton": "Generar lectura",
  "generating": "Leyendo las estrellas…",
  "regenerateButton": "Regenerar",
  "errorGeneric": "No pudimos generar tu lectura. Intenta de nuevo.",
  "errorRateLimit": "Demasiadas solicitudes. Intenta en un minuto.",
  "errorNetwork": "Error de red. Verifica tu conexión.",
  "errorNotFound": "Carta no encontrada. Recalcula para continuar.",
  "signOneLiners": {
    "Aries": "Fuego cardinal — la chispa de la iniciación.",
    "Taurus": "Tierra fija — el cuerpo enraizado del valor.",
    "Gemini": "Aire mutable — el espejo curioso.",
    "Cancer": "Agua cardinal — raíces emocionales.",
    "Leo": "Fuego fijo — el corazón radiante.",
    "Virgo": "Tierra mutable — el servidor discerniente.",
    "Libra": "Aire cardinal — la máscara social.",
    "Scorpio": "Agua fija — la profundidad transformadora.",
    "Sagittarius": "Fuego mutable — la flecha buscadora.",
    "Capricorn": "Tierra cardinal — el ascenso estructurado.",
    "Aquarius": "Aire fijo — la visión disidente.",
    "Pisces": "Agua mutable — el místico que se disuelve."
  }
}
```

- [ ] **Step 3: Validate JSON parses + typecheck clean**

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('en ok');"
node -e "JSON.parse(require('fs').readFileSync('messages/es.json', 'utf8')); console.log('es ok');"
npm run typecheck
```

Expected: both `ok`, typecheck zero errors. (next-intl validates key presence at the `useTranslations` call site; typecheck failure here usually means a typo in a `t('chartReading.xxx')` call you haven't written yet — should not happen at this point since we haven't touched the component.)

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/es.json
git commit -m "$(cat <<'EOF'
feat(i18n/chart-reading): EN+ES strings (teaser + paywall context)

paywall.contextualTitles.natalChart + cta.subline.natalChart for
the new PaywallTrigger value, plus chartReading.* namespace covering
teaser + 12 sign one-liners + error messages.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `ChartReadingSection` component

**Files:**
- Create: `src/modules/astro-engine/components/ChartReadingSection.tsx`
- Create: `src/modules/astro-engine/components/__tests__/ChartReadingSection.test.tsx`

- [ ] **Step 1: Write the failing unit test**

Create `src/modules/astro-engine/components/__tests__/ChartReadingSection.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';
import type { ChartResult } from '@/shared/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const CHART_WITH_HOUSES: ChartResult = {
  system: 'sidereal',
  houseSystem: 'Placidus',
  ayanamsa: 'lahiri',
  planets: [
    { planet: 'Sun',  sign: 'Aries',  longitude: 12, signDegree: 12, house: 1, retrograde: false },
    { planet: 'Moon', sign: 'Cancer', longitude: 95, signDegree: 5,  house: 4, retrograde: false },
    { planet: 'Mercury', sign: 'Pisces', longitude: 340, signDegree: 10, house: 12, retrograde: true },
    { planet: 'Venus', sign: 'Taurus', longitude: 45, signDegree: 15, house: 2, retrograde: false },
    { planet: 'Mars', sign: 'Leo', longitude: 130, signDegree: 10, house: 5, retrograde: false },
    { planet: 'Jupiter', sign: 'Sagittarius', longitude: 250, signDegree: 10, house: 9, retrograde: false },
    { planet: 'Saturn', sign: 'Capricorn', longitude: 290, signDegree: 20, house: 10, retrograde: false },
    { planet: 'Uranus', sign: 'Aquarius', longitude: 310, signDegree: 10, house: 11, retrograde: false },
    { planet: 'Neptune', sign: 'Pisces', longitude: 345, signDegree: 15, house: 12, retrograde: false },
    { planet: 'Pluto', sign: 'Scorpio', longitude: 220, signDegree: 10, house: 8, retrograde: false },
    { planet: 'North Node', sign: 'Cancer', longitude: 100, signDegree: 10, house: 4, retrograde: true },
    { planet: 'Chiron', sign: 'Virgo', longitude: 160, signDegree: 10, house: 6, retrograde: false },
  ],
  houses: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
  aspects: [],
};

const CHART_NO_HOUSES: ChartResult = { ...CHART_WITH_HOUSES, houses: null };

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en/chart',
}));

const makeT = () => {
  const t: ((key: string, params?: Record<string, string>) => string) & { has?: (k: string) => boolean } =
    (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
  t.has = () => true;
  return t;
};

vi.mock('next-intl', () => ({
  useTranslations: () => makeT(),
  useLocale: () => 'en',
}));

const mockUseSubscription = vi.fn();
vi.mock('@/shared/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

const mockPostJson = vi.fn();
vi.mock('@/shared/lib/apiFetch', () => ({
  postJson: (...args: unknown[]) => mockPostJson(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

import { ChartReadingSection } from '../ChartReadingSection';

describe('ChartReadingSection', () => {
  it('renders skeleton while subscription is loading', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: true });
    const { container } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );
    expect(container.querySelector('[data-testid="chart-reading-skeleton"]')).not.toBeNull();
  });

  it('free user with houses: teaser + PaywallCta visible, no Generate button', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { container, queryByRole } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );
    expect(container.querySelector('[data-variant="card"]')).not.toBeNull();
    expect(queryByRole('button', { name: /generateButton/i })).toBeNull();
    // Locked-label-with-houses string is referenced
    expect(container.textContent).toContain('lockedLabelWithHouses');
  });

  it('free user without houses: locked-label-no-houses shown, no Ascendant teaser', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { container } = render(
      <ChartReadingSection chartId="abc" chart={CHART_NO_HOUSES} />,
    );
    expect(container.textContent).toContain('lockedLabelNoHouses');
    expect(container.textContent).not.toContain('teaserAscendant');
  });

  it('Pro user, no reading yet: Generate button visible, no PaywallCta', () => {
    mockUseSubscription.mockReturnValue({ isPro: true, isLoading: false });
    const { container, getByRole } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );
    expect(container.querySelector('[data-variant="card"]')).toBeNull();
    expect(getByRole('button', { name: /generateButton/i })).toBeTruthy();
  });

  it('Generate click fires POST and sets reading', async () => {
    mockUseSubscription.mockReturnValue({ isPro: true, isLoading: false });
    mockPostJson.mockResolvedValueOnce({
      kind: 'ok',
      data: { success: true, data: { reading: 'You are Aries Sun...', source: 'generated' }, error: null },
    });
    const { getByRole, findByTestId } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );

    await act(async () => {
      fireEvent.click(getByRole('button', { name: /generateButton/i }));
    });

    const body = await findByTestId('reading-body');
    expect(body.textContent).toContain('You are Aries Sun...');
    expect(mockPostJson).toHaveBeenCalledWith(
      '/api/v1/chart/interpret',
      expect.objectContaining({ chartId: 'abc', locale: 'en' }),
    );
  });

  it('shows errorRateLimit on 429', async () => {
    mockUseSubscription.mockReturnValue({ isPro: true, isLoading: false });
    mockPostJson.mockResolvedValueOnce({
      kind: 'error',
      status: 429,
      payload: { error: 'RATE_LIMITED' },
      message: 'rate limited',
    });
    const { getByRole, findByRole } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );
    await act(async () => {
      fireEvent.click(getByRole('button', { name: /generateButton/i }));
    });
    const alert = await findByRole('alert');
    expect(alert.textContent).toContain('errorRateLimit');
  });

  it('opens paywall modal when free user clicks CTA button', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { container, getAllByRole } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );
    const ctaButton = container.querySelector('[data-variant="card"] button') as HTMLButtonElement;
    expect(ctaButton).not.toBeNull();
    fireEvent.click(ctaButton);
    // PaywallModal renders as a role=dialog when open
    const dialogs = getAllByRole('dialog', { hidden: true });
    expect(dialogs.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/modules/astro-engine/components/__tests__/ChartReadingSection.test.tsx
```

Expected: import error — `ChartReadingSection` not found.

- [ ] **Step 3: Implement the component**

Create `src/modules/astro-engine/components/ChartReadingSection.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useSubscription } from '@/shared/hooks/useSubscription';
import { postJson } from '@/shared/lib/apiFetch';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { PaywallCta } from '@/shared/components/PaywallCta';
import { PaywallModal } from '@/shared/components/PaywallModal';
import type { ChartResult } from '@/shared/types';

interface ChartReadingSectionProps {
  chartId: string;
  chart: ChartResult;
}

interface InterpretResponse {
  success: boolean;
  data: { reading: string; source: 'cache' | 'generated' } | null;
  error: string | null;
}

/**
 * Map an ecliptic longitude (0-360°) to its sign name. Used to derive the
 * Ascendant sign from house[0].
 */
const SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

function longitudeToSign(longitude: number): string {
  const normalised = ((longitude % 360) + 360) % 360;
  return SIGN_NAMES[Math.floor(normalised / 30)];
}

export function ChartReadingSection({ chartId, chart }: ChartReadingSectionProps) {
  const t = useTranslations('chartReading');
  const locale = useLocale() as 'en' | 'es';
  const pathname = usePathname();
  const { isPro, isLoading: subLoading } = useSubscription();

  const [reading, setReading] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const sun = chart.planets.find((p) => p.planet === 'Sun');
  const moon = chart.planets.find((p) => p.planet === 'Moon');
  const hasHouses = chart.houses !== null && chart.houses !== undefined;
  const ascSign = hasHouses ? longitudeToSign(chart.houses![0]) : null;

  const handleGenerate = useCallback(async () => {
    if (!isPro) return;
    setIsGenerating(true);
    setError(null);

    const result = await postJson<InterpretResponse>(
      '/api/v1/chart/interpret',
      { chartId, locale },
    );
    setIsGenerating(false);

    switch (result.kind) {
      case 'ok':
        if (result.data?.success && result.data.data?.reading) {
          setReading(result.data.data.reading);
          trackEvent(AnalyticsEvent.CHART_READING_GENERATED, {
            chartId,
            source: result.data.data.source,
            locale,
          });
        } else {
          setError(t('errorGeneric'));
        }
        break;
      case 'error':
        if (result.status === 429) setError(t('errorRateLimit'));
        else if (result.status === 404) setError(t('errorNotFound'));
        else setError(t('errorGeneric'));
        break;
      case 'network-error':
        setError(t('errorNetwork'));
        break;
      case 'auth-required':
        // Should never happen for Pro user, but be defensive
        setError(t('errorGeneric'));
        break;
    }
  }, [isPro, chartId, locale, t]);

  if (subLoading) {
    return (
      <section
        data-testid="chart-reading-skeleton"
        className="rounded-xl border border-white/8 p-6"
        style={{ background: 'rgba(255,255,255,0.02)' }}
        aria-busy="true"
      >
        <div className="h-4 w-32 rounded bg-white/8 animate-pulse mb-3" />
        <div className="h-3 w-48 rounded bg-white/6 animate-pulse mb-2" />
        <div className="h-3 w-40 rounded bg-white/6 animate-pulse" />
      </section>
    );
  }

  return (
    <section
      data-testid="chart-reading-section"
      className="space-y-4"
      aria-labelledby="chart-reading-heading"
    >
      {/* Header */}
      <div className="space-y-1">
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#FFD700]/60">
          {t('eyebrow')}
        </p>
        <h2
          id="chart-reading-heading"
          className="text-xl font-light text-white/95"
          style={{ fontFamily: "var(--font-crimson-pro, Georgia, serif)" }}
        >
          {t('heading')}
        </h2>
      </div>

      {/* Teaser — visible for all */}
      <div className="space-y-1.5">
        <p className="text-xs text-white/40 uppercase tracking-wider">
          {t('teaserSub')}
        </p>
        {sun && (
          <p className="text-sm text-white/80">
            <span aria-hidden="true" className="text-[#FFD700]/60">✦ </span>
            <strong className="font-semibold">{t('teaserSun', { sign: sun.sign })}</strong>
            {' — '}
            <span className="text-white/60">{t(`signOneLiners.${sun.sign}` as 'signOneLiners.Aries')}</span>
          </p>
        )}
        {moon && (
          <p className="text-sm text-white/80">
            <span aria-hidden="true" className="text-[#FFD700]/60">✦ </span>
            <strong className="font-semibold">{t('teaserMoon', { sign: moon.sign })}</strong>
            {' — '}
            <span className="text-white/60">{t(`signOneLiners.${moon.sign}` as 'signOneLiners.Aries')}</span>
          </p>
        )}
        {ascSign && (
          <p className="text-sm text-white/80">
            <span aria-hidden="true" className="text-[#FFD700]/60">✦ </span>
            <strong className="font-semibold">{t('teaserAscendant', { sign: ascSign })}</strong>
            {' — '}
            <span className="text-white/60">{t(`signOneLiners.${ascSign}` as 'signOneLiners.Aries')}</span>
          </p>
        )}
      </div>

      {/* State A: free user — locked preview + PaywallCta */}
      {!isPro && (
        <>
          <div
            aria-hidden="true"
            className="rounded-lg border border-white/6 p-4 text-sm text-white/70 select-none"
            style={{ background: 'rgba(255,255,255,0.02)', filter: 'blur(3px)' }}
          >
            Mercury · Venus · Mars · Jupiter · Saturn · Uranus · Neptune · Pluto · N. Node · Chiron
            {hasHouses ? ' + 12 houses' : ''} + top 3 aspects woven into a personal synthesis…
          </div>
          <p className="text-xs text-white/40 text-center">
            {hasHouses ? t('lockedLabelWithHouses') : t('lockedLabelNoHouses')}
          </p>
          <PaywallCta
            trigger="natal-chart"
            variant="card"
            onClick={() => setPaywallOpen(true)}
          />
        </>
      )}

      {/* State B: Pro, no reading yet — Generate button */}
      {isPro && !reading && (
        <button
          type="button"
          data-testid="generate-reading-btn"
          onClick={handleGenerate}
          disabled={isGenerating}
          aria-busy={isGenerating}
          className="w-full max-w-xs mx-auto block py-3 px-6 rounded-xl text-sm font-semibold tracking-wide transition-all disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          style={{
            background: 'linear-gradient(135deg, #FFD700, #FFE033)',
            color: '#0A0A0F',
          }}
        >
          {isGenerating ? t('generating') : t('generateButton')}
        </button>
      )}

      {/* State C: Pro, reading present */}
      {isPro && reading && (
        <div
          data-testid="reading-body"
          aria-live="polite"
          className="rounded-xl border border-[#FFD700]/15 p-5"
          style={{ background: 'rgba(255,215,0,0.04)' }}
        >
          <p
            className="text-sm text-white/80 leading-relaxed whitespace-pre-line"
            style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
          >
            {reading}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p
          role="alert"
          className="text-xs text-red-400/80 text-center"
        >
          {error}
        </p>
      )}

      {/* Paywall modal (mounted only when needed) */}
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        returnUrl={pathname ?? '/chart'}
        triggerContext="natal-chart"
      />
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/modules/astro-engine/components/__tests__/ChartReadingSection.test.tsx
npm run typecheck
```

Expected: 7 tests pass; typecheck clean.

If the test mocking `IntersectionObserver` in the section's `beforeEach` is not also catching the observer used inside `PaywallCta` (mounted inside the section when free), you may need to apply the same `vi.stubGlobal('IntersectionObserver', ...)` pattern from `PaywallCta.test.tsx` — copy the invoke-on-observe class verbatim.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/ChartReadingSection.tsx src/modules/astro-engine/components/__tests__/ChartReadingSection.test.tsx
git commit -m "$(cat <<'EOF'
feat(astro/chart-reading): ChartReadingSection component

Value-then-block UI: Sun/Moon/Ascendant teaser + blurred locked preview
+ PaywallCta for free users; Generate Reading button + cached LLM
synthesis render for Pro. Handles no-birth-time charts gracefully.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Mount `ChartReadingSection` in `ChartDisplay`

**Files:**
- Modify: `src/modules/astro-engine/components/ChartDisplay.tsx`

- [ ] **Step 1: Add the import**

In `src/modules/astro-engine/components/ChartDisplay.tsx`, near the other component imports (around line 30), add:

```tsx
import { ChartReadingSection } from './ChartReadingSection';
```

- [ ] **Step 2: Insert the section between Wheel/Table tabpanels and Passport divider**

Locate the existing block (around line 425 — verify with `grep -n "chartId && (" src/modules/astro-engine/components/ChartDisplay.tsx`):

```tsx
      {/* Passport section — shown after chart calculation */}
      {chartId && (
        <>
          <div
            className="h-px"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-hidden="true"
          />
          <PassportSection chartId={chartId} />
        </>
      )}
```

**Replace** the entire `{chartId && (...)}` Passport block with:

```tsx
      {/* AI Reading section — first slot after the chart */}
      {chartId && (
        <>
          <div
            className="h-px"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-hidden="true"
          />
          <ChartReadingSection chartId={chartId} chart={chart} />
        </>
      )}

      {/* Passport section — second slot, viral share mechanic */}
      {chartId && (
        <>
          <div
            className="h-px"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-hidden="true"
          />
          <PassportSection chartId={chartId} />
        </>
      )}
```

The Avatar block below it stays unchanged.

- [ ] **Step 3: Typecheck and run all astro-engine component tests**

```bash
npm run typecheck
npx vitest run src/modules/astro-engine/components/__tests__/
```

Expected: typecheck zero errors; all existing ChartDisplay-related tests pass (no regression).

- [ ] **Step 4: Manual visual smoke**

```bash
npm run dev
```

Open `http://localhost:3000/chart` in a browser, calculate a test chart (anonymous), and verify:
1. After the Wheel/Table tabs, an "AI Reading · Pro" section appears
2. Teaser shows Sun/Moon/Ascendant one-liners
3. Below: blurred preview + PaywallCta card with "Get your full natal chart reading" headline
4. Below that: Cosmic Passport (still works)
5. Below that: Avatar generator (still works)

Click the CTA button → PaywallModal opens with the same contextual headline. Close it (X or Escape).

Test no-birth-time variant: Calculate a chart with the "Knows birth time" toggle OFF. The Ascendant line should be absent from the teaser; the locked label should say "10 more planets & aspects" (no houses).

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/ChartDisplay.tsx
git commit -m "$(cat <<'EOF'
feat(astro/chart-display): mount ChartReadingSection between tabs and Passport

New AI Reading section sits in the highest-impression slot for the
new Meta-ad paywall surface — first content after the chart itself,
ahead of Passport (which stays in slot 2 for viral share retention).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Add `CHART_READING_GENERATED` analytics event

**Files:**
- Modify: `src/shared/lib/analytics.ts`

- [ ] **Step 1: Find and inspect the analytics module**

```bash
grep -n "PAYWALL_CTA_VIEWED\|export enum AnalyticsEvent\|export const AnalyticsEvent" src/shared/lib/analytics.ts | head
```

Note the format (enum vs object const, naming convention, etc.).

- [ ] **Step 2: Add the new event constant**

In `src/shared/lib/analytics.ts`, locate the existing `PAYWALL_CTA_VIEWED` entry. Right after it (or in alphabetical order — match the existing style), add:

```ts
CHART_READING_GENERATED: 'chart_reading_generated',
```

(If `AnalyticsEvent` is a TypeScript `enum`, use the enum-member syntax instead: `CHART_READING_GENERATED = 'chart_reading_generated',`. Inspect the surrounding lines to match.)

If the file has a TypeScript union of allowed event names or a payload-type map, add a new payload type:

```ts
interface ChartReadingGeneratedPayload {
  chartId: string;
  source: 'cache' | 'generated';
  locale: 'en' | 'es';
}
```

And register it in the event-to-payload map if one exists. If not, the loose `trackEvent(event, payload?: Record<string, unknown>)` signature already supports the new event.

- [ ] **Step 3: Verify component test still passes**

The `ChartReadingSection` test in Task 7 already asserts that `trackEvent` is called with `AnalyticsEvent.CHART_READING_GENERATED`. Re-run it to confirm:

```bash
npx vitest run src/modules/astro-engine/components/__tests__/ChartReadingSection.test.tsx
npm run typecheck
```

Expected: tests pass (the Proxy-based mock from Task 7 accepts any key name; the real export now backs the same name at runtime).

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/analytics.ts
git commit -m "$(cat <<'EOF'
feat(analytics): CHART_READING_GENERATED event

PII-safe payload: { chartId, source: 'cache'|'generated', locale }.
Used to track post-paywall feature consumption — proof the converted
Pro user actually used the AI reading they paid for.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: E2E test for canonical conversion path

**Files:**
- Modify: `tests/e2e/paywall-cta.spec.ts`

- [ ] **Step 1: Add a new `test.describe` block for natal-chart**

Open `tests/e2e/paywall-cta.spec.ts`. After the existing `test.describe('Paywall CTA — 3-card spread', ...)` block (around line 85), insert:

```ts
test.describe('Paywall CTA — Natal Chart Reading', () => {
  test('anonymous user calculates chart, sees AI Reading CTA, opens modal with contextual headline', async ({ page }) => {
    await suppressCookieBanner(page);

    // Bypass the email-gate localStorage flag so the modal does not appear and
    // intercept the test. Combine with `no_gate=1` query param to be belt-and-suspenders.
    await page.addInitScript(() => {
      window.localStorage.setItem('email_gate_passed', '1');
    });

    // Drive directly to /chart with URL-param pre-fill — exercises the
    // auto-calculate path without forms.
    const url = '/en/chart'
      + '?bd=1990-04-15'
      + '&bt=14:30'
      + '&ktb=1'
      + '&lat=-34.6037'
      + '&lon=-58.3816'
      + '&place=Buenos+Aires'
      + '&tz=America/Argentina/Buenos_Aires'
      + '&no_gate=1';

    const response = await page.goto(url);
    if (response?.status() === 404) test.skip();
    await page.waitForLoadState('domcontentloaded');

    // Auto-calculation runs; wait for the chart result wrapper to appear.
    await page.waitForSelector('[data-testid="natal-chart-result"]', { timeout: 15_000 });

    // Scroll into the new AI Reading section.
    const section = page.locator('[data-testid="chart-reading-section"]');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();

    // PaywallCta is mounted inside the section for free users.
    const cta = section.locator('[data-variant="card"]');
    await expect(cta).toBeVisible();
    await expect(cta).toContainText(/natal chart|carta natal/i);

    // No /pricing anchor leakage from this section.
    const pricingLink = section.locator('a[href*="/pricing"]').first();
    await expect(pricingLink).toBeHidden();

    // Click the CTA → modal opens with contextual headline.
    await cta.getByRole('button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/natal chart|carta natal/i);
  });
});
```

- [ ] **Step 2: Run the new E2E test**

```bash
npm run test:e2e -- --grep "Natal Chart Reading"
```

Expected: 1 test passes. If the auto-calculation timing on the chart is flaky (>15s), bump the `waitForSelector` timeout. If Buenos Aires coords trip some validation, swap to coordinates from `tests/astro/fixtures/` (e.g. London or NYC).

If the test fails because the URL params shape differs from what `ChartDisplay.tsx:159-167` reads, run `grep -n "searchParams.get" src/modules/astro-engine/components/ChartDisplay.tsx` and align the param names exactly.

- [ ] **Step 3: Run the full E2E suite to confirm no regression**

```bash
npm run test:e2e
```

Expected: all suites pass (including the existing Celtic Cross and 3-card paywall tests).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/paywall-cta.spec.ts
git commit -m "$(cat <<'EOF'
test(chart-reading): e2e canonical conversion path for natal-chart paywall

Anonymous user → /chart with URL params → auto-calc → AI Reading
section visible → CTA click → modal opens with contextual headline.
Sits beside the existing Celtic Cross and 3-card spread cases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Post-implementation verification

Once all 10 tasks are committed, run the full verification gate from the spec:

- [ ] **Run all unit + integration tests**

```bash
npm test
```

Expected: zero failures across all suites (including the 3 new test files and 2 extended ones).

- [ ] **Run typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Run lint**

```bash
npm run lint 2>&1 | tee /tmp/lint.log
grep -c "error" /tmp/lint.log || true
```

Expected: zero NEW errors (the baseline is poisoned by `.claude/worktrees/` per memory `feedback_lint_worktrees_pollution`; only treat regressions as failures — i.e., compare new lint output to a baseline grep of pre-change lint output).

- [ ] **Manual founder smoke** (see spec § Testing § Manual smoke)

- [ ] **Confirm prod env vars** — founder must verify `ANTHROPIC_API_KEY` is set in Vercel prod before declaring the feature live. Same key powers `/api/v1/tarot/interpret` so likely already configured, but verify.

- [ ] **Prod migration deploy** — founder owes deploy of migration `0010_chart_readings.sql` to prod Neon Postgres. Same pattern as previous migrations 0007/0008/0009 per memory.

---

## Self-Review (writer’s checklist)

**Spec coverage:**
- ✅ § Architecture — File map covered by Tasks 1–10
- ✅ § Components > PaywallTrigger extension — Task 1
- ✅ § Components > ChartReadingSection — Task 7 (+ mounted in Task 8)
- ✅ § Components > buildChartInterpretationPrompt — Task 3
- ✅ § Components > Server endpoint — Task 5
- ✅ § Data flow — Tasks 5 + 7 (server + client halves)
- ✅ § chart_readings table — Task 2
- ✅ § Rate limit — Task 4
- ✅ § i18n EN + ES — Task 6
- ✅ § Analytics CHART_READING_GENERATED — Task 9
- ✅ § Error handling — covered in Task 5 (server) + Task 7 (client)
- ✅ § Testing unit + integration + E2E — Tasks 3, 5, 7, 10
- ✅ § Rollout (10 commits) — Tasks 1–10 produce exactly these commits

**Placeholder scan:** no TBD, no "implement later", no "add error handling" without code. Every code-touching step contains the exact code.

**Type / name consistency:**
- `PaywallTrigger`: `'natal-chart'` — kebab-case throughout
- i18n key path: `paywall.contextualTitles.natalChart` (camelCase) — matches existing `celticCross` pattern
- `chartReadings` (Drizzle table identifier) vs `chart_readings` (SQL table name) vs `ChartReading` (TypeScript type) — consistent with existing repo pattern (`natalCharts` / `natal_charts` / `NatalChart`)
- Component props: `chartId: string, chart: ChartResult` — matches across Tasks 7 + 8
- API endpoint path: `/api/v1/chart/interpret` — consistent across Tasks 4 (rate limit key), 5 (file location), 7 (POST URL), 10 (E2E)
- Migration number: `0010` — confirmed via `ls drizzle/` in pre-flight, matches Task 2

**Open spec questions resolved or deferred:**
- Q1 (`requirePremium()` returns 403, not 402) — confirmed via direct read of `src/modules/auth/lib/premium.ts`; spec/plan use 403 throughout
- Q2 (aspect-selection algorithm) — concrete impl in Task 3 (filter to major types, sort by abs(orb) ascending, take 3)
- Q3 (prompt skeleton) — Task 3 ships the skeleton; founder iterates post-deploy
- Q4 (no-birth-time branch) — explicit in Tasks 3 + 7 with dedicated tests
- Q5 (Regenerate button cache semantics) — **deferred**: regenerate button is NOT in this plan; can be added as a follow-up task without changing endpoint contract (`?force=1` extension)
- Q6 (Sentry alert threshold) — relies on existing Sentry rules; nothing to do here
- Q7 (`postJson` helper) — confirmed in `src/shared/lib/apiFetch.ts:139`
- Q8 (`data-testid` placement) — explicit in Task 7 + Task 10
