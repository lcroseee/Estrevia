import data from '../../../../content/correspondences/777.json';
import type { Sign, Planet } from '@/shared/types/astrology';

export interface CorrespondenceColor {
  king: string;
  queen: string;
  prince: string;
  princess: string;
}

export interface Correspondence {
  path: number;
  hebrewLetter: string;
  hebrewSymbol: string;
  meaning: string;
  tarotTrump: string;
  tarotNumber: number;
  element: string | null;
  zodiacOrPlanet: string | null;
  color: CorrespondenceColor;
  stone: string;
  perfume: string;
  plant: string;
  animal: string;
  astrologicalAttribution: string;
}

export interface Sephira {
  path: number;
  name: string;
  meaning: string;
  planet: string | null;
  element: string | null;
  zodiacOrPlanet: string;
  color: CorrespondenceColor;
  stone: string;
  perfume: string;
  plant: string;
  animal: string;
  astrologicalAttribution: string;
}

// Sign → path number mapping (Golden Dawn / 777 attributions)
const SIGN_TO_PATH: Record<string, number> = {
  Aries: 15,       // Heh
  Taurus: 16,      // Vav
  Gemini: 17,      // Zayin
  Cancer: 18,      // Cheth
  Leo: 19,         // Teth
  Virgo: 20,       // Yod
  Libra: 22,       // Lamed
  Scorpio: 24,     // Nun
  Sagittarius: 25, // Samekh
  Capricorn: 26,   // Ayin
  Aquarius: 28,    // Tzaddi
  Pisces: 29,      // Qoph
};

// Planet → Sephira number mapping (Golden Dawn / 777 attributions)
const PLANET_TO_SEPHIRA: Record<string, number> = {
  Saturn: 3,   // Binah
  Jupiter: 4,  // Chesed
  Mars: 5,     // Geburah
  Sun: 6,      // Tiphareth
  Venus: 7,    // Netzach
  Mercury: 8,  // Hod
  Moon: 9,     // Yesod
};

const pathsMap = new Map<number, Correspondence>(
  (data.paths as Correspondence[]).map((p) => [p.path, p])
);

const sephirothMap = new Map<number, Sephira>(
  (data.sephiroth as Sephira[]).map((s) => [s.path, s])
);

/**
 * Returns the 777 path correspondence for a zodiac sign.
 * Maps the sign to its Golden Dawn path (paths 11–32).
 */
export function getBySign(sign: Sign): Correspondence | null {
  const pathNumber = SIGN_TO_PATH[sign as string];
  if (pathNumber === undefined) return null;
  return pathsMap.get(pathNumber) ?? null;
}

/**
 * Returns the Sephira correspondence for a planet.
 * The seven classical planets each correspond to a Sephira (paths 3–9).
 * Outer planets (Uranus, Neptune, Pluto) and modern bodies
 * (NorthNode, Chiron) have no traditional Sephira assignment in 777.
 */
export function getByPlanet(planet: Planet): Sephira | null {
  const sephiraNumber = PLANET_TO_SEPHIRA[planet as string];
  if (sephiraNumber === undefined) return null;
  return sephirothMap.get(sephiraNumber) ?? null;
}

/**
 * Returns a path (11–32) by its number, or null if not found.
 */
export function getByPath(pathNumber: number): Correspondence | null {
  return pathsMap.get(pathNumber) ?? null;
}

/**
 * Returns a Sephira (1–10) by its number, or null if not found.
 */
export function getBySephira(sephiraNumber: number): Sephira | null {
  return sephirothMap.get(sephiraNumber) ?? null;
}

/**
 * Returns all 22 paths (11–32), sorted by path number.
 */
export function getAllPaths(): Correspondence[] {
  return [...pathsMap.values()].sort((a, b) => a.path - b.path);
}

/**
 * Returns all 10 Sephiroth (1–10), sorted by path number.
 */
export function getAllSephiroth(): Sephira[] {
  return [...sephirothMap.values()].sort((a, b) => a.path - b.path);
}
