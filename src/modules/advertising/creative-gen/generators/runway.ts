import { nanoid } from 'nanoid';
import type { VideoGenerator, VideoGenOptions, GeneratedAsset } from '@/shared/types/advertising';

interface RunwayClient {
  generateVideo(opts: {
    prompt: string;
    aspect: string;
    duration_sec: number;
    resolution: '720p' | '1080p';
  }): Promise<{ url: string; width: number; height: number; duration_sec: number; cost_usd: number }>;
}

interface RunwayDeps {
  apiClient: RunwayClient;
}

/**
 * Runway Gen-4 — optional fallback for narrative Reels with story arc,
 * complex camera motion, and character consistency. Activated via RUNWAY_API_KEY.
 * Use when Veo 3.1 Lite cannot achieve the required cinematic narrative.
 */
export class RunwayGen4 implements VideoGenerator {
  name = 'runway-gen-4' as const;
  cost_per_second_usd = 0.05;

  constructor(private deps: RunwayDeps) {}

  /**
   * Create a RunwayGen4 instance from the RUNWAY_API_KEY environment variable.
   * Throws an informative error if the key is not set.
   */
  static fromEnv(): RunwayGen4 {
    const key = process.env.RUNWAY_API_KEY;
    if (!key) {
      throw new Error(
        'RunwayGen4 requires RUNWAY_API_KEY environment variable to be set. ' +
        'Add it to your .env file or Vercel env vars before using this generator.'
      );
    }

    // Build a thin HTTP client using the key.
    // The real HTTP client implementation lives in the infrastructure layer.
    const apiClient: RunwayClient = {
      generateVideo: async (opts) => {
        const response = await fetch('https://api.runwayml.com/v1/image_to_video', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'X-Runway-Version': '2024-11-06',
          },
          body: JSON.stringify({
            model: 'gen4_turbo',
            prompt_text: opts.prompt,
            ratio: opts.aspect,
            duration: opts.duration_sec,
          }),
        });
        if (!response.ok) {
          throw new Error(`Runway API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json() as { output?: string[]; id?: string };
        const url = data.output?.[0] ?? '';
        return {
          url,
          width: opts.resolution === '1080p' ? 1080 : 1280,
          height: opts.resolution === '1080p' ? 1920 : 720,
          duration_sec: opts.duration_sec,
          cost_usd: 0.05 * opts.duration_sec,
        };
      },
    };

    return new RunwayGen4({ apiClient });
  }

  async generate(prompt: string, opts: VideoGenOptions): Promise<GeneratedAsset> {
    const result = await this.deps.apiClient.generateVideo({
      prompt,
      aspect: opts.aspect,
      duration_sec: opts.duration_sec,
      resolution: opts.resolution,
    });

    return {
      id: nanoid(),
      kind: 'video',
      generator: 'runway-gen-4',
      prompt_used: prompt,
      url: result.url,
      width: result.width,
      height: result.height,
      duration_sec: result.duration_sec,
      cost_usd: result.cost_usd,
      created_at: new Date(),
    };
  }
}
