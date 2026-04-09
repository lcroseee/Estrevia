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
  /** Sidereal Moon sign */
  moonSign: string | null;
  /** Sidereal Moon degree (0-360) */
  moonDegree: number | null;
  /** UTC ISO time when Moon entered current sign */
  signEntryTime: string | null;
  /** UTC ISO time when Moon exits current sign */
  signExitTime: string | null;
  /** UTC ISO time of moonrise (only if lat/lon provided) */
  moonrise: string | null;
  /** UTC ISO time of moonset (only if lat/lon provided) */
  moonset: string | null;
}

export interface MoonCalendarDay {
  date: string;
  phase: string;
  illumination: number;
  emoji: string;
  moonSign: string;
  moonDegree: number;
  isVoidOfCourse: boolean;
  vocStart: string | null;
  vocEnd: string | null;
}

export interface MoonCalendarResponse {
  year: number;
  month: number;
  days: MoonCalendarDay[];
}

export interface VocPeriod {
  start: string;
  end: string;
  lastAspect: { planet: string; aspect: string } | null;
  fromSign: string;
  toSign: string;
}

export interface VocMonthResponse {
  year: number;
  month: number;
  periods: VocPeriod[];
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
