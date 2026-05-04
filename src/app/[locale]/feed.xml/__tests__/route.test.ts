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
    return [];
  }),
}));

import { GET } from '../route';

describe('GET /[locale]/feed.xml — ES', () => {
  it('returns 200 with ES essays for locale=es', async () => {
    const response = await GET(new Request('https://estrevia.app/es/feed.xml'), {
      params: Promise.resolve({ locale: 'es' }),
    });
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).toContain('<title>Sol en Aries</title>');
  });

  it('uses /es/essays/ URLs', async () => {
    const response = await GET(new Request('https://estrevia.app/es/feed.xml'), {
      params: Promise.resolve({ locale: 'es' }),
    });
    const xml = await response.text();
    expect(xml).toContain('https://estrevia.app/es/essays/sun-in-aries');
  });

  it('declares xml:lang="es"', async () => {
    const response = await GET(new Request('https://estrevia.app/es/feed.xml'), {
      params: Promise.resolve({ locale: 'es' }),
    });
    const xml = await response.text();
    expect(xml).toContain('xml:lang="es"');
  });

  it('returns 404 for unsupported locale', async () => {
    const response = await GET(new Request('https://estrevia.app/fr/feed.xml'), {
      params: Promise.resolve({ locale: 'fr' }),
    });
    expect(response.status).toBe(404);
  });
});
