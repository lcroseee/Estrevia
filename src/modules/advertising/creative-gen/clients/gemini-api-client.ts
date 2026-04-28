import { nanoid } from 'nanoid';
import { put as defaultBlobPut } from '@vercel/blob';

export interface GeminiImageOpts {
  prompt: string;
  model: 'imagen-4-fast' | 'imagen-4-ultra';
  aspect: '9:16' | '1:1' | '4:5';
}

export interface GeminiImageResult {
  url: string;
  width: number;
  height: number;
  cost_usd: number;
}

export interface GeminiVideoOpts {
  prompt: string;
  model: string;
  aspect: string;
  duration_sec: number;
  resolution: '720p' | '1080p';
  with_audio?: boolean;
}

export interface GeminiVideoResult {
  url: string;
  width: number;
  height: number;
  duration_sec: number;
  cost_usd: number;
}

export interface GeminiApiClientDeps {
  geminiApiKey: string;
  blobToken: string;
  fetch?: typeof fetch;
  blobPut?: typeof defaultBlobPut;
  sleepMs?: (ms: number) => Promise<void>;
}

const MODEL_ENDPOINT: Record<GeminiImageOpts['model'], string> = {
  'imagen-4-fast': 'imagen-4.0-fast-generate-001:predict',
  'imagen-4-ultra': 'imagen-4.0-ultra-generate-001:predict',
};

const MODEL_COST: Record<GeminiImageOpts['model'], number> = {
  'imagen-4-fast': 0.02,
  'imagen-4-ultra': 0.06,
};

const ASPECT_DIMENSIONS: Record<GeminiImageOpts['aspect'], { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1024, height: 1024 },
  '4:5': { width: 1024, height: 1280 },
};

export class GeminiApiClient {
  private readonly fetch: typeof fetch;
  private readonly blobPut: typeof defaultBlobPut;
  private readonly sleepMs: (ms: number) => Promise<void>;

  constructor(private readonly deps: GeminiApiClientDeps) {
    this.fetch = deps.fetch ?? globalThis.fetch;
    this.blobPut = deps.blobPut ?? defaultBlobPut;
    this.sleepMs = deps.sleepMs ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async generateImage(opts: GeminiImageOpts): Promise<GeminiImageResult> {
    const endpoint = MODEL_ENDPOINT[opts.model];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${endpoint}?key=${this.deps.geminiApiKey}`;
    const requestInit: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: opts.prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: opts.aspect,
          safetyFilterLevel: 'block_some',
        },
      }),
    };

    const MAX_ATTEMPTS = 3;
    let response: Response | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      response = await this.fetch(url, requestInit);
      if (response.status >= 200 && response.status < 300) break;
      if (response.status === 401 || response.status === 403) {
        throw new Error(`GEMINI_AUTH: HTTP ${response.status}`);
      }
      if (response.status === 429) {
        throw new Error(`GEMINI_QUOTA: HTTP 429`);
      }
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`GEMINI_BAD_REQUEST: HTTP ${response.status}`);
      }
      // 5xx — retry with exponential backoff
      if (attempt < MAX_ATTEMPTS) {
        await this.sleepMs(2 ** (attempt - 1) * 1000);
      }
    }
    if (!response || response.status >= 500) {
      throw new Error(`GEMINI_5XX: HTTP ${response?.status ?? 'unknown'} after ${MAX_ATTEMPTS} attempts`);
    }

    const data = (await response.json()) as { predictions?: Array<{ bytesBase64Encoded?: string }> };
    const base64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!base64) {
      throw new Error('GEMINI_NO_IMAGE');
    }

    const buffer = Buffer.from(base64, 'base64');
    const blob = await this.blobPut(`creatives/launch/${nanoid()}.png`, buffer, {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
      token: this.deps.blobToken,
    });

    const dims = ASPECT_DIMENSIONS[opts.aspect];
    return {
      url: blob.url,
      width: dims.width,
      height: dims.height,
      cost_usd: MODEL_COST[opts.model],
    };
  }

  async generateVideo(_opts: GeminiVideoOpts): Promise<GeminiVideoResult> {
    throw new Error('VIDEO_NOT_IMPLEMENTED');
  }
}
