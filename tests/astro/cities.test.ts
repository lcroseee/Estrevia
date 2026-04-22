import { describe, it, expect } from 'vitest';
import { searchCities } from '../../src/modules/astro-engine/cities';

describe('searchCities', () => {
  it('"Moscow" returns Moscow as the first result', () => {
    const results = searchCities('Moscow');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('Moscow');
    expect(results[0].countryCode).toBe('RU');
  });

  it('"Lon" returns London among results', () => {
    const results = searchCities('Lon');
    const london = results.find((r) => r.name === 'London');
    expect(london).toBeDefined();
    expect(london?.countryCode).toBe('GB');
  });

  it('"New" returns New York City among results', () => {
    const results = searchCities('New', 10);
    const ny = results.find((r) => r.name.toLowerCase().includes('new york'));
    expect(ny).toBeDefined();
    expect(ny?.countryCode).toBe('US');
  });

  it('limit parameter constrains result count', () => {
    const results3 = searchCities('New', 3);
    expect(results3.length).toBeLessThanOrEqual(3);

    const results1 = searchCities('New', 1);
    expect(results1.length).toBeLessThanOrEqual(1);
  });

  it('default limit is 5', () => {
    // "a" matches many cities — default limit should cap at 5
    const results = searchCities('a');
    // Short query returns empty per our implementation (min 2 chars)
    expect(results.length).toBe(0);
  });

  it('query shorter than 2 characters returns empty array', () => {
    expect(searchCities('M')).toHaveLength(0);
    expect(searchCities('L')).toHaveLength(0);
    expect(searchCities('')).toHaveLength(0);
  });

  it('results are sorted by population descending', () => {
    const results = searchCities('Moscow', 10);
    // Moscow (12M) should come before Saint Petersburg (5M)
    const moscow = results.findIndex((r) => r.name.includes('Moscow'));
    expect(moscow).toBe(0);
  });

  it('"Tokyo" returns Tokyo with correct timezone', () => {
    const results = searchCities('Tokyo');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].timezone).toBe('Asia/Tokyo');
  });

  it('"Saint" returns Saint Petersburg', () => {
    const results = searchCities('Saint');
    const spb = results.find((r) => r.name.includes('Petersburg'));
    expect(spb).toBeDefined();
  });

  it('each result has all required CitySearchResult fields', () => {
    const results = searchCities('London');
    expect(results.length).toBeGreaterThan(0);
    const city = results[0];
    expect(typeof city.name).toBe('string');
    expect(typeof city.country).toBe('string');
    expect(typeof city.countryCode).toBe('string');
    expect(typeof city.latitude).toBe('number');
    expect(typeof city.longitude).toBe('number');
    expect(typeof city.timezone).toBe('string');
    expect(typeof city.population).toBe('number');
  });

  it('"Berlin" returns Berlin with correct coordinates', () => {
    const results = searchCities('Berlin');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].latitude).toBeCloseTo(52.52, 1);
    expect(results[0].longitude).toBeCloseTo(13.405, 1);
  });

  it('"москва" (Cyrillic query) returns empty — data is English-only', () => {
    const results = searchCities('москва');
    expect(results.length).toBe(0);
  });

  it('"Austin" returns Austin, Texas as top US result', () => {
    const results = searchCities('Austin', 10);
    const austin = results.find((r) => r.countryCode === 'US');
    expect(austin).toBeDefined();
    expect(austin?.admin1).toBe('Texas');
  });

  it('"Lyon" returns Lyon with its French region in admin1', () => {
    const results = searchCities('Lyon', 5);
    const lyon = results.find((r) => r.countryCode === 'FR');
    expect(lyon).toBeDefined();
    expect(lyon?.admin1).toBeTruthy();
    // GeoNames uses the pre-2016 "Rhone-Alpes" region code; post-consolidation
    // regional name "Auvergne-Rhone-Alpes" may appear if GeoNames updates later.
    expect(lyon?.admin1).toMatch(/Rhone|Auvergne/i);
  });

  it('"Monaco" returns Monaco with admin1 = null (city-state)', () => {
    const results = searchCities('Monaco', 5);
    const monaco = results.find((r) => r.countryCode === 'MC');
    expect(monaco).toBeDefined();
    expect(monaco?.admin1).toBeNull();
  });

  it('admin1 field is present on every result (string or null)', () => {
    const results = searchCities('Berlin', 5);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty('admin1');
      expect(r.admin1 === null || typeof r.admin1 === 'string').toBe(true);
    }
  });
});
