/**
 * Swiss Ephemeris file path configuration.
 *
 * Sets the directory where sweph will look for .se1 asteroid ephemeris files.
 * Required for Chiron (seas_18.se1) — not included in Moshier built-in ephemeris.
 *
 * Files are stored in data/ephe/ at the project root.
 * On Vercel, these files are included in the deployment bundle via
 * outputFileTracingIncludes in next.config.ts:
 *   '/api/**': ['./data/ephe/**']
 *
 * IMPORTANT: This module must be imported before any calcPlanet() calls for
 * asteroid bodies (Chiron = SE_CHIRON = 15).
 *
 * FAIL-FAST: On module load we verify that seas_18.se1 is present and readable.
 * If it is missing (e.g., Vercel bundle misconfiguration) we throw immediately so
 * the deployment fails loudly rather than silently returning wrong Chiron positions.
 */

import * as sweph from 'sweph';
import path from 'path';
import { statSync } from 'fs';

// Use process.cwd() instead of __dirname because Turbopack rewrites __dirname
// to a virtual path that doesn't match the real filesystem layout.
const ephePath = path.resolve(process.cwd(), 'data/ephe');

sweph.set_ephe_path(ephePath);

// Runtime assertion: Chiron requires seas_18.se1 and sweph will silently
// return inaccurate data if the file is absent (no negative flag emitted).
// Fail immediately on startup so missing-file issues are caught at deploy time,
// not discovered via subtle position errors in production.
const chironFile = path.join(ephePath, 'seas_18.se1');
try {
  statSync(chironFile);
} catch {
  throw new Error(
    `[astro-engine] Chiron ephemeris file not found: ${chironFile}. ` +
    'Ensure data/ephe/seas_18.se1 is present in the deployment bundle. ' +
    'Check outputFileTracingIncludes in next.config.ts.',
  );
}
