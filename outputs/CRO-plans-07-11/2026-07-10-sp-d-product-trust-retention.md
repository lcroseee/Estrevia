# SP-D — Product Trust & Retention Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop fabricating a noon Ascendant for time-unknown charts (LIVE-6), make the email gate re-arm across sessions with input focus + real value copy (LAND-3/LIVE-4), route free-user tarot-interpret clicks to the paywall (07 STR-4), kill the anonymous `/chart` 401 console error, and turn on masked PostHog session recordings so the payer-day-one-silence question becomes answerable.

**Architecture:** Six independent client-side tracks over existing code — three chart-calculate callsites (HeroCalculator, BirthDataForm, ChartDisplay) switch to `time: null`, EmailGateModal + HeroCalculator gate logic, ThreeCardSpread's interpret handler, SubscriptionProvider gains a Clerk `useAuth()` gate, PostHogProvider init options + `data-ph-mask` tags on birth-data forms. Zero schema/engine/API changes: `chartCalculateSchema` already accepts `time: null` (`src/shared/validation/chart.ts:13`) and every null-houses UI path is present and dormant. Spec: `docs/superpowers/specs/2026-07-10-sp-d-product-trust-retention-design.md`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, next-intl, Clerk (`useAuth`), PostHog (posthog-js 1.364), Vitest + Testing Library (jsdom).

## Global Constraints

- i18n message files live at `messages/en.json` and `messages/es.json` (repo root). ES copy = español neutro LATAM, `tú` form.
- `messages/*.json` line numbers in this plan are pre-SP-E-insertion (SP-E T2 inserts `landing.heroProof` at ~788 in both files) — locate the `emailGate` keys by NAME, not absolute line.
- Tests: `npx vitest run <path>` for single files; full gate = `npx vitest run` + `npm run typecheck` + `npm run lint` (lint: ignore `.claude/worktrees/**` noise). Component tests need the `// @vitest-environment jsdom` pragma.
- PII rules: birth date/time/location never in logs, analytics payloads, or error messages. The `bd/bt/...` URL params are an accepted existing pattern in browser history — BUT Task 7's session recordings ARE a new PII surface: rrweb `$snapshot` payloads embed `window.location.href` (and the replay player displays it), so on `/chart?bd=…&bt=…&place=…` the recorded URL carries birth PII. `sanitize_properties` never reaches rrweb payloads, and `maskAllInputs`/`maskTextSelector` do not mask the recorded URL. Task 7 therefore ships a `before_send` scrubber (URL props + rrweb hrefs) BEFORE recording is enabled, and T9 Step 3 smoke-verifies the replay player's URL bar is clean.
- **Merge-order coordination with CRO Phase 0 T8:** that task adds `initialChart`/`initialChartId` props to `src/modules/astro-engine/components/ChartDisplay.tsx` (signature + state lines ~153/177-178) and creates `__tests__/ChartDisplay.initial.test.tsx`. This plan's ChartDisplay edits target the mount-params fetch body and the header/houses rendering — textually disjoint from T8's edits, and the Edit anchors below match both pre- and post-T8 file states. If both plans run concurrently, land whichever finishes first and rebase the other; no semantic conflict.
- The gate flag key literal `'email_gate_passed'` is shared between `EmailGateModal.tsx` (writer) and `HeroCalculator.tsx` (reader) — Task 4 changes both sides in ONE commit so no intermediate state re-gates same-session repeat calculations.
- Do NOT touch `SynastryClient.tsx`'s `'12:00'` initial form values (`:48,:58`) — user-editable defaults, explicitly a spec non-goal.
- No recalculation/backfill of stored charts: temp charts expire in 7 days; the handful of saved rows keep the stale noon Ascendant (accepted, documented in Task 8's runbook).
- Commit style: `fix(sp-d/T<n>): <what>` / `feat(...)` / `test(...)` / `docs(...)`.
- No prod-mutating scripts in this plan (nothing needs `--apply` gating); no DB migrations.

---

### Task 1: HeroCalculator sends `time: null` when birth time is unknown (D1, callsite 1)

**Files:**
- Modify: `src/modules/astro-engine/components/HeroCalculator.tsx:236-245` (fetch body inside `handleSubmit`)
- Test: `src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx` (TimePickerField mock upgrade + new describe)

**Interfaces:**
- Consumes: `POST /api/v1/chart/calculate` — `chartCalculateSchema` already has `time: timeSchema.nullable()` (`src/shared/validation/chart.ts:13`); the engine gate `hasBirthTime = time !== null && time.trim().length > 0` (`src/modules/astro-engine/chart.ts:122`) then returns `houses: null`, `ascendant: null`, `midheaven: null`.
- Produces: payload without the schema-stripped `knowsBirthTime`/`ayanamsa` extras; `time: null` + `houseSystem: null` when the user doesn't know their birth time. The AI-reading teaser's fake-Ascendant lead disappears automatically (`src/modules/astro-engine/lib/chart-interpretation-prompt.ts` — no-houses `ascendantLine`/`houseSection` branch).

- [ ] **Step 1: Upgrade the TimePickerField mock in the existing test file**

In `src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`, replace the null-rendering mock (lines 68-70):

```ts
vi.mock('../TimePickerField', () => ({
  TimePickerField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    React.createElement('input', {
      'data-testid': 'time-input',
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    }),
}));
```

(Existing tests never render it — `knowsBirthTime` defaults to `false` and the field is conditional — so this is behavior-neutral for them.)

- [ ] **Step 2: Write the failing tests**

Append to the same file:

```ts
describe('HeroCalculator chart-calculate payload (time-unknown honesty)', () => {
  // The file's top-level beforeEach re-spies fetch via vi.spyOn WITHOUT
  // clearing it, and vitest config sets neither clearMocks nor restoreMocks —
  // so .mock.calls ACCUMULATE across every test in this file. This describe
  // is appended last: without a clear, calls[0] would be the FIRST test's
  // request and the assertions below would read stale bodies. Clear here so
  // calls[0] is THIS test's request.
  beforeEach(() => {
    vi.mocked(global.fetch).mockClear();
  });

  it('sends time:null + houseSystem:null and drops schema-stripped extras when birth time is unknown', async () => {
    render(<HeroCalculator isSignedIn={true} />);
    await fillFormAndSubmit();
    await waitFor(() => expect(screen.getByText('Leo')).toBeTruthy());

    const init = vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.time).toBeNull();
    expect(body.houseSystem).toBeNull();
    // chartCalculateSchema silently strips these — stop sending them.
    expect(body).not.toHaveProperty('knowsBirthTime');
    expect(body).not.toHaveProperty('ayanamsa');
  });

  it('sends the real time + Placidus when the user knows their birth time', async () => {
    render(<HeroCalculator isSignedIn={true} />);
    fireEvent.change(screen.getByTestId('date-input'), { target: { value: '1990-08-15' } });
    fireEvent.click(screen.getByTestId('pick-city'));
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.change(screen.getByTestId('time-input'), { target: { value: '14:30' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(screen.getByText('Leo')).toBeTruthy());

    const init = vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.time).toBe('14:30');
    expect(body.houseSystem).toBe('Placidus');
  });
});
```

- [ ] **Step 3: Run to verify the new tests fail**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`
Expected: FAIL — `body.time` is `'12:00'` (not null) and `body` HAS `knowsBirthTime`/`ayanamsa`; existing tests still pass.

- [ ] **Step 4: Implement**

In `src/modules/astro-engine/components/HeroCalculator.tsx`, replace the fetch body (lines 236-245):

```ts
          body: JSON.stringify({
            date: form.date,
            // Honest chart when birth time is unknown: `time: null` makes the
            // engine skip Ascendant + houses (schema accepts null) instead of
            // fabricating a noon Ascendant from a literal '12:00'. The old
            // knowsBirthTime/ayanamsa extras were silently stripped by
            // chartCalculateSchema — dropped.
            time: form.knowsBirthTime ? form.time : null,
            latitude: form.latitude,
            longitude: form.longitude,
            timezone: form.timezone,
            houseSystem: form.knowsBirthTime ? 'Placidus' : null,
          }),
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`
Expected: PASS (all existing + 2 new)

- [ ] **Step 6: Commit**

```bash
git add src/modules/astro-engine/components/HeroCalculator.tsx src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx
git commit -m "fix(sp-d/T1): hero calculator sends time:null when birth time unknown — no fabricated noon Ascendant"
```

---

### Task 2: BirthDataForm sends `time: null` when birth time is unknown (D1, callsite 2)

**Files:**
- Modify: `src/modules/astro-engine/components/BirthDataForm.tsx:99` (fetch body inside `handleSubmit`)
- Test: `src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx` (new describe)

**Interfaces:**
- Consumes: same endpoint/schema as Task 1. `houseSystem: values.knowsBirthTime ? values.houseSystem : null` at `:103` is already correct — unchanged.
- Produces: `time: null` in the body when `knowsBirthTime === false` (the form's default state).

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx` (reuses the file's `renderForm`/`stubFetchOk`/`fillAndSubmit` helpers; its TimePickerField mock already renders a `data-testid="time-input"` input):

```ts
describe('BirthDataForm — chart-calculate payload (time unknown → time:null)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends time:null + houseSystem:null when birth time is unknown (default toggle state)', async () => {
    const fetchMock = stubFetchOk();
    const onChartCalculated = vi.fn();
    renderForm(onChartCalculated);
    await fillAndSubmit();
    await waitFor(() => expect(onChartCalculated).toHaveBeenCalled());

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.time).toBeNull();
    expect(body.houseSystem).toBeNull();
  });

  it('sends the real time + house system when the birth-time toggle is on', async () => {
    const fetchMock = stubFetchOk();
    const onChartCalculated = vi.fn();
    renderForm(onChartCalculated);
    fireEvent.change(screen.getByTestId('date-input'), { target: { value: '1990-01-01' } });
    fireEvent.click(screen.getByTestId('select-city'));
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.change(screen.getByTestId('time-input'), { target: { value: '10:15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate Chart' }));
    await waitFor(() => expect(onChartCalculated).toHaveBeenCalled());

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.time).toBe('10:15');
    expect(body.houseSystem).toBe('Placidus');
  });
});
```

- [ ] **Step 2: Run to verify the first new test fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx`
Expected: FAIL — `body.time` is `'12:00'`, not null. (The toggle-on test should already pass.)

- [ ] **Step 3: Implement**

In `src/modules/astro-engine/components/BirthDataForm.tsx`, replace line 99:

```ts
          // Honest chart when birth time is unknown — see HeroCalculator's
          // payload comment; `time: null` skips Ascendant/houses server-side.
          time: values.knowsBirthTime ? values.time : null,
```

(The surrounding `body` object literal at `:97-104` is otherwise unchanged.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx`
Expected: PASS (all existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/BirthDataForm.tsx src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx
git commit -m "fix(sp-d/T2): BirthDataForm sends time:null when birth time unknown"
```

---

### Task 3: ChartDisplay URL-param path sends `time: null` + honest house-system labels (D1, callsite 3 + cosmetic companion)

**Files:**
- Modify: `src/modules/astro-engine/components/ChartDisplay.tsx` (mount-effect fetch body at `:204`; header line `:335-338`)
- Modify: `src/modules/astro-engine/components/PositionTable.tsx:253-257` (footer `{chart.houseSystem} houses` echo)
- Test: `src/modules/astro-engine/components/__tests__/ChartDisplay.timeUnknown.test.tsx` (new), `src/modules/astro-engine/components/__tests__/PositionTable.test.tsx` (new)

**Interfaces:**
- Consumes: `noHouses` message key — exists in both locales (`messages/en.json:66` "No houses (no birth time)", `messages/es.json:66` "Sin casas (sin hora de nacimiento)").
- Produces: for `houses === null` charts, the header reads "Sidereal · noHouses" WITHOUT the house-system name (the schema transform persists `houseSystem: 'Placidus'` into `ChartResult` even when no houses were computed — `validation/chart.ts:18-20`), and PositionTable's footer drops "Placidus houses". Dormant null paths (ChartWheel `:298`, houses checkbox `:395`, PositionTable rows `:75-76`, passport `:39`) activate on their own.
- Phase 0 T8 note: these edits do not overlap T8's (signature/state/page). Anchors below are code-content anchors, valid in both file states.

- [ ] **Step 1: Write the failing ChartDisplay test**

```tsx
// src/modules/astro-engine/components/__tests__/ChartDisplay.timeUnknown.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { ChartResult } from '@/shared/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

let searchParamsValue = new URLSearchParams();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParamsValue,
}));

// next/dynamic drives the lazy ChartWheel import — stub it so the test never
// touches the ~250 KB SVG module.
vi.mock('next/dynamic', () => ({ default: () => () => null }));

vi.mock('../BirthDataForm', () => ({
  BirthDataForm: () => <div data-testid="birth-form-stub" />,
}));
vi.mock('../PositionTable', () => ({
  PositionTable: () => <div data-testid="position-table-stub" />,
}));
vi.mock('../PassportCard', () => ({ PassportCard: () => null }));
vi.mock('../ShareButton', () => ({ ShareButton: () => null }));
vi.mock('../AvatarSection', () => ({ AvatarSection: () => null }));
vi.mock('../ChartReadingSection', () => ({
  ChartReadingSection: () => <div data-testid="reading-stub" />,
}));
vi.mock('@/modules/astro-engine/passport', () => ({ generatePassport: () => null }));

import { ChartDisplay } from '../ChartDisplay';

function noHousesChart(): ChartResult {
  return {
    planets: [],
    houses: null,
    aspects: [],
    ascendant: null,
    midheaven: null,
    ayanamsa: 24.21,
    system: 'sidereal',
    houseSystem: 'Placidus', // schema transform persists Placidus even with no houses
    nodeType: 'mean',
    calculatedAt: '2026-07-11T00:00:00Z',
  } as unknown as ChartResult;
}

function stubCalcOk(chart: ChartResult) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ success: true, data: { chartId: 'c1', chart } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  replaceMock.mockClear();
  // ktb absent → time unknown
  searchParamsValue = new URLSearchParams(
    'bd=1990-06-15&lat=40.7128&lon=-74.006&place=New+York&tz=America/New_York',
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChartDisplay URL-param auto-calc (time unknown → time:null)', () => {
  it('sends time:null + houseSystem:null when ktb is absent', async () => {
    const fetchMock = stubCalcOk(noHousesChart());
    render(<ChartDisplay />);
    await waitFor(() => expect(screen.getByTestId('natal-chart-result')).toBeTruthy());

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.time).toBeNull();
    expect(body.houseSystem).toBeNull();
  });

  it('sends the real time + Placidus when ktb=1 and bt are present', async () => {
    searchParamsValue = new URLSearchParams(
      'bd=1990-06-15&bt=14:30&ktb=1&lat=40.7128&lon=-74.006&tz=America/New_York',
    );
    const fetchMock = stubCalcOk(noHousesChart());
    render(<ChartDisplay />);
    await waitFor(() => expect(screen.getByTestId('natal-chart-result')).toBeTruthy());

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.time).toBe('14:30');
    expect(body.houseSystem).toBe('Placidus');
  });

  it('houses:null → header shows noHouses WITHOUT the house-system name; houses checkbox absent', async () => {
    stubCalcOk(noHousesChart());
    render(<ChartDisplay />);
    await waitFor(() => expect(screen.getByTestId('natal-chart-result')).toBeTruthy());

    // Header <p> reads "Sidereal · noHouses" (t() echoes keys in this mock)
    expect(screen.getByText(/noHouses/)).toBeTruthy();
    expect(screen.queryByText(/Placidus/)).toBeNull();
    // Houses checkbox only renders when chart.houses exists (dormant path)
    expect(screen.queryByText('houses')).toBeNull();
    expect(screen.getByText('aspects')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/ChartDisplay.timeUnknown.test.tsx`
Expected: FAIL — `body.time` is `'12:00'` in test 1; test 3 finds "Placidus" in the header.

- [ ] **Step 3: Implement the ChartDisplay changes**

In `src/modules/astro-engine/components/ChartDisplay.tsx`:

1. In the mount-only auto-calc effect, replace the body line `time: knowsTime ? bt : '12:00',` (line 204) with:

```ts
        // Honest chart when birth time is unknown — see HeroCalculator's
        // payload comment; `time: null` skips Ascendant/houses server-side.
        time: knowsTime ? bt : null,
```

2. Replace the header meta line (lines 335-338):

```tsx
          <p className="text-xs text-white/60 font-mono mt-0.5">
            {chart.system === 'sidereal' ? 'Sidereal' : 'Tropical'}
            {/* houseSystem persists as 'Placidus' in ChartResult even when no
                houses were computed (schema transform) — only show it when
                houses actually exist. */}
            {chart.houses ? ` · ${chart.houseSystem}` : ` · ${t('noHouses')}`}
          </p>
```

- [ ] **Step 4: Write the failing PositionTable test**

```tsx
// src/modules/astro-engine/components/__tests__/PositionTable.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PositionTable } from '../PositionTable';
import { Planet, Sign } from '@/shared/types';
import type { ChartResult, PlanetPosition } from '@/shared/types';

function pos(planet: Planet, overrides: Partial<PlanetPosition> = {}): PlanetPosition {
  return {
    planet,
    absoluteDegree: 123.5,
    tropicalDegree: 147.7,
    sign: Sign.Leo,
    signDegree: 3.5,
    minutes: 30,
    seconds: 0,
    isRetrograde: false,
    speed: 1,
    house: null,
    ...overrides,
  };
}

function chartFixture(overrides: Partial<ChartResult> = {}): ChartResult {
  return {
    planets: [pos(Planet.Sun), pos(Planet.Moon, { sign: Sign.Pisces })],
    houses: null,
    aspects: [],
    ascendant: null,
    midheaven: null,
    ayanamsa: 24.21,
    system: 'sidereal',
    houseSystem: 'Placidus',
    nodeType: 'mean',
    calculatedAt: '2026-07-11T00:00:00Z',
    ...overrides,
  } as unknown as ChartResult;
}

describe('PositionTable — no-houses chart honesty', () => {
  it('renders no Ascendant/Midheaven rows and no house-system footer when houses are null', () => {
    render(<PositionTable chart={chartFixture()} />);
    expect(screen.queryByText('Ascendant')).toBeNull();
    expect(screen.queryByText('Midheaven')).toBeNull();
    expect(screen.queryByText(/Placidus houses/)).toBeNull();
  });

  it('keeps the Ascendant row + house-system footer for a full chart', () => {
    render(
      <PositionTable
        chart={chartFixture({
          houses: [{ house: 1, degree: 100, sign: Sign.Leo, signDegree: 10 }],
          ascendant: pos(Planet.Ascendant, { house: 1 }),
        })}
      />,
    );
    expect(screen.getByText('Ascendant')).toBeTruthy();
    expect(screen.getByText(/Placidus houses/)).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run to verify the first PositionTable test fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/PositionTable.test.tsx`
Expected: FAIL — footer renders "Placidus houses" unconditionally (`PositionTable.tsx:256`). The Ascendant-row assertions already pass (dormant path).

- [ ] **Step 6: Implement the PositionTable footer**

Replace `src/modules/astro-engine/components/PositionTable.tsx:253-257`:

```tsx
      <p className="mt-2 text-xs text-white/30">
        {isTropical ? 'Tropical zodiac' : `Sidereal (Lahiri ayanamsa: ${chart.ayanamsa.toFixed(4)}°)`}
        {/* Suppress the house-system mention on no-houses charts — houseSystem
            persists as 'Placidus' in ChartResult even without computed houses. */}
        {chart.houses ? ` · ${chart.houseSystem} houses` : ''}
      </p>
```

- [ ] **Step 7: Run both test files**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/ChartDisplay.timeUnknown.test.tsx src/modules/astro-engine/components/__tests__/PositionTable.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add src/modules/astro-engine/components/ChartDisplay.tsx src/modules/astro-engine/components/PositionTable.tsx src/modules/astro-engine/components/__tests__/ChartDisplay.timeUnknown.test.tsx src/modules/astro-engine/components/__tests__/PositionTable.test.tsx
git commit -m "fix(sp-d/T3): ChartDisplay param path time:null + honest house-system labels on no-houses charts"
```

---

### Task 4: Email gate — session re-arm on dismiss, input focus, value copy (D2 + D3)

**Files:**
- Modify: `src/shared/components/EmailGateModal.tsx` (`safeSetFlag` `:51-57`, `handleDismiss` `:67-71`, focus `:113`, submit-success `:183`, input `:236`)
- Modify: `src/modules/astro-engine/components/HeroCalculator.tsx:208-219` (`shouldShowGate`)
- Modify: `messages/en.json:1059-1060` + `messages/es.json:1062-1063` (`emailGate.title` / `.subtitle`)
- Test: `src/shared/components/__tests__/EmailGateModal.test.tsx` (flip dismiss assertion + 3 new), `src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx` (1 new)

**Interfaces:**
- Produces: dismiss writes `sessionStorage['email_gate_passed']` (re-arms next browser session); successful submit keeps the permanent `localStorage` flag; `shouldShowGate()` checks BOTH stores (same-session repeat calculations stay un-gated after a dismissal — the per-chartId alternative was rejected as hostile). Initial focus → `#email-gate-input`; X stays reachable via Tab/Escape. Storage failure (private mode) falls through to showing the gate — the existing catch pattern, reused.
- One commit: writer (modal) + reader (`shouldShowGate`) + copy move together (see Global Constraints).

- [ ] **Step 1: Update + extend the modal tests**

In `src/shared/components/__tests__/EmailGateModal.test.tsx`:

1. In the top-level `beforeEach` (after `window.localStorage.clear();` on line 12) add:

```ts
  window.sessionStorage.clear();
```

2. Replace the dismiss test (lines 177-186) with:

```ts
  it('dismiss writes the SESSION flag only — localStorage stays clear so the gate re-arms next session', () => {
    const ph = makePosthogMock();
    const fbq = makeFbqMock();
    render(<EmailGateModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'dismissCta' }));
    expect(baseProps.onDismiss).toHaveBeenCalled();
    expect(window.sessionStorage.getItem('email_gate_passed')).toBe('1');
    expect(window.localStorage.getItem('email_gate_passed')).toBeNull();
    expect(ph.capture).toHaveBeenCalledWith('email_gate_dismissed', expect.any(Object));
    expect(fbq).not.toHaveBeenCalled();
  });
```

3. Append three new tests inside the `describe('EmailGateModal', ...)` block:

```ts
  it('successful submit writes the PERMANENT localStorage flag, not the session flag', async () => {
    makePosthogMock();
    makeFbqMock();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { leadId: 'lead_s', eventId: 'lead_s:email_lead_submitted', wasNew: true }, error: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'perm@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => expect(baseProps.onSubmitted).toHaveBeenCalled());
    expect(window.localStorage.getItem('email_gate_passed')).toBe('1');
    expect(window.sessionStorage.getItem('email_gate_passed')).toBeNull();
  });

  it('focuses the email input on open (not the close button)', () => {
    render(<EmailGateModal {...baseProps} />);
    const input = screen.getByLabelText('emailLabel');
    expect(document.activeElement).toBe(input);
  });

  it('tolerates sessionStorage throwing on dismiss (still calls onDismiss)', () => {
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    render(<EmailGateModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'dismissCta' }));
    expect(baseProps.onDismiss).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify the new/changed modal tests fail**

Run: `npx vitest run src/shared/components/__tests__/EmailGateModal.test.tsx`
Expected: FAIL — dismiss writes localStorage (not sessionStorage); focus is on the X button; submit test passes-by-accident is impossible (sessionStorage assertion holds but the dismiss test drives the change).

- [ ] **Step 3: Implement the modal**

In `src/shared/components/EmailGateModal.tsx`:

1. Replace `safeSetFlag` (lines 51-57):

```ts
// Submit → permanent localStorage flag (we have the email — never gate again).
// Dismiss → sessionStorage flag only, so the gate re-arms in the NEXT browser
// session (LAND-3: dismissal used to be permanent) while same-session repeat
// calculations stay un-gated.
function safeSetFlag(store: 'local' | 'session'): void {
  try {
    const storage = store === 'local' ? window.localStorage : window.sessionStorage;
    storage.setItem(STORAGE_FLAG, '1');
  } catch {
    /* private mode / quota — ignore */
  }
}
```

2. In `handleDismiss` (line 68): `safeSetFlag();` → `safeSetFlag('session');`

3. In `handleSubmit` success path (line 183): `safeSetFlag();` → `safeSetFlag('local');`

4. Add a ref next to `closeButtonRef` (line 65):

```ts
  const emailInputRef = useRef<HTMLInputElement>(null);
```

5. In the open-effect (line 113), replace `closeButtonRef.current?.focus();` with:

```ts
    // LIVE-4: initial focus goes to the email input — the one action we want.
    // The X button stays first in the Tab order and Escape still dismisses.
    emailInputRef.current?.focus();
```

6. Attach the ref on the input (line 236, after `id="email-gate-input"`):

```tsx
            ref={emailInputRef}
```

- [ ] **Step 4: Implement `shouldShowGate` in HeroCalculator**

Replace `src/modules/astro-engine/components/HeroCalculator.tsx:208-219`:

```ts
  const shouldShowGate = useCallback((): boolean => {
    if (isSignedIn) return false;
    if (searchParams?.get('no_gate') === '1') return false;
    if (gateBypassed) return false;
    if (typeof window === 'undefined') return false;
    try {
      // Permanent flag — written only on successful email submit.
      if (window.localStorage.getItem('email_gate_passed')) return false;
    } catch {
      /* private mode — fall through, gate shows */
    }
    try {
      // Session flag — written on dismissal; re-arms next browser session.
      if (window.sessionStorage.getItem('email_gate_passed')) return false;
    } catch {
      /* private mode — fall through, gate shows */
    }
    return true;
  }, [isSignedIn, searchParams, gateBypassed]);
```

- [ ] **Step 5: Add the HeroCalculator gate test**

In `src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`:

1. In the top-level `beforeEach` (after `window.localStorage.clear();` on line 100) add:

```ts
  window.sessionStorage.clear();
```

2. Append to the `describe('HeroCalculator gate state machine', ...)` block:

```ts
  it('does NOT mount the modal when the sessionStorage dismiss flag is set (same session)', async () => {
    window.sessionStorage.setItem('email_gate_passed', '1');
    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('Leo')).toBeTruthy();
    });
    expect(screen.queryByTestId('gate-modal')).toBeNull();
  });
```

- [ ] **Step 6: Update the copy in both locales**

`messages/en.json` — inside `"emailGate"` (lines 1059-1060), replace title + subtitle:

```json
    "title": "Your chart is ready — where do we send the details?",
    "subtitle": "We'll email your full placements breakdown (Moon, rising & aspects) plus what they mean.",
```

`messages/es.json` — inside `"emailGate"` (lines 1062-1063; español neutro, tú form):

```json
    "title": "Tu carta está lista — ¿a dónde te la enviamos?",
    "subtitle": "Te enviaremos por email el desglose completo de tus posiciones (Luna, ascendente y aspectos) y qué significan.",
```

All other `emailGate` keys (including `"dismissCta": "Skip for now"` / `"Saltar por ahora"`) stay — the skip stays dark-pattern-free, the value is now stated.

- [ ] **Step 7: Run tests + validate JSON**

Run: `npx vitest run src/shared/components/__tests__/EmailGateModal.test.tsx src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`
Expected: PASS (all existing + 4 new)

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('json ok')"`
Expected: `json ok`

- [ ] **Step 8: Commit**

```bash
git add src/shared/components/EmailGateModal.tsx src/modules/astro-engine/components/HeroCalculator.tsx messages/en.json messages/es.json src/shared/components/__tests__/EmailGateModal.test.tsx src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx
git commit -m "fix(sp-d/T4): email gate re-arms per session on dismiss, focuses input, states the value (both locales)"
```

---

### Task 5: ThreeCardSpread — free-user interpret click opens the paywall (D4)

**Files:**
- Modify: `src/modules/esoteric/components/ThreeCardSpread.tsx:89-91` (`handleInterpret` free branch)
- Test: `src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx` (PaywallModal mock + new describe)

**Interfaces:**
- Consumes: existing `paywallOpen` state + `<PaywallModal ... triggerContext="three-card">` already wired at `:322-327` — `PaywallModal` fires `PAYWALL_OPENED` with `trigger: 'three-card'` internally on open (`PaywallModal.tsx:64-69`), so no extra analytics call is needed here.
- Produces: the interpret button stays visible for free users (strongest paywall trigger — chosen over CelticCross's hide-the-button parity) and the click opens the modal instead of a silent no-op. Pro path unchanged; server-side 403 enforcement (`middleware.ts:64` + `:122-124` handling) stays as defense-in-depth.

- [ ] **Step 1: Write the failing tests**

In `src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx`:

1. Extend the RTL import (line 3):

```ts
import { render, fireEvent, act, waitFor } from '@testing-library/react';
```

2. Add a PaywallModal mock after the existing `@/shared/lib/apiFetch` mock (line 47):

```ts
vi.mock('@/shared/components/PaywallModal', () => ({
  PaywallModal: ({ open, triggerContext }: { open: boolean; triggerContext?: string }) =>
    open
      ? React.createElement('div', {
          'data-testid': 'paywall-modal',
          'data-trigger': triggerContext ?? '',
        })
      : null,
}));
```

3. Append a new describe:

```ts
describe('ThreeCardSpread — interpret button routes free clicks to the paywall (STR-4)', () => {
  it('free user click opens the paywall (trigger=three-card) and fires NO interpret fetch', () => {
    vi.useFakeTimers();
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { getByRole, getByTestId, queryByTestId } = render(<ThreeCardSpread allCards={cards} />);

    fireEvent.click(getByRole('button', { name: /drawCards/i }));
    // Reveal timeouts: 400/900/1400ms — advance past the last one.
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(queryByTestId('paywall-modal')).toBeNull();
    fireEvent.click(getByRole('button', { name: /aiInterpretation/i }));

    expect(getByTestId('paywall-modal')).toBeTruthy();
    expect(getByTestId('paywall-modal').getAttribute('data-trigger')).toBe('three-card');
    expect(mockPostJson).not.toHaveBeenCalledWith('/api/v1/tarot/interpret', expect.anything());
    vi.useRealTimers();
  });

  it('Pro click still fires the interpret fetch (unchanged)', async () => {
    vi.useFakeTimers();
    mockUseSubscription.mockReturnValue({ isPro: true, isLoading: false });
    mockPostJson.mockResolvedValue({
      kind: 'ok',
      data: { success: true, data: { interpretation: 'The cards align.' } },
    });
    const { getByRole } = render(<ThreeCardSpread allCards={cards} />);

    fireEvent.click(getByRole('button', { name: /drawCards/i }));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(getByRole('button', { name: /aiInterpretation/i }));
    vi.useRealTimers();

    await waitFor(() => {
      expect(mockPostJson).toHaveBeenCalledWith('/api/v1/tarot/interpret', expect.anything());
    });
  });
});
```

- [ ] **Step 2: Run to verify the free-click test fails**

Run: `npx vitest run src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx`
Expected: FAIL — `paywall-modal` never appears (`handleInterpret` returns silently for `!isPro`). The Pro test should pass.

- [ ] **Step 3: Implement**

In `src/modules/esoteric/components/ThreeCardSpread.tsx`, replace the top of `handleInterpret` (lines 89-91):

```ts
  const handleInterpret = useCallback(async () => {
    if (!isPro) {
      // Free-user click on the interpret button is the strongest paywall
      // trigger we have — open the modal (PaywallModal fires PAYWALL_OPENED
      // with trigger=three-card via triggerContext) instead of the old
      // silent no-op. Server-side 403 on /api/v1/tarot/interpret remains
      // the enforcement layer.
      setPaywallOpen(true);
      return;
    }
    if (drawnCards.length === 0) return;
```

(`setPaywallOpen` is a state setter — identity-stable, no dependency-array change.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx`
Expected: PASS (2 existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add src/modules/esoteric/components/ThreeCardSpread.tsx src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx
git commit -m "fix(sp-d/T5): ThreeCardSpread free-user interpret click opens paywall instead of silent no-op"
```

---

### Task 6: SubscriptionProvider — Clerk gate kills the anonymous `/chart` 401 (D5)

**Files:**
- Modify: `src/shared/context/SubscriptionProvider.tsx` (import + `useAuth` + mount effect `:145-147` + focus effect `:151-169`)
- Test: `src/shared/context/__tests__/SubscriptionProvider.test.tsx` (new)

**Interfaces:**
- Consumes: `useAuth()` from `@clerk/nextjs` — safe: the provider's ONLY mount is inside `ClerkProvider` in `src/app/[locale]/(app)/layout.tsx:26-35` (consistent with `feedback_clerk_provider_scope`; verified no other mount sites).
- Produces: signed-out visitors on public `(app)` routes (`/chart` is NOT in the middleware protected list — `middleware.ts:49-57`) get free tier locally with ZERO network round-trip → zero 401 console errors. `isLoaded === false` → provider stays in loading state (no fetch, no wrong-tier flash). Signed-in behavior byte-identical, including focus revalidation. The `fetchSubscription` defensive 401/HTML handling (`:79-89`) stays as a safety net.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/shared/context/__tests__/SubscriptionProvider.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockUseAuth = vi.fn();
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockUseAuth(),
}));

import { SubscriptionProvider, useSubscriptionContext } from '../SubscriptionProvider';

function Probe() {
  const { plan, isPro, isLoading } = useSubscriptionContext();
  return <div data-testid="probe">{`${plan}|${isPro}|${isLoading}`}</div>;
}

function renderProvider() {
  return render(
    <SubscriptionProvider>
      <Probe />
    </SubscriptionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SubscriptionProvider — Clerk gate (anon /chart 401 fix)', () => {
  it('signed-out: no fetch fired, resolves to free tier not-loading', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('free|false|false');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Clerk not loaded yet: stays in loading state, no fetch', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    // Give any (wrong) mount-time fetch a tick to fire.
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId('probe').textContent).toBe('free|false|true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signed-in: fetches and reflects the subscription payload', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        plan: 'pro_monthly',
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: '2026-08-01T00:00:00Z',
        isPro: true,
        isTrialing: false,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('pro_monthly|true|false');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/user/subscription',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/context/__tests__/SubscriptionProvider.test.tsx`
Expected: FAIL — signed-out and not-loaded cases still fire the fetch (provider has no Clerk dependency yet).

- [ ] **Step 3: Implement**

In `src/shared/context/SubscriptionProvider.tsx`:

1. Add the import after the react import block (line 24):

```ts
import { useAuth } from '@clerk/nextjs';
```

2. Inside the component, before `fetchSubscription` (after line 57):

```ts
  // Clerk gate (anon-401 fix): the provider mounts inside ClerkProvider in
  // (app)/layout.tsx, but `/chart` is a PUBLIC route — anonymous visitors
  // used to hit the Clerk-protected subscription endpoint and print a 401
  // console error on every view. Signed-out → free tier locally, no fetch.
  const { isLoaded, isSignedIn } = useAuth();
```

3. Replace the mount effect (lines 144-147):

```ts
  // Initial fetch — only once Clerk has resolved, and only for signed-in
  // users. While `isLoaded` is false the provider stays in its loading state
  // (no fetch, no flash of the wrong tier). A client-side sign-in flips
  // isSignedIn and re-runs this effect, fetching the real plan.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setState({ ...DEFAULT_STATE, isLoading: false });
      hasLoadedRef.current = true;
      lastFetchRef.current = Date.now();
      return;
    }
    fetchSubscription();
  }, [isLoaded, isSignedIn, fetchSubscription]);
```

4. In the focus-revalidation effect, add the same gate after the window check (line 152) and extend the deps:

```ts
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Same Clerk gate as the initial fetch — anonymous tab-backs must not
    // re-trigger the 401.
    if (!isLoaded || !isSignedIn) return;
```

and change the closing dependency array (line 169) to:

```ts
  }, [fetchSubscription, isLoaded, isSignedIn]);
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/context/__tests__/SubscriptionProvider.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Check for collateral test breakage (components that render the provider indirectly)**

Run: `npx vitest run src/shared src/modules`
Expected: PASS — consumers use `useSubscription()`/`useSubscriptionContext()` which fall back to `DEFAULT_STATE` outside a provider; no component test mounts `SubscriptionProvider` itself. If any test fails on a missing `useAuth` mock, add `vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: false }) }))` to that file.

- [ ] **Step 6: Commit**

```bash
git add src/shared/context/SubscriptionProvider.tsx src/shared/context/__tests__/SubscriptionProvider.test.tsx
git commit -m "fix(sp-d/T6): SubscriptionProvider gates the fetch on Clerk auth — anon /chart no longer 401s"
```

---

### Task 7: Session recordings ON (masked) + `data-ph-mask` on birth-data forms + runbook (D6)

**Files:**
- Modify: `src/shared/components/PostHogProvider.tsx:98` (init options + `before_send` recording-URL scrubber next to the existing `stripPiiFromUrl` helper)
- Modify: `src/modules/astro-engine/components/BirthDataForm.tsx:160-165` (form root), `src/modules/astro-engine/components/HeroCalculator.tsx:413-418` (form root), `src/modules/astro-engine/components/BirthDataFormStandalone.tsx:69` (root div)
- Create: `docs/runbooks/session-recordings-enabled.md`
- Test: `src/shared/components/__tests__/PostHogProvider.test.tsx` (new describe), `src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx` + `__tests__/HeroCalculator.test.tsx` (1 attribute assertion each)

**Interfaces:**
- Consumes: posthog-js `session_recording: { maskAllInputs, maskTextSelector }` config; the existing consent gate (`initPostHog` only runs after `estrevia_cookie_consent === 'accepted'`, `PostHogProvider.tsx:127-128`) — recordings are therefore consent-gated with no extra work.
- Produces: masked recordings for consented sessions. `maskAllInputs` hides every typed value (birth date/time/city included); `[data-ph-mask]` masks TEXT surfaces that echo birth data back (posthog/rrweb applies the selector via `closest()`, so tagging the form containers masks all descendant text: DateInput calendar, TimePickerField labels, CityAutocomplete suggestions). NEITHER masks the recorded page URL — rrweb Meta/FullSnapshot payloads embed `window.location.href` and the replay player shows it, which on `/chart?bd=…&bt=…&place=…` is birth PII; a `before_send` hook (Step 4) scrubs URL properties on ALL events and rewrites the href inside `$snapshot` rrweb payloads, reusing the existing `PII_PARAMS` + `stripPiiFromUrl` (`PostHogProvider.tsx:74-84`). PII rule for the future: any new component echoing birth data as text must carry `data-ph-mask` — codified in the runbook.

- [ ] **Step 1: Write the failing PostHogProvider test**

Append to `src/shared/components/__tests__/PostHogProvider.test.tsx` (same init pattern as the "first-pageview locale" describe):

```ts
describe('PostHogProvider — session recording (masked)', () => {
  it('init enables recording with maskAllInputs + data-ph-mask text masking', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    hoisted.mockUsePathname.mockReturnValue('/en');
    window.localStorage.setItem('estrevia_cookie_consent', 'accepted');
    delete (window as unknown as Record<string, unknown>).posthog;

    render(<PostHogProvider><div /></PostHogProvider>);

    await waitFor(() => {
      expect(hoisted.mockInit).toHaveBeenCalledTimes(1);
    });

    const [, options] = hoisted.mockInit.mock.calls[0];
    expect(options.disable_session_recording).toBe(false);
    expect(options.session_recording).toEqual({
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
    });
  });

  it('before_send scrubs birth-PII params from URL props and rrweb snapshot hrefs', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    hoisted.mockUsePathname.mockReturnValue('/en');
    window.localStorage.setItem('estrevia_cookie_consent', 'accepted');
    delete (window as unknown as Record<string, unknown>).posthog;

    render(<PostHogProvider><div /></PostHogProvider>);

    await waitFor(() => {
      expect(hoisted.mockInit).toHaveBeenCalledTimes(1);
    });

    const [, options] = hoisted.mockInit.mock.calls[0];
    // sanitize_properties never runs on $snapshot events and the input/text
    // masks cannot reach the recorded URL — before_send is the PII gate.
    expect(typeof options.before_send).toBe('function');

    const piiUrl =
      'https://estrevia.app/en/chart?bd=1990-06-15&bt=14%3A30&lat=40.7128&lon=-74.006&place=New+York&tz=America%2FNew_York&utm_source=meta';
    const scrubbed = options.before_send({
      event: '$snapshot',
      properties: {
        $current_url: piiUrl,
        $session_entry_url: piiUrl,
        $snapshot_data: [
          // rrweb Meta event — its href is what the replay player's URL bar shows
          { type: 4, data: { href: piiUrl, width: 390, height: 844 } },
          // incremental event without href — must pass through untouched
          { type: 3, data: { source: 2 } },
        ],
      },
    });

    for (const url of [
      scrubbed.properties.$current_url,
      scrubbed.properties.$session_entry_url,
      scrubbed.properties.$snapshot_data[0].data.href,
    ] as string[]) {
      expect(url).not.toMatch(/[?&](bd|bt|lat|lon|place|tz|ktb)=/);
    }
    // Non-PII params survive the scrub (attribution stays intact).
    expect(scrubbed.properties.$current_url).toContain('utm_source=meta');
    // Events without URL props pass through unchanged.
    const plain = options.before_send({ event: 'paywall_opened', properties: { trigger: 'three-card' } });
    expect(plain.properties.trigger).toBe('three-card');
  });
});
```

- [ ] **Step 2: Write the failing attribute assertions**

Append to `src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx` (inside the existing describe, before its closing brace):

```ts
  it('tags the form root with data-ph-mask so session recordings mask birth-data text', () => {
    const { container } = renderForm();
    expect(container.querySelector('form')?.hasAttribute('data-ph-mask')).toBe(true);
  });
```

Append to `src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx` (inside the gate-state-machine describe):

```ts
  it('tags the hero form with data-ph-mask (session-recording text mask)', () => {
    const { container } = render(<HeroCalculator isSignedIn={false} />);
    expect(container.querySelector('form')?.hasAttribute('data-ph-mask')).toBe(true);
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/shared/components/__tests__/PostHogProvider.test.tsx src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`
Expected: FAIL — `disable_session_recording` is `true`, `session_recording` and `before_send` undefined; neither form has the attribute.

- [ ] **Step 4: Implement the init options + recording-URL scrubber**

In `src/shared/components/PostHogProvider.tsx`:

1. After the `stripPiiFromUrl` helper (line 84, still inside `initPostHog`), add the scrubber — recordings must NOT ship the raw page URL:

```ts
    // Recording-URL PII scrub (CLAUDE.md PII rule): enabling session
    // recording ships window.location.href inside rrweb $snapshot payloads,
    // and the replay player displays it — on /chart?bd=…&bt=…&place=… that
    // href IS birth PII. sanitize_properties never runs on $snapshot events,
    // and maskAllInputs/maskTextSelector cannot mask the recorded URL, so
    // scrub here, before anything leaves the browser. Reuses PII_PARAMS +
    // stripPiiFromUrl above.
    type RRWebEvent = { type: number; data?: { href?: unknown } & Record<string, unknown> };
    type CaptureEvent = { event?: string; properties?: Record<string, unknown> } | null;
    function scrubEventUrls(event: CaptureEvent): CaptureEvent {
      if (!event) return event;
      const props = event.properties ?? {};
      // Every event: strip PII params from URL-bearing properties
      // ($snapshot events carry $current_url/$session_entry_url that
      // sanitize_properties does not reach).
      for (const key of ['$current_url', '$session_entry_url', '$referrer', '$initial_referrer']) {
        if (key in props) props[key] = stripPiiFromUrl(props[key]);
      }
      // $snapshot events: rrweb Meta (type 4) carries the href the replay
      // player's URL bar shows; FullSnapshot (type 2) is scrubbed too,
      // defensively, in case the href appears in its payload.
      if (Array.isArray(props.$snapshot_data)) {
        for (const rr of props.$snapshot_data as RRWebEvent[]) {
          if (rr && (rr.type === 4 || rr.type === 2) && rr.data && typeof rr.data.href === 'string') {
            rr.data.href = stripPiiFromUrl(rr.data.href) as string;
          }
        }
      }
      event.properties = props;
      return event;
    }
```

2. Replace line 98 (`disable_session_recording: true,`):

```ts
      // Session recordings ON, masked — the "payers go silent on day one"
      // investigation needs them. maskAllInputs hides every typed value
      // (birth data included); maskTextSelector masks text inside elements
      // tagged data-ph-mask (birth-data form surfaces that echo PII back);
      // before_send (below) scrubs the recorded page URL itself.
      // Recording stays consent-gated: this init only runs after the cookie
      // banner is accepted, so decliners remain unrecorded.
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-ph-mask]',
      },
```

3. Add the hook to the same `posthog.init` options object, directly above `sanitize_properties` (cast only if the installed posthog-js typings demand it):

```ts
      // PII gate for recordings — see scrubEventUrls above.
      before_send: scrubEventUrls,
```

**Fallback (only if rewriting `$snapshot_data` proves impractical** — e.g. the installed posthog-js does not route `$snapshot` events through `before_send`): do NOT ship raw URLs anyway. Instead gate recording start on clean URLs: keep `disable_session_recording: true` at init and call `posthog.startSessionRecording()` only when `location.search` contains no `bd`/`bt` params — ChartDisplay's `router.replace` already cleans the URL after the mount-params calc, or strip the params via `history.replaceState` once the chart is loaded. Either way, T9 Step 3's replay-URL smoke check must pass before this task counts as done.

- [ ] **Step 5: Tag the birth-data form roots**

1. `src/modules/astro-engine/components/BirthDataForm.tsx` — form root (line 160):

```tsx
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={t('formAria')}
      // Session-recording text mask: birth date/time/place echoes (calendar,
      // time labels, city suggestions) must never appear in recordings.
      data-ph-mask
      className="w-full max-w-md space-y-5"
    >
```

2. `src/modules/astro-engine/components/HeroCalculator.tsx` — form root (line 413):

```tsx
      <form
        onSubmit={handleSubmit}
        noValidate
        // Session-recording text mask — see BirthDataForm.
        data-ph-mask
        className="w-full space-y-3 hc-form"
        aria-label={t('formAria')}
      >
```

3. `src/modules/astro-engine/components/BirthDataFormStandalone.tsx` — root div (line 69):

```tsx
    <div className="space-y-4" data-ph-mask="">
```

(Standalone has no test file; the attribute is covered by typecheck/lint and the prod smoke in Task 9.)

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/shared/components/__tests__/PostHogProvider.test.tsx src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`
Expected: PASS (all existing + 3 new)

- [ ] **Step 7: Write the runbook**

Create `docs/runbooks/session-recordings-enabled.md`:

```markdown
# Session Recordings — Enabled 2026-07 (SP-D, D6)

## What changed
`PostHogProvider` now initializes posthog-js with `disable_session_recording: false`,
`session_recording: { maskAllInputs: true, maskTextSelector: '[data-ph-mask]' }`,
and a `before_send` hook that scrubs birth-PII params out of recorded URLs.
Purpose: the CRO audit's open question — 100% of payers go silent after day one —
had zero investigation instrumentation. Recordings make it answerable.

## Masking rules (PII)
- `maskAllInputs: true` — every input value is masked, including birth date /
  time / place fields. Non-negotiable (CLAUDE.md PII rule).
- `[data-ph-mask]` — masks ALL descendant text of tagged elements. Currently
  tagged: `BirthDataForm` form root, `HeroCalculator` form root,
  `BirthDataFormStandalone` root (synastry). rrweb applies the selector via
  `closest()`, so tagging a container masks everything inside it.
- **Rule going forward:** any new component that echoes birth data back as
  TEXT (not an input) must carry `data-ph-mask` on its container.

## Recorded-URL scrub (PII)
- rrweb `$snapshot` payloads embed `window.location.href` and the replay
  player displays it — on `/chart?bd=…&bt=…&place=…` that href is birth PII.
  Neither `sanitize_properties` (never runs on `$snapshot` events) nor the
  input/text masks reach it.
- The `before_send` hook in `PostHogProvider.tsx` (`scrubEventUrls`) strips
  `PII_PARAMS` (`bd/bt/ktb/lat/lon/place/tz`) from `$current_url` /
  `$session_entry_url` / `$referrer` / `$initial_referrer` on ALL events and
  rewrites `data.href` on rrweb Meta (type 4) / FullSnapshot (type 2) events
  inside `$snapshot_data`.
- **Residual risk (accepted, documented):** the scrub targets known
  URL-bearing fields. If a future page renders the PII URL into DOM
  content itself (e.g. an anchor `href` or visible text echoing
  `location.href`), the FullSnapshot DOM serialization would carry it —
  tag such surfaces `data-ph-mask` or extend the scrubber. posthog-js
  upgrades can also change payload shapes; re-run the replay-URL smoke
  check (see Verification) after any posthog-js version bump.

## Verification
- After deploy: open a recorded `/chart` replay in PostHog → Session replay
  and confirm the player's URL bar shows NO `bd`/`bt`/`lat`/`lon`/`place`
  values (T9 Step 3 smoke item).

## Known blind spots (accepted)
- Recording is consent-gated: posthog-js only initializes after the cookie
  banner is accepted. Visitors (including payers) who decline consent are
  invisible to recordings. If day-one-silence analysis stays empty, check
  consent-acceptance rate before concluding "no sessions happened".
- Sessions before this deploy are not retroactively recoverable.

## Ops
- Quota: PostHog free tier includes 5,000 recordings/month — verify current
  usage in PostHog → Settings → Usage BEFORE the prod deploy and set a
  billing limit alert if close.
- Viewing: PostHog → Session replay. Filter by `plan`/`locale` person props.
- Kill switch: flip `disable_session_recording` back to `true` and redeploy
  (no data migration involved).
```

- [ ] **Step 8: Commit**

```bash
git add src/shared/components/PostHogProvider.tsx src/modules/astro-engine/components/BirthDataForm.tsx src/modules/astro-engine/components/HeroCalculator.tsx src/modules/astro-engine/components/BirthDataFormStandalone.tsx docs/runbooks/session-recordings-enabled.md src/shared/components/__tests__/PostHogProvider.test.tsx src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx
git commit -m "feat(sp-d/T7): masked session recordings + data-ph-mask on birth-data forms + runbook"
```

---

### Task 8: Full local gate

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: 0 failures (this plan adds ~19 tests; baseline 2276+ passing).

- [ ] **Step 2: Types + lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck clean; lint — no NEW issues in files this plan touched (`.claude/worktrees/**` noise is pre-existing).

- [ ] **Step 3: Commit any stragglers**

Only if Steps 1-2 forced fixes; otherwise nothing to commit.

---

### Task 9: Founder ops checklist (pre-deploy gate + post-deploy smoke)

**Files:** none (ops runbook — do not reorder)

- [ ] **Step 1: PostHog recording quota BEFORE deploy**

PostHog → Settings → Usage: confirm session-replay quota headroom (free tier: 5,000 recordings/mo) and set a usage alert. If the project is near quota, decide sampling (`session_recording.sampleRate`) BEFORE the deploy — do not ship unbounded recording into a quota wall.

- [ ] **Step 2: Push (founder-confirmed — shared-state action)**

Run: `git log origin/main..HEAD --oneline`, show the founder the list, and push only on explicit OK: `git push origin main`. Watch the Vercel deployment to READY.

- [ ] **Step 3: Post-deploy smoke (production)**

- Time-unknown honesty: calculate a chart on `/` (hero) and `/chart` (form) WITHOUT birth time → no Ascendant row in the table, no houses on the wheel, header shows "No houses (no birth time)" with NO "Placidus", AI-reading teaser does not lead with an Ascendant. Repeat once on `/es/chart`.
- Anon 401: open `/en/chart` in a fresh incognito window with devtools console → zero 401 entries.
- Gate: dismiss the email gate → recalculate in the same session (no gate) → close the browser, new session, recalculate → gate shows again; on open, focus is in the email input; new title/subtitle copy renders in EN and ES.
- Tarot: as a free user, draw 3 cards → click "AI interpretation" → PaywallModal opens; PostHog Live Events shows `paywall_opened` with `trigger: three-card`.
- Recording: after one consented session, a masked replay appears in PostHog → Session replay (birth-data fields/text unreadable).
- Recording URL scrub: calculate a chart via a `/chart?bd=…&bt=…` param URL in a consented session, then open that session's replay — the player's URL bar must show NO `bd`/`bt`/`lat`/`lon`/`place` values (the `before_send` scrubber working). If any PII param appears, recording ships PII — flip `disable_session_recording` back to `true` and redeploy before investigating.

- [ ] **Step 4: Log the known stale-data caveat**

Existing temp charts (≤7d TTL) and the handful of saved charts keep the fabricated noon Ascendant in stored `chartData` — accepted spec non-goal. If a user reports a "wrong rising sign disappeared", that's this fix working, not a regression.

---

## Self-review notes

- **Spec coverage:** D1 (time:null at 3 callsites + houseSystem-label suppression) → T1/T2/T3; D2 (sessionStorage re-arm + localStorage submit + `shouldShowGate` both stores) → T4; D3 (input focus + value-tease copy both locales) → T4; D4 (free tarot click → paywall) → T5; D5 (Clerk-gated subscription fetch) → T6; D6 (recordings on, masked + runbook + quota founder-note) → T7 + T9 step 1. Error-handling section: private-mode fall-through → T4 step 1 (sessionStorage-throw test) + reused catch pattern; useAuth-not-loaded → T6 test 2; dormant no-houses UI regression-tested → T3 tests. Success criteria all appear in T9's smoke.
- **Deviation (D6 mask targets):** the spec names "ChartDisplay header + settings" as PII-echo surfaces — verified NEITHER echoes birth data (ChartDisplay header shows only system/houses labels; settings has no birth-data section). The actual text-echo surfaces are the birth-data form containers (DateInput calendar, TimePickerField labels, CityAutocomplete suggestions), so `data-ph-mask` goes on the three form roots instead — strictly wider coverage than the spec's list.
- **Deviation (extension):** PositionTable's footer `"{houseSystem} houses"` (`PositionTable.tsx:256`) is the same fabricated-label class as ChartDisplay:336 and is suppressed in T3 — required by the success criterion "no houses anywhere".
- **Deliberately untouched hazards:** SynastryClient `'12:00'` form defaults (spec non-goal); stored charts with stale noon Ascendants (spec non-goal, documented T9 step 4); PositionTable's pre-existing hardcoded-English headers ("Planet"/"Sign"/…) — an i18n gap, not SP-D scope; EmailGateModal's `z-50` tie with the cookie banner (Phase 0 territory); consent-decliner invisibility in recordings (documented in the runbook, accepted).
- **Phase 0 T8 coordination:** ChartDisplay edits here are content-anchored and disjoint from T8's prop/state edits; both orders work (see Global Constraints).
