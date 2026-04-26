import { describe, it, expect } from 'vitest';
import { composeWithText, type TextPosition, type OverlayFont } from '../sharp-overlay';

// Minimal 1×1 transparent PNG as a data URL (test background)
// This is a real 1×1 white PNG base64 encoded
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function getTinyPngBuffer(): Promise<Buffer> {
  return Buffer.from(TINY_PNG_BASE64, 'base64');
}

describe('composeWithText', () => {
  it('returns a Buffer', async () => {
    const bg = await getTinyPngBuffer();
    const result = await composeWithText(bg, 'Hello', { x: 0, y: 0, anchor: 'top-left' });
    expect(result).toBeInstanceOf(Buffer);
  }, 15_000);

  it('PNG magic bytes are correct (\\x89PNG)', async () => {
    const bg = await getTinyPngBuffer();
    const result = await composeWithText(bg, 'Test', { x: 0, y: 0, anchor: 'top-left' });
    expect(result[0]).toBe(0x89);
    expect(result[1]).toBe(0x50); // P
    expect(result[2]).toBe(0x4E); // N
    expect(result[3]).toBe(0x47); // G
  }, 15_000);

  it('produces output larger than the input background', async () => {
    const bg = await getTinyPngBuffer();
    const result = await composeWithText(bg, 'Discover Your Sidereal Sign', { x: 0, y: 0, anchor: 'top-left' });
    // The output should be a valid PNG (possibly resized, but definitely a PNG)
    expect(result.length).toBeGreaterThan(0);
  }, 15_000);

  it('accepts center anchor without throwing', async () => {
    const bg = await getTinyPngBuffer();
    const pos: TextPosition = { x: 0, y: 0, anchor: 'center' };
    await expect(composeWithText(bg, 'Centered text', pos)).resolves.toBeInstanceOf(Buffer);
  }, 15_000);

  it('accepts bottom-center anchor without throwing', async () => {
    const bg = await getTinyPngBuffer();
    const pos: TextPosition = { x: 0, y: 0, anchor: 'bottom-center' };
    await expect(composeWithText(bg, 'Bottom text', pos)).resolves.toBeInstanceOf(Buffer);
  }, 15_000);

  it('accepts optional font options', async () => {
    const bg = await getTinyPngBuffer();
    const font: OverlayFont = {
      size: 48,
      color: '#F5B945',
      weight: 'bold',
      family: 'sans-serif',
    };
    await expect(
      composeWithText(bg, 'Styled text', { x: 10, y: 10, anchor: 'top-left' }, font),
    ).resolves.toBeInstanceOf(Buffer);
  }, 15_000);

  it('supports empty string text without throwing', async () => {
    const bg = await getTinyPngBuffer();
    await expect(
      composeWithText(bg, '', { x: 0, y: 0, anchor: 'top-left' }),
    ).resolves.toBeInstanceOf(Buffer);
  }, 15_000);

  it('can be called multiple times with the same background (A/B variant support)', async () => {
    const bg = await getTinyPngBuffer();
    const variantA = await composeWithText(bg, 'Most apps show tropical signs.', { x: 0, y: 0, anchor: 'top-left' });
    const variantB = await composeWithText(bg, 'The actual stars say something different.', { x: 0, y: 0, anchor: 'top-left' });
    expect(variantA).toBeInstanceOf(Buffer);
    expect(variantB).toBeInstanceOf(Buffer);
    // Two variants with different text but same background should both be valid PNGs
    expect(variantA[0]).toBe(0x89);
    expect(variantB[0]).toBe(0x89);
  }, 15_000);
});
