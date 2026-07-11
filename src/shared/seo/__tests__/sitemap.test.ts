import { describe, it, expect } from 'vitest';
import sitemap from '@/app/sitemap';
import { generateMetadata as compatPairMetadata } from '@/app/[locale]/(marketing)/compatibility/[pair]/page';
import { ALL_PAIR_SLUGS } from '@/shared/seo/compatibility-pairs';

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

describe('compatibility pairs removed from sitemap (T2)', () => {
  it('emits zero /compatibility/<pair> URLs', () => {
    const urls = sitemap().map((e) => e.url);
    const pairUrls = urls.filter((u) => /\/compatibility\/[^/]+$/.test(u));
    expect(pairUrls).toHaveLength(0);
  });

  it('keeps the /compatibility hub (EN + ES)', () => {
    const urls = sitemap().map((e) => e.url);
    const hubUrls = urls.filter((u) => /\/compatibility$/.test(u));
    expect(hubUrls).toHaveLength(2);
  });

  it('total entry count drops to 514', () => {
    expect(sitemap()).toHaveLength(514);
  });
});

describe('compatibility pair pages are noindex (T2)', () => {
  it('sets robots index:false, follow:true', async () => {
    const md = await compatPairMetadata({
      params: Promise.resolve({ locale: 'en' as const, pair: ALL_PAIR_SLUGS[0] }),
    });
    expect(md.robots).toEqual({ index: false, follow: true });
  });
});
