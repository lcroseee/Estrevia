import { describe, it, expect, vi } from 'vitest';
import { RunwayGen4 } from '../runway';

describe('RunwayGen4', () => {
  function makeFakeRunwayClient() {
    return {
      generateVideo: vi.fn().mockResolvedValue({
        url: 'https://cdn.runwayml.com/vid-001.mp4',
        width: 1080,
        height: 1920,
        duration_sec: 10,
        cost_usd: 0.50,
      }),
    };
  }

  it('generates video with correct kind and generator label', async () => {
    const client = makeFakeRunwayClient();
    const gen = new RunwayGen4({ apiClient: client });

    const result = await gen.generate('narrative story reel with character arc', {
      aspect: '9:16',
      duration_sec: 10,
      resolution: '1080p',
    });

    expect(result.kind).toBe('video');
    expect(result.generator).toBe('runway-gen-4');
  });

  it('has correct name', () => {
    const client = makeFakeRunwayClient();
    const gen = new RunwayGen4({ apiClient: client });
    expect(gen.name).toBe('runway-gen-4');
  });

  it('has a positive cost_per_second_usd', () => {
    const client = makeFakeRunwayClient();
    const gen = new RunwayGen4({ apiClient: client });
    expect(gen.cost_per_second_usd).toBeGreaterThan(0);
  });

  it('includes prompt_used, duration_sec, and created_at', async () => {
    const client = makeFakeRunwayClient();
    const gen = new RunwayGen4({ apiClient: client });

    const result = await gen.generate('cosmic narrative', {
      aspect: '9:16',
      duration_sec: 10,
      resolution: '1080p',
    });

    expect(result.prompt_used).toBe('cosmic narrative');
    expect(result.duration_sec).toBe(10);
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('assigns unique ids per generation', async () => {
    const client = makeFakeRunwayClient();
    const gen = new RunwayGen4({ apiClient: client });
    const opts = { aspect: '9:16' as const, duration_sec: 10, resolution: '1080p' as const };
    const r1 = await gen.generate('a', opts);
    const r2 = await gen.generate('b', opts);
    expect(r1.id).not.toBe(r2.id);
  });

  it('propagates API errors', async () => {
    const client = makeFakeRunwayClient();
    client.generateVideo.mockRejectedValue(new Error('runway api unavailable'));
    const gen = new RunwayGen4({ apiClient: client });

    await expect(
      gen.generate('test', { aspect: '9:16', duration_sec: 10, resolution: '720p' })
    ).rejects.toThrow('runway api unavailable');
  });

  it('throws informative error when constructed without apiClient and env var missing', () => {
    const originalKey = process.env.RUNWAY_API_KEY;
    delete process.env.RUNWAY_API_KEY;

    expect(() => RunwayGen4.fromEnv()).toThrow(/RUNWAY_API_KEY/);

    if (originalKey !== undefined) process.env.RUNWAY_API_KEY = originalKey;
  });

  it('fromEnv() uses env key when present', () => {
    const originalKey = process.env.RUNWAY_API_KEY;
    process.env.RUNWAY_API_KEY = 'test-runway-key';

    expect(() => RunwayGen4.fromEnv()).not.toThrow();

    if (originalKey !== undefined) {
      process.env.RUNWAY_API_KEY = originalKey;
    } else {
      delete process.env.RUNWAY_API_KEY;
    }
  });

  it('passes prompt and resolution to apiClient', async () => {
    const client = makeFakeRunwayClient();
    const gen = new RunwayGen4({ apiClient: client });

    await gen.generate('character reveals chart', { aspect: '9:16', duration_sec: 12, resolution: '720p' });

    expect(client.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'character reveals chart', resolution: '720p' })
    );
  });
});
