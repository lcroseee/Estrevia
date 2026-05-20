// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  UTM_COOKIE_NAME,
  parseUtmFromSearch,
  readUtmCookie,
  readUtmLastTouch,
  writeUtmCookie,
} from '../utm-cookie';

// ---------------------------------------------------------------------------
// parseUtmFromSearch
// ---------------------------------------------------------------------------

describe('parseUtmFromSearch', () => {
  it('returns empty object for empty search string', () => {
    expect(parseUtmFromSearch('')).toEqual({});
  });

  it('returns empty object when no utm_ params present', () => {
    expect(parseUtmFromSearch('?foo=bar&baz=qux')).toEqual({});
  });

  it('parses a single utm field', () => {
    expect(parseUtmFromSearch('?utm_source=facebook')).toEqual({
      utm_source: 'facebook',
    });
  });

  it('parses multiple utm fields', () => {
    const result = parseUtmFromSearch(
      '?utm_source=facebook&utm_medium=cpc&utm_campaign=spring25&utm_content=ad1&utm_term=astrology',
    );
    expect(result).toEqual({
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: 'spring25',
      utm_content: 'ad1',
      utm_term: 'astrology',
    });
  });

  it('ignores non-utm params', () => {
    const result = parseUtmFromSearch('?utm_source=fb&ref=homepage&click_id=abc');
    expect(result).toEqual({ utm_source: 'fb' });
    expect(result).not.toHaveProperty('ref');
    expect(result).not.toHaveProperty('click_id');
  });

  it('handles URL-encoded values', () => {
    const result = parseUtmFromSearch('?utm_campaign=spring%2025%20sale');
    expect(result).toEqual({ utm_campaign: 'spring 25 sale' });
  });
});

// ---------------------------------------------------------------------------
// readUtmCookie / writeUtmCookie — browser environment simulation
// ---------------------------------------------------------------------------

describe('readUtmCookie + writeUtmCookie', () => {
  let cookieStore: string;

  beforeEach(() => {
    cookieStore = '';

    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => cookieStore,
      set: (val: string) => {
        // Simplified cookie setter: extract name=value and store it.
        const [nameVal] = val.split(';');
        const eqIdx = nameVal.indexOf('=');
        if (eqIdx === -1) return;
        const name = nameVal.slice(0, eqIdx).trim();
        const value = nameVal.slice(eqIdx + 1).trim();

        // Remove existing cookie with same name, then append new one.
        const existing = cookieStore
          .split('; ')
          .filter((c) => !c.startsWith(`${name}=`))
          .join('; ');
        cookieStore = existing ? `${existing}; ${name}=${value}` : `${name}=${value}`;
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips utm fields via write → read', () => {
    const fields = {
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: 'test-camp',
      utm_click_timestamp: '2026-05-04T12:00:00.000Z',
    };
    writeUtmCookie(fields);
    expect(readUtmCookie()).toEqual(fields);
  });

  it('readUtmCookie returns null when cookie is absent', () => {
    expect(readUtmCookie()).toBeNull();
  });

  it('readUtmCookie returns null for malformed JSON', () => {
    // Directly inject a broken cookie value.
    cookieStore = `${UTM_COOKIE_NAME}=not-valid-json`;
    expect(readUtmCookie()).toBeNull();
  });

  it('writeUtmCookie is a no-op for empty fields', () => {
    writeUtmCookie({});
    expect(cookieStore).toBe('');
  });

  it('writeUtmCookie sets the cookie with the correct name', () => {
    writeUtmCookie({ utm_source: 'ig' });
    expect(cookieStore).toContain(UTM_COOKIE_NAME);
  });
});

// ---------------------------------------------------------------------------
// SSR safety — functions must not throw when document is undefined
// ---------------------------------------------------------------------------

describe('SSR safety', () => {
  it('readUtmCookie returns null when document is undefined', () => {
    // Temporarily simulate SSR by hiding document.
    const original = globalThis.document;
    // @ts-expect-error — deliberate SSR simulation
    delete globalThis.document;
    try {
      expect(readUtmCookie()).toBeNull();
    } finally {
      globalThis.document = original;
    }
  });

  it('writeUtmCookie is a no-op when document is undefined', () => {
    const original = globalThis.document;
    // @ts-expect-error — deliberate SSR simulation
    delete globalThis.document;
    try {
      expect(() => writeUtmCookie({ utm_source: 'fb' })).not.toThrow();
    } finally {
      globalThis.document = original;
    }
  });
});

// ---------------------------------------------------------------------------
// readUtmLastTouch — URL last-touch overrides cookie
// ---------------------------------------------------------------------------

describe('readUtmLastTouch', () => {
  beforeEach(() => {
    document.cookie = `${UTM_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '' },
    });
  });

  it('returns cookie value when URL has no UTM params', () => {
    document.cookie = `${UTM_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ utm_source: 'meta' }))}; path=/;`;
    expect(readUtmLastTouch()).toEqual({ utm_source: 'meta' });
  });

  it('URL UTM overrides cookie UTM (last-touch)', () => {
    document.cookie = `${UTM_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ utm_source: 'meta' }))}; path=/;`;
    Object.defineProperty(window, 'location', { writable: true, value: { search: '?utm_source=lead-nurture' } });
    expect(readUtmLastTouch()).toEqual({ utm_source: 'lead-nurture' });
  });

  it('partial URL UTM merges with cookie (per-key override)', () => {
    document.cookie = `${UTM_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ utm_source: 'meta', utm_campaign: 'estrevia_lead_en' }))}; path=/;`;
    Object.defineProperty(window, 'location', { writable: true, value: { search: '?utm_source=lead-nurture' } });
    expect(readUtmLastTouch()).toEqual({ utm_source: 'lead-nurture', utm_campaign: 'estrevia_lead_en' });
  });

  it('returns empty object when both cookie and URL are empty', () => {
    expect(readUtmLastTouch()).toEqual({});
  });
});
