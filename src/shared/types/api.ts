import type { ChartResult, PlanetaryHour } from './astrology';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface ChartCalculateResponse {
  chartId: string;
  chart: ChartResult;
}

export interface MoonPhaseResponse {
  phase: string;
  illumination: number;
  angle: number;
  emoji: string;
  nextNewMoon: string;
  nextFullMoon: string;
}

export interface PlanetaryHoursResponse {
  hours: PlanetaryHour[];
  currentHour: PlanetaryHour | null;
  sunrise: string;
  sunset: string;
}

export interface CitySearchResult {
  name: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number;
}

export interface CitySearchResponse {
  results: CitySearchResult[];
}

export interface PassportResponse {
  id: string;
  sunSign: string;
  moonSign: string;
  ascendantSign: string | null;
  element: string;
  rulingPlanet: string;
  rarityPercent: number;
}

/** Saved chart summary — returned from list endpoint (no birth data). */
export interface ChartSummary {
  id: string;
  name: string | null;
  houseSystem: string;
  ayanamsa: string;
  sunSign: string | null;
  moonSign: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Full chart — returned from GET /chart/:id (includes decrypted birth data). */
export interface ChartDetailResponse {
  id: string;
  name: string | null;
  houseSystem: string;
  ayanamsa: string;
  birthDate: string;
  birthTime: string | null;
  birthLatitude: number;
  birthLongitude: number;
  birthTimezone: string;
  chartData: ChartResult;
  createdAt: string;
  updatedAt: string;
}

export interface ChartSaveResponse {
  id: string;
  name: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChartListResponse {
  charts: ChartSummary[];
}
