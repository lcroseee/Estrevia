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
