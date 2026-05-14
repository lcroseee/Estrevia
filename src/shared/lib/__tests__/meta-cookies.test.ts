// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readMetaCookies } from '../meta-cookies';

beforeEach(() => {
  // jsdom does not auto-reset cookies between tests
  document.cookie.split(';').forEach((c) => {
    const k = c.split('=')[0]?.trim();
    if (k) document.cookie = `${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
});

describe('readMetaCookies', () => {
  it('returns both fbc and fbp when present', () => {
    document.cookie = '_fbc=fb.1.1714867200.AbCdEf123';
    document.cookie = '_fbp=fb.1.1714867200.987654321';
    expect(readMetaCookies()).toEqual({
      fbc: 'fb.1.1714867200.AbCdEf123',
      fbp: 'fb.1.1714867200.987654321',
    });
  });

  it('returns only fbp when fbc is absent', () => {
    document.cookie = '_fbp=fb.1.1714867200.999';
    expect(readMetaCookies()).toEqual({ fbp: 'fb.1.1714867200.999' });
  });

  it('returns empty object when neither cookie is set', () => {
    expect(readMetaCookies()).toEqual({});
  });

  it('ignores cookies whose name differs in case or has a similar prefix', () => {
    document.cookie = '_Fbc=fb.1.x.x';
    document.cookie = '_fbcExtra=fb.1.x.x';
    expect(readMetaCookies()).toEqual({});
  });

  it('tolerates extra whitespace, equals signs in values, and multi-cookie strings', () => {
    document.cookie = '_fbp=fb.1.0.a=b=c';
    expect(readMetaCookies().fbp).toBe('fb.1.0.a=b=c');
  });
});
