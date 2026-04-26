import { describe, it, expect } from 'vitest';
import { NanoBanana2 } from '../nano-banana';
import { mockGeminiApi } from '../../../__tests__/mocks/gemini';

describe('NanoBanana2', () => {
  it('generates image with correct generator label and kind', async () => {
    const api = mockGeminiApi();
    const gen = new NanoBanana2({ apiClient: api });

    const result = await gen.generate('zodiac series background', {
      aspect: '1:1',
      width: 1080,
      height: 1080,
    });

    expect(result.kind).toBe('image');
    expect(result.generator).toBe('nano-banana-2');
  });

  it('has correct name and cost_per_image_usd', () => {
    const api = mockGeminiApi();
    const gen = new NanoBanana2({ apiClient: api });
    expect(gen.name).toBe('nano-banana-2');
    expect(gen.cost_per_image_usd).toBeGreaterThan(0);
  });

  it('accepts up to 14 reference_images in opts', async () => {
    const api = mockGeminiApi();
    const gen = new NanoBanana2({ apiClient: api });

    const referenceImages = Array.from({ length: 14 }, (_, i) => `https://cdn.example.com/ref-${i}.png`);

    const result = await gen.generate('style-consistent ad', {
      aspect: '9:16',
      width: 1080,
      height: 1920,
      reference_images: referenceImages,
    });

    expect(result.kind).toBe('image');
    expect(api.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ reference_images: referenceImages })
    );
  });

  it('passes reference_images=undefined when not provided', async () => {
    const api = mockGeminiApi();
    const gen = new NanoBanana2({ apiClient: api });

    await gen.generate('standalone', {
      aspect: '1:1',
      width: 1080,
      height: 1080,
    });

    expect(api.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.1-flash-image' })
    );
  });

  it('assigns unique ids on each generation', async () => {
    const api = mockGeminiApi();
    const gen = new NanoBanana2({ apiClient: api });
    const opts = { aspect: '1:1' as const, width: 1080, height: 1080 };
    const r1 = await gen.generate('a', opts);
    const r2 = await gen.generate('b', opts);
    expect(r1.id).not.toBe(r2.id);
  });

  it('includes prompt_used and created_at', async () => {
    const api = mockGeminiApi();
    const gen = new NanoBanana2({ apiClient: api });
    const result = await gen.generate('series promo', { aspect: '4:5', width: 1080, height: 1350 });
    expect(result.prompt_used).toBe('series promo');
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('propagates API errors', async () => {
    const api = mockGeminiApi();
    api.generateImage.mockRejectedValue(new Error('model unavailable'));
    const gen = new NanoBanana2({ apiClient: api });

    await expect(
      gen.generate('test', { aspect: '1:1', width: 1080, height: 1080 })
    ).rejects.toThrow('model unavailable');
  });

  it('uses gemini-3.1-flash-image model', async () => {
    const api = mockGeminiApi();
    const gen = new NanoBanana2({ apiClient: api });

    await gen.generate('brand series', { aspect: '1:1', width: 1080, height: 1080 });

    expect(api.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.1-flash-image' })
    );
  });
});
