import { describe, it, expect } from 'vitest';
import { essayLocaleUrls } from '../essay-urls';
import { SITE_URL } from '../constants';

describe('essayLocaleUrls', () => {
  it('EN essay uses root URLs', () => {
    const u = essayLocaleUrls('sun-in-aries', 'en', 'aries');
    expect(u.canonicalUrl).toBe(`${SITE_URL}/essays/sun-in-aries`);
    expect(u.homeUrl).toBe(SITE_URL.replace(/\/$/, ''));
    expect(u.signUrl).toBe(`${SITE_URL}/signs/aries`);
  });

  it('ES essay uses /es/ URLs on every field', () => {
    const u = essayLocaleUrls('sun-in-aries', 'es', 'aries');
    const base = SITE_URL.replace(/\/$/, '');
    expect(u.canonicalUrl).toBe(`${base}/es/essays/sun-in-aries`);
    expect(u.homeUrl).toBe(`${base}/es`);
    expect(u.signUrl).toBe(`${base}/es/signs/aries`);
  });

  it('returns null signUrl when no sign', () => {
    expect(essayLocaleUrls('foo', 'es', null).signUrl).toBeNull();
    expect(essayLocaleUrls('foo', 'es').signUrl).toBeNull();
  });
});
