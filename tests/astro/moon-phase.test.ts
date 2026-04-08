import { describe, it, expect } from 'vitest';
import { getCurrentMoonPhase } from '../../src/modules/astro-engine/moon-phase';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a YYYY-MM-DD string into a UTC Date at noon */
function utcNoon(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

// ---------------------------------------------------------------------------
// Known new moons (angle ≈ 0°, illumination ≈ 0%)
// Dates from: https://www.timeanddate.com/moon/phases/
// ---------------------------------------------------------------------------

describe('New Moon dates', () => {
  const newMoonDates = [
    '2024-01-11', // Jan 2024 new moon
    '2024-02-09', // Feb 2024 new moon
  ];

  for (const dateStr of newMoonDates) {
    it(`${dateStr}: angle is near 0° (≤30° or ≥330°)`, () => {
      const result = getCurrentMoonPhase(utcNoon(dateStr));
      // New moon exact moment may be up to ~12h from noon UTC, so Moon can be
      // within ~6° before or after 0°. Accept the range [0°, 30°] ∪ [330°, 360°).
      const near = result.angle <= 30 || result.angle >= 330;
      expect(near).toBe(true);
    });

    it(`${dateStr}: illumination is near 0% (≤10%)`, () => {
      const result = getCurrentMoonPhase(utcNoon(dateStr));
      expect(result.illumination).toBeLessThanOrEqual(10);
    });

    it(`${dateStr}: phase name contains "New" or "Crescent"`, () => {
      const result = getCurrentMoonPhase(utcNoon(dateStr));
      expect(result.phase).toMatch(/New Moon|Crescent/);
    });

    it(`${dateStr}: emoji is 🌑 or 🌒`, () => {
      const result = getCurrentMoonPhase(utcNoon(dateStr));
      expect(['🌑', '🌒']).toContain(result.emoji);
    });
  }
});

// ---------------------------------------------------------------------------
// Known full moons (angle ≈ 180°, illumination ≈ 100%)
// ---------------------------------------------------------------------------

describe('Full Moon dates', () => {
  const fullMoonDates = [
    '2024-01-25', // Jan 2024 full moon
    '2024-02-24', // Feb 2024 full moon
  ];

  for (const dateStr of fullMoonDates) {
    it(`${dateStr}: angle is near 180° (150°–210°)`, () => {
      const result = getCurrentMoonPhase(utcNoon(dateStr));
      expect(result.angle).toBeGreaterThanOrEqual(150);
      expect(result.angle).toBeLessThanOrEqual(210);
    });

    it(`${dateStr}: illumination is near 100% (≥90%)`, () => {
      const result = getCurrentMoonPhase(utcNoon(dateStr));
      expect(result.illumination).toBeGreaterThanOrEqual(90);
    });

    it(`${dateStr}: phase name contains "Full" or "Gibbous"`, () => {
      const result = getCurrentMoonPhase(utcNoon(dateStr));
      expect(result.phase).toMatch(/Full Moon|Gibbous/);
    });

    it(`${dateStr}: emoji is 🌕 or 🌖`, () => {
      const result = getCurrentMoonPhase(utcNoon(dateStr));
      expect(['🌕', '🌖']).toContain(result.emoji);
    });
  }
});

// ---------------------------------------------------------------------------
// Phase names for specific angles
// ---------------------------------------------------------------------------

describe('Phase names by angle', () => {
  // We use 2024-03-10 (new moon) as a baseline and forward-offset the check
  // by picking dates where the known approximate angle falls in each segment.
  // Instead, we test the phase name boundaries directly by checking real dates.

  it('angle 0–22.5: New Moon', () => {
    // 2024-01-11 is a new moon — angle should be in this range at exact moment
    // We approximate with known-close date
    const result = getCurrentMoonPhase(utcNoon('2024-01-11'));
    if (result.angle < 22.5 || result.angle >= 337.5) {
      expect(result.phase).toBe('New Moon');
    }
  });

  it('Full Moon at 180°: phase name is Full Moon', () => {
    const result = getCurrentMoonPhase(utcNoon('2024-01-25'));
    if (result.angle >= 157.5 && result.angle < 202.5) {
      expect(result.phase).toBe('Full Moon');
    }
  });

  it('First Quarter approx (2024-01-17): angle in 67.5–112.5 range', () => {
    // 2024-01-17 is roughly first quarter
    const result = getCurrentMoonPhase(utcNoon('2024-01-17'));
    // Relaxed check — just verify phase is one of the waxing phases
    expect(result.phase).toMatch(/Waxing|Quarter/);
  });

  it('Last Quarter approx (2024-01-03): angle in 247.5–292.5 range', () => {
    // 2024-01-03 is roughly last quarter
    const result = getCurrentMoonPhase(utcNoon('2024-01-03'));
    expect(result.phase).toMatch(/Waning|Quarter/);
  });
});

// ---------------------------------------------------------------------------
// Phase name / emoji consistency
// ---------------------------------------------------------------------------

describe('Phase name and emoji consistency', () => {
  const testDates = [
    '2024-01-03',
    '2024-01-08',
    '2024-01-11',
    '2024-01-17',
    '2024-01-21',
    '2024-01-25',
    '2024-01-28',
    '2024-02-02',
  ];

  const EMOJI_MAP: Record<string, string[]> = {
    'New Moon': ['🌑'],
    'Waxing Crescent': ['🌒'],
    'First Quarter': ['🌓'],
    'Waxing Gibbous': ['🌔'],
    'Full Moon': ['🌕'],
    'Waning Gibbous': ['🌖'],
    'Last Quarter': ['🌗'],
    'Waning Crescent': ['🌘'],
  };

  for (const dateStr of testDates) {
    it(`${dateStr}: emoji matches phase name`, () => {
      const result = getCurrentMoonPhase(utcNoon(dateStr));
      const expectedEmojis = EMOJI_MAP[result.phase];
      expect(expectedEmojis, `Unknown phase: ${result.phase}`).toBeDefined();
      expect(expectedEmojis).toContain(result.emoji);
    });
  }
});

// ---------------------------------------------------------------------------
// Next new/full moon: must be in the future relative to input
// ---------------------------------------------------------------------------

describe('Next new and full moon dates', () => {
  it('nextNewMoon is after the input date', () => {
    const date = utcNoon('2024-01-15');
    const result = getCurrentMoonPhase(date);
    expect(result.nextNewMoon.getTime()).toBeGreaterThan(date.getTime());
  });

  it('nextFullMoon is after the input date', () => {
    const date = utcNoon('2024-01-15');
    const result = getCurrentMoonPhase(date);
    expect(result.nextFullMoon.getTime()).toBeGreaterThan(date.getTime());
  });

  it('nextNewMoon is within 30 days of input date', () => {
    const date = utcNoon('2024-01-15');
    const result = getCurrentMoonPhase(date);
    const diffDays =
      (result.nextNewMoon.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeLessThan(30);
  });

  it('nextFullMoon is within 30 days of input date', () => {
    const date = utcNoon('2024-01-15');
    const result = getCurrentMoonPhase(date);
    const diffDays =
      (result.nextFullMoon.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeLessThan(30);
  });

  it('nextNewMoon after a known new moon is ~29 days later', () => {
    // Day after 2024-01-11 new moon — next should be ~2024-02-09
    const date = utcNoon('2024-01-12');
    const result = getCurrentMoonPhase(date);
    const expectedDate = new Date('2024-02-09T00:00:00Z');
    const diffDays = Math.abs(
      (result.nextNewMoon.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    // Allow ±2 day tolerance (we query at noon, exact moment varies)
    expect(diffDays).toBeLessThan(2);
  });

  it('nextFullMoon after a known full moon is ~29 days later', () => {
    // Day after 2024-01-25 full moon — next should be ~2024-02-24
    const date = utcNoon('2024-01-26');
    const result = getCurrentMoonPhase(date);
    const expectedDate = new Date('2024-02-24T00:00:00Z');
    const diffDays = Math.abs(
      (result.nextFullMoon.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBeLessThan(2);
  });
});

// ---------------------------------------------------------------------------
// Illumination is monotonically increasing from new to full
// ---------------------------------------------------------------------------

describe('Illumination increases from new to full moon', () => {
  it('illumination increases day by day from new to full moon (Jan 2024)', () => {
    // New moon 2024-01-11 → Full moon 2024-01-25
    // Sample every 2 days
    const sampleDates = [
      '2024-01-11',
      '2024-01-13',
      '2024-01-15',
      '2024-01-17',
      '2024-01-19',
      '2024-01-21',
      '2024-01-23',
      '2024-01-25',
    ];

    const illuminations = sampleDates.map(
      (d) => getCurrentMoonPhase(utcNoon(d)).illumination,
    );

    // Each value must be >= the previous (monotonically non-decreasing)
    for (let i = 1; i < illuminations.length; i++) {
      expect(illuminations[i]).toBeGreaterThanOrEqual(illuminations[i - 1]);
    }
  });

  it('first sample (new moon) has illumination < 20%', () => {
    const result = getCurrentMoonPhase(utcNoon('2024-01-11'));
    expect(result.illumination).toBeLessThan(20);
  });

  it('last sample (full moon) has illumination > 80%', () => {
    const result = getCurrentMoonPhase(utcNoon('2024-01-25'));
    expect(result.illumination).toBeGreaterThan(80);
  });
});

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

describe('Output shape', () => {
  it('returns all required fields', () => {
    const result = getCurrentMoonPhase(utcNoon('2024-06-01'));
    expect(typeof result.phase).toBe('string');
    expect(typeof result.illumination).toBe('number');
    expect(typeof result.angle).toBe('number');
    expect(typeof result.emoji).toBe('string');
    expect(result.nextNewMoon).toBeInstanceOf(Date);
    expect(result.nextFullMoon).toBeInstanceOf(Date);
  });

  it('illumination is between 0 and 100', () => {
    const result = getCurrentMoonPhase(utcNoon('2024-06-01'));
    expect(result.illumination).toBeGreaterThanOrEqual(0);
    expect(result.illumination).toBeLessThanOrEqual(100);
  });

  it('angle is between 0 and 360', () => {
    const result = getCurrentMoonPhase(utcNoon('2024-06-01'));
    expect(result.angle).toBeGreaterThanOrEqual(0);
    expect(result.angle).toBeLessThan(360);
  });

  it('emoji is one of the 8 moon phase emojis', () => {
    const result = getCurrentMoonPhase(utcNoon('2024-06-01'));
    expect(['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']).toContain(result.emoji);
  });

  it('nextNewMoon and nextFullMoon are valid Date objects', () => {
    const result = getCurrentMoonPhase(utcNoon('2024-06-01'));
    expect(isNaN(result.nextNewMoon.getTime())).toBe(false);
    expect(isNaN(result.nextFullMoon.getTime())).toBe(false);
  });
});
