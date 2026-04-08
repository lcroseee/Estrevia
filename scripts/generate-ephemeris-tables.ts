/**
 * Build-time script: generates sidereal sign ingress dates for all planets.
 *
 * Run once at build time, re-run yearly to extend the 5-year window.
 * Output: src/modules/esoteric/data/ephemeris-tables.json (~50KB)
 *
 * Algorithm: iterate daily 2024-01-01 → 2028-12-31.
 * For each planet, compute sidereal longitude = tropical - ayanamsa.
 * Record a sign ingress whenever the sign index changes day-to-day.
 *
 * Moon special handling: only first ingress per calendar month is kept
 * to cap file size (Moon changes sign every ~2.5 days = 700+ entries otherwise).
 */

// Must be first import to set SE file path before any sweph calls
import '../src/modules/astro-engine/ephe-path';

import * as path from 'path';
import * as fs from 'fs';
import { calcPlanet, getAyanamsa } from '../src/modules/astro-engine/ephemeris';
import { dateToJulianDay } from '../src/modules/astro-engine/julian-day';
import { PLANET_TO_SWEPH_ID, SIGN_NAMES } from '../src/modules/astro-engine/constants';
import { Planet, Sign } from '../src/shared/types/astrology';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Ingress {
  sign: Sign;
  date: string;   // YYYY-MM-DD
  degree: number; // always 0.0 — entry at sign boundary
}

interface PlanetTable {
  ingresses: Ingress[];
}

interface EphemerisTables {
  generated: string;
  range: { start: string; end: string };
  planets: Partial<Record<Planet, PlanetTable>>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const START_DATE = new Date(Date.UTC(2024, 0, 1));  // 2024-01-01
const END_DATE   = new Date(Date.UTC(2028, 11, 31)); // 2028-12-31

// 10 planets: Sun → Pluto. NorthNode and Chiron excluded per task spec.
const TARGET_PLANETS: Planet[] = [
  Planet.Sun,
  Planet.Moon,
  Planet.Mercury,
  Planet.Venus,
  Planet.Mars,
  Planet.Jupiter,
  Planet.Saturn,
  Planet.Uranus,
  Planet.Neptune,
  Planet.Pluto,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateToISOString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getSiderealSign(julianDay: number, swephBodyId: number): number {
  const tropical = calcPlanet(julianDay, swephBodyId).longitude;
  const ayanamsa = getAyanamsa(julianDay);
  let sidereal = tropical - ayanamsa;
  // Normalize to [0, 360)
  sidereal = ((sidereal % 360) + 360) % 360;
  return Math.floor(sidereal / 30);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function generate(): EphemerisTables {
  const tables: EphemerisTables = {
    generated: new Date().toISOString(),
    range: { start: '2024-01-01', end: '2028-12-31' },
    planets: {},
  };

  // Build array of all dates in window
  const dates: Date[] = [];
  const cursor = new Date(START_DATE);
  while (cursor <= END_DATE) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  console.log(`Processing ${dates.length} days for ${TARGET_PLANETS.length} planets...`);

  for (const planet of TARGET_PLANETS) {
    const bodyId = PLANET_TO_SWEPH_ID[planet];
    const ingresses: Ingress[] = [];
    // For Moon: track which months we've already recorded an ingress
    const moonMonthsSeen = new Set<string>();

    let prevSignIndex = -1;

    for (const date of dates) {
      const jd = dateToJulianDay(date);
      let signIndex: number;

      try {
        signIndex = getSiderealSign(jd, bodyId);
      } catch (err) {
        // Skip days where sweph calculation fails (e.g. very fast planets at exact boundaries)
        console.warn(`  Warning: calcPlanet failed for ${planet} on ${dateToISOString(date)}: ${err}`);
        continue;
      }

      const signChanged = prevSignIndex !== -1 && signIndex !== prevSignIndex;
      prevSignIndex = signIndex;

      if (!signChanged) continue;

      const dateStr = dateToISOString(date);

      // Moon: limit to first ingress per month
      if (planet === Planet.Moon) {
        const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        if (moonMonthsSeen.has(monthKey)) continue;
        moonMonthsSeen.add(monthKey);
      }

      ingresses.push({
        sign: SIGN_NAMES[signIndex] as Sign,
        date: dateStr,
        degree: 0.0,
      });
    }

    tables.planets[planet] = { ingresses };
    console.log(`  ${planet.padEnd(8)}: ${ingresses.length} ingresses`);
  }

  return tables;
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const output = generate();

const outPath = path.resolve(
  __dirname,
  '../src/modules/esoteric/data/ephemeris-tables.json',
);

fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

const fileSizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`\nWritten to ${outPath} (${fileSizeKB} KB)`);
console.log(`Range: ${output.range.start} → ${output.range.end}`);
console.log(`Generated: ${output.generated}`);
