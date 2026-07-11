// src/shared/lib/__tests__/currency-equiv.test.ts
import { describe, it, expect } from 'vitest';
import { CURRENCY_EQUIV } from '../currency-equiv';
import esMessages from '../../../../messages/es.json';

describe('currency-equiv — single source of truth (SP-B D2)', () => {
  it('messages/es.json pricing equiv strings mirror CURRENCY_EQUIV byte-exact', () => {
    // next-intl reads the JSON; the checkout route reads the TS module.
    // If a quarterly FX refresh edits one side only, this fails the build.
    expect(esMessages.pricing.monthlyPriceEquiv).toBe(CURRENCY_EQUIV.pro_monthly);
    expect(esMessages.pricing.annualPriceEquiv).toBe(CURRENCY_EQUIV.pro_annual);
  });

  it('uses NARROW NO-BREAK SPACE (U+202F) as the thousands separator', () => {
    expect(CURRENCY_EQUIV.pro_annual).toContain('147 000');
    expect(CURRENCY_EQUIV.pro_monthly).toContain('21 000');
  });
});
