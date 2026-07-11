// @vitest-environment node
//
// SP-B i18n completeness / parity guard.
//
// Owns the message-file contract for the SP-B string additions:
// T2 (US$ price framing + billedInUsd — ES only), T5 (in-modal trust row),
// T6 (cookieConsent namespace), T7 (dateInput namespace), and T8 (timePicker
// timeGroupAria + cityAutocomplete namespace). Value-agnostic where the briefs
// pin exact strings in their own component tests — here we assert presence /
// parity plus the two policy invariants (the Phase-0 aria contract and the
// honest consent copy).
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

// Keys added / rewritten by SP-B — each must be a non-empty string in BOTH locales.
const PRESENT_IN_BOTH = [
  'paywall.trustRow', // T5 new
  'cookieConsent.ariaLabel', // T6 new namespace
  'cookieConsent.shortCopy',
  'cookieConsent.shortPrivacyLabel',
  'cookieConsent.shortPrivacyAria',
  'cookieConsent.fullCopy',
  'cookieConsent.privacyPolicyLabel',
  'cookieConsent.decline',
  'cookieConsent.accept',
  'dateInput.monthAria', // T7 new namespace
  'dateInput.dayAria',
  'dateInput.yearAria',
  'dateInput.openCalendarAria',
  'dateInput.calendarDialogAria',
  'dateInput.prevMonthAria',
  'dateInput.nextMonthAria',
  'timePicker.timeGroupAria', // T8 new key in existing namespace
  'cityAutocomplete.suggestionsAria', // T8 new namespace
  'cityAutocomplete.searchUnavailable',
];

describe('SP-B message-key parity (T2/T5/T6/T7/T8)', () => {
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
});

describe('SP-B T6 hard requirements (Phase-0 aria contract + honest consent copy)', () => {
  it('EN cookieConsent.ariaLabel is EXACTLY "Cookie consent" (Phase-0 e2e getByLabel contract)', () => {
    expect(get(en, 'cookieConsent.ariaLabel')).toBe('Cookie consent');
  });

  it('consent copy is truthful post-gating: no "no ads / no third-party / analytics only" claims, and it names ad measurement (both locales)', () => {
    for (const [label, tree] of [['en', en], ['es', es]] as const) {
      const short = get(tree, 'cookieConsent.shortCopy')!;
      const full = get(tree, 'cookieConsent.fullCopy')!;
      const combined = `${short}\n${full}`;
      // The old hardcoded lies must not reappear.
      expect(combined, `${label} still claims "no ads"`).not.toMatch(/no ads/i);
      expect(combined, `${label} still claims "no third-party"`).not.toMatch(
        /third[- ]party/i,
      );
      expect(combined, `${label} still claims "analytics cookies only"`).not.toMatch(
        /analytics cookies only|solo cookies de anal/i,
      );
      // Post-consent the Meta ads pixel loads — the copy must own that.
      expect(full, `${label} fullCopy must mention ad measurement`).toMatch(
        /ad measurement|medici[óo]n de anuncios/i,
      );
    }
  });
});

describe('SP-B T2 US$ framing is ES-only', () => {
  it('billedInUsd is present in ES and absent in EN', () => {
    expect(get(es, 'pricing.billedInUsd')).toBeTypeOf('string');
    expect(get(en, 'pricing.billedInUsd')).toBeUndefined();
  });

  it('ES prices carry the US$ marker; EN prices keep the bare $', () => {
    expect(get(es, 'pricing.monthlyPrice')).toBe('US$4.99');
    expect(get(es, 'pricing.annualPrice')).toBe('US$34.99');
    expect(get(es, 'pricing.annualPerMonth')).toBe('~US$2,92/mes');
    expect(get(en, 'pricing.monthlyPrice')).toBe('$4.99');
  });

  it('T1 local-currency equiv strings are left byte-exact (U+202F preserved)', () => {
    // Guards against this SP-B pass disturbing SP-B T1's currency-equiv.ts output.
    const monthly = get(es, 'pricing.monthlyPriceEquiv')!;
    const annual = get(es, 'pricing.annualPriceEquiv')!;
    expect(monthly).toContain(' '); // narrow no-break space between digit groups
    expect(annual).toContain(' ');
    expect(monthly).toContain('MXN');
    expect(annual).toContain('MXN');
  });
});
