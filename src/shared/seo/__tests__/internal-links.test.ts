import { describe, it, expect } from 'vitest';
import {
  parseEssaySlug,
  getAllEssaySlugs,
  getAllSignSlugs,
  getAllEssaySlugsBySign,
  getAllEssaySlugsByPlanet,
  getRelatedPages,
} from '../internal-links';

describe('parseEssaySlug', () => {
  it('parses a valid planet-in-sign slug', () => {
    const result = parseEssaySlug('sun-in-aries');
    expect(result).toEqual({ planet: 'sun', sign: 'aries' });
  });

  it('parses moon-in-scorpio correctly', () => {
    const result = parseEssaySlug('moon-in-scorpio');
    expect(result).toEqual({ planet: 'moon', sign: 'scorpio' });
  });

  it('returns null for a slug with no "-in-" separator', () => {
    expect(parseEssaySlug('invalid')).toBeNull();
  });

  it('returns null for a slug with unknown planet', () => {
    expect(parseEssaySlug('earth-in-aries')).toBeNull();
  });

  it('returns null for a slug with unknown sign', () => {
    expect(parseEssaySlug('sun-in-ophiuchus')).toBeNull();
  });

  it('returns null when both planet and sign are unknown', () => {
    expect(parseEssaySlug('unknown-in-unknown')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseEssaySlug('')).toBeNull();
  });
});

describe('getAllEssaySlugs', () => {
  it('returns exactly 120 slugs (10 planets × 12 signs)', () => {
    expect(getAllEssaySlugs().length).toBe(120);
  });

  it('every slug follows the planet-in-sign pattern', () => {
    const slugs = getAllEssaySlugs();
    slugs.forEach((slug) => {
      expect(slug).toMatch(/^[a-z]+-in-[a-z]+$/);
    });
  });

  it('contains no duplicate slugs', () => {
    const slugs = getAllEssaySlugs();
    const unique = new Set(slugs);
    expect(unique.size).toBe(120);
  });

  it('includes sun-in-aries and pluto-in-pisces as boundary slugs', () => {
    const slugs = getAllEssaySlugs();
    expect(slugs).toContain('sun-in-aries');
    expect(slugs).toContain('pluto-in-pisces');
  });
});

describe('getAllSignSlugs', () => {
  it('returns exactly 12 slugs', () => {
    expect(getAllSignSlugs().length).toBe(12);
  });

  it('includes all expected sign names', () => {
    const signs = getAllSignSlugs();
    const expected = [
      'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
      'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
    ];
    expected.forEach((sign) => expect(signs).toContain(sign));
  });
});

describe('getAllEssaySlugsBySign', () => {
  it('returns exactly 10 slugs for aries (one per planet)', () => {
    expect(getAllEssaySlugsBySign('aries').length).toBe(10);
  });

  it('every slug ends with the given sign', () => {
    const slugs = getAllEssaySlugsBySign('scorpio');
    slugs.forEach((slug) => {
      expect(slug).toMatch(/-in-scorpio$/);
    });
  });

  it('includes all 10 planets for the given sign', () => {
    const slugs = getAllEssaySlugsBySign('aries');
    const planets = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
    planets.forEach((planet) => expect(slugs).toContain(`${planet}-in-aries`));
  });
});

describe('getAllEssaySlugsByPlanet', () => {
  it('returns exactly 12 slugs for sun (one per sign)', () => {
    expect(getAllEssaySlugsByPlanet('sun').length).toBe(12);
  });

  it('every slug starts with the given planet', () => {
    const slugs = getAllEssaySlugsByPlanet('moon');
    slugs.forEach((slug) => {
      expect(slug).toMatch(/^moon-in-/);
    });
  });

  it('includes all 12 signs for the given planet', () => {
    const slugs = getAllEssaySlugsByPlanet('sun');
    const signs = [
      'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
      'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
    ];
    signs.forEach((sign) => expect(slugs).toContain(`sun-in-${sign}`));
  });
});

describe('getRelatedPages — essay slug', () => {
  it('returns 3-5 related pages for sun-in-aries', () => {
    const pages = getRelatedPages('sun-in-aries');
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.length).toBeLessThanOrEqual(5);
  });

  it('includes /signs/aries in the related pages for sun-in-aries', () => {
    const pages = getRelatedPages('sun-in-aries');
    const hrefs = pages.map((p) => p.href);
    expect(hrefs).toContain('/signs/aries');
  });

  it('returns no duplicate hrefs', () => {
    const pages = getRelatedPages('sun-in-aries');
    const hrefs = pages.map((p) => p.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });

  it('all hrefs start with /', () => {
    const pages = getRelatedPages('sun-in-aries');
    pages.forEach((page) => {
      expect(page.href).toMatch(/^\//);
    });
  });

  it('every page has a non-empty title and anchorText', () => {
    const pages = getRelatedPages('sun-in-aries');
    pages.forEach((page) => {
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.anchorText.length).toBeGreaterThan(0);
    });
  });

  it('works for moon-in-scorpio without duplicate hrefs', () => {
    const pages = getRelatedPages('moon-in-scorpio');
    const hrefs = pages.map((p) => p.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
    expect(pages.length).toBeGreaterThanOrEqual(3);
  });
});

describe('getRelatedPages — sign slug', () => {
  it('returns related pages for a sign slug (aries)', () => {
    const pages = getRelatedPages('aries');
    expect(pages.length).toBeGreaterThan(0);
  });

  it('sign-slug related pages include all 10 planet essays for that sign', () => {
    const pages = getRelatedPages('aries');
    const hrefs = pages.map((p) => p.href);
    const planets = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
    planets.forEach((planet) => {
      expect(hrefs).toContain(`/essays/${planet}-in-aries`);
    });
  });

  it('returns empty array for an unknown slug', () => {
    expect(getRelatedPages('unknown-slug')).toEqual([]);
  });
});

describe('parseEssaySlug round-trip', () => {
  it('every slug from getAllEssaySlugs() can be parsed by parseEssaySlug()', () => {
    const slugs = getAllEssaySlugs();
    slugs.forEach((slug) => {
      const result = parseEssaySlug(slug);
      expect(result).not.toBeNull();
      expect(result?.planet).toBeTruthy();
      expect(result?.sign).toBeTruthy();
    });
  });
});

describe('getRelatedPages — no broken routes', () => {
  it('no hrefs point to /planets/ routes (route does not exist)', () => {
    const slugs = getAllEssaySlugs();
    slugs.forEach((slug) => {
      const pages = getRelatedPages(slug);
      pages.forEach((page) => {
        expect(page.href).not.toMatch(/^\/planets\//);
      });
    });
  });

  it('no hrefs point to /sidereal-vs-tropical (route does not exist, use /why-sidereal)', () => {
    const slugs = getAllEssaySlugs();
    slugs.forEach((slug) => {
      const pages = getRelatedPages(slug);
      pages.forEach((page) => {
        expect(page.href).not.toBe('/sidereal-vs-tropical');
      });
    });
  });

  it('sidereal vs tropical link points to /why-sidereal', () => {
    const pages = getRelatedPages('sun-in-aries');
    const whySidereal = pages.find((p) => p.anchorText === 'sidereal vs tropical astrology');
    expect(whySidereal).toBeDefined();
    expect(whySidereal?.href).toBe('/why-sidereal');
  });
});
