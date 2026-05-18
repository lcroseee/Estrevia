// ---------------------------------------------------------------------------
// Top-20 cities for /planetary-hours-cities programmatic SEO.
//
// Mix EN-primary + ES-primary (LATAM) markets to maximize organic reach for
// both locales. lat/lng in WGS84 decimal degrees. tz in IANA tz database.
// ---------------------------------------------------------------------------

export interface CityEntry {
  slug: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  tz: string;
}

export const TOP_CITIES: readonly CityEntry[] = [
  // EN-primary
  { slug: 'new-york',     name: 'New York',     country: 'US', lat: 40.7128,  lng:  -74.0060, tz: 'America/New_York' },
  { slug: 'los-angeles',  name: 'Los Angeles',  country: 'US', lat: 34.0522,  lng: -118.2437, tz: 'America/Los_Angeles' },
  { slug: 'chicago',      name: 'Chicago',      country: 'US', lat: 41.8781,  lng:  -87.6298, tz: 'America/Chicago' },
  { slug: 'london',       name: 'London',       country: 'GB', lat: 51.5074,  lng:   -0.1278, tz: 'Europe/London' },
  { slug: 'toronto',      name: 'Toronto',      country: 'CA', lat: 43.6532,  lng:  -79.3832, tz: 'America/Toronto' },
  { slug: 'sydney',       name: 'Sydney',       country: 'AU', lat: -33.8688, lng:  151.2093, tz: 'Australia/Sydney' },
  { slug: 'singapore',    name: 'Singapore',    country: 'SG', lat:  1.3521,  lng:  103.8198, tz: 'Asia/Singapore' },
  { slug: 'dubai',        name: 'Dubai',        country: 'AE', lat: 25.2048,  lng:   55.2708, tz: 'Asia/Dubai' },
  { slug: 'mumbai',       name: 'Mumbai',       country: 'IN', lat: 19.0760,  lng:   72.8777, tz: 'Asia/Kolkata' },
  { slug: 'amsterdam',    name: 'Amsterdam',    country: 'NL', lat: 52.3676,  lng:    4.9041, tz: 'Europe/Amsterdam' },
  // ES-primary (LATAM + Spain)
  { slug: 'ciudad-de-mexico', name: 'Ciudad de México', country: 'MX', lat: 19.4326,  lng:  -99.1332, tz: 'America/Mexico_City' },
  { slug: 'buenos-aires',     name: 'Buenos Aires',     country: 'AR', lat: -34.6037, lng:  -58.3816, tz: 'America/Argentina/Buenos_Aires' },
  { slug: 'bogota',           name: 'Bogotá',           country: 'CO', lat:   4.7110, lng:  -74.0721, tz: 'America/Bogota' },
  { slug: 'lima',             name: 'Lima',             country: 'PE', lat: -12.0464, lng:  -77.0428, tz: 'America/Lima' },
  { slug: 'santiago',         name: 'Santiago',         country: 'CL', lat: -33.4489, lng:  -70.6693, tz: 'America/Santiago' },
  { slug: 'sao-paulo',        name: 'São Paulo',        country: 'BR', lat: -23.5505, lng:  -46.6333, tz: 'America/Sao_Paulo' },
  { slug: 'rio-de-janeiro',   name: 'Rio de Janeiro',   country: 'BR', lat: -22.9068, lng:  -43.1729, tz: 'America/Sao_Paulo' },
  { slug: 'madrid',           name: 'Madrid',           country: 'ES', lat:  40.4168, lng:   -3.7038, tz: 'Europe/Madrid' },
  { slug: 'barcelona',        name: 'Barcelona',        country: 'ES', lat:  41.3851, lng:    2.1734, tz: 'Europe/Madrid' },
  { slug: 'caracas',          name: 'Caracas',          country: 'VE', lat:  10.4806, lng:  -66.9036, tz: 'America/Caracas' },
];

export const ALL_CITY_SLUGS: readonly string[] = TOP_CITIES.map((c) => c.slug);

const CITY_BY_SLUG = new Map(TOP_CITIES.map((c) => [c.slug, c]));

export function findCityBySlug(slug: string): CityEntry | undefined {
  return CITY_BY_SLUG.get(slug);
}
