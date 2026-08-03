import { describe, it, expect, vi } from 'vitest';
import { GeminiImageClient } from '../image-client';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQAB';

function okResponse(parts: unknown[]) {
  return {
    status: 200,
    json: async () => ({ candidates: [{ content: { parts }, finishReason: 'STOP' }] }),
  } as unknown as Response;
}

describe('GeminiImageClient.generateFromImage', () => {
  it('finds the inlineData part when it is NOT parts[0]', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse([
        { text: 'Here is your portrait.' },
        { inlineData: { mimeType: 'image/jpeg', data: PNG_B64 } },
      ]),
    );
    const client = new GeminiImageClient({ apiKey: 'k', fetch: fetchMock as unknown as typeof fetch });

    const out = await client.generateFromImage({
      prompt: 'cosmic portrait',
      image: { data: PNG_B64, mimeType: 'image/jpeg' },
    });

    expect(out.mimeType).toBe('image/jpeg');
    expect(out.buffer).toBeInstanceOf(Buffer);
    expect(out.buffer.length).toBeGreaterThan(0);
  });

  it('sends the input image as an inline_data part and defaults to gemini-3.1-flash-image', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse([{ inlineData: { mimeType: 'image/jpeg', data: PNG_B64 } }]),
    );
    const client = new GeminiImageClient({ apiKey: 'k', fetch: fetchMock as unknown as typeof fetch });

    await client.generateFromImage({
      prompt: 'cosmic portrait',
      image: { data: PNG_B64, mimeType: 'image/png' },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('gemini-3.1-flash-image:generateContent');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.contents[0].parts[0].inline_data).toEqual({
      mime_type: 'image/png',
      data: PNG_B64,
    });
    expect(body.contents[0].parts[1].text).toBe('cosmic portrait');
  });

  it('sends the API key via the x-goog-api-key header, not the URL query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse([{ inlineData: { mimeType: 'image/jpeg', data: PNG_B64 } }]),
    );
    const client = new GeminiImageClient({
      apiKey: 'super-secret-key',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.generateFromImage({
      prompt: 'cosmic portrait',
      image: { data: PNG_B64, mimeType: 'image/png' },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain('super-secret-key');
    expect((init as RequestInit).headers).toMatchObject({
      'x-goog-api-key': 'super-secret-key',
    });
  });

  it('never puts the API key in the thrown message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 403, json: async () => ({}) } as unknown as Response);
    const client = new GeminiImageClient({ apiKey: 'super-secret-key', fetch: fetchMock as unknown as typeof fetch });

    await expect(
      client.generateFromImage({ prompt: 'p', image: { data: PNG_B64, mimeType: 'image/jpeg' } }),
    ).rejects.toThrow(/^GEMINI_AUTH: HTTP 403$/);
  });

  it('throws GEMINI_QUOTA on 429 without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 429, json: async () => ({}) } as unknown as Response);
    const client = new GeminiImageClient({ apiKey: 'k', fetch: fetchMock as unknown as typeof fetch });

    await expect(
      client.generateFromImage({ prompt: 'p', image: { data: PNG_B64, mimeType: 'image/jpeg' } }),
    ).rejects.toThrow('GEMINI_QUOTA: HTTP 429');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx three times with backoff, then throws GEMINI_5XX', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 503, json: async () => ({}) } as unknown as Response);
    const sleepMs = vi.fn().mockResolvedValue(undefined);
    const client = new GeminiImageClient({ apiKey: 'k', fetch: fetchMock as unknown as typeof fetch, sleepMs });

    await expect(
      client.generateFromImage({ prompt: 'p', image: { data: PNG_B64, mimeType: 'image/jpeg' } }),
    ).rejects.toThrow(/GEMINI_5XX/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepMs).toHaveBeenCalledTimes(2);
  });

  it('throws GEMINI_NO_IMAGE when the response carries only text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([{ text: 'I cannot do that.' }]));
    const client = new GeminiImageClient({ apiKey: 'k', fetch: fetchMock as unknown as typeof fetch });

    await expect(
      client.generateFromImage({ prompt: 'p', image: { data: PNG_B64, mimeType: 'image/jpeg' } }),
    ).rejects.toThrow('GEMINI_NO_IMAGE');
  });
});
