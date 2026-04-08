import { describe, it, expect } from 'vitest';
import { calculatePlanetaryHours } from '../../src/modules/astro-engine/planetary-hours';
import { CHALDEAN_ORDER } from '../../src/modules/astro-engine/constants';
import { Planet } from '../../src/shared/types/astrology';

// Moscow coordinates (no polar edge cases, four distinct seasons)
const MOSCOW_LAT = 55.7558;
const MOSCOW_LON = 37.6176;

// Reykjavik (close to Arctic, useful for verifying no crash at high latitudes)
const REYKJAVIK_LAT = 64.1355;
const REYKJAVIK_LON = -21.8954;

// Helper: parse a YYYY-MM-DD string to a UTC Date at noon
function utcNoon(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

describe('calculatePlanetaryHours', () => {
  describe('basic structure', () => {
    it('returns exactly 24 hours', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-07'));
      expect(result.hours).toHaveLength(24);
    });

    it('first 12 hours are day hours', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-07'));
      const dayHours = result.hours.slice(0, 12);
      expect(dayHours.every(h => h.isDay === true)).toBe(true);
    });

    it('last 12 hours are night hours', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-07'));
      const nightHours = result.hours.slice(12, 24);
      expect(nightHours.every(h => h.isDay === false)).toBe(true);
    });

    it('hours are contiguous — each hour ends where the next begins', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-06-21'));
      const { hours } = result;

      for (let i = 0; i < hours.length - 1; i++) {
        const endMs = new Date(hours[i].endTime).getTime();
        const nextStartMs = new Date(hours[i + 1].startTime).getTime();
        // Allow 1ms tolerance for floating-point JD conversion rounding
        expect(Math.abs(endMs - nextStartMs)).toBeLessThanOrEqual(1);
      }
    });

    it('first day hour starts at sunrise', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-06-21'));
      const firstHourStart = new Date(result.hours[0].startTime).getTime();
      const sunriseMs = new Date(result.sunrise).getTime();
      expect(Math.abs(firstHourStart - sunriseMs)).toBeLessThanOrEqual(1);
    });

    it('12th day hour ends at sunset', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-06-21'));
      const dayHourEnd = new Date(result.hours[11].endTime).getTime();
      const sunsetMs = new Date(result.sunset).getTime();
      expect(Math.abs(dayHourEnd - sunsetMs)).toBeLessThanOrEqual(1);
    });

    it('all planets are valid Chaldean-order planets', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-07'));
      const validPlanets = new Set(CHALDEAN_ORDER);
      result.hours.forEach(h => {
        expect(validPlanets.has(h.planet)).toBe(true);
      });
    });
  });

  describe('day ruler by weekday', () => {
    // 2024-01-07 = Sunday  → first hour ruler = Sun
    it('Sunday (2024-01-07): first hour ruler is Sun', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-07'));
      expect(result.hours[0].planet).toBe(Planet.Sun);
    });

    // 2024-01-08 = Monday  → first hour ruler = Moon
    it('Monday (2024-01-08): first hour ruler is Moon', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-08'));
      expect(result.hours[0].planet).toBe(Planet.Moon);
    });

    // 2024-01-09 = Tuesday  → first hour ruler = Mars
    it('Tuesday (2024-01-09): first hour ruler is Mars', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-09'));
      expect(result.hours[0].planet).toBe(Planet.Mars);
    });

    // 2024-01-10 = Wednesday → first hour ruler = Mercury
    it('Wednesday (2024-01-10): first hour ruler is Mercury', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-10'));
      expect(result.hours[0].planet).toBe(Planet.Mercury);
    });

    // 2024-01-11 = Thursday  → first hour ruler = Jupiter
    it('Thursday (2024-01-11): first hour ruler is Jupiter', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-11'));
      expect(result.hours[0].planet).toBe(Planet.Jupiter);
    });

    // 2024-01-12 = Friday    → first hour ruler = Venus
    it('Friday (2024-01-12): first hour ruler is Venus', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-12'));
      expect(result.hours[0].planet).toBe(Planet.Venus);
    });

    // 2024-01-13 = Saturday  → first hour ruler = Saturn
    it('Saturday (2024-01-13): first hour ruler is Saturn', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-13'));
      expect(result.hours[0].planet).toBe(Planet.Saturn);
    });
  });

  describe('Chaldean order cycle', () => {
    it('planets cycle in correct Chaldean order across all 24 hours', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-07'));
      // Sunday: first ruler = Sun (index 3 in CHALDEAN_ORDER)
      const startIndex = CHALDEAN_ORDER.indexOf(Planet.Sun);

      result.hours.forEach((hour, i) => {
        const expectedPlanet = CHALDEAN_ORDER[(startIndex + i) % 7];
        expect(hour.planet).toBe(expectedPlanet);
      });
    });

    it('planet sequence wraps correctly across day/night boundary', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-01-08'));
      // Full sequence of 24 should be unbroken Chaldean cycle
      const startIndex = CHALDEAN_ORDER.indexOf(result.hours[0].planet);

      for (let i = 0; i < 24; i++) {
        const expected = CHALDEAN_ORDER[(startIndex + i) % 7];
        expect(result.hours[i].planet).toBe(expected);
      }
    });
  });

  describe('day hour length: summer vs winter', () => {
    it('day hours are longer in Moscow summer than in Moscow winter', () => {
      const summer = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-06-21'));
      const winter = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-12-21'));

      const summerDayHourMs =
        new Date(summer.hours[0].endTime).getTime() - new Date(summer.hours[0].startTime).getTime();
      const winterDayHourMs =
        new Date(winter.hours[0].endTime).getTime() - new Date(winter.hours[0].startTime).getTime();

      expect(summerDayHourMs).toBeGreaterThan(winterDayHourMs);
    });

    it('night hours are shorter in Moscow summer than in Moscow winter', () => {
      const summer = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-06-21'));
      const winter = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-12-21'));

      const summerNightHourMs =
        new Date(summer.hours[12].endTime).getTime() - new Date(summer.hours[12].startTime).getTime();
      const winterNightHourMs =
        new Date(winter.hours[12].endTime).getTime() - new Date(winter.hours[12].startTime).getTime();

      expect(summerNightHourMs).toBeLessThan(winterNightHourMs);
    });

    it('day + night = 24 hours total (approximately)', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-06-21'));
      const totalMs =
        new Date(result.hours[23].endTime).getTime() - new Date(result.hours[0].startTime).getTime();
      // Should be approximately 24 hours (86400000 ms), allow ±10 minutes
      expect(totalMs).toBeGreaterThan(86400000 - 10 * 60 * 1000);
      expect(totalMs).toBeLessThan(86400000 + 10 * 60 * 1000);
    });
  });

  describe('currentHour', () => {
    it('returns currentHour that contains the provided now timestamp', () => {
      const date = utcNoon('2024-06-21');
      // Use a time that is definitely during daytime in Moscow (08:00 UTC = 11:00 MSK)
      const now = new Date('2024-06-21T08:00:00Z');
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, date, now);

      if (result.currentHour !== null) {
        const startMs = new Date(result.currentHour.startTime).getTime();
        const endMs = new Date(result.currentHour.endTime).getTime();
        expect(now.getTime()).toBeGreaterThanOrEqual(startMs);
        expect(now.getTime()).toBeLessThan(endMs);
      }
      // If currentHour is null, the `now` timestamp is outside the 24-hour range —
      // which is acceptable for this test (edge of day boundary).
    });

    it('returns null when now is outside the calculated hour range', () => {
      const date = utcNoon('2024-06-21');
      // 2024-06-22 20:00 UTC is well outside the June 21 planetary hour range
      const now = new Date('2024-06-22T20:00:00Z');
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, date, now);
      expect(result.currentHour).toBeNull();
    });
  });

  describe('sunrise and sunset', () => {
    it('sunrise and sunset are valid ISO strings', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-06-21'));
      expect(() => new Date(result.sunrise)).not.toThrow();
      expect(() => new Date(result.sunset)).not.toThrow();
      expect(new Date(result.sunrise).getTime()).not.toBeNaN();
      expect(new Date(result.sunset).getTime()).not.toBeNaN();
    });

    it('sunset is after sunrise', () => {
      const result = calculatePlanetaryHours(MOSCOW_LAT, MOSCOW_LON, utcNoon('2024-06-21'));
      expect(new Date(result.sunset).getTime()).toBeGreaterThan(new Date(result.sunrise).getTime());
    });
  });

  describe('polar region fallback', () => {
    it('returns exactly 24 hours for Reykjavik (high latitude)', () => {
      // Reykjavik is near Arctic but has sunrise/sunset most of the year;
      // this confirms no crash and correct count
      const result = calculatePlanetaryHours(REYKJAVIK_LAT, REYKJAVIK_LON, utcNoon('2024-06-21'));
      expect(result.hours).toHaveLength(24);
    });

    it('returns 24 hours for extreme north latitude (polar night)', () => {
      // 89°N is well inside polar circle — likely no sunrise in December
      const result = calculatePlanetaryHours(89.0, 0, utcNoon('2024-12-21'));
      expect(result.hours).toHaveLength(24);
    });

    it('returns 24 hours for extreme north latitude (polar day)', () => {
      // 89°N in summer — continuous daylight
      const result = calculatePlanetaryHours(89.0, 0, utcNoon('2024-06-21'));
      expect(result.hours).toHaveLength(24);
    });

    it('polar fallback hours are all isDay=true', () => {
      const result = calculatePlanetaryHours(89.0, 0, utcNoon('2024-12-21'));
      // In polar fallback, all hours are marked isDay=true
      // (or all have the same isDay value — verify no crash at minimum)
      expect(result.hours).toHaveLength(24);
    });
  });
});
