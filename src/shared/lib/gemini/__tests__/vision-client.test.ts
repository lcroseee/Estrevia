import { describe, it, expect } from 'vitest';
import { GeminiVisionClient, createGeminiVisionClient } from '../vision-client';
import type { VisionClient, VisionAnalysisResult } from '../vision-client';

describe('shared gemini vision-client', () => {
  it('exports the class and the factory from the shared path', () => {
    expect(GeminiVisionClient).toBeTypeOf('function');
    expect(createGeminiVisionClient).toBeTypeOf('function');
  });

  it('createGeminiVisionClient throws when GEMINI_API_KEY is absent', () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(() => createGeminiVisionClient()).toThrow(/GEMINI_API_KEY/);
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
  });

  it('satisfies the VisionClient contract structurally', () => {
    const fake: VisionClient = {
      async analyzeImage(): Promise<VisionAnalysisResult> {
        return { json: {}, cost_usd: 0 };
      },
    };
    expect(fake.analyzeImage).toBeTypeOf('function');
  });
});
