import { nanoid } from 'nanoid';
import type { ImageGenerator, ImageGenOptions, GeneratedAsset } from '@/shared/types/advertising';

interface IdeogramClient {
  generateImage(opts: {
    prompt: string;
    aspect: string;
  }): Promise<{ url: string; width: number; height: number; cost_usd: number }>;
}

interface IdeogramDeps {
  apiClient: IdeogramClient;
}

/**
 * Ideogram 3.0 — optional fallback for creatives requiring complex in-image
 * text composition. Activated via IDEOGRAM_API_KEY env var.
 * Use when Imagen 4 breaks on text phrases longer than 5 words.
 */
export class IdeogramV3 implements ImageGenerator {
  name = 'ideogram-3' as const;
  cost_per_image_usd = 0.08;

  constructor(private deps: IdeogramDeps) {}

  /**
   * Create an IdeogramV3 instance from the IDEOGRAM_API_KEY environment variable.
   * Throws an informative error if the key is not set.
   */
  static fromEnv(): IdeogramV3 {
    const key = process.env.IDEOGRAM_API_KEY;
    if (!key) {
      throw new Error(
        'IdeogramV3 requires IDEOGRAM_API_KEY environment variable to be set. ' +
        'Add it to your .env file or Vercel env vars before using this generator.'
      );
    }

    // Build a thin HTTP client using the key.
    // The real HTTP client implementation lives in the infrastructure layer;
    // here we create a minimal stub that satisfies the interface.
    const apiClient: IdeogramClient = {
      generateImage: async (opts) => {
        const response = await fetch('https://api.ideogram.ai/generate', {
          method: 'POST',
          headers: {
            'Api-Key': key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_request: {
              prompt: opts.prompt,
              aspect_ratio: opts.aspect,
              model: 'V_3',
            },
          }),
        });
        if (!response.ok) {
          throw new Error(`Ideogram API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json() as {
          data: Array<{ url: string; width?: number; height?: number }>;
        };
        const img = data.data[0];
        return {
          url: img.url,
          width: img.width ?? 1080,
          height: img.height ?? 1080,
          cost_usd: 0.08,
        };
      },
    };

    return new IdeogramV3({ apiClient });
  }

  async generate(prompt: string, opts: ImageGenOptions): Promise<GeneratedAsset> {
    const result = await this.deps.apiClient.generateImage({
      prompt,
      aspect: opts.aspect,
    });

    return {
      id: nanoid(),
      kind: 'image',
      generator: 'ideogram-3',
      prompt_used: prompt,
      url: result.url,
      width: result.width,
      height: result.height,
      cost_usd: this.cost_per_image_usd,
      created_at: new Date(),
    };
  }
}
