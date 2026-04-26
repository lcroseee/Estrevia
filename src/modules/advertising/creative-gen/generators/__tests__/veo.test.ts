import { describe, it, expect } from 'vitest';
import { VeoLite } from '../veo';
import { mockGeminiApi } from '../../../__tests__/mocks/gemini';

describe('VeoLite', () => {
  it('generates video with correct kind and generator label', async () => {
    const api = mockGeminiApi();
    const gen = new VeoLite({ apiClient: api });

    const result = await gen.generate('celestial time-lapse', {
      aspect: '9:16',
      duration_sec: 10,
      resolution: '1080p',
      with_audio: true,
    });

    expect(result.kind).toBe('video');
    expect(result.generator).toBe('veo-3-1-lite');
  });

  it('has correct name', () => {
    const api = mockGeminiApi();
    const gen = new VeoLite({ apiClient: api });
    expect(gen.name).toBe('veo-3-1-lite');
  });

  it('charges $0.05/sec for 720p', async () => {
    const api = mockGeminiApi();
    api.generateVideo.mockResolvedValue({
      url: 'https://test.blob.vercel-storage.com/vid.mp4',
      width: 1280,
      height: 720,
      duration_sec: 10,
      cost_usd: 0.5,
    });
    const gen = new VeoLite({ apiClient: api });

    const result = await gen.generate('background', {
      aspect: '9:16',
      duration_sec: 10,
      resolution: '720p',
    });

    expect(result.cost_usd).toBe(0.05 * 10);
  });

  it('charges $0.08/sec for 1080p', async () => {
    const api = mockGeminiApi();
    api.generateVideo.mockResolvedValue({
      url: 'https://test.blob.vercel-storage.com/vid.mp4',
      width: 1080,
      height: 1920,
      duration_sec: 15,
      cost_usd: 1.2,
    });
    const gen = new VeoLite({ apiClient: api });

    const result = await gen.generate('cosmic journey', {
      aspect: '9:16',
      duration_sec: 15,
      resolution: '1080p',
    });

    expect(result.cost_usd).toBe(0.08 * 15);
  });

  it('exposes cost_per_second_usd (720p rate)', () => {
    const api = mockGeminiApi();
    const gen = new VeoLite({ apiClient: api });
    expect(gen.cost_per_second_usd).toBe(0.05);
  });

  it('returns duration_sec from API response', async () => {
    const api = mockGeminiApi();
    const gen = new VeoLite({ apiClient: api });

    const result = await gen.generate('stars', {
      aspect: '9:16',
      duration_sec: 8,
      resolution: '720p',
    });

    expect(result.duration_sec).toBe(15); // mock returns 15
  });

  it('assigns unique id on each call', async () => {
    const api = mockGeminiApi();
    const gen = new VeoLite({ apiClient: api });
    const opts = { aspect: '9:16' as const, duration_sec: 10, resolution: '720p' as const };
    const r1 = await gen.generate('a', opts);
    const r2 = await gen.generate('b', opts);
    expect(r1.id).toBeTruthy();
    expect(r1.id).not.toBe(r2.id);
  });

  it('passes resolution and aspect to apiClient', async () => {
    const api = mockGeminiApi();
    const gen = new VeoLite({ apiClient: api });

    await gen.generate('stars', {
      aspect: '1:1',
      duration_sec: 8,
      resolution: '720p',
      with_audio: true,
    });

    expect(api.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'veo-3-1-lite',
        aspect: '1:1',
        resolution: '720p',
        with_audio: true,
      })
    );
  });

  it('includes prompt_used in result', async () => {
    const api = mockGeminiApi();
    const gen = new VeoLite({ apiClient: api });

    const result = await gen.generate('aurora borealis', {
      aspect: '9:16',
      duration_sec: 12,
      resolution: '1080p',
    });

    expect(result.prompt_used).toBe('aurora borealis');
  });

  it('propagates API errors', async () => {
    const api = mockGeminiApi();
    api.generateVideo.mockRejectedValue(new Error('video generation failed'));
    const gen = new VeoLite({ apiClient: api });

    await expect(
      gen.generate('test', { aspect: '9:16', duration_sec: 10, resolution: '720p' })
    ).rejects.toThrow('video generation failed');
  });
});
