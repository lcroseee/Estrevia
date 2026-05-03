import { describe, it, expect } from 'vitest';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

/**
 * Recursively flattens a nested object into a list of dot-separated key paths.
 * Stops descending at non-object values.
 */
function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const next = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) {
      return flattenKeys(v, next);
    }
    return [next];
  });
}

/**
 * KNOWN_DRIFT — pre-existing parity violations not in scope of Cluster A.
 *
 * Populate empirically on first run: any keys this test reports as missing
 * BEFORE Cluster A added new keys are baseline drift, to be cleaned up in a
 * follow-up commit outside this plan. Keys added in T1 (Cluster A) MUST
 * NOT be added here — they should be present on both sides.
 *
 * After cleanup commit, this set should be emptied.
 */
const KNOWN_DRIFT: ReadonlySet<string> = new Set<string>([
  // Populated empirically on first run (Step 5.3) if pre-existing drift exists.
]);

describe('i18n key parity — messages/en.json ↔ messages/es.json', () => {
  const enKeys = new Set(flattenKeys(en));
  const esKeys = new Set(flattenKeys(es));

  it('every EN key exists in ES (no missing translations)', () => {
    const missing = [...enKeys].filter(
      (k) => !esKeys.has(k) && !KNOWN_DRIFT.has(k),
    );
    expect(missing, `Missing in es.json: ${missing.join(', ')}`).toEqual([]);
  });

  it('every ES key exists in EN (no orphan translations)', () => {
    const missing = [...esKeys].filter(
      (k) => !enKeys.has(k) && !KNOWN_DRIFT.has(k),
    );
    expect(missing, `Missing in en.json: ${missing.join(', ')}`).toEqual([]);
  });
});

/**
 * Invariant from T1 quality review: when both `og.title` (single-line) and
 * `og.titleLine1` + `og.titleLine2` (Stories 2-line layout) are stored
 * separately, they must be derivable from each other (joined by space) so
 * future translator updates can't silently desync them.
 */
describe('i18n invariants — share.passport.og title decomposition', () => {
  function get(o: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((x, k) => {
      if (x && typeof x === 'object' && k in x) {
        return (x as Record<string, unknown>)[k];
      }
      return undefined;
    }, o);
  }

  for (const [locale, catalog] of [['en', en], ['es', es]] as const) {
    it(`${locale}: og.title === og.titleLine1 + ' ' + og.titleLine2`, () => {
      const title = get(catalog, 'share.passport.og.title');
      const line1 = get(catalog, 'share.passport.og.titleLine1');
      const line2 = get(catalog, 'share.passport.og.titleLine2');
      expect(typeof title).toBe('string');
      expect(typeof line1).toBe('string');
      expect(typeof line2).toBe('string');
      expect(title).toBe(`${line1} ${line2}`);
    });
  }
});
