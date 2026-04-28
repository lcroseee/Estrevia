import { describe, it, expect, vi } from 'vitest';
import { GeminiApiClient } from '../gemini-api-client';

function makeOkResponse(base64: string): Response {
  return new Response(
    JSON.stringify({ predictions: [{ bytesBase64Encoded: base64 }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('GeminiApiClient.generateImage', () => {
  it('calls Imagen 4 Fast endpoint, uploads to Blob, returns URL with cost 0.02', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse('aGVsbG8='));
    const blobPutMock = vi.fn().mockResolvedValue({
      url: 'https://test.public.blob.vercel-storage.com/creatives/launch/abc.png',
      pathname: 'creatives/launch/abc.png',
    });

    const client = new GeminiApiClient({
      geminiApiKey: 'gemini-key',
      blobToken: 'blob-token',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
    });

    const result = await client.generateImage({
      prompt: 'dark cosmic gradient',
      model: 'imagen-4-fast',
      aspect: '9:16',
    });

    // Endpoint check
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('imagen-4.0-fast-generate-001:predict');
    expect(url).toContain('key=gemini-key');
    expect(init.method).toBe('POST');

    // POST body check
    const body = JSON.parse(init.body as string);
    expect(body.instances[0].prompt).toBe('dark cosmic gradient');
    expect(body.parameters.aspectRatio).toBe('9:16');
    expect(body.parameters.sampleCount).toBe(1);

    // Blob upload check
    expect(blobPutMock).toHaveBeenCalledTimes(1);
    const [blobPath, blobBuffer, blobOpts] = blobPutMock.mock.calls[0];
    expect(blobPath).toMatch(/^creatives\/launch\/[A-Za-z0-9_-]+\.png$/);
    expect(blobBuffer).toBeInstanceOf(Buffer);
    expect(blobOpts.access).toBe('public');
    expect(blobOpts.contentType).toBe('image/png');
    expect(blobOpts.token).toBe('blob-token');

    // Return shape
    expect(result.url).toBe('https://test.public.blob.vercel-storage.com/creatives/launch/abc.png');
    expect(result.cost_usd).toBe(0.02);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
  });

  it('returns cost 0.06 for imagen-4-ultra and uses ultra endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse('aGVsbG8='));
    const blobPutMock = vi.fn().mockResolvedValue({
      url: 'https://test.public.blob.vercel-storage.com/creatives/launch/u.png',
      pathname: 'creatives/launch/u.png',
    });

    const client = new GeminiApiClient({
      geminiApiKey: 'k',
      blobToken: 't',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
    });

    const result = await client.generateImage({
      prompt: 'p',
      model: 'imagen-4-ultra',
      aspect: '1:1',
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('imagen-4.0-ultra-generate-001:predict');
    expect(result.cost_usd).toBe(0.06);
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
  });

  it('throws on 401 without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"error":{"code":401,"message":"unauth"}}', { status: 401 }),
    );
    const blobPutMock = vi.fn();

    const client = new GeminiApiClient({
      geminiApiKey: 'bad',
      blobToken: 't',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
    });

    await expect(
      client.generateImage({ prompt: 'p', model: 'imagen-4-fast', aspect: '9:16' }),
    ).rejects.toThrow(/GEMINI_AUTH/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(blobPutMock).not.toHaveBeenCalled();
  });

  it('retries 3 times on 503 then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('upstream', { status: 503 }))
      .mockResolvedValueOnce(new Response('upstream', { status: 503 }))
      .mockResolvedValueOnce(makeOkResponse('aGk='));
    const blobPutMock = vi.fn().mockResolvedValue({
      url: 'https://test.public.blob.vercel-storage.com/x.png',
      pathname: 'x.png',
    });

    const client = new GeminiApiClient({
      geminiApiKey: 'k',
      blobToken: 't',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
      sleepMs: () => Promise.resolve(),
    });

    const result = await client.generateImage({
      prompt: 'p',
      model: 'imagen-4-fast',
      aspect: '9:16',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.url).toBe('https://test.public.blob.vercel-storage.com/x.png');
  });

  it('throws after 3 failed retries on 503', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('upstream', { status: 503 }));
    const blobPutMock = vi.fn();

    const client = new GeminiApiClient({
      geminiApiKey: 'k',
      blobToken: 't',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
      sleepMs: () => Promise.resolve(),
    });

    await expect(
      client.generateImage({ prompt: 'p', model: 'imagen-4-fast', aspect: '9:16' }),
    ).rejects.toThrow(/GEMINI_5XX/);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(blobPutMock).not.toHaveBeenCalled();
  });

  it('throws GEMINI_NO_IMAGE when predictions array is empty (safety filter)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ predictions: [] }), { status: 200 }),
    );
    const blobPutMock = vi.fn();

    const client = new GeminiApiClient({
      geminiApiKey: 'k',
      blobToken: 't',
      fetch: fetchMock as unknown as typeof fetch,
      blobPut: blobPutMock,
    });

    await expect(
      client.generateImage({ prompt: 'p', model: 'imagen-4-fast', aspect: '9:16' }),
    ).rejects.toThrow(/GEMINI_NO_IMAGE/);

    expect(blobPutMock).not.toHaveBeenCalled();
  });
});

describe('GeminiApiClient.generateVideo', () => {
  it('throws VIDEO_NOT_IMPLEMENTED — first batch is image-only', async () => {
    const client = new GeminiApiClient({
      geminiApiKey: 'k',
      blobToken: 't',
      fetch: vi.fn() as unknown as typeof fetch,
      blobPut: vi.fn(),
    });

    await expect(
      client.generateVideo({
        prompt: 'p',
        model: 'veo-3-1-lite',
        aspect: '9:16',
        duration_sec: 15,
        resolution: '720p',
      }),
    ).rejects.toThrow(/VIDEO_NOT_IMPLEMENTED/);
  });
});
