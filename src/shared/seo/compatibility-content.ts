/**
 * Server-only loader + readiness gate for enriched compatibility pairs (T7).
 *
 * fs lives here (not in the pure compatibility-pairs.ts) — same split as
 * sitemap-mtime.ts. A pair is "ready" (re-indexed + re-added to the sitemap)
 * only when BOTH locales pass isEnrichedLocaleValid(): 300+ words, 3+ sections,
 * 3+ FAQ, zero placeholder sentinel. Never import on the client.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ENRICHED_PAIRS,
  isEnrichedPair,
  isEnrichedLocaleValid,
  type EnrichedPairContent,
} from './compatibility-pairs';

const ENRICHED_DIR = path.join(process.cwd(), 'content', 'compatibility', 'enriched');

/** Parsed content for a pair, or null if the file is absent/invalid JSON. */
export function getEnrichedPairContent(pair: string): EnrichedPairContent | null {
  const file = path.join(ENRICHED_DIR, `${pair}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as EnrichedPairContent;
  } catch {
    return null;
  }
}

/** True iff `pair` is on the allowlist AND both locales are fully authored. */
export function isPairReady(pair: string): boolean {
  if (!isEnrichedPair(pair)) return false;
  const c = getEnrichedPairContent(pair);
  if (!c) return false;
  return isEnrichedLocaleValid(c.en) && isEnrichedLocaleValid(c.es);
}

/** Content for a ready pair (index-worthy), else null. Single call site helper. */
export function getReadyEnrichedPairContent(pair: string): EnrichedPairContent | null {
  return isPairReady(pair) ? getEnrichedPairContent(pair) : null;
}

/** The allowlisted pairs that currently pass validation (drives the sitemap). */
export function readyEnrichedPairs(): string[] {
  return ENRICHED_PAIRS.filter(isPairReady);
}
