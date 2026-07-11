import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { lastModifiedFor } from '../sitemap-mtime';

describe('lastModifiedFor', () => {
  it('essay returns MDX frontmatter updatedAt when present', () => {
    // Derive the expected date from the file so realified dates (T11a) can't
    // make this assertion stale.
    const raw = readFileSync(join(process.cwd(), 'content/essays/jupiter-in-aries.mdx'), 'utf8');
    const expected = matter(raw).data.updatedAt as string;
    const date = lastModifiedFor('essay', 'jupiter-in-aries', 'en');
    expect(date.toISOString().slice(0, 10)).toBe(expected);
  });

  it('sidereal-dates returns Jan 1 of current year (UTC)', () => {
    const date = lastModifiedFor('sidereal-dates');
    const expected = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    expect(date.toISOString()).toBe(expected.toISOString());
  });

  it('static returns a valid Date for a known path', () => {
    const date = lastModifiedFor('static', 'src/app/sitemap.ts');
    expect(date).toBeInstanceOf(Date);
    expect(Number.isNaN(date.getTime())).toBe(false);
    expect(date.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('falls back to build time for non-existent path', () => {
    const before = Date.now();
    const date = lastModifiedFor('static', 'src/does/not/exist.ts');
    expect(date.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('sign returns a Date for both locales', () => {
    const en = lastModifiedFor('sign', 'aries', 'en');
    const es = lastModifiedFor('sign', 'aries', 'es');
    expect(en).toBeInstanceOf(Date);
    expect(es).toBeInstanceOf(Date);
  });

  it('tarot returns a Date sourced from cards.json', () => {
    const date = lastModifiedFor('tarot');
    expect(date).toBeInstanceOf(Date);
    expect(Number.isNaN(date.getTime())).toBe(false);
  });
});

describe('compat + cities lastmod is a real git mtime (T11c)', () => {
  it('resolves a Date for compatibility', () => {
    expect(lastModifiedFor('compatibility')).toBeInstanceOf(Date);
  });
  it('resolves a Date for planetary-hours-cities', () => {
    expect(lastModifiedFor('planetary-hours-cities')).toBeInstanceOf(Date);
  });
});
