/**
 * Script to generate reference chart fixtures.
 * Runs calculateChart() for 100+ cases and records tropical positions.
 * Run: npx tsx scripts/generate-fixtures.ts
 */

import { calculateChart } from '../src/modules/astro-engine/chart';
import { HouseSystem, Planet } from '../src/shared/types/astrology';
import * as fs from 'fs';
import * as path from 'path';

interface FixtureInput {
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  houseSystem: 'Placidus';
}

interface FixtureExpected {
  sun: { tropicalDegree: number; sign: string; signDegree: number };
  moon: { tropicalDegree: number; sign: string; signDegree: number };
  mercury: { tropicalDegree: number };
  venus: { tropicalDegree: number };
  mars: { tropicalDegree: number };
  jupiter: { tropicalDegree: number };
  saturn: { tropicalDegree: number };
  ascendant: number | null;
  midheaven: number | null;
}

interface Fixture {
  name: string;
  input: FixtureInput;
  expected: FixtureExpected;
}

interface RawInput {
  name: string;
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
}

const RAW_INPUTS: RawInput[] = [
  // ============================================================
  // Famous charts (10)
  // ============================================================
  {
    name: 'Aleister Crowley',
    date: '1875-10-12', time: '23:42',
    latitude: 52.2852, longitude: -1.5242, timezone: 'Europe/London',
  },
  {
    name: 'Albert Einstein',
    date: '1879-03-14', time: '11:30',
    latitude: 48.4011, longitude: 9.9876, timezone: 'Europe/Berlin',
  },
  {
    name: 'Nikola Tesla',
    date: '1856-07-10', time: '00:00',
    latitude: 44.5372, longitude: 15.3214, timezone: 'Europe/Belgrade',
  },
  {
    name: 'Steve Jobs',
    date: '1955-02-24', time: '19:15',
    latitude: 37.7749, longitude: -122.4194, timezone: 'America/Los_Angeles',
  },
  {
    name: 'Princess Diana',
    date: '1961-07-01', time: '19:45',
    latitude: 52.8275, longitude: 0.5150, timezone: 'Europe/London',
  },
  {
    name: 'Frida Kahlo',
    date: '1907-07-06', time: '08:30',
    latitude: 19.3500, longitude: -99.1617, timezone: 'America/Mexico_City',
  },
  {
    name: 'Nelson Mandela',
    date: '1918-07-18', time: '14:54',
    latitude: -31.7833, longitude: 28.7500, timezone: 'Africa/Johannesburg',
  },
  {
    name: 'Marie Curie',
    date: '1867-11-07', time: '12:00',
    latitude: 52.2297, longitude: 21.0122, timezone: 'Europe/Warsaw',
  },
  {
    name: 'Mahatma Gandhi',
    date: '1869-10-02', time: '07:33',
    latitude: 21.6417, longitude: 69.6293, timezone: 'Asia/Kolkata',
  },
  {
    name: 'Wolfgang Amadeus Mozart',
    date: '1756-01-27', time: '20:00',
    latitude: 47.8011, longitude: 13.0445, timezone: 'Europe/Vienna',
  },

  // ============================================================
  // Geographic spread (20) — different world cities, diverse latitudes
  // ============================================================
  {
    name: 'Moscow born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 55.7558, longitude: 37.6173, timezone: 'Europe/Moscow',
  },
  {
    name: 'Tokyo born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo',
  },
  {
    name: 'Sydney born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney',
  },
  {
    name: 'Buenos Aires born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: -34.6037, longitude: -58.3816, timezone: 'America/Argentina/Buenos_Aires',
  },
  {
    name: 'Cairo born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 30.0444, longitude: 31.2357, timezone: 'Africa/Cairo',
  },
  {
    name: 'Mumbai born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 19.0760, longitude: 72.8777, timezone: 'Asia/Kolkata',
  },
  {
    name: 'Reykjavik born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 64.1355, longitude: -21.8954, timezone: 'Atlantic/Reykjavik',
  },
  {
    name: 'Cape Town born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: -33.9249, longitude: 18.4241, timezone: 'Africa/Johannesburg',
  },
  {
    name: 'Bangkok born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 13.7563, longitude: 100.5018, timezone: 'Asia/Bangkok',
  },
  {
    name: 'Lima born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: -12.0464, longitude: -77.0428, timezone: 'America/Lima',
  },
  {
    name: 'Auckland born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: -36.8509, longitude: 174.7645, timezone: 'Pacific/Auckland',
  },
  {
    name: 'Dubai born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 25.2048, longitude: 55.2708, timezone: 'Asia/Dubai',
  },
  {
    name: 'Mexico City born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 19.4326, longitude: -99.1332, timezone: 'America/Mexico_City',
  },
  {
    name: 'Lagos born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 6.5244, longitude: 3.3792, timezone: 'Africa/Lagos',
  },
  {
    name: 'Toronto born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 43.6532, longitude: -79.3832, timezone: 'America/Toronto',
  },
  {
    name: 'Seoul born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 37.5665, longitude: 126.9780, timezone: 'Asia/Seoul',
  },
  {
    name: 'Sao Paulo born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: -23.5505, longitude: -46.6333, timezone: 'America/Sao_Paulo',
  },
  {
    name: 'Helsinki born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 60.1699, longitude: 24.9384, timezone: 'Europe/Helsinki',
  },
  {
    name: 'Singapore born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: 1.3521, longitude: 103.8198, timezone: 'Asia/Singapore',
  },
  {
    name: 'Nairobi born 1990-06-12 noon',
    date: '1990-06-12', time: '12:00',
    latitude: -1.2921, longitude: 36.8219, timezone: 'Africa/Nairobi',
  },

  // ============================================================
  // Time edge cases (15)
  // ============================================================
  {
    name: 'Midnight birth 2000-01-01 London',
    date: '2000-01-01', time: '00:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Just before midnight 2000-01-01 London',
    date: '2000-01-01', time: '23:59',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Noon birth 2000-01-01 London',
    date: '2000-01-01', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'No birth time 2000-01-01 London',
    date: '2000-01-01', time: null,
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'No birth time 1980-03-15 New York',
    date: '1980-03-15', time: null,
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'No birth time 1995-08-22 Tokyo',
    date: '1995-08-22', time: null,
    latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo',
  },
  {
    name: 'No birth time 2010-12-01 Sydney',
    date: '2010-12-01', time: null,
    latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney',
  },
  {
    name: 'No birth time 1965-07-04 Chicago',
    date: '1965-07-04', time: null,
    latitude: 41.8781, longitude: -87.6298, timezone: 'America/Chicago',
  },
  // DST transition dates
  {
    name: 'DST spring forward USA 2023-03-12 New York',
    date: '2023-03-12', time: '02:30',
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'DST fall back USA 2023-11-05 New York',
    date: '2023-11-05', time: '01:30',
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'DST spring forward UK 2023-03-26 London',
    date: '2023-03-26', time: '01:30',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'DST fall back UK 2023-10-29 London',
    date: '2023-10-29', time: '01:30',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Midnight UTC boundary 2000-01-01 Reykjavik',
    date: '2000-01-01', time: '00:00',
    latitude: 64.1355, longitude: -21.8954, timezone: 'Atlantic/Reykjavik',
  },
  {
    name: 'Midnight birth Tokyo 2000-01-01',
    date: '2000-01-01', time: '00:00',
    latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo',
  },
  {
    name: 'Near midnight Sydney 1999-12-31',
    date: '1999-12-31', time: '23:59',
    latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney',
  },

  // ============================================================
  // Latitude extremes (10)
  // ============================================================
  {
    name: 'Tromso Norway — polar latitude 69.6N',
    date: '2000-06-21', time: '12:00',
    latitude: 69.6500, longitude: 18.9560, timezone: 'Europe/Oslo',
  },
  {
    name: 'Reykjavik 64.1N near polar boundary',
    date: '2000-06-21', time: '12:00',
    latitude: 64.1355, longitude: -21.8954, timezone: 'Atlantic/Reykjavik',
  },
  {
    name: 'Helsinki 60.2N summer solstice',
    date: '2000-06-21', time: '12:00',
    latitude: 60.1699, longitude: 24.9384, timezone: 'Europe/Helsinki',
  },
  {
    name: 'Ushuaia Argentina -54.8S extreme south',
    date: '2000-06-21', time: '12:00',
    latitude: -54.8019, longitude: -68.3030, timezone: 'America/Argentina/Ushuaia',
  },
  {
    name: 'Quito Ecuador 0.22S near equator',
    date: '2000-06-21', time: '12:00',
    latitude: -0.2295, longitude: -78.5243, timezone: 'America/Guayaquil',
  },
  {
    name: 'Svalbard 78N extreme polar',
    date: '2000-06-21', time: '12:00',
    latitude: 78.2232, longitude: 15.6469, timezone: 'Arctic/Longyearbyen',
  },
  {
    name: 'Anchorage Alaska 61.2N subarctic',
    date: '2000-06-21', time: '12:00',
    latitude: 61.2181, longitude: -149.9003, timezone: 'America/Anchorage',
  },
  {
    name: 'McMurdo Station Antarctica -77.8S extreme south',
    date: '2000-06-21', time: '12:00',
    latitude: -77.8419, longitude: 166.6863, timezone: 'Antarctica/McMurdo',
  },
  {
    name: 'Fairbanks Alaska 64.8N high latitude',
    date: '2000-12-21', time: '12:00',
    latitude: 64.8378, longitude: -147.7164, timezone: 'America/Anchorage',
  },
  {
    name: 'Punta Arenas Chile -53.1S',
    date: '2000-06-21', time: '12:00',
    latitude: -53.1548, longitude: -70.9110, timezone: 'America/Punta_Arenas',
  },

  // ============================================================
  // Historical dates (10)
  // ============================================================
  {
    name: 'Historical 1800-01-01 London',
    date: '1800-01-01', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Historical 1850-06-15 Paris',
    date: '1850-06-15', time: '12:00',
    latitude: 48.8566, longitude: 2.3522, timezone: 'Europe/Paris',
  },
  {
    name: 'Historical 1900-03-21 Berlin',
    date: '1900-03-21', time: '12:00',
    latitude: 52.5200, longitude: 13.4050, timezone: 'Europe/Berlin',
  },
  {
    name: 'Historical 1950-09-10 New York',
    date: '1950-09-10', time: '12:00',
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'Recent 2024-01-01 London',
    date: '2024-01-01', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Recent 2024-06-21 New York',
    date: '2024-06-21', time: '12:00',
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'Recent 2025-03-15 Tokyo',
    date: '2025-03-15', time: '12:00',
    latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo',
  },
  {
    name: 'Future 2030-12-25 London',
    date: '2030-12-25', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Future 2050-06-21 New York',
    date: '2050-06-21', time: '12:00',
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'Historical 1920-11-11 Paris',
    date: '1920-11-11', time: '11:11',
    latitude: 48.8566, longitude: 2.3522, timezone: 'Europe/Paris',
  },

  // ============================================================
  // Consecutive dates (10) — same location, verify Sun moves ~1°/day
  // ============================================================
  {
    name: 'Consecutive Sun movement Day 1 — 2000-01-01 London noon',
    date: '2000-01-01', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Consecutive Sun movement Day 2 — 2000-01-02 London noon',
    date: '2000-01-02', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Consecutive Sun movement Day 3 — 2000-01-03 London noon',
    date: '2000-01-03', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Consecutive Sun movement Day 4 — 2000-01-04 London noon',
    date: '2000-01-04', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Consecutive Sun movement Day 5 — 2000-01-05 London noon',
    date: '2000-01-05', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Consecutive Moon check Day 1 — 2010-05-01 London noon',
    date: '2010-05-01', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Consecutive Moon check Day 2 — 2010-05-02 London noon',
    date: '2010-05-02', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Consecutive Moon check Day 3 — 2010-05-03 London noon',
    date: '2010-05-03', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Consecutive Moon check Day 4 — 2010-05-04 London noon',
    date: '2010-05-04', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Consecutive Moon check Day 5 — 2010-05-05 London noon',
    date: '2010-05-05', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },

  // ============================================================
  // Seasonal (10) — same location, different seasons
  // ============================================================
  {
    name: 'Seasonal spring equinox 2020-03-20 London',
    date: '2020-03-20', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Seasonal summer solstice 2020-06-21 London',
    date: '2020-06-21', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Seasonal autumn equinox 2020-09-22 London',
    date: '2020-09-22', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Seasonal winter solstice 2020-12-21 London',
    date: '2020-12-21', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Seasonal mid-spring 2020-04-15 New York',
    date: '2020-04-15', time: '12:00',
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'Seasonal mid-summer 2020-07-15 New York',
    date: '2020-07-15', time: '12:00',
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'Seasonal mid-autumn 2020-10-15 New York',
    date: '2020-10-15', time: '12:00',
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'Seasonal mid-winter 2020-01-15 New York',
    date: '2020-01-15', time: '12:00',
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'Southern hemisphere winter 2020-06-21 Sydney',
    date: '2020-06-21', time: '12:00',
    latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney',
  },
  {
    name: 'Southern hemisphere summer 2020-12-21 Sydney',
    date: '2020-12-21', time: '12:00',
    latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney',
  },

  // ============================================================
  // Retrograde check (5) — known Mercury retrograde dates
  // ============================================================
  {
    name: 'Mercury retrograde 2024-04-01 London (Mercury Rx Apr 2024)',
    date: '2024-04-01', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Mercury retrograde 2024-08-10 New York (Mercury Rx Aug 2024)',
    date: '2024-08-10', time: '12:00',
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'Mercury retrograde 2023-12-15 London (Mercury Rx Dec 2023)',
    date: '2023-12-15', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Venus retrograde 2023-08-01 New York (Venus Rx Jul-Sep 2023)',
    date: '2023-08-01', time: '12:00',
    latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York',
  },
  {
    name: 'Mars retrograde 2022-12-01 London (Mars Rx Oct 2022-Jan 2023)',
    date: '2022-12-01', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },

  // ============================================================
  // Southern hemisphere houses (10)
  // ============================================================
  {
    name: 'Southern hemisphere houses Sydney 1985-03-10 08:00',
    date: '1985-03-10', time: '08:00',
    latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney',
  },
  {
    name: 'Southern hemisphere houses Melbourne 1990-07-22 15:30',
    date: '1990-07-22', time: '15:30',
    latitude: -37.8136, longitude: 144.9631, timezone: 'Australia/Melbourne',
  },
  {
    name: 'Southern hemisphere houses Buenos Aires 1975-11-15 20:00',
    date: '1975-11-15', time: '20:00',
    latitude: -34.6037, longitude: -58.3816, timezone: 'America/Argentina/Buenos_Aires',
  },
  {
    name: 'Southern hemisphere houses Cape Town 2000-01-15 09:00',
    date: '2000-01-15', time: '09:00',
    latitude: -33.9249, longitude: 18.4241, timezone: 'Africa/Johannesburg',
  },
  {
    name: 'Southern hemisphere houses Lima Peru 2005-05-20 07:00',
    date: '2005-05-20', time: '07:00',
    latitude: -12.0464, longitude: -77.0428, timezone: 'America/Lima',
  },
  {
    name: 'Southern hemisphere houses Auckland 1995-09-01 17:00',
    date: '1995-09-01', time: '17:00',
    latitude: -36.8509, longitude: 174.7645, timezone: 'Pacific/Auckland',
  },
  {
    name: 'Southern hemisphere houses Johannesburg 2010-02-14 10:00',
    date: '2010-02-14', time: '10:00',
    latitude: -26.2041, longitude: 28.0473, timezone: 'Africa/Johannesburg',
  },
  {
    name: 'Southern hemisphere houses Santiago Chile 1988-08-08 08:08',
    date: '1988-08-08', time: '08:08',
    latitude: -33.4489, longitude: -70.6693, timezone: 'America/Santiago',
  },
  {
    name: 'Southern hemisphere houses Perth Australia 2003-04-04 04:04',
    date: '2003-04-04', time: '04:04',
    latitude: -31.9505, longitude: 115.8605, timezone: 'Australia/Perth',
  },
  {
    name: 'Southern hemisphere houses Montevideo Uruguay 1999-06-30 18:30',
    date: '1999-06-30', time: '18:30',
    latitude: -34.9011, longitude: -56.1645, timezone: 'America/Montevideo',
  },

  // ============================================================
  // Additional variety (extra to exceed 100 total)
  // ============================================================
  {
    name: 'New Year 2024 midnight Moscow',
    date: '2024-01-01', time: '00:00',
    latitude: 55.7558, longitude: 37.6173, timezone: 'Europe/Moscow',
  },
  {
    name: 'Solar eclipse 2024-04-08 Dallas TX',
    date: '2024-04-08', time: '13:30',
    latitude: 32.7767, longitude: -96.7970, timezone: 'America/Chicago',
  },
  {
    name: 'Chinese New Year 2024-02-10 Beijing',
    date: '2024-02-10', time: '00:00',
    latitude: 39.9042, longitude: 116.4074, timezone: 'Asia/Shanghai',
  },
  {
    name: 'Vernal equinox 2024-03-20 UTC',
    date: '2024-03-20', time: '03:06',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Summer solstice 2024-06-20 London',
    date: '2024-06-20', time: '20:51',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Autumnal equinox 2024-09-22 London',
    date: '2024-09-22', time: '12:43',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Winter solstice 2024-12-21 London',
    date: '2024-12-21', time: '09:20',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'New Moon 2024-01-11 London noon',
    date: '2024-01-11', time: '11:57',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Full Moon 2024-01-25 London noon',
    date: '2024-01-25', time: '17:54',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
  {
    name: 'Leap day 2000-02-29 London noon',
    date: '2000-02-29', time: '12:00',
    latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London',
  },
];

function generateFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];

  for (const raw of RAW_INPUTS) {
    try {
      const result = calculateChart({
        date: raw.date,
        time: raw.time,
        latitude: raw.latitude,
        longitude: raw.longitude,
        timezone: raw.timezone,
        houseSystem: HouseSystem.Placidus,
      });

      const getPlanet = (name: Planet) => result.planets.find(p => p.planet === name)!;

      const sun = getPlanet(Planet.Sun);
      const moon = getPlanet(Planet.Moon);
      const mercury = getPlanet(Planet.Mercury);
      const venus = getPlanet(Planet.Venus);
      const mars = getPlanet(Planet.Mars);
      const jupiter = getPlanet(Planet.Jupiter);
      const saturn = getPlanet(Planet.Saturn);

      const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

      const fixture: Fixture = {
        name: raw.name,
        input: {
          date: raw.date,
          time: raw.time,
          latitude: raw.latitude,
          longitude: raw.longitude,
          timezone: raw.timezone,
          houseSystem: 'Placidus',
        },
        expected: {
          sun: {
            tropicalDegree: round6(sun.tropicalDegree),
            sign: sun.sign,
            signDegree: sun.signDegree,
          },
          moon: {
            tropicalDegree: round6(moon.tropicalDegree),
            sign: moon.sign,
            signDegree: moon.signDegree,
          },
          mercury: { tropicalDegree: round6(mercury.tropicalDegree) },
          venus: { tropicalDegree: round6(venus.tropicalDegree) },
          mars: { tropicalDegree: round6(mars.tropicalDegree) },
          jupiter: { tropicalDegree: round6(jupiter.tropicalDegree) },
          saturn: { tropicalDegree: round6(saturn.tropicalDegree) },
          ascendant: result.ascendant ? round6(result.ascendant.tropicalDegree) : null,
          midheaven: result.midheaven ? round6(result.midheaven.tropicalDegree) : null,
        },
      };

      fixtures.push(fixture);
      process.stdout.write('.');
    } catch (err) {
      console.error(`\nFailed for ${raw.name}:`, err);
    }
  }

  return fixtures;
}

const fixtures = generateFixtures();
console.log(`\nGenerated ${fixtures.length} fixtures`);

const outputPath = path.resolve(__dirname, '../tests/astro/fixtures/reference-charts.json');
fs.writeFileSync(outputPath, JSON.stringify(fixtures, null, 2));
console.log(`Written to ${outputPath}`);
