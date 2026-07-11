// @vitest-environment node
//
// SP-E i18n completeness / parity guard.
//
// This test owns the message-file contract for the whole SP-E copy plan:
// every key touched by SP-E T2/T3/T5/T7/T8/T9 must exist in BOTH `en.json`
// and `es.json`, retired keys must be gone from both, and the phantom "Star"
// tier must not appear in either locale's paywall eyebrow.
//
// It is intentionally value-agnostic where the briefs already pin exact strings
// in their own component-level tests — here we assert presence/parity plus the
// two policy invariants (no NASA claim in the proof line; no "Star" tier).
import { describe, it, expect } from 'vitest';
import enMessages from '../../../../messages/en.json';
import esMessages from '../../../../messages/es.json';

type Tree = { [k: string]: Tree | string };
const en = enMessages as unknown as Tree;
const es = esMessages as unknown as Tree;

function get(tree: Tree, path: string): string | undefined {
  let node: Tree | string | undefined = tree;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === undefined || node === null) {
      return undefined;
    }
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

// Keys added or rewritten by SP-E — each must be a non-empty string in BOTH locales.
const PRESENT_IN_BOTH = [
  'landing.heroSubtext', // T2 rewrite
  'landing.heroProof', // T2 new
  'landing.heroTrust', // T2 rewrite
  'landing.statsHeading', // T3 reframe
  'pricing.heading', // T5 rewrite
  'pricing.subheading', // T5 rewrite
  'paywall.cta.eyebrow', // T7 reframe
  'paywall.cta.subline.synastryAi', // T8 rewrite
  'essays.unlockFull', // T9 new
];

// Keys retired by SP-E — must be ABSENT from BOTH locales.
const ABSENT_IN_BOTH = [
  'essays.readMore', // T9 retired (renamed to unlockFull)
];

describe('SP-E message-key parity (T2/T3/T5/T7/T8/T9)', () => {
  it.each(PRESENT_IN_BOTH)('%s exists as a non-empty string in EN', (path) => {
    const v = get(en, path);
    expect(v, `en.json missing ${path}`).toBeTypeOf('string');
    expect(v!.trim().length, `en.json ${path} is empty`).toBeGreaterThan(0);
  });

  it.each(PRESENT_IN_BOTH)('%s exists as a non-empty string in ES', (path) => {
    const v = get(es, path);
    expect(v, `es.json missing ${path}`).toBeTypeOf('string');
    expect(v!.trim().length, `es.json ${path} is empty`).toBeGreaterThan(0);
  });

  it.each(ABSENT_IN_BOTH)('%s is retired from BOTH locales', (path) => {
    expect(get(en, path), `en.json still has retired ${path}`).toBeUndefined();
    expect(get(es, path), `es.json still has retired ${path}`).toBeUndefined();
  });
});

describe('SP-E policy invariants', () => {
  it('T2 hero proof line cites Swiss Ephemeris and never claims NASA', () => {
    for (const [label, tree] of [
      ['en', en],
      ['es', es],
    ] as const) {
      const proof = get(tree, 'landing.heroProof');
      expect(proof, `${label}.landing.heroProof missing`).toBeTypeOf('string');
      expect(proof, `${label} heroProof must cite Swiss Ephemeris`).toContain(
        'Swiss Ephemeris',
      );
      expect(proof, `${label} heroProof must not claim NASA`).not.toMatch(/NASA/i);
    }
  });

  it('T7 phantom "Star" tier appears in NEITHER locale\'s paywall eyebrow', () => {
    const enEyebrow = get(en, 'paywall.cta.eyebrow');
    const esEyebrow = get(es, 'paywall.cta.eyebrow');
    expect(enEyebrow).toBe('Included in Pro');
    expect(esEyebrow).toBe('Incluido en Pro');
    // Whole-word "Star" (the tier name) must be gone; "Locked behind Star" too.
    for (const eyebrow of [enEyebrow, esEyebrow]) {
      expect(eyebrow).not.toMatch(/\bStar\b/);
      expect(eyebrow).not.toMatch(/Locked behind Star/i);
    }
  });
});

describe('SP-E synastry subline (D5 — inline paywall had 0/9 lifetime opens, switched to card)', () => {
  it('subline sells the card CTA in both locales', () => {
    expect(get(en, 'paywall.cta.subline.synastryAi')).toBe(
      'See how your two charts actually interact — full AI reading with Pro.',
    );
    expect(get(es, 'paywall.cta.subline.synastryAi')).toBe(
      'Mira cómo interactúan realmente sus dos cartas — lectura completa con IA, incluida en Pro.',
    );
  });
});
