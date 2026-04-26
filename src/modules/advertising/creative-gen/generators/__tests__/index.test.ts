import { describe, it, expect } from 'vitest';
import {
  getDefaultImageGenerator,
  getDefaultVideoGenerator,
  ImagenUltra,
  ImagenFast,
  NanoBanana2,
  VeoLite,
  IdeogramV3,
  RunwayGen4,
} from '../index';
import { mockGeminiApi } from '../../../__tests__/mocks/gemini';

describe('getDefaultImageGenerator', () => {
  it('returns ImagenUltra by default', () => {
    const api = mockGeminiApi();
    const gen = getDefaultImageGenerator({ apiClient: api });
    expect(gen).toBeInstanceOf(ImagenUltra);
    expect(gen.name).toBe('imagen-4-ultra');
  });

  it('returns NanoBanana2 when batchMode=true', () => {
    const api = mockGeminiApi();
    const gen = getDefaultImageGenerator({ apiClient: api }, { batchMode: true });
    expect(gen).toBeInstanceOf(NanoBanana2);
    expect(gen.name).toBe('nano-banana-2');
  });

  it('returns ImagenUltra when batchMode=false', () => {
    const api = mockGeminiApi();
    const gen = getDefaultImageGenerator({ apiClient: api }, { batchMode: false });
    expect(gen).toBeInstanceOf(ImagenUltra);
  });

  it('returns ImagenUltra when opts is undefined', () => {
    const api = mockGeminiApi();
    const gen = getDefaultImageGenerator({ apiClient: api }, undefined);
    expect(gen).toBeInstanceOf(ImagenUltra);
  });
});

describe('getDefaultVideoGenerator', () => {
  it('returns VeoLite', () => {
    const api = mockGeminiApi();
    const gen = getDefaultVideoGenerator({ apiClient: api });
    expect(gen).toBeInstanceOf(VeoLite);
    expect(gen.name).toBe('veo-3-1-lite');
  });
});

describe('barrel exports', () => {
  it('exports all generator classes', () => {
    expect(ImagenUltra).toBeDefined();
    expect(ImagenFast).toBeDefined();
    expect(NanoBanana2).toBeDefined();
    expect(VeoLite).toBeDefined();
    expect(IdeogramV3).toBeDefined();
    expect(RunwayGen4).toBeDefined();
  });

  it('exported generators are constructible', () => {
    const api = mockGeminiApi();
    expect(() => new ImagenUltra({ apiClient: api })).not.toThrow();
    expect(() => new ImagenFast({ apiClient: api })).not.toThrow();
    expect(() => new NanoBanana2({ apiClient: api })).not.toThrow();
    expect(() => new VeoLite({ apiClient: api })).not.toThrow();
  });
});
