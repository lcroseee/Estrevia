/** Base64 image payload plus its MIME type. `data` carries no `data:` prefix. */
export interface GeminiInlineImage {
  data: string;
  mimeType: string;
}

export interface GeminiImageInput {
  prompt: string;
  image: GeminiInlineImage;
  /** Defaults to the GA image model verified via ListModels on 2026-08-02. */
  model?: string;
}

export interface GeminiImageOutput {
  buffer: Buffer;
  mimeType: string;
}

export interface GeminiImageClientDeps {
  apiKey: string;
  fetch?: typeof fetch;
  sleepMs?: (ms: number) => Promise<void>;
}

const DEFAULT_MODEL = 'gemini-3.1-flash-image';
const MAX_ATTEMPTS = 3;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}

/**
 * Image-conditioned generation via Gemini `generateContent`.
 *
 * Distinct from the advertising `GeminiApiClient`, which targets Imagen's
 * `:predict` endpoint and is text-to-image only. Verified against the live API
 * on 2026-08-02: the response carries BOTH a text part and an inlineData part,
 * so the image must be located by predicate, never by index.
 *
 * The API key is never interpolated into a thrown message.
 */
export class GeminiImageClient {
  private readonly fetch: typeof fetch;
  private readonly sleepMs: (ms: number) => Promise<void>;

  constructor(private readonly deps: GeminiImageClientDeps) {
    this.fetch = deps.fetch ?? globalThis.fetch;
    this.sleepMs = deps.sleepMs ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async generateFromImage(opts: GeminiImageInput): Promise<GeminiImageOutput> {
    const model = opts.model ?? DEFAULT_MODEL;
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}` +
      `:generateContent?key=${this.deps.apiKey}`;

    const requestInit: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: opts.image.mimeType, data: opts.image.data } },
              { text: opts.prompt },
            ],
          },
        ],
      }),
    };

    let response: Response | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      response = await this.fetch(url, requestInit);
      if (response.status >= 200 && response.status < 300) break;
      if (response.status === 401 || response.status === 403) {
        throw new Error(`GEMINI_AUTH: HTTP ${response.status}`);
      }
      if (response.status === 429) {
        throw new Error('GEMINI_QUOTA: HTTP 429');
      }
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`GEMINI_BAD_REQUEST: HTTP ${response.status}`);
      }
      if (attempt < MAX_ATTEMPTS) {
        await this.sleepMs(2 ** (attempt - 1) * 1000);
      }
    }
    if (!response || response.status >= 500) {
      throw new Error(
        `GEMINI_5XX: HTTP ${response?.status ?? 'unknown'} after ${MAX_ATTEMPTS} attempts`,
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    // The image is NOT reliably parts[0] — the model prepends a text part.
    const imagePart = parts.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      throw new Error('GEMINI_NO_IMAGE');
    }

    return {
      buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
      mimeType: imagePart.inlineData.mimeType ?? 'image/jpeg',
    };
  }
}
