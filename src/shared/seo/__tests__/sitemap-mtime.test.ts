import { describe, it, expect } from 'vitest';
import { lastModifiedFor } from '../sitemap-mtime';

describe('lastModifiedFor', () => {
  it('essay returns MDX frontmatter updatedAt when present', () => {
    // jupiter-in-aries.mdx has updatedAt: "2024-01-15"
    const date = lastModifiedFor('essay', 'jupiter-in-aries', 'en');
    expect(date.toISOString().slice(0, 10)).toBe('2024-01-15');
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
