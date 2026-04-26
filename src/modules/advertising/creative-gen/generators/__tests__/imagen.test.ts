import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImagenUltra, ImagenFast } from '../imagen';
import { mockGeminiApi } from '../../../__tests__/mocks/gemini';

describe('ImagenUltra', () => {
  it('generates image with correct dimensions and cost', async () => {
    const api = mockGeminiApi();
    const gen = new ImagenUltra({ apiClient: api });

    const result = await gen.generate('cosmic background', { aspect: '9:16', width: 1080, height: 1920 });

    expect(result.kind).toBe('image');
    expect(result.generator).toBe('imagen-4-ultra');
    expect(result.cost_usd).toBe(0.06);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
  });

  it('has correct cost_per_image_usd and name', () => {
    const api = mockGeminiApi();
    const gen = new ImagenUltra({ apiClient: api });
    expect(gen.cost_per_image_usd).toBe(0.06);
    expect(gen.name).toBe('imagen-4-ultra');
  });

  it('assigns unique id and prompt_used to each result', async () => {
    const api = mockGeminiApi();
    const gen = new ImagenUltra({ apiClient: api });

    const r1 = await gen.generate('prompt one', { aspect: '1:1', width: 1080, height: 1080 });
    const r2 = await gen.generate('prompt two', { aspect: '1:1', width: 1080, height: 1080 });

    expect(r1.id).toBeTruthy();
    expect(r2.id).toBeTruthy();
    expect(r1.id).not.toBe(r2.id);
    expect(r1.prompt_used).toBe('prompt one');
    expect(r2.prompt_used).toBe('prompt two');
  });

  it('includes created_at date', async () => {
    const api = mockGeminiApi();
    const gen = new ImagenUltra({ apiClient: api });
    const result = await gen.generate('test', { aspect: '1:1', width: 1080, height: 1080 });
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('propagates API errors', async () => {
    const api = mockGeminiApi();
    api.generateImage.mockRejectedValue(new Error('API quota exceeded'));
    const gen = new ImagenUltra({ apiClient: api });

    await expect(gen.generate('test', { aspect: '1:1', width: 1080, height: 1080 })).rejects.toThrow('API quota exceeded');
  });

  it('passes model and aspect to apiClient', async () => {
    const api = mockGeminiApi();
    const gen = new ImagenUltra({ apiClient: api });

    await gen.generate('cosmic background', { aspect: '4:5', width: 1080, height: 1350 });

    expect(api.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'imagen-4-ultra', aspect: '4:5', prompt: 'cosmic background' })
    );
  });
});

describe('ImagenFast', () => {
  it('costs $0.02 per image', async () => {
    const api = mockGeminiApi();
    const gen = new ImagenFast({ apiClient: api });

    const result = await gen.generate('background', { aspect: '1:1', width: 1080, height: 1080 });
    expect(result.cost_usd).toBe(0.02);
    expect(result.generator).toBe('imagen-4-fast');
  });

  it('has correct cost_per_image_usd and name', () => {
    const api = mockGeminiApi();
    const gen = new ImagenFast({ apiClient: api });
    expect(gen.cost_per_image_usd).toBe(0.02);
    expect(gen.name).toBe('imagen-4-fast');
  });

  it('assigns unique id on each generation', async () => {
    const api = mockGeminiApi();
    const gen = new ImagenFast({ apiClient: api });
    const r1 = await gen.generate('a', { aspect: '1:1', width: 1080, height: 1080 });
    const r2 = await gen.generate('b', { aspect: '1:1', width: 1080, height: 1080 });
    expect(r1.id).not.toBe(r2.id);
  });

  it('passes model imagen-4-fast to apiClient', async () => {
    const api = mockGeminiApi();
    const gen = new ImagenFast({ apiClient: api });

    await gen.generate('bg', { aspect: '9:16', width: 1080, height: 1920 });

    expect(api.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'imagen-4-fast' })
    );
  });

  it('propagates API errors', async () => {
    const api = mockGeminiApi();
    api.generateImage.mockRejectedValue(new Error('rate limit'));
    const gen = new ImagenFast({ apiClient: api });

    await expect(gen.generate('test', { aspect: '1:1', width: 1080, height: 1080 })).rejects.toThrow('rate limit');
  });
});
