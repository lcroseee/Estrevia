/**
 * Tests for aspect calculation:
 * - Conjunction near 0°/360° boundary
 * - Opposition detection
 * - Applying vs separating
 * - Retrograde body aspects
 * - Known aspect types
 */

import { describe, it, expect } from 'vitest';
import { calculateAspects } from '@/modules/astro-engine/aspects';
import { calculateChart } from '@/modules/astro-engine/chart';
import { AspectType, HouseSystem, Planet, PlanetPosition, Sign } from '@/shared/types/astrology';

/** Build a minimal PlanetPosition for testing */
function makePlanet(
  planet: Planet,
  absoluteDegree: number,
  speed = 1.0,
): PlanetPosition {
  return {
    planet,
    absoluteDegree,
    tropicalDegree: absoluteDegree + 23.85, // arbitrary offset
    sign: Sign.Aries,
    signDegree: Math.floor(absoluteDegree % 30),
    minutes: 0,
    seconds: 0,
    isRetrograde: speed < 0,
    speed,
    house: null,
  };
}

describe('Conjunction detection near 0°/360° boundary', () => {
  it('358° and 2° are within conjunction orb (4° separation)', () => {
    const planets = [
      makePlanet(Planet.Sun, 358),
      makePlanet(Planet.Moon, 2),
    ];
    const aspects = calculateAspects(planets);
    const conjunctions = aspects.filter(a => a.type === AspectType.Conjunction);
    expect(conjunctions).toHaveLength(1);
    expect(conjunctions[0]!.orb).toBeCloseTo(4, 1);
  });

  it('355° and 5° are within conjunction orb (10° — outside orb 8°)', () => {
    const planets = [
      makePlanet(Planet.Sun, 355),
      makePlanet(Planet.Moon, 5),
    ];
    const aspects = calculateAspects(planets);
    const conjunctions = aspects.filter(a => a.type === AspectType.Conjunction);
    // 10° separation > 8° max orb — no conjunction
    expect(conjunctions).toHaveLength(0);
  });

  it('0° and 0° = exact conjunction (0° orb)', () => {
    const planets = [
      makePlanet(Planet.Sun, 0),
      makePlanet(Planet.Moon, 0),
    ];
    const aspects = calculateAspects(planets);
    const conjunctions = aspects.filter(a => a.type === AspectType.Conjunction);
    expect(conjunctions).toHaveLength(1);
    expect(conjunctions[0]!.orb).toBeCloseTo(0, 5);
  });

  it('360° and 0° = exact conjunction (boundary wrap)', () => {
    const planets = [
      makePlanet(Planet.Sun, 360), // sweph would never return this but test normalization
      makePlanet(Planet.Moon, 0),
    ];
    const aspects = calculateAspects(planets);
    const conjunctions = aspects.filter(a => a.type === AspectType.Conjunction);
    expect(conjunctions).toHaveLength(1);
  });
});

describe('Opposition detection', () => {
  it('180° exact opposition', () => {
    const planets = [
      makePlanet(Planet.Sun, 0),
      makePlanet(Planet.Moon, 180),
    ];
    const aspects = calculateAspects(planets);
    const oppositions = aspects.filter(a => a.type === AspectType.Opposition);
    expect(oppositions).toHaveLength(1);
    expect(oppositions[0]!.orb).toBeCloseTo(0, 5);
  });

  it('177° = 3° orb opposition', () => {
    const planets = [
      makePlanet(Planet.Sun, 0),
      makePlanet(Planet.Moon, 177),
    ];
    const aspects = calculateAspects(planets);
    const oppositions = aspects.filter(a => a.type === AspectType.Opposition);
    expect(oppositions).toHaveLength(1);
    expect(oppositions[0]!.orb).toBeCloseTo(3, 1);
  });

  it('no opposition at 170° (beyond 8° orb)', () => {
    const planets = [
      makePlanet(Planet.Sun, 0),
      makePlanet(Planet.Moon, 170),
    ];
    const aspects = calculateAspects(planets);
    const oppositions = aspects.filter(a => a.type === AspectType.Opposition);
    expect(oppositions).toHaveLength(0);
  });

  it('opposition across 360° boundary: 10° and 190°', () => {
    const planets = [
      makePlanet(Planet.Sun, 10),
      makePlanet(Planet.Moon, 190),
    ];
    const aspects = calculateAspects(planets);
    const oppositions = aspects.filter(a => a.type === AspectType.Opposition);
    expect(oppositions).toHaveLength(1);
    expect(oppositions[0]!.orb).toBeCloseTo(0, 5);
  });
});

describe('Trine, Square, Sextile detection', () => {
  it('120° = exact trine', () => {
    const planets = [
      makePlanet(Planet.Sun, 0),
      makePlanet(Planet.Moon, 120),
    ];
    const aspects = calculateAspects(planets);
    const trines = aspects.filter(a => a.type === AspectType.Trine);
    expect(trines).toHaveLength(1);
    expect(trines[0]!.orb).toBeCloseTo(0, 5);
  });

  it('90° = exact square', () => {
    const planets = [
      makePlanet(Planet.Sun, 0),
      makePlanet(Planet.Moon, 90),
    ];
    const aspects = calculateAspects(planets);
    const squares = aspects.filter(a => a.type === AspectType.Square);
    expect(squares).toHaveLength(1);
    expect(squares[0]!.orb).toBeCloseTo(0, 5);
  });

  it('60° = exact sextile', () => {
    const planets = [
      makePlanet(Planet.Sun, 0),
      makePlanet(Planet.Moon, 60),
    ];
    const aspects = calculateAspects(planets);
    const sextiles = aspects.filter(a => a.type === AspectType.Sextile);
    expect(sextiles).toHaveLength(1);
    expect(sextiles[0]!.orb).toBeCloseTo(0, 5);
  });
});

describe('Applying vs separating aspects', () => {
  it('faster planet moving toward exact aspect = applying', () => {
    // Sun at 92°, Moon at 0° → separation = 92°, target = 90° (square)
    // Moon (faster, 13°/day) moves forward from 0° → increases degree
    // In a small step: Moon at 0.013°, futureSep = |92-0.013| = 91.987°
    // |91.987 - 90| = 1.987 < |92 - 90| = 2.0 → approaching exact → APPLYING
    const sun = makePlanet(Planet.Sun, 92, 1.0);
    const moon = makePlanet(Planet.Moon, 0, 13.0);
    const aspects = calculateAspects([sun, moon]);
    const squares = aspects.filter(a => a.type === AspectType.Square);
    expect(squares).toHaveLength(1);
    expect(squares[0]!.isApplying).toBe(true);
  });

  it('faster planet moving away from exact aspect = separating', () => {
    // Sun at 88°, Moon at 0° → separation = 88°, target = 90° (square)
    // Moon (faster, 13°/day) moves forward from 0°: futurePos = 0.013°
    // futureSep = |88-0.013| = 87.987°
    // |87.987 - 90| = 2.013 > |88 - 90| = 2.0 → moving away from exact → SEPARATING
    const sun = makePlanet(Planet.Sun, 88, 1.0);
    const moon = makePlanet(Planet.Moon, 0, 13.0);
    const aspects = calculateAspects([sun, moon]);
    const squares = aspects.filter(a => a.type === AspectType.Square);
    expect(squares).toHaveLength(1);
    expect(squares[0]!.isApplying).toBe(false);
  });
});

describe('Retrograde planet aspects', () => {
  it('retrograde planet (negative speed) can form aspects', () => {
    const sun = makePlanet(Planet.Sun, 100, 1.0);
    const mercury = makePlanet(Planet.Mercury, 98, -0.5); // retrograde, 2° separation
    const aspects = calculateAspects([sun, mercury]);
    const conjunctions = aspects.filter(a => a.type === AspectType.Conjunction);
    expect(conjunctions).toHaveLength(1);
  });

  it('retrograde planet isRetrograde flag is set correctly', () => {
    const mercury = makePlanet(Planet.Mercury, 100, -0.5);
    expect(mercury.isRetrograde).toBe(true);
  });

  it('known Mercury retrograde date produces retrograde Mercury', () => {
    // Mercury stations retrograde on ~April 2, 2024, so April 5 is well into Rx
    const result = calculateChart({
      date: '2024-04-05',
      time: '12:00',
      latitude: 51.5074,
      longitude: -0.1278,
      timezone: 'Europe/London',
      houseSystem: HouseSystem.Placidus,
    });

    const mercury = result.planets.find(p => p.planet === Planet.Mercury)!;
    expect(mercury.isRetrograde).toBe(true);
    expect(mercury.speed).toBeLessThan(0);
  });

  it('known Venus retrograde date produces retrograde Venus', () => {
    // Venus retrograde July-September 2023
    const result = calculateChart({
      date: '2023-08-01',
      time: '12:00',
      latitude: 40.7128,
      longitude: -74.0060,
      timezone: 'America/New_York',
      houseSystem: HouseSystem.Placidus,
    });

    const venus = result.planets.find(p => p.planet === Planet.Venus)!;
    expect(venus.isRetrograde).toBe(true);
    expect(venus.speed).toBeLessThan(0);
  });

  it('known Mars retrograde date produces retrograde Mars', () => {
    // Mars retrograde October 2022 - January 2023
    const result = calculateChart({
      date: '2022-12-01',
      time: '12:00',
      latitude: 51.5074,
      longitude: -0.1278,
      timezone: 'Europe/London',
      houseSystem: HouseSystem.Placidus,
    });

    const mars = result.planets.find(p => p.planet === Planet.Mars)!;
    expect(mars.isRetrograde).toBe(true);
    expect(mars.speed).toBeLessThan(0);
  });
});

describe('Aspect orb values', () => {
  it('orb is rounded to 3 decimal places', () => {
    const sun = makePlanet(Planet.Sun, 0);
    const moon = makePlanet(Planet.Moon, 3.123456);
    const aspects = calculateAspects([sun, moon]);
    const conjunction = aspects.find(a => a.type === AspectType.Conjunction);
    expect(conjunction).toBeDefined();
    // Orb should be rounded to max 3 decimal places
    const orbStr = conjunction!.orb.toString();
    const decimalPart = orbStr.split('.')[1] ?? '';
    expect(decimalPart.length).toBeLessThanOrEqual(3);
  });

  it('exactDegree matches the aspect angle', () => {
    const sun = makePlanet(Planet.Sun, 0);
    const moon = makePlanet(Planet.Moon, 180);
    const aspects = calculateAspects([sun, moon]);
    const opposition = aspects.find(a => a.type === AspectType.Opposition);
    expect(opposition).toBeDefined();
    expect(opposition!.exactDegree).toBe(180);
  });
});

describe('Real chart aspects', () => {
  it('Aleister Crowley chart has at least 5 aspects', () => {
    const result = calculateChart({
      date: '1875-10-12',
      time: '23:42',
      latitude: 52.2852,
      longitude: -1.5242,
      timezone: 'Europe/London',
      houseSystem: HouseSystem.Placidus,
    });
    expect(result.aspects.length).toBeGreaterThan(5);
  });

  it('All aspects have valid planet1 and planet2', () => {
    const result = calculateChart({
      date: '2000-01-01',
      time: '12:00',
      latitude: 51.5074,
      longitude: -0.1278,
      timezone: 'Europe/London',
      houseSystem: HouseSystem.Placidus,
    });

    const validPlanets = Object.values(Planet);
    for (const aspect of result.aspects) {
      expect(validPlanets).toContain(aspect.planet1);
      expect(validPlanets).toContain(aspect.planet2);
      expect(aspect.planet1).not.toBe(aspect.planet2);
    }
  });

  it('All aspects have orb within defined tolerance', () => {
    const result = calculateChart({
      date: '2000-01-01',
      time: '12:00',
      latitude: 51.5074,
      longitude: -0.1278,
      timezone: 'Europe/London',
      houseSystem: HouseSystem.Placidus,
    });

    const maxOrbs: Record<string, number> = {
      Conjunction: 8,
      Opposition: 8,
      Trine: 8,
      Square: 7,
      Sextile: 6,
      Quincunx: 3,
      SemiSextile: 3,
    };

    for (const aspect of result.aspects) {
      const maxOrb = maxOrbs[aspect.type];
      expect(maxOrb, `Unknown aspect type: ${aspect.type}`).toBeDefined();
      expect(aspect.orb, `${aspect.type} orb ${aspect.orb} exceeds max ${maxOrb}`).toBeLessThanOrEqual(maxOrb!);
    }
  });
});
