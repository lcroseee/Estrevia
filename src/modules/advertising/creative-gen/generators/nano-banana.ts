import { nanoid } from 'nanoid';
import type { ImageGenerator, ImageGenOptions, GeneratedAsset } from '@/shared/types/advertising';

interface GeminiClient {
  generateImage(opts: {
    prompt: string;
    model: string;
    aspect: string;
    reference_images?: string[];
  }): Promise<{ url: string; width: number; height: number; cost_usd: number }>;
}

interface NanaBananaDeps {
  apiClient: GeminiClient;
}

/**
 * Nano Banana 2 — Gemini 3.1 Flash Image.
 * Designed for style-consistent batch generation with up to 14 reference images.
 * Activate for batches of ≥10 ads in a series where brand consistency
 * outweighs per-image cost over Imagen 4 Fast.
 */
export class NanoBanana2 implements ImageGenerator {
  name = 'nano-banana-2' as const;
  /** Cost TBD once Nano Banana 2 exits preview; set conservatively at $0.03/image. */
  cost_per_image_usd = 0.03;

  constructor(private deps: NanaBananaDeps) {}

  async generate(prompt: string, opts: ImageGenOptions): Promise<GeneratedAsset> {
    const result = await this.deps.apiClient.generateImage({
      prompt,
      model: 'gemini-3.1-flash-image',
      aspect: opts.aspect,
      reference_images: opts.reference_images,
    });

    return {
      id: nanoid(),
      kind: 'image',
      generator: 'nano-banana-2',
      prompt_used: prompt,
      url: result.url,
      width: result.width,
      height: result.height,
      cost_usd: this.cost_per_image_usd,
      created_at: new Date(),
    };
  }
}
