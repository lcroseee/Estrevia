export * from './imagen';
export * from './veo';
export * from './nano-banana';
export * from './ideogram';
export * from './runway';

import type { ImageGenerator, VideoGenerator } from '@/shared/types/advertising';
import { ImagenUltra, ImagenFast } from './imagen';
import { VeoLite } from './veo';
import { NanoBanana2 } from './nano-banana';

interface GeneratorDeps {
  apiClient: {
    generateImage: (opts: {
      prompt: string;
      model: string;
      aspect: string;
      reference_images?: string[];
    }) => Promise<{ url: string; width: number; height: number; cost_usd: number }>;
    generateVideo: (opts: {
      prompt: string;
      model: string;
      aspect: string;
      duration_sec: number;
      resolution: '720p' | '1080p';
      with_audio?: boolean;
    }) => Promise<{ url: string; width: number; height: number; duration_sec: number; cost_usd: number }>;
  };
}

/**
 * Returns the default ImageGenerator for a given context.
 *
 * - Default: ImagenUltra ($0.06/image) — hero images, OG passport cards, landing visuals
 * - batchMode=true: NanoBanana2 — style-consistent series with reference images
 */
export function getDefaultImageGenerator(
  deps: GeneratorDeps,
  opts?: { batchMode?: boolean }
): ImageGenerator {
  if (opts?.batchMode) return new NanoBanana2(deps);
  return new ImagenUltra(deps);
}

/**
 * Returns the default VideoGenerator.
 * Always returns VeoLite — atmospheric Reels/Stories with built-in audio.
 */
export function getDefaultVideoGenerator(deps: GeneratorDeps): VideoGenerator {
  return new VeoLite(deps);
}
