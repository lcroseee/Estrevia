#!/usr/bin/env node
/**
 * SP-0 backfill: rewrite persisted natal_charts.chart_data so house cusps
 * carry both zodiac frames and planets are assigned against sidereal cusps.
 *
 * Deterministic from the row itself: `ayanamsa` lives inside the same
 * chart_data blob, so there is no ephemeris call and no decryption of
 * encrypted_birth_data. This script never reads PII.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   node scripts/backfill-house-frame-2026-08-04.mjs
 *   node scripts/backfill-house-frame-2026-08-04.mjs --apply
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes('--apply');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const norm = (d) => ((d % 360) + 360) % 360;

/** Mirrors absoluteToSignPosition: signDegree is the INTEGER degree in sign. */
function signPosition(absoluteDegree) {
  const deg = norm(absoluteDegree);
  const index = Math.floor(deg / 30);
  const degreeWithinSign = deg - index * 30;
  return { sign: SIGNS[index], signDegree: Math.floor(degreeWithinSign) };
}

/** Mirrors getPlanetHouse, reading the projected sidereal boundaries. */
function planetHouse(planetDegree, cusps) {
  const degree = norm(planetDegree);
  for (let i = 0; i < 12; i++) {
    const start = cusps[i].siderealDegree;
    const end = cusps[(i + 1) % 12].siderealDegree;
    if (start <= end) {
      if (degree >= start && degree < end) return cusps[i].house;
    } else if (degree >= start || degree < end) {
      return cusps[i].house;
    }
  }
  return 1;
}

export function migrate(chartData) {
  if (!chartData?.houses || !Array.isArray(chartData.houses)) return null;
  // Already migrated
  if (chartData.houses.some((c) => c && c.siderealDegree !== undefined)) return null;
  if (typeof chartData.ayanamsa !== 'number') return null;

  const ayanamsa = chartData.ayanamsa;
  const houses = chartData.houses.map((c, i) => {
    const tropicalDegree = c.degree;
    const siderealDegree = norm(tropicalDegree - ayanamsa);
    const pos = signPosition(siderealDegree);
    return {
      house: c.house ?? i + 1,
      siderealDegree,
      tropicalDegree,
      sign: pos.sign,
      signDegree: pos.signDegree,
    };
  });

  const planets = (chartData.planets ?? []).map((p) => ({
    ...p,
    house: planetHouse(p.absoluteDegree, houses),
  }));

  return { ...chartData, houses, planets };
}

// Allow importing `migrate` from a test without opening a DB connection.
if (process.argv[1] && process.argv[1].endsWith('backfill-house-frame-2026-08-04.mjs')) {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT id, status, chart_data FROM natal_charts
        WHERE chart_data->'houses' IS NOT NULL
          AND chart_data->'houses' != 'null'::jsonb`,
    );

    let migrated = 0;
    let skipped = 0;
    let housesChanged = 0;
    let planetsMoved = 0;

    for (const row of rows) {
      const next = migrate(row.chart_data);
      if (!next) { skipped++; continue; }

      const before = (row.chart_data.planets ?? []).map((p) => p.house);
      const after = next.planets.map((p) => p.house);
      const moved = after.filter((h, i) => h !== before[i]).length;
      if (moved > 0) housesChanged++;
      planetsMoved += moved;

      if (APPLY) {
        await pool.query('UPDATE natal_charts SET chart_data = $1 WHERE id = $2', [next, row.id]);
      }
      migrated++;
    }

    console.log(APPLY ? 'APPLIED' : 'DRY RUN');
    console.log(`  rows with houses      : ${rows.length}`);
    console.log(`  migrated              : ${migrated}`);
    console.log(`  skipped               : ${skipped} (no ayanamsa, or already migrated)`);
    console.log(`  charts with a change  : ${housesChanged}`);
    console.log(`  planet placements fixed: ${planetsMoved}`);
    if (!APPLY) console.log('\nRe-run with --apply to write.');
  } finally {
    await pool.end();
  }
}
