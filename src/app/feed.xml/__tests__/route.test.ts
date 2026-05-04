import { describe, it, expect, vi } from 'vitest';

vi.mock('@/modules/esoteric/lib/essays', () => ({
  getAllEssays: vi.fn((locale?: string) => {
    if (locale === 'es') {
      return [
        {
          slug: 'sun-in-aries',
          title: 'Sol en Aries',
          description: 'Sol sideral en Aries',
          publishedAt: '2024-01-15',
          updatedAt: '2024-01-20',
        },
      ];
    }
    return [
      {
        slug: 'sun-in-aries',
        title: 'Sun in Aries',
        description: 'Sidereal sun in Aries',
        publishedAt: '2024-01-15',
        updatedAt: '2024-01-20',
      },
      {
        slug: 'sun-in-taurus',
        title: 'Sun in Taurus',
        description: 'Sidereal sun in Taurus',
        publishedAt: '2024-02-10',
        updatedAt: '2024-02-15',
      },
    ];
  }),
}));

import { GET } from '../route';

describe('GET /feed.xml (EN)', () => {
  it('returns 200 with application/atom+xml', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/atom+xml');
  });

  it('contains all EN essays', async () => {
    const response = await GET();
    const xml = await response.text();
    expect(xml).toContain('<title>Sun in Aries</title>');
    expect(xml).toContain('<title>Sun in Taurus</title>');
  });

  it('does not contain ES essays', async () => {
    const response = await GET();
    const xml = await response.text();
    expect(xml).not.toContain('Sol en Aries');
  });

  it('uses absolute URLs to en pages', async () => {
    const response = await GET();
    const xml = await response.text();
    expect(xml).toContain('https://estrevia.app/essays/sun-in-aries');
  });

  it('declares xml:lang="en"', async () => {
    const response = await GET();
    const xml = await response.text();
    expect(xml).toContain('xml:lang="en"');
  });

  it('caches with public, max-age', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toContain('public');
  });
});
