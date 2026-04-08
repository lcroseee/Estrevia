import type { CitySearchResult } from '@/shared/types/api';
import citiesData from '../../../data/cities15000.json';

export interface City {
  name: string;
  asciiName: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number;
}

// Typed reference to the JSON dataset — loaded once at module init (Node.js caches require/import)
const cities: City[] = citiesData as City[];

/**
 * Search cities by prefix match on asciiName or name.
 * Matching is case-insensitive. Results are sorted by population descending.
 *
 * @param query - Search string, minimum 2 characters
 * @param limit - Maximum number of results to return (default 5)
 * @returns Array of CitySearchResult sorted by population descending
 */
export function searchCities(query: string, limit: number = 5): CitySearchResult[] {
  if (query.length < 2) {
    return [];
  }

  const q = query.toLowerCase();

  const matches = cities.filter((city) => {
    // Primary: case-insensitive prefix match on ASCII name
    if (city.asciiName.toLowerCase().startsWith(q)) return true;
    // Secondary: case-insensitive prefix match on native name (for non-ASCII cities like Москва)
    if (city.name.toLowerCase().startsWith(q)) return true;
    // Tertiary: substring match anywhere in asciiName for partial queries
    if (city.asciiName.toLowerCase().includes(q)) return true;
    return false;
  });

  // Sort by population descending
  matches.sort((a, b) => b.population - a.population);

  return matches.slice(0, limit).map((city) => ({
    name: city.name,
    country: city.country,
    countryCode: city.countryCode,
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: city.timezone,
    population: city.population,
  }));
}
