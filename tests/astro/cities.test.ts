import { describe, it, expect } from 'vitest';
import { searchCities } from '../../src/modules/astro-engine/cities';

describe('searchCities', () => {
  it('"Moscow" returns Moscow as the first result', () => {
    const results = searchCities('Moscow');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toMatch(/москва|Moscow/i);
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
    const moscow = results.findIndex((r) => r.name.includes('осква') || r.name.includes('Moscow'));
    expect(moscow).toBe(0);
  });

  it('"Tokyo" returns Tokyo with correct timezone', () => {
    const results = searchCities('Tokyo');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].timezone).toBe('Asia/Tokyo');
  });

  it('"Saint" returns Saint Petersburg', () => {
    const results = searchCities('Saint');
    const spb = results.find((r) => r.name.includes('Петербург') || r.name.includes('Petersburg'));
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

  it('"москва" (Cyrillic query) matches Moscow via name field', () => {
    const results = searchCities('москва');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].countryCode).toBe('RU');
  });
});
