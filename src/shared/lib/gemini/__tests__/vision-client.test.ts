import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }));

vi.mock('@google/generative-ai', () => {
  // Class-based mock so `new GoogleGenerativeAI(...)` works as a constructor.
  class MockGoogleGenerativeAI {
    constructor(public readonly apiKey: string) {}
    getGenerativeModel = mockGetGenerativeModel;
  }
  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

import { GeminiVisionClient, createGeminiVisionClient } from '../vision-client';
import type { VisionClient, VisionAnalysisResult } from '../vision-client';

describe('shared gemini vision-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('analyzeImage accepts inline base64 + mimeType directly, without fetching a URL', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => '{"safe": true, "reasons": []}' },
    });

    const client = new GeminiVisionClient({ apiKey: 'test-key' });
    const result = await client.analyzeImage(
      { data: 'ZmFrZS1zZWxmaWUtYnl0ZXM=', mimeType: 'image/jpeg' },
      'ANALYSE PROMPT',
    );

    // The whole point of the inline path is that the raw bytes never need to
    // round-trip through a URL — no network fetch of the image itself.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockGenerateContent).toHaveBeenCalledOnce();
    const args = mockGenerateContent.mock.calls[0][0];
    expect(args).toEqual([
      { inlineData: { data: 'ZmFrZS1zZWxmaWUtYnl0ZXM=', mimeType: 'image/jpeg' } },
      expect.stringContaining('ANALYSE PROMPT'),
    ]);
    expect(result.json).toEqual({ safe: true, reasons: [] });
    expect(result.cost_usd).toBe(0.0002);

    fetchSpy.mockRestore();
  });

  it('analyzeImage still fetches when given a URL string (existing behaviour)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, {
        headers: { 'content-type': 'image/png' },
        status: 200,
      }),
    );
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => '{"safe": true, "reasons": []}' },
    });

    const client = new GeminiVisionClient({ apiKey: 'test-key' });
    await client.analyzeImage('https://example.com/img.png', 'URL PROMPT');

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/img.png');
    fetchSpy.mockRestore();
  });
});
