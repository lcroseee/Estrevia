import { describe, it, expect } from 'vitest';
import sitemap from '@/app/sitemap';

describe('sitemap', () => {
  it('emits one entry per locale for every canonical path', () => {
    const entries = sitemap();
    const en = entries.filter((e) => !/\/es(\/|$)/.test(e.url));
    const es = entries.filter((e) => /\/es(\/|$)/.test(e.url));
    expect(en.length).toBeGreaterThan(0);
    expect(es.length).toBeGreaterThan(0);
    expect(en.length).toBe(es.length);
    expect(en.length + es.length).toBe(entries.length);
  });

  it('every entry has hreflang alternates for both locales', () => {
    const entries = sitemap();
    for (const e of entries) {
      expect(e.alternates?.languages?.['en-US']).toBeTruthy();
      expect(e.alternates?.languages?.['es']).toBeTruthy();
      expect(e.alternates?.languages?.['x-default']).toBeTruthy();
    }
  });

  it('total entry count is double the canonical path count (≥442)', () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThanOrEqual(442);
  });

  it('no entry url contains a vercel.app domain', () => {
    const entries = sitemap();
    for (const e of entries) {
      expect(e.url).not.toContain('vercel.app');
    }
  });

  it('no share-page (/s/) entries in sitemap', () => {
    const entries = sitemap();
    for (const e of entries) {
      expect(e.url).not.toContain('/s/');
    }
  });
});
