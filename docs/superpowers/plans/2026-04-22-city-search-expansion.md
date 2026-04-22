# City Search Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the bundled city dataset from ~24K (pop ≥ 15K) to ~50K (pop ≥ 5K) and surface the first-level administrative division (US state, French region, Russian oblast, etc.) in the birth-city autocomplete.

**Architecture:** Regenerate the static JSON dataset from GeoNames `cities5000.zip` joined with `admin1CodesASCII.txt`. Pass `admin1` through the existing `CitySearchResult` shape; append it to dropdown metadata and the selection label in `CityAutocomplete` and `BirthDataForm`. No runtime architecture changes — search stays in-memory, same API, same search algorithm.

**Tech Stack:** Node.js TSX script (`scripts/generate-cities.ts`), Next.js 16 App Router, TypeScript strict, Vitest for unit tests, GeoNames open dataset.

**Spec:** `docs/superpowers/specs/2026-04-22-city-search-expansion-design.md`

---

## File Structure

**Created:**
- `data/cities5000.json` — regenerated dataset (~13MB, ~50K cities with admin1)

**Modified:**
- `scripts/generate-cities.ts` — download cities5000 + admin1CodesASCII, join admin1
- `src/shared/types/api.ts` — add `admin1: string | null` to `CitySearchResult`
- `src/modules/astro-engine/cities.ts` — add `admin1` to `City` and search output, switch import path
- `src/modules/astro-engine/components/CityAutocomplete.tsx` — show admin1 in dropdown row; include admin1 in selection label
- `src/modules/astro-engine/components/BirthDataForm.tsx:75` — use the same label logic
- `tests/astro/cities.test.ts` — add admin1 assertions

**Deleted:**
- `data/cities15000.json` — replaced by `cities5000.json`

---

## Task 1: Add `admin1` field to `CitySearchResult` type

**Files:**
- Modify: `src/shared/types/api.ts:74-82`

- [ ] **Step 1: Add the field**

Replace lines 74-82 in `src/shared/types/api.ts` with:

```ts
export interface CitySearchResult {
  name: string;
  /** First-level administrative division (US state, French region, Russian oblast, etc.). Null for city-states or when GeoNames has no admin1 for the city. */
  admin1: string | null;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number;
}
```

- [ ] **Step 2: Verify TS compile surfaces the expected errors**

Run: `pnpm tsc --noEmit`

Expected: errors in `src/modules/astro-engine/cities.ts` (missing `admin1` in returned object). These get fixed in Task 4. Do not commit yet.

---

## Task 2: Rewrite `scripts/generate-cities.ts` to produce the new dataset

**Files:**
- Modify: `scripts/generate-cities.ts` (full rewrite)

- [ ] **Step 1: Replace the entire file**

Overwrite `scripts/generate-cities.ts` with:

```ts
/**
 * Downloads GeoNames cities5000 + admin1CodesASCII datasets and generates
 * data/cities5000.json with ~50K cities (population >= 5,000) joined with
 * first-level administrative division names (US state, French region, etc.).
 *
 * Usage: npx tsx scripts/generate-cities.ts
 */

import {
  createWriteStream,
  mkdirSync,
  existsSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';

const CITIES_URL = 'https://download.geonames.org/export/dump/cities5000.zip';
const ADMIN1_URL = 'https://download.geonames.org/export/dump/admin1CodesASCII.txt';
const OUTPUT_PATH = join(process.cwd(), 'data', 'cities5000.json');
const TMP_DIR = join(process.cwd(), '.tmp-geonames');

// Use Intl.DisplayNames for country code → English name (built into Node.js)
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function getCountryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

interface City {
  name: string;
  asciiName: string;
  admin1: string | null;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number;
}

// GeoNames cities TSV column indices
const COL = {
  NAME: 1,
  ASCII_NAME: 2,
  LATITUDE: 4,
  LONGITUDE: 5,
  COUNTRY_CODE: 8,
  ADMIN1_CODE: 10,
  POPULATION: 14,
  TIMEZONE: 17,
} as const;

// admin1CodesASCII.txt columns: [code, name, asciiName, geonameId]
const ADMIN1_COL = {
  CODE: 0,
  ASCII_NAME: 2,
} as const;

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }
  const fileStream = createWriteStream(dest);
  await pipeline(Readable.fromWeb(response.body as never), fileStream);
  console.log(`Downloaded to ${dest}`);
}

function parseAdmin1Map(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const code = cols[ADMIN1_COL.CODE].trim();
    const asciiName = cols[ADMIN1_COL.ASCII_NAME].trim();
    if (code && asciiName) map.set(code, asciiName);
  }
  return map;
}

function parseTSV(content: string, admin1Map: Map<string, string>): City[] {
  const lines = content.split('\n');
  const cities: City[] = [];
  let missingAdmin1 = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    const cols = line.split('\t');
    if (cols.length < 18) continue;

    const population = parseInt(cols[COL.POPULATION], 10);
    if (isNaN(population) || population < 5000) continue;

    const countryCode = cols[COL.COUNTRY_CODE].trim();
    const asciiName = cols[COL.ASCII_NAME].trim();
    const admin1Code = cols[COL.ADMIN1_CODE].trim();

    // Resolve admin1: null if code is empty, "00", or key isn't in the map
    let admin1: string | null = null;
    if (admin1Code && admin1Code !== '00') {
      const key = `${countryCode}.${admin1Code}`;
      const resolved = admin1Map.get(key);
      if (resolved) {
        admin1 = resolved;
      } else {
        missingAdmin1++;
      }
    }

    // English only: both name and asciiName use the ASCII value
    cities.push({
      name: asciiName,
      asciiName,
      admin1,
      country: getCountryName(countryCode),
      countryCode,
      latitude: parseFloat(cols[COL.LATITUDE]),
      longitude: parseFloat(cols[COL.LONGITUDE]),
      timezone: cols[COL.TIMEZONE].trim(),
      population,
    });
  }

  if (missingAdmin1 > 0) {
    console.warn(`  ⚠ ${missingAdmin1} cities had admin1Code present but unresolved in admin1CodesASCII.txt`);
  }

  return cities;
}

async function main(): Promise<void> {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const zipPath = join(TMP_DIR, 'cities5000.zip');
  const txtPath = join(TMP_DIR, 'cities5000.txt');
  const admin1Path = join(TMP_DIR, 'admin1CodesASCII.txt');

  try {
    // Download both files in parallel
    await Promise.all([
      downloadFile(CITIES_URL, zipPath),
      downloadFile(ADMIN1_URL, admin1Path),
    ]);

    // Unzip cities5000 using execFileSync (no shell injection risk)
    console.log('Extracting cities5000.zip...');
    execFileSync('unzip', ['-o', zipPath, 'cities5000.txt', '-d', TMP_DIR], { stdio: 'pipe' });

    // Build admin1 map
    console.log('Parsing admin1CodesASCII.txt...');
    const admin1Content = readFileSync(admin1Path, 'utf-8');
    const admin1Map = parseAdmin1Map(admin1Content);
    console.log(`  Loaded ${admin1Map.size} admin1 entries`);

    // Parse cities with admin1 join
    console.log('Parsing cities5000.txt...');
    const content = readFileSync(txtPath, 'utf-8');
    const cities = parseTSV(content, admin1Map);

    // Sort by population descending
    cities.sort((a, b) => b.population - a.population);

    console.log(`Parsed ${cities.length} cities with population >= 5,000`);

    // Spot checks — both dataset size and admin1 join correctness
    const spotChecks: Array<{ name: string; expectedAdmin1: string | null }> = [
      { name: 'Austin', expectedAdmin1: 'Texas' },
      { name: 'Lyon', expectedAdmin1: 'Auvergne-Rhone-Alpes' },
      { name: 'Moscow', expectedAdmin1: 'Moscow' },
      { name: 'Monaco', expectedAdmin1: null },
      { name: 'Tokyo', expectedAdmin1: 'Tokyo' },
      { name: 'New York City', expectedAdmin1: 'New York' },
    ];
    for (const { name, expectedAdmin1 } of spotChecks) {
      const found = cities.find((c) => c.asciiName === name);
      if (!found) {
        console.log(`  ✗ ${name} NOT FOUND`);
        continue;
      }
      const ok = found.admin1 === expectedAdmin1
        || (expectedAdmin1 !== null && found.admin1?.includes(expectedAdmin1.split('-')[0]));
      console.log(
        `  ${ok ? '✓' : '✗'} ${name} (pop: ${found.population.toLocaleString()}, admin1: ${JSON.stringify(found.admin1)}, expected: ${JSON.stringify(expectedAdmin1)})`,
      );
    }

    // Write output — compact JSON, one entry per line for git-friendliness
    console.log(`Writing ${OUTPUT_PATH}...`);
    const jsonLines = cities.map((c) => '  ' + JSON.stringify(c));
    const output = '[\n' + jsonLines.join(',\n') + '\n]\n';
    writeFileSync(OUTPUT_PATH, output, 'utf-8');

    console.log(`Done! ${cities.length} cities written to ${OUTPUT_PATH}`);
  } finally {
    // Cleanup
    try { unlinkSync(zipPath); } catch { /* ignore */ }
    try { unlinkSync(txtPath); } catch { /* ignore */ }
    try { unlinkSync(admin1Path); } catch { /* ignore */ }
    try { execFileSync('rmdir', [TMP_DIR]); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the script compiles**

Run: `pnpm tsc --noEmit --skipLibCheck scripts/generate-cities.ts`

Expected: no errors. If the root `tsconfig.json` doesn't include `scripts/`, ignore this step — the script runs via `tsx` which does its own transpile. Move on.

---

## Task 3: Run the script and produce the new dataset

**Files:**
- Create: `data/cities5000.json`
- Delete: `data/cities15000.json`

- [ ] **Step 1: Run the generator**

Run: `npx tsx scripts/generate-cities.ts`

Expected output (exact counts may drift slightly as GeoNames updates):
```
Downloading https://download.geonames.org/export/dump/cities5000.zip...
Downloaded to .../.tmp-geonames/cities5000.zip
Downloading https://download.geonames.org/export/dump/admin1CodesASCII.txt...
Downloaded to .../.tmp-geonames/admin1CodesASCII.txt
Extracting cities5000.zip...
Parsing admin1CodesASCII.txt...
  Loaded ~4000 admin1 entries
Parsing cities5000.txt...
Parsed ~50000 cities with population >= 5,000
  ✓ Austin (pop: 961,855, admin1: "Texas", expected: "Texas")
  ✓ Lyon (pop: ~520,000, admin1: "Auvergne-Rhone-Alpes", expected: "Auvergne-Rhone-Alpes")
  ✓ Moscow (pop: ~10,381,222, admin1: "Moscow", expected: "Moscow")
  ✓ Monaco (pop: ~36,000, admin1: null, expected: null)
  ✓ Tokyo (pop: ~8,336,599, admin1: "Tokyo", expected: "Tokyo")
  ✓ New York City (pop: ~8,175,133, admin1: "New York", expected: "New York")
Done! ~50000 cities written to data/cities5000.json
```

If any spot check fails (`✗`), investigate — do not proceed. The old `data/cities15000.json` is intentionally left in place; it gets removed during the commit step (Task 8) so that `cities.ts` (still importing the old path until Task 4) never sees a broken state mid-flow.

- [ ] **Step 2: Verify file size and shape**

Run:
```bash
ls -lh data/cities5000.json
head -3 data/cities5000.json
```

Expected:
- `cities5000.json` size ~13MB
- First data line includes an `"admin1":` key (value may be string or null)

---

## Task 4: Update cities module + add admin1 tests (TDD)

**Files:**
- Modify: `tests/astro/cities.test.ts` — add test cases at end of describe block
- Modify: `src/modules/astro-engine/cities.ts` — full rewrite

- [ ] **Step 1: Add failing tests**

Append these test cases inside the `describe('searchCities', ...)` block in `tests/astro/cities.test.ts`, immediately before the closing `});` on line 90:

```ts
  it('"Austin" returns Austin, Texas as top US result', () => {
    const results = searchCities('Austin', 10);
    const austin = results.find((r) => r.countryCode === 'US');
    expect(austin).toBeDefined();
    expect(austin?.admin1).toBe('Texas');
  });

  it('"Lyon" returns Lyon with its French region in admin1', () => {
    const results = searchCities('Lyon', 5);
    const lyon = results.find((r) => r.countryCode === 'FR');
    expect(lyon).toBeDefined();
    expect(lyon?.admin1).toBeTruthy();
    expect(lyon?.admin1).toMatch(/Auvergne/i);
  });

  it('"Monaco" returns Monaco with admin1 = null (city-state)', () => {
    const results = searchCities('Monaco', 5);
    const monaco = results.find((r) => r.countryCode === 'MC');
    expect(monaco).toBeDefined();
    expect(monaco?.admin1).toBeNull();
  });

  it('admin1 field is present on every result (string or null)', () => {
    const results = searchCities('Berlin', 5);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty('admin1');
      expect(r.admin1 === null || typeof r.admin1 === 'string').toBe(true);
    }
  });
```

- [ ] **Step 2: Run the new tests — verify they fail**

Run: `pnpm test -- tests/astro/cities.test.ts`

Expected: the 4 new tests fail (either type error because `admin1` doesn't exist on the returned object, or `undefined` where a string is expected). The 12 original tests still pass.

- [ ] **Step 3: Update the cities module**

Replace the entire contents of `src/modules/astro-engine/cities.ts` with:

```ts
import type { CitySearchResult } from '@/shared/types/api';
import citiesData from '../../../data/cities5000.json';

export interface City {
  name: string;
  asciiName: string;
  admin1: string | null;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number;
}

// Typed reference to the JSON dataset — loaded once at module init (Node.js caches require/import)
const cities: City[] = citiesData as City[];

/**
 * Search cities by prefix match on asciiName or name.
 * Matching is case-insensitive. Results are sorted by population descending.
 *
 * @param query - Search string, minimum 2 characters
 * @param limit - Maximum number of results to return (default 5)
 * @returns Array of CitySearchResult sorted by population descending
 */
export function searchCities(query: string, limit: number = 5): CitySearchResult[] {
  if (query.length < 2) {
    return [];
  }

  const q = query.toLowerCase();

  const matches = cities.filter((city) => {
    // Primary: case-insensitive prefix match on ASCII name
    if (city.asciiName.toLowerCase().startsWith(q)) return true;
    // Secondary: case-insensitive prefix match on native name (for non-ASCII cities like Москва)
    if (city.name.toLowerCase().startsWith(q)) return true;
    // Tertiary: substring match anywhere in asciiName for partial queries
    if (city.asciiName.toLowerCase().includes(q)) return true;
    return false;
  });

  // Sort by population descending
  matches.sort((a, b) => b.population - a.population);

  return matches.slice(0, limit).map((city) => ({
    name: city.name,
    admin1: city.admin1,
    country: city.country,
    countryCode: city.countryCode,
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: city.timezone,
    population: city.population,
  }));
}
```

- [ ] **Step 4: Run the full cities test file — verify all pass**

Run: `pnpm test -- tests/astro/cities.test.ts`

Expected: all 16 tests pass (12 original + 4 new).

---

## Task 5: Update `CityAutocomplete` dropdown row and selection label

**Files:**
- Modify: `src/modules/astro-engine/components/CityAutocomplete.tsx:107-118` (selectCity callback)
- Modify: `src/modules/astro-engine/components/CityAutocomplete.tsx:260-272` (dropdown row JSX)

- [ ] **Step 1: Update the `selectCity` callback**

In `src/modules/astro-engine/components/CityAutocomplete.tsx`, find lines 107-118 and replace with:

```tsx
  const selectCity = useCallback(
    (city: CitySearchResult) => {
      const label = city.admin1
        ? `${city.name}, ${city.admin1}, ${city.country}`
        : `${city.name}, ${city.country}`;
      setQuery(label);
      onChange?.(label);
      setResults([]);
      setIsOpen(false);
      setActiveIndex(-1);
      onCitySelect(city);
    },
    [onCitySelect, onChange]
  );
```

- [ ] **Step 2: Update the dropdown row metadata line**

In the same file, find the `<span className="truncate text-xs text-white/40 leading-snug">` block around lines 264-271 and replace its body with:

```tsx
              <span className="truncate text-xs text-white/40 leading-snug">
                {city.admin1 ? `${city.admin1} · ${city.country}` : city.country}
                {city.population > 0 && (
                  <span className="font-mono tabular-nums">
                    {' · '}{formatPopulation(city.population)}
                  </span>
                )}
              </span>
```

- [ ] **Step 3: TypeScript check**

Run: `pnpm tsc --noEmit`

Expected: no errors related to `admin1`.

---

## Task 6: Update `BirthDataForm` label

**Files:**
- Modify: `src/modules/astro-engine/components/BirthDataForm.tsx:72-77`

- [ ] **Step 1: Read the current handleCitySelect**

Run: `sed -n '70,80p' src/modules/astro-engine/components/BirthDataForm.tsx`

Confirm line 75 contains: `cityLabel: \`${city.name}, ${city.country}\`,`

- [ ] **Step 2: Replace the label assignment**

Find this block in `src/modules/astro-engine/components/BirthDataForm.tsx`:

```tsx
  const handleCitySelect = useCallback((city: CitySearchResult) => {
    setForm((prev) => ({
      ...prev,
      cityLabel: `${city.name}, ${city.country}`,
```

Replace with:

```tsx
  const handleCitySelect = useCallback((city: CitySearchResult) => {
    setForm((prev) => ({
      ...prev,
      cityLabel: city.admin1
        ? `${city.name}, ${city.admin1}, ${city.country}`
        : `${city.name}, ${city.country}`,
```

- [ ] **Step 3: TypeScript check**

Run: `pnpm tsc --noEmit`

Expected: no errors.

---

## Task 7: Check other callers for regressions

**Files (read-only audit):**
- `src/modules/astro-engine/components/HeroCalculator.tsx` — uses only `city.name` (line 161), no change needed
- `src/modules/astro-engine/components/BirthDataFormStandalone.tsx`
- `src/modules/astro-engine/components/PlanetaryHoursGrid.tsx`
- `src/modules/astro-engine/components/SynastryClient.tsx`

- [ ] **Step 1: Grep every `handleCitySelect` / `onCitySelect` implementation**

Run: `grep -rn "handleCitySelect\|onCitySelect=" src/modules/astro-engine/components/`

- [ ] **Step 2: For each hit, confirm it only reads `name/latitude/longitude/timezone` OR produces a label we intentionally leave short**

HeroCalculator keeps bare `city.name` — intentional (hero card's selected-city chip is short by design).

For any other component that builds a full label like `${city.name}, ${city.country}`, update it with the same admin1-aware expression from Task 6 Step 2. If no other component does this, skip.

- [ ] **Step 3: TypeScript check**

Run: `pnpm tsc --noEmit`

Expected: no errors.

---

## Task 8: Full verification and commit

- [ ] **Step 1: Full type check**

Run: `pnpm tsc --noEmit`

Expected: zero errors.

- [ ] **Step 2: Full unit test suite**

Run: `pnpm test -- --run`

Expected: all tests pass (including the 4 new admin1 tests). No failures.

- [ ] **Step 3: Start dev server and sanity-check the homepage**

Run (background): `pnpm dev`

Open `http://localhost:3000/en` in a browser. In the hero calculator city input:

1. Type `Austin` — top US result shows "Austin" with "Texas · United States · 960K" on the second line.
2. Type `Lyon` — Lyon, France shows with admin1 containing "Auvergne".
3. Type `Monaco` — Monaco shows with just "Monaco · 36K" (no admin1 duplication).
4. Type `Москва` — empty (dataset is English-only, unchanged behavior).
5. Select Austin — the input fills with `Austin, Texas, United States`.
6. Pick a date, submit the form — the chart calculates successfully (no 500, no validation error).

Stop the dev server when done (Ctrl+C).

- [ ] **Step 4: Remove the stale dataset and stage everything for the commit**

```bash
git rm data/cities15000.json
git add \
  data/cities5000.json \
  scripts/generate-cities.ts \
  src/shared/types/api.ts \
  src/modules/astro-engine/cities.ts \
  src/modules/astro-engine/components/CityAutocomplete.tsx \
  src/modules/astro-engine/components/BirthDataForm.tsx \
  tests/astro/cities.test.ts
git status
```

If any other components were updated in Task 7, add them too.

Expected `git status`:
- modified: `scripts/generate-cities.ts`, `src/shared/types/api.ts`, `src/modules/astro-engine/cities.ts`, `src/modules/astro-engine/components/CityAutocomplete.tsx`, `src/modules/astro-engine/components/BirthDataForm.tsx`, `tests/astro/cities.test.ts`
- new file: `data/cities5000.json`
- deleted: `data/cities15000.json`

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(cities): expand to cities5000 with admin1 region names

Bumps the bundled city dataset from cities15000 (~24K cities, pop ≥ 15K)
to cities5000 (~50K, pop ≥ 5K) and joins first-level admin division
names from admin1CodesASCII so "Austin, Texas, United States" shows
instead of "Austin, United States".

- scripts/generate-cities.ts now downloads both cities5000.zip and
  admin1CodesASCII.txt, joins on "US.TX" → "Texas" keys
- CitySearchResult gains admin1: string | null
- CityAutocomplete and BirthDataForm show/store the richer label
- 4 new tests cover admin1 for Austin, Lyon, Monaco, and shape

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds; pre-commit hooks (if any) pass.
