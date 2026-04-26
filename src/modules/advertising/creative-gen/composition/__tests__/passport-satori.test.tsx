import { describe, it, expect } from 'vitest';
import { renderPassportCard } from '../passport-satori';

describe('renderPassportCard', () => {
  it('returns PNG buffer for valid EN passport data', async () => {
    const png = await renderPassportCard({
      sun_sign: 'Pisces',
      moon_sign: 'Sagittarius',
      rising_sign: 'Capricorn',
      rarity_label: '1 of 247',
      rarity_pct: 0.4,
      locale: 'en',
      width: 1080,
      height: 1920,
    });
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(1000);
  }, 30_000);

  it('renders ES locale with translated planet names', async () => {
    const png = await renderPassportCard({
      sun_sign: 'Pisces',
      moon_sign: 'Sagittarius',
      rising_sign: 'Capricorn',
      rarity_label: '1 de 247',
      rarity_pct: 0.4,
      locale: 'es',
      width: 1080,
      height: 1920,
    });
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(1000);
  }, 30_000);

  it('returns PNG buffer for square (1:1) format', async () => {
    const png = await renderPassportCard({
      sun_sign: 'Leo',
      moon_sign: 'Aries',
      rising_sign: 'Scorpio',
      rarity_label: '1 of 89',
      rarity_pct: 1.1,
      locale: 'en',
      width: 1080,
      height: 1080,
    });
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(1000);
  }, 30_000);

  it('handles missing rising sign (null)', async () => {
    const png = await renderPassportCard({
      sun_sign: 'Aquarius',
      moon_sign: 'Taurus',
      rising_sign: null,
      rarity_label: '1 of 144',
      rarity_pct: 0.69,
      locale: 'en',
      width: 1080,
      height: 1920,
    });
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(1000);
  }, 30_000);

  it('PNG header magic bytes are correct (\\x89PNG)', async () => {
    const png = await renderPassportCard({
      sun_sign: 'Gemini',
      moon_sign: 'Virgo',
      rising_sign: 'Libra',
      rarity_label: '1 of 512',
      rarity_pct: 0.2,
      locale: 'en',
      width: 1080,
      height: 1920,
    });
    // PNG files begin with: 89 50 4E 47 (hex) = \x89PNG
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4E); // N
    expect(png[3]).toBe(0x47); // G
  }, 30_000);
});
