import { nanoid } from 'nanoid';
import type { ImageGenerator, ImageGenOptions, GeneratedAsset } from '@/shared/types/advertising';

interface GeminiClient {
  generateImage(opts: {
    prompt: string;
    model: string;
    aspect: string;
  }): Promise<{ url: string; width: number; height: number; cost_usd: number }>;
}

interface ImagenDeps {
  apiClient: GeminiClient;
}

export class ImagenUltra implements ImageGenerator {
  name = 'imagen-4-ultra' as const;
  cost_per_image_usd = 0.06;

  constructor(private deps: ImagenDeps) {}

  async generate(prompt: string, opts: ImageGenOptions): Promise<GeneratedAsset> {
    const result = await this.deps.apiClient.generateImage({
      prompt,
      model: 'imagen-4-ultra',
      aspect: opts.aspect,
    });

    return {
      id: nanoid(),
      kind: 'image',
      generator: 'imagen-4-ultra',
      prompt_used: prompt,
      url: result.url,
      width: result.width,
      height: result.height,
      cost_usd: this.cost_per_image_usd,
      created_at: new Date(),
    };
  }
}

export class ImagenFast implements ImageGenerator {
  name = 'imagen-4-fast' as const;
  cost_per_image_usd = 0.02;

  constructor(private deps: ImagenDeps) {}

  async generate(prompt: string, opts: ImageGenOptions): Promise<GeneratedAsset> {
    const result = await this.deps.apiClient.generateImage({
      prompt,
      model: 'imagen-4-fast',
      aspect: opts.aspect,
    });

    return {
      id: nanoid(),
      kind: 'image',
      generator: 'imagen-4-fast',
      prompt_used: prompt,
      url: result.url,
      width: result.width,
      height: result.height,
      cost_usd: this.cost_per_image_usd,
      created_at: new Date(),
    };
  }
}
