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

import { GeminiVisionClient, createGeminiVisionClient } from '../vision-checker';

describe('GeminiVisionClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('analyzeImage fetches the image, base64-encodes, and sends to Gemini', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, {
        headers: { 'content-type': 'image/png' },
        status: 200,
      }),
    );
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '{"passed": true, "dominantColors": ["#FFD700"], "reason": "matches gold"}',
      },
    });

    const client = new GeminiVisionClient({ apiKey: 'test-key' });
    const result = await client.analyzeImage('https://example.com/img.png', 'BRAND PROMPT');

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/img.png');
    expect(mockGenerateContent).toHaveBeenCalledOnce();
    const args = mockGenerateContent.mock.calls[0][0];
    expect(args).toEqual([
      { inlineData: { data: expect.any(String), mimeType: 'image/png' } },
      expect.stringContaining('BRAND PROMPT'),
    ]);
    expect(result.json).toEqual({
      passed: true,
      dominantColors: ['#FFD700'],
      reason: 'matches gold',
    });
    expect(result.cost_usd).toBe(0.0002);

    fetchSpy.mockRestore();
  });

  it('throws if the image fetch fails', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const client = new GeminiVisionClient({ apiKey: 'test-key' });
    await expect(client.analyzeImage('https://example.com/missing.png', 'PROMPT')).rejects.toThrow(
      /Image fetch failed: 404/,
    );
    fetchSpy.mockRestore();
  });

  it('throws on invalid JSON from Gemini', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, {
        headers: { 'content-type': 'image/png' },
        status: 200,
      }),
    );
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'not json' },
    });
    const client = new GeminiVisionClient({ apiKey: 'test-key' });
    await expect(client.analyzeImage('https://example.com/img.png', 'PROMPT')).rejects.toThrow(
      /JSON|Unexpected token/,
    );
    fetchSpy.mockRestore();
  });

  it('strips markdown code fences from Gemini JSON response', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, {
        headers: { 'content-type': 'image/png' },
        status: 200,
      }),
    );
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '```json\n{"passed": true}\n```',
      },
    });
    const client = new GeminiVisionClient({ apiKey: 'test-key' });
    const result = await client.analyzeImage('https://example.com/img.png', 'PROMPT');
    expect(result.json).toEqual({ passed: true });
    fetchSpy.mockRestore();
  });

  it('defaults mimeType to image/jpeg when content-type header is missing', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer, { status: 200 }),
    );
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => '{"passed": true}' },
    });
    const client = new GeminiVisionClient({ apiKey: 'test-key' });
    await client.analyzeImage('https://example.com/img.jpg', 'PROMPT');
    const args = mockGenerateContent.mock.calls[0][0];
    expect(args[0]).toMatchObject({ inlineData: { mimeType: 'image/jpeg' } });
    fetchSpy.mockRestore();
  });
});

describe('createGeminiVisionClient', () => {
  it('throws if GEMINI_API_KEY is unset', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => createGeminiVisionClient()).toThrow(/GEMINI_API_KEY/);
  });

  it('returns a GeminiVisionClient when the key is set', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const client = createGeminiVisionClient();
    expect(client).toBeDefined();
  });
});
