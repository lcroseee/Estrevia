import { describe, it, expect } from 'vitest';
import {
  getBySign,
  getByPlanet,
  getByPath,
  getAllPaths,
  getAllSephiroth,
} from '@/modules/esoteric/lib/correspondences';
import { Sign, Planet } from '@/shared/types/astrology';

describe('777 Correspondences — data integrity', () => {
  it('has exactly 22 paths (11–32)', () => {
    const paths = getAllPaths();
    expect(paths).toHaveLength(22);
  });

  it('has exactly 10 Sephiroth (1–10)', () => {
    const sephiroth = getAllSephiroth();
    expect(sephiroth).toHaveLength(10);
  });

  it('total entries is 32 (10 Sephiroth + 22 paths)', () => {
    expect(getAllPaths().length + getAllSephiroth().length).toBe(32);
  });

  it('all paths have required non-empty fields', () => {
    for (const p of getAllPaths()) {
      expect(typeof p.path).toBe('number');
      expect(p.hebrewLetter).toBeTruthy();
      expect(p.hebrewSymbol).toBeTruthy();
      expect(p.meaning).toBeTruthy();
      expect(p.tarotTrump).toBeTruthy();
      expect(typeof p.tarotNumber).toBe('number');
      expect(p.color).toBeDefined();
      expect(p.color.king).toBeTruthy();
      expect(p.color.queen).toBeTruthy();
      expect(p.color.prince).toBeTruthy();
      expect(p.color.princess).toBeTruthy();
      expect(p.stone).toBeTruthy();
      expect(p.perfume).toBeTruthy();
      expect(p.plant).toBeTruthy();
      expect(p.animal).toBeTruthy();
      expect(p.astrologicalAttribution).toBeTruthy();
    }
  });

  it('all Hebrew letters are unique among paths 11–32', () => {
    const letters = getAllPaths().map((p) => p.hebrewLetter);
    const unique = new Set(letters);
    expect(unique.size).toBe(22);
  });

  it('all Hebrew symbols are unique among paths 11–32', () => {
    const symbols = getAllPaths().map((p) => p.hebrewSymbol);
    const unique = new Set(symbols);
    expect(unique.size).toBe(22);
  });

  it('all Tarot trumps are present (numbers 0–21)', () => {
    const numbers = getAllPaths().map((p) => p.tarotNumber).sort((a, b) => a - b);
    for (let i = 0; i <= 21; i++) {
      expect(numbers).toContain(i);
    }
  });

  it('all Tarot trump numbers are unique', () => {
    const numbers = getAllPaths().map((p) => p.tarotNumber);
    const unique = new Set(numbers);
    expect(unique.size).toBe(22);
  });
});

describe('777 Correspondences — getByPath', () => {
  it('path 11 = The Fool / Aleph / Air', () => {
    const entry = getByPath(11);
    expect(entry).not.toBeNull();
    expect(entry!.hebrewLetter).toBe('Aleph');
    expect(entry!.hebrewSymbol).toBe('א');
    expect(entry!.tarotTrump).toBe('The Fool');
    expect(entry!.tarotNumber).toBe(0);
    expect(entry!.element).toBe('Air');
    expect(entry!.zodiacOrPlanet).toBeNull();
  });

  it('path 13 = The High Priestess / Gimel / Moon', () => {
    const entry = getByPath(13);
    expect(entry).not.toBeNull();
    expect(entry!.hebrewLetter).toBe('Gimel');
    expect(entry!.hebrewSymbol).toBe('ג');
    expect(entry!.tarotTrump).toBe('The High Priestess');
    expect(entry!.tarotNumber).toBe(2);
    expect(entry!.zodiacOrPlanet).toBe('Moon');
  });

  it('returns null for non-existent path', () => {
    expect(getByPath(0)).toBeNull();
    expect(getByPath(33)).toBeNull();
    expect(getByPath(50)).toBeNull();
  });
});

describe('777 Correspondences — getBySign', () => {
  const expectedSignPaths: [Sign, number, string][] = [
    [Sign.Aries, 15, 'Heh'],
    [Sign.Taurus, 16, 'Vav'],
    [Sign.Gemini, 17, 'Zayin'],
    [Sign.Cancer, 18, 'Cheth'],
    [Sign.Leo, 19, 'Teth'],
    [Sign.Virgo, 20, 'Yod'],
    [Sign.Libra, 22, 'Lamed'],
    [Sign.Scorpio, 24, 'Nun'],
    [Sign.Sagittarius, 25, 'Samekh'],
    [Sign.Capricorn, 26, 'Ayin'],
    [Sign.Aquarius, 28, 'Tzaddi'],
    [Sign.Pisces, 29, 'Qoph'],
  ];

  it.each(expectedSignPaths)(
    '%s → path %d (%s)',
    (sign, expectedPath, expectedLetter) => {
      const entry = getBySign(sign);
      expect(entry).not.toBeNull();
      expect(entry!.path).toBe(expectedPath);
      expect(entry!.hebrewLetter).toBe(expectedLetter);
    }
  );

  it('all 12 signs return a non-null result', () => {
    const signs = Object.values(Sign);
    expect(signs).toHaveLength(12);
    for (const sign of signs) {
      expect(getBySign(sign)).not.toBeNull();
    }
  });
});

describe('777 Correspondences — getByPlanet', () => {
  const expectedPlanetSephiroth: [Planet, number, string][] = [
    [Planet.Saturn, 3, 'Binah'],
    [Planet.Jupiter, 4, 'Chesed'],
    [Planet.Mars, 5, 'Geburah'],
    [Planet.Sun, 6, 'Tiphareth'],
    [Planet.Venus, 7, 'Netzach'],
    [Planet.Mercury, 8, 'Hod'],
    [Planet.Moon, 9, 'Yesod'],
  ];

  it.each(expectedPlanetSephiroth)(
    '%s → Sephira %d (%s)',
    (planet, expectedSephira, expectedName) => {
      const entry = getByPlanet(planet);
      expect(entry).not.toBeNull();
      expect(entry!.path).toBe(expectedSephira);
      expect(entry!.name).toBe(expectedName);
    }
  );

  it('outer planets return null (no traditional 777 assignment)', () => {
    expect(getByPlanet(Planet.Uranus)).toBeNull();
    expect(getByPlanet(Planet.Neptune)).toBeNull();
    expect(getByPlanet(Planet.Pluto)).toBeNull();
  });

  it('modern bodies return null (no traditional 777 assignment)', () => {
    expect(getByPlanet(Planet.NorthNode)).toBeNull();
    expect(getByPlanet(Planet.Chiron)).toBeNull();
  });
});

describe('777 Correspondences — specific astrological attributions', () => {
  it('Aries path has Fire-like color (Scarlet/Red)', () => {
    const entry = getBySign(Sign.Aries)!;
    expect(entry.color.king.toLowerCase()).toContain('scarlet');
  });

  it('Moon path has lunar color (Silver/Blue)', () => {
    const moon = getByPath(13)!;
    expect(moon.color.queen.toLowerCase()).toContain('silver');
  });

  it('Sun Sephira (Tiphareth) has planet Sun', () => {
    const tiphareth = getByPlanet(Planet.Sun)!;
    expect(tiphareth.planet).toBe('Sun');
    expect(tiphareth.astrologicalAttribution).toBe('Sun');
  });

  it('path 31 = Fire element (Shin)', () => {
    const shin = getByPath(31)!;
    expect(shin.hebrewLetter).toBe('Shin');
    expect(shin.element).toBe('Fire');
  });

  it('path 23 = Water element (Mem)', () => {
    const mem = getByPath(23)!;
    expect(mem.hebrewLetter).toBe('Mem');
    expect(mem.element).toBe('Water');
  });
});
