/**
 * Synastry compatibility scoring.
 *
 * Converts raw synastry aspects into human-readable category scores (0-100).
 * Uses sigmoid normalization so that a reasonable range of raw scores
 * maps smoothly to the 0-100% range.
 */

import type { SynastryAspect } from './synastry';

// ---------------------------------------------------------------------------
// Configuration — configurable weights, not hardcoded magic numbers
// ---------------------------------------------------------------------------

export interface CategoryConfig {
  label: string;
  /** Planet pairs that belong to this category: [chart1Planet, chart2Planet] */
  pairs: [string, string][];
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  emotional: {
    label: 'Emotional Connection',
    pairs: [
      ['Moon', 'Moon'],
      ['Moon', 'Venus'],
      ['Venus', 'Moon'],
    ],
  },
  communication: {
    label: 'Communication',
    pairs: [
      ['Mercury', 'Mercury'],
      ['Mercury', 'Moon'],
      ['Moon', 'Mercury'],
    ],
  },
  passion: {
    label: 'Passion',
    pairs: [
      ['Mars', 'Venus'],
      ['Venus', 'Mars'],
      ['Mars', 'Mars'],
    ],
  },
  stability: {
    label: 'Long-term Stability',
    pairs: [
      ['Saturn', 'Sun'],
      ['Sun', 'Saturn'],
      ['Saturn', 'Moon'],
      ['Moon', 'Saturn'],
    ],
  },
  growth: {
    label: 'Growth',
    pairs: [
      ['Jupiter', 'Sun'],
      ['Sun', 'Jupiter'],
      ['Jupiter', 'Moon'],
      ['Moon', 'Jupiter'],
    ],
  },
};

/** Base weights for each aspect type */
export const ASPECT_WEIGHTS: Record<string, number> = {
  Conjunction: 10,
  Trine: 8,
  Sextile: 5,
  Square: -6,
  Opposition: -3,
  Quincunx: -2,
  SemiSextile: 2,
};

/**
 * Planet pairs where conjunction is challenging rather than harmonious.
 * For these pairs, the conjunction weight is flipped to negative.
 */
const CHALLENGING_CONJUNCTIONS: [string, string][] = [
  ['Saturn', 'Moon'],
  ['Moon', 'Saturn'],
  ['Saturn', 'Venus'],
  ['Venus', 'Saturn'],
  ['Mars', 'Saturn'],
  ['Saturn', 'Mars'],
  ['Pluto', 'Moon'],
  ['Moon', 'Pluto'],
  ['Pluto', 'Venus'],
  ['Venus', 'Pluto'],
];

// ---------------------------------------------------------------------------
// Scoring types
// ---------------------------------------------------------------------------

export interface CategoryScore {
  /** Category key (e.g., "emotional") */
  category: string;
  /** Human-readable label (e.g., "Emotional Connection") */
  label: string;
  /** Normalized score 0-100 */
  score: number;
  /** Number of aspects contributing to this category */
  aspectCount: number;
}

export interface SynastryScores {
  /** Overall compatibility score 0-100 */
  overall: number;
  /** Per-category breakdown */
  categories: CategoryScore[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Check if a conjunction between two planets is challenging.
 */
function isChallengingConjunction(planet1: string, planet2: string): boolean {
  return CHALLENGING_CONJUNCTIONS.some(
    ([a, b]) => a === planet1 && b === planet2,
  );
}

/**
 * Get the score contribution of a single aspect.
 * Conjunction weight is negative for challenging planet pairs.
 */
function getAspectScore(aspect: SynastryAspect): number {
  const baseWeight = ASPECT_WEIGHTS[aspect.aspect] ?? 0;

  // Flip conjunction to negative for challenging pairs
  if (aspect.aspect === 'Conjunction' && isChallengingConjunction(aspect.planet1, aspect.planet2)) {
    return -5; // Challenging conjunction: reduced negative impact vs. full flip
  }

  // Tighter orbs get higher scores — scale linearly from 100% at 0° orb to 50% at max orb
  const orbFactor = Math.max(0.5, 1 - aspect.orb / 16);

  return baseWeight * orbFactor;
}

/**
 * Sigmoid normalization: maps any real number to (0, 100).
 * k controls the steepness. With k=10, raw scores in [-30, 30] map to [5, 95].
 */
function sigmoid(rawScore: number, k: number = 10): number {
  return 100 / (1 + Math.exp(-rawScore / k));
}

/**
 * Check if an aspect matches a planet pair definition.
 * planet1 comes from chart1, planet2 comes from chart2.
 */
function aspectMatchesPair(
  aspect: SynastryAspect,
  pair: [string, string],
): boolean {
  return aspect.planet1 === pair[0] && aspect.planet2 === pair[1];
}

/**
 * Calculate compatibility scores from synastry aspects.
 *
 * For each category:
 * 1. Filter aspects matching the category's planet pairs.
 * 2. Sum weighted scores (conjunction weight depends on whether it's challenging).
 * 3. Apply sigmoid normalization to map raw sum to 0-100.
 *
 * Overall score = weighted average of category scores.
 */
export function calculateCompatibilityScores(
  aspects: SynastryAspect[],
): SynastryScores {
  const categories: CategoryScore[] = [];

  for (const [key, config] of Object.entries(CATEGORY_CONFIG)) {
    // Find all aspects that belong to this category
    const matchingAspects = aspects.filter((aspect) =>
      config.pairs.some((pair) => aspectMatchesPair(aspect, pair)),
    );

    // Sum raw scores
    const rawScore = matchingAspects.reduce(
      (sum, aspect) => sum + getAspectScore(aspect),
      0,
    );

    // Normalize to 0-100 via sigmoid
    // When no aspects match, raw = 0 → sigmoid(0) = 50 (neutral baseline)
    const score = Math.round(sigmoid(rawScore) * 10) / 10;

    categories.push({
      category: key,
      label: config.label,
      score,
      aspectCount: matchingAspects.length,
    });
  }

  // Overall = weighted average of category scores.
  // Categories with more aspects get slightly more weight.
  const totalAspects = categories.reduce((sum, c) => sum + Math.max(c.aspectCount, 1), 0);
  const overall =
    categories.reduce(
      (sum, c) => sum + c.score * Math.max(c.aspectCount, 1),
      0,
    ) / totalAspects;

  return {
    overall: Math.round(overall * 10) / 10,
    categories,
  };
}
