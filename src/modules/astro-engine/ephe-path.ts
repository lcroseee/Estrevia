/**
 * Swiss Ephemeris file path configuration.
 *
 * Sets the directory where sweph will look for .se1 asteroid ephemeris files.
 * Required for Chiron (seas_18.se1) — not included in Moshier built-in ephemeris.
 *
 * Files are stored in data/ephe/ at the project root.
 * On Vercel, this path resolves to the deployment bundle's data directory.
 *
 * IMPORTANT: This module must be imported before any calcPlanet() calls for
 * asteroid bodies (Chiron = SE_CHIRON = 15).
 */

import * as sweph from 'sweph';
import path from 'path';

// Use process.cwd() instead of __dirname because Turbopack rewrites __dirname
// to a virtual path that doesn't match the real filesystem layout.
const ephePath = path.resolve(process.cwd(), 'data/ephe');

sweph.set_ephe_path(ephePath);
