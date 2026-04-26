import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IdeogramV3 } from '../ideogram';

describe('IdeogramV3', () => {
  const FAKE_URL = 'https://cdn.ideogram.ai/img-001.png';

  function makeFakeIdeogramClient() {
    return {
      generateImage: vi.fn().mockResolvedValue({
        url: FAKE_URL,
        width: 1080,
        height: 1080,
        cost_usd: 0.08,
      }),
    };
  }

  it('generates image with correct kind and generator label', async () => {
    const client = makeFakeIdeogramClient();
    const gen = new IdeogramV3({ apiClient: client });

    const result = await gen.generate('zodiac sign with text overlay', {
      aspect: '1:1',
      width: 1080,
      height: 1080,
    });

    expect(result.kind).toBe('image');
    expect(result.generator).toBe('ideogram-3');
  });

  it('has correct name', () => {
    const client = makeFakeIdeogramClient();
    const gen = new IdeogramV3({ apiClient: client });
    expect(gen.name).toBe('ideogram-3');
  });

  it('has a positive cost_per_image_usd', () => {
    const client = makeFakeIdeogramClient();
    const gen = new IdeogramV3({ apiClient: client });
    expect(gen.cost_per_image_usd).toBeGreaterThan(0);
  });

  it('includes prompt_used and created_at', async () => {
    const client = makeFakeIdeogramClient();
    const gen = new IdeogramV3({ apiClient: client });

    const result = await gen.generate('sun in scorpio text', { aspect: '9:16', width: 1080, height: 1920 });
    expect(result.prompt_used).toBe('sun in scorpio text');
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('assigns unique ids per generation', async () => {
    const client = makeFakeIdeogramClient();
    const gen = new IdeogramV3({ apiClient: client });
    const opts = { aspect: '1:1' as const, width: 1080, height: 1080 };
    const r1 = await gen.generate('a', opts);
    const r2 = await gen.generate('b', opts);
    expect(r1.id).not.toBe(r2.id);
  });

  it('propagates API errors', async () => {
    const client = makeFakeIdeogramClient();
    client.generateImage.mockRejectedValue(new Error('forbidden'));
    const gen = new IdeogramV3({ apiClient: client });

    await expect(
      gen.generate('test', { aspect: '1:1', width: 1080, height: 1080 })
    ).rejects.toThrow('forbidden');
  });

  it('throws informative error when constructed without apiClient and env var missing', () => {
    const originalKey = process.env.IDEOGRAM_API_KEY;
    delete process.env.IDEOGRAM_API_KEY;

    expect(() => IdeogramV3.fromEnv()).toThrow(/IDEOGRAM_API_KEY/);

    if (originalKey !== undefined) process.env.IDEOGRAM_API_KEY = originalKey;
  });

  it('fromEnv() uses env key when present', () => {
    const originalKey = process.env.IDEOGRAM_API_KEY;
    process.env.IDEOGRAM_API_KEY = 'test-key-123';

    expect(() => IdeogramV3.fromEnv()).not.toThrow();

    if (originalKey !== undefined) {
      process.env.IDEOGRAM_API_KEY = originalKey;
    } else {
      delete process.env.IDEOGRAM_API_KEY;
    }
  });

  it('passes prompt and aspect to apiClient', async () => {
    const client = makeFakeIdeogramClient();
    const gen = new IdeogramV3({ apiClient: client });

    await gen.generate('complex text layout', { aspect: '4:5', width: 1080, height: 1350 });

    expect(client.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'complex text layout', aspect: '4:5' })
    );
  });
});
