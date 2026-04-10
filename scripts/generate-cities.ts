/**
 * Downloads GeoNames cities15000 dataset and generates data/cities15000.json
 * with ~24K cities (population >= 15,000), English names only.
 *
 * Usage: npx tsx scripts/generate-cities.ts
 */

import { createWriteStream, mkdirSync, existsSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';

const GEONAMES_URL = 'https://download.geonames.org/export/dump/cities15000.zip';
const OUTPUT_PATH = join(process.cwd(), 'data', 'cities15000.json');
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
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number;
}

// GeoNames TSV column indices
const COL = {
  NAME: 1,
  ASCII_NAME: 2,
  LATITUDE: 4,
  LONGITUDE: 5,
  COUNTRY_CODE: 8,
  POPULATION: 14,
  TIMEZONE: 17,
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

function parseTSV(content: string): City[] {
  const lines = content.split('\n');
  const cities: City[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const cols = line.split('\t');
    if (cols.length < 18) continue;

    const population = parseInt(cols[COL.POPULATION], 10);
    if (isNaN(population) || population < 15000) continue;

    const countryCode = cols[COL.COUNTRY_CODE].trim();
    const asciiName = cols[COL.ASCII_NAME].trim();

    // English only: both name and asciiName use the ASCII value
    cities.push({
      name: asciiName,
      asciiName: asciiName,
      country: getCountryName(countryCode),
      countryCode,
      latitude: parseFloat(cols[COL.LATITUDE]),
      longitude: parseFloat(cols[COL.LONGITUDE]),
      timezone: cols[COL.TIMEZONE].trim(),
      population,
    });
  }

  return cities;
}

async function main(): Promise<void> {
  // Setup tmp dir
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const zipPath = join(TMP_DIR, 'cities15000.zip');
  const txtPath = join(TMP_DIR, 'cities15000.txt');

  try {
    // Download
    await downloadFile(GEONAMES_URL, zipPath);

    // Unzip using execFileSync (no shell injection risk)
    console.log('Extracting...');
    execFileSync('unzip', ['-o', zipPath, 'cities15000.txt', '-d', TMP_DIR], { stdio: 'pipe' });

    // Parse
    console.log('Parsing TSV data...');
    const content = readFileSync(txtPath, 'utf-8');
    const cities = parseTSV(content);

    // Sort by population descending
    cities.sort((a, b) => b.population - a.population);

    console.log(`Parsed ${cities.length} cities with population >= 15,000`);

    // Spot checks
    const spotChecks = ['Moscow', 'Tokyo', 'New York City', 'Sao Paulo', 'London', 'Paris'];
    for (const name of spotChecks) {
      const found = cities.find((c) => c.asciiName.includes(name));
      console.log(`  ${found ? '✓' : '✗'} ${name}${found ? ` (pop: ${found.population.toLocaleString()})` : ' NOT FOUND'}`);
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
    try { execFileSync('rmdir', [TMP_DIR]); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
