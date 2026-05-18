import { describe, it, expect } from 'vitest';
import { TOP_CITIES, findCityBySlug, ALL_CITY_SLUGS } from '../cities';

describe('cities', () => {
  it('exports exactly 20 cities', () => {
    expect(TOP_CITIES.length).toBe(20);
    expect(ALL_CITY_SLUGS.length).toBe(20);
  });

  it('all city slugs are unique', () => {
    expect(new Set(ALL_CITY_SLUGS).size).toBe(20);
  });

  it('every city has lat, lng, tz', () => {
    for (const c of TOP_CITIES) {
      expect(typeof c.lat).toBe('number');
      expect(typeof c.lng).toBe('number');
      expect(typeof c.tz).toBe('string');
      expect(c.tz.length).toBeGreaterThan(0);
    }
  });

  it('lat/lng within valid ranges', () => {
    for (const c of TOP_CITIES) {
      expect(c.lat).toBeGreaterThanOrEqual(-90);
      expect(c.lat).toBeLessThanOrEqual(90);
      expect(c.lng).toBeGreaterThanOrEqual(-180);
      expect(c.lng).toBeLessThanOrEqual(180);
    }
  });

  it('findCityBySlug returns city for valid slug', () => {
    const ny = findCityBySlug('new-york');
    expect(ny).toBeDefined();
    expect(ny!.name).toBe('New York');
  });

  it('findCityBySlug returns undefined for invalid slug', () => {
    expect(findCityBySlug('atlantis')).toBeUndefined();
    expect(findCityBySlug('')).toBeUndefined();
  });

  it('includes mix of EN-primary and ES-primary cities', () => {
    expect(ALL_CITY_SLUGS).toContain('new-york');
    expect(ALL_CITY_SLUGS).toContain('london');
    expect(ALL_CITY_SLUGS).toContain('ciudad-de-mexico');
    expect(ALL_CITY_SLUGS).toContain('buenos-aires');
    expect(ALL_CITY_SLUGS).toContain('madrid');
  });
});
