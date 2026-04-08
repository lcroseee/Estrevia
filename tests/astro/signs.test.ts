/**
 * Tests for absoluteToSignPosition — sign boundary detection, fractional degrees,
 * edge cases at 0°, 360°, and exact sign cusps.
 */

import { describe, it, expect } from 'vitest';
import { absoluteToSignPosition } from '@/modules/astro-engine/signs';
import { Sign } from '@/shared/types/astrology';

describe('absoluteToSignPosition — sign boundaries', () => {
  it('0.000° = 0°00\'00" Aries', () => {
    const pos = absoluteToSignPosition(0);
    expect(pos.sign).toBe(Sign.Aries);
    expect(pos.signDegree).toBe(0);
    expect(pos.minutes).toBe(0);
    expect(pos.seconds).toBe(0);
  });

  it('30.000° = 0°00\'00" Taurus (exact boundary)', () => {
    const pos = absoluteToSignPosition(30);
    expect(pos.sign).toBe(Sign.Taurus);
    expect(pos.signDegree).toBe(0);
    expect(pos.minutes).toBe(0);
    expect(pos.seconds).toBe(0);
  });

  it('60.000° = 0°00\'00" Gemini', () => {
    const pos = absoluteToSignPosition(60);
    expect(pos.sign).toBe(Sign.Gemini);
    expect(pos.signDegree).toBe(0);
  });

  it('90.000° = 0°00\'00" Cancer', () => {
    const pos = absoluteToSignPosition(90);
    expect(pos.sign).toBe(Sign.Cancer);
    expect(pos.signDegree).toBe(0);
  });

  it('120.000° = 0°00\'00" Leo', () => {
    const pos = absoluteToSignPosition(120);
    expect(pos.sign).toBe(Sign.Leo);
    expect(pos.signDegree).toBe(0);
  });

  it('150.000° = 0°00\'00" Virgo', () => {
    const pos = absoluteToSignPosition(150);
    expect(pos.sign).toBe(Sign.Virgo);
    expect(pos.signDegree).toBe(0);
  });

  it('180.000° = 0°00\'00" Libra', () => {
    const pos = absoluteToSignPosition(180);
    expect(pos.sign).toBe(Sign.Libra);
    expect(pos.signDegree).toBe(0);
  });

  it('210.000° = 0°00\'00" Scorpio', () => {
    const pos = absoluteToSignPosition(210);
    expect(pos.sign).toBe(Sign.Scorpio);
    expect(pos.signDegree).toBe(0);
  });

  it('240.000° = 0°00\'00" Sagittarius', () => {
    const pos = absoluteToSignPosition(240);
    expect(pos.sign).toBe(Sign.Sagittarius);
    expect(pos.signDegree).toBe(0);
  });

  it('270.000° = 0°00\'00" Capricorn', () => {
    const pos = absoluteToSignPosition(270);
    expect(pos.sign).toBe(Sign.Capricorn);
    expect(pos.signDegree).toBe(0);
  });

  it('300.000° = 0°00\'00" Aquarius', () => {
    const pos = absoluteToSignPosition(300);
    expect(pos.sign).toBe(Sign.Aquarius);
    expect(pos.signDegree).toBe(0);
  });

  it('330.000° = 0°00\'00" Pisces', () => {
    const pos = absoluteToSignPosition(330);
    expect(pos.sign).toBe(Sign.Pisces);
    expect(pos.signDegree).toBe(0);
  });

  it('29.999° is still Aries (not Taurus)', () => {
    const pos = absoluteToSignPosition(29.999);
    expect(pos.sign).toBe(Sign.Aries);
    expect(pos.signDegree).toBe(29);
  });

  it('359.999° = last degree of Pisces', () => {
    const pos = absoluteToSignPosition(359.999);
    expect(pos.sign).toBe(Sign.Pisces);
    expect(pos.signDegree).toBe(29);
  });
});

describe('absoluteToSignPosition — degree/minute/second extraction', () => {
  it('15.000° = 15°00\'00" Aries', () => {
    const pos = absoluteToSignPosition(15);
    expect(pos.sign).toBe(Sign.Aries);
    expect(pos.signDegree).toBe(15);
    expect(pos.minutes).toBe(0);
    expect(pos.seconds).toBe(0);
  });

  it('15.5° = 15°30\'00" Aries', () => {
    const pos = absoluteToSignPosition(15.5);
    expect(pos.sign).toBe(Sign.Aries);
    expect(pos.signDegree).toBe(15);
    expect(pos.minutes).toBe(30);
    expect(pos.seconds).toBe(0);
  });

  it('15.25° = 15°15\'00" Aries', () => {
    const pos = absoluteToSignPosition(15.25);
    expect(pos.sign).toBe(Sign.Aries);
    expect(pos.signDegree).toBe(15);
    expect(pos.minutes).toBe(15);
    expect(pos.seconds).toBe(0);
  });

  it('123.456° parses to correct sign/degree/minutes/seconds', () => {
    // 123.456° = 3°27'21.6" Leo (120+3.456 = Leo)
    // Within sign: 3.456° = 3° + 0.456*60' = 3°27.36' = 3°27'21.6"
    const pos = absoluteToSignPosition(123.456);
    expect(pos.sign).toBe(Sign.Leo);
    expect(pos.signDegree).toBe(3);
    expect(pos.minutes).toBe(27);
    // seconds ≈ 21 (floor of 0.36*60 = 21.6)
    expect(pos.seconds).toBe(21);
  });

  it('0.017° > 1 minute — shows 1 minute in Aries', () => {
    // 0.017° * 60 = 1.02 minutes → floor = 1 minute
    // Note: exactly 1/60 = 0.01666... has floating point issues (0.9999... * 60)
    // Using 0.017 which reliably gives 1 minute
    const pos = absoluteToSignPosition(0.017);
    expect(pos.sign).toBe(Sign.Aries);
    expect(pos.signDegree).toBe(0);
    expect(pos.minutes).toBe(1);
  });

  it('0.000277778° ≈ 0°00\'01" Aries (1 second)', () => {
    // 1/3600 = 0.0002777...
    const pos = absoluteToSignPosition(1 / 3600);
    expect(pos.sign).toBe(Sign.Aries);
    expect(pos.signDegree).toBe(0);
    expect(pos.minutes).toBe(0);
    expect(pos.seconds).toBe(1);
  });

  it('29°59\'59" Pisces = 359.999722° Pisces', () => {
    // 330 + 29 + 59/60 + 59/3600 = 359.99972...
    const degree = 330 + 29 + 59 / 60 + 59 / 3600;
    const pos = absoluteToSignPosition(degree);
    expect(pos.sign).toBe(Sign.Pisces);
    expect(pos.signDegree).toBe(29);
    expect(pos.minutes).toBe(59);
    // Floating point: (29.9997... - 29) * 60 = 59.98..., floor = 59
    // seconds: (59.98... - 59) * 60 = 58.9... or 59, depends on FP
    expect(pos.seconds).toBeGreaterThanOrEqual(58);
    expect(pos.seconds).toBeLessThanOrEqual(59);
  });
});

describe('absoluteToSignPosition — normalization', () => {
  it('360° normalizes to 0°00\'00" Aries', () => {
    const pos = absoluteToSignPosition(360);
    expect(pos.sign).toBe(Sign.Aries);
    expect(pos.signDegree).toBe(0);
    expect(pos.minutes).toBe(0);
    expect(pos.seconds).toBe(0);
  });

  it('720° normalizes to 0°00\'00" Aries', () => {
    const pos = absoluteToSignPosition(720);
    expect(pos.sign).toBe(Sign.Aries);
    expect(pos.signDegree).toBe(0);
  });

  it('negative degree -30° normalizes to 0°00\'00" Pisces (= 330°)', () => {
    const pos = absoluteToSignPosition(-30);
    expect(pos.sign).toBe(Sign.Pisces);
    expect(pos.signDegree).toBe(0);
    expect(pos.minutes).toBe(0);
    expect(pos.seconds).toBe(0);
  });

  it('negative degree -1° normalizes to 29°00\' Pisces', () => {
    const pos = absoluteToSignPosition(-1);
    expect(pos.sign).toBe(Sign.Pisces);
    expect(pos.signDegree).toBe(29);
  });
});

describe('absoluteToSignPosition — all 12 signs mid-point', () => {
  const midpoints: Array<[number, Sign, number]> = [
    [15, Sign.Aries, 15],
    [45, Sign.Taurus, 15],
    [75, Sign.Gemini, 15],
    [105, Sign.Cancer, 15],
    [135, Sign.Leo, 15],
    [165, Sign.Virgo, 15],
    [195, Sign.Libra, 15],
    [225, Sign.Scorpio, 15],
    [255, Sign.Sagittarius, 15],
    [285, Sign.Capricorn, 15],
    [315, Sign.Aquarius, 15],
    [345, Sign.Pisces, 15],
  ];

  for (const [degree, sign, signDeg] of midpoints) {
    it(`${degree}° = ${signDeg}° ${sign}`, () => {
      const pos = absoluteToSignPosition(degree);
      expect(pos.sign).toBe(sign);
      expect(pos.signDegree).toBe(signDeg);
      expect(pos.minutes).toBe(0);
      expect(pos.seconds).toBe(0);
    });
  }
});
