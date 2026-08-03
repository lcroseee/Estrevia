import { describe, it, expect } from 'vitest';
import { GeminiImageClient } from '../image-client';

// Synthetic 8x8 PNG — no PII, no face.
const SYNTHETIC_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=';

const enabled = process.env.RUN_GEMINI_CONTRACT_TESTS === 'true' && !!process.env.GEMINI_API_KEY;

describe.runIf(enabled)('GeminiImageClient — live contract', () => {
  it('accepts an inline image and returns an image part', { timeout: 120_000 }, async () => {
    const client = new GeminiImageClient({ apiKey: process.env.GEMINI_API_KEY as string });
    const out = await client.generateFromImage({
      prompt: 'Restyle this simple shape as a cosmic emblem in deep indigo and gold. Return an image.',
      image: { data: SYNTHETIC_PNG, mimeType: 'image/png' },
    });
    expect(out.buffer.length).toBeGreaterThan(1000);
    expect(out.mimeType).toMatch(/^image\//);
  });
});
