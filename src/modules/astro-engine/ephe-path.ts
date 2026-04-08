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

// Resolve path relative to this file's location:
// src/modules/astro-engine/ → ../../../data/ephe
const ephePath = path.resolve(__dirname, '../../../data/ephe');

sweph.set_ephe_path(ephePath);
