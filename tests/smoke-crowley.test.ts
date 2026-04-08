/**
 * Smoke test: Aleister Crowley natal chart
 * Born: 1875-10-12, 23:42, Leamington Spa
 * Coordinates: 52.2852° N, -1.5242° (West → negative)
 * Timezone: Europe/London
 */

import { describe, it, expect } from 'vitest';
import { calculateChart } from '@/modules/astro-engine/chart';
import { HouseSystem, Planet, Sign } from '@/shared/types/astrology';

const SIGN_SYMBOL: Record<string, string> = {
  Aries: 'Ari', Taurus: 'Tau', Gemini: 'Gem', Cancer: 'Can',
  Leo: 'Leo', Virgo: 'Vir', Libra: 'Lib', Scorpio: 'Sco',
  Sagittarius: 'Sag', Capricorn: 'Cap', Aquarius: 'Aqu', Pisces: 'Pis',
};

function formatDMS(signDegree: number, minutes: number, seconds: number): string {
  return `${String(signDegree).padStart(2, '0')}°${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}"`;
}

describe('Crowley natal chart smoke test', () => {
  it('calculates all 12 bodies with valid positions', () => {
    const result = calculateChart({
      date: '1875-10-12',
      time: '23:42',
      latitude: 52.2852,
      longitude: -1.5242,
      timezone: 'Europe/London',
      houseSystem: HouseSystem.Placidus,
    });

    console.log('\n=== Aleister Crowley — Sidereal Chart ===');
    console.log(`Ayanamsa (Lahiri): ${result.ayanamsa.toFixed(4)}°`);
    console.log(`System: ${result.system}  |  Houses: ${result.houseSystem}`);
    console.log(`Calculated At: ${result.calculatedAt}\n`);

    console.log('Planet'.padEnd(12) + 'Position'.padEnd(14) + 'Sign'.padEnd(6) + 'R  ' + 'Abs°'.padEnd(12) + 'Trop°'.padEnd(12) + 'House');
    console.log('-'.repeat(70));
    for (const p of result.planets) {
      const sign = SIGN_SYMBOL[p.sign] ?? p.sign;
      const dms = formatDMS(p.signDegree, p.minutes, p.seconds);
      const retro = p.isRetrograde ? 'R' : ' ';
      const house = p.house !== null ? `H${p.house}` : '--';
      console.log(
        `${p.planet.padEnd(12)}${dms.padEnd(14)}${sign.padEnd(6)}${retro}  ${p.absoluteDegree.toFixed(4).padEnd(12)}${p.tropicalDegree.toFixed(4).padEnd(12)}${house}`
      );
    }

    if (result.ascendant) {
      const a = result.ascendant;
      console.log(`\nASC: ${formatDMS(a.signDegree, a.minutes, a.seconds)} ${SIGN_SYMBOL[a.sign] ?? a.sign}  abs=${a.absoluteDegree.toFixed(4)}°`);
    }
    if (result.midheaven) {
      const m = result.midheaven;
      console.log(`MC:  ${formatDMS(m.signDegree, m.minutes, m.seconds)} ${SIGN_SYMBOL[m.sign] ?? m.sign}  abs=${m.absoluteDegree.toFixed(4)}°`);
    }

    const majorAspects = result.aspects.filter(a =>
      ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'].includes(a.type)
    );
    console.log(`\nMajor aspects (${majorAspects.length} of ${result.aspects.length} total):`);
    for (const asp of majorAspects) {
      console.log(
        `  ${asp.planet1.padEnd(10)} ${asp.type.padEnd(12)} ${asp.planet2.padEnd(10)} orb=${asp.orb.toFixed(3)}°  ${asp.isApplying ? 'applying' : 'separating'}`
      );
    }

    // --- Assertions ---

    // 12 planets
    expect(result.planets).toHaveLength(12);

    // All positions valid
    for (const p of result.planets) {
      expect(p.absoluteDegree).toBeGreaterThanOrEqual(0);
      expect(p.absoluteDegree).toBeLessThan(360);
      expect(p.tropicalDegree).toBeGreaterThanOrEqual(0);
      expect(p.tropicalDegree).toBeLessThan(360);
    }

    // System is sidereal
    expect(result.system).toBe('sidereal');

    // Ayanamsa is in expected historical range for 1875 (≈ 22.2° Lahiri)
    expect(result.ayanamsa).toBeGreaterThan(21);
    expect(result.ayanamsa).toBeLessThan(23);

    // Sun: tropical ~19° Libra in 1875. Lahiri ayanamsa ~22.2° → sidereal ≈ 26°-27° Virgo
    // (19° + 180° = 199° tropical → 199 - 22.2 = 176.8° = 26°48' Virgo)
    const sun = result.planets.find(p => p.planet === Planet.Sun)!;
    expect(sun).toBeDefined();
    console.log(`\nSun sidereal: ${sun.signDegree}°${sun.minutes}' ${sun.sign}  (abs=${sun.absoluteDegree.toFixed(4)}°)`);
    console.log(`Sun tropical: ${sun.tropicalDegree.toFixed(4)}° (should be ~199° = 19° Libra tropical)`);

    // Sun should be in Virgo or early Libra sidereal for this date
    expect([Sign.Virgo, Sign.Libra]).toContain(sun.sign);

    // Houses calculated (birth time known)
    expect(result.houses).not.toBeNull();
    expect(result.houses).toHaveLength(12);

    // ASC and MC present
    expect(result.ascendant).not.toBeNull();
    expect(result.midheaven).not.toBeNull();

    // Aspects found
    expect(result.aspects.length).toBeGreaterThan(0);
  });
});
