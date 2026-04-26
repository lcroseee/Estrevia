import { nanoid } from 'nanoid';
import type { VideoGenerator, VideoGenOptions, GeneratedAsset } from '@/shared/types/advertising';

interface GeminiClient {
  generateVideo(opts: {
    prompt: string;
    model: string;
    aspect: string;
    duration_sec: number;
    resolution: '720p' | '1080p';
    with_audio?: boolean;
  }): Promise<{ url: string; width: number; height: number; duration_sec: number; cost_usd: number }>;
}

interface VeoDeps {
  apiClient: GeminiClient;
}

const COST_PER_SECOND: Record<'720p' | '1080p', number> = {
  '720p': 0.05,
  '1080p': 0.08,
};

export class VeoLite implements VideoGenerator {
  name = 'veo-3-1-lite' as const;
  /** Base cost_per_second_usd is the 720p rate. Actual cost depends on resolution. */
  cost_per_second_usd = 0.05;

  constructor(private deps: VeoDeps) {}

  async generate(prompt: string, opts: VideoGenOptions): Promise<GeneratedAsset> {
    const result = await this.deps.apiClient.generateVideo({
      prompt,
      model: 'veo-3-1-lite',
      aspect: opts.aspect,
      duration_sec: opts.duration_sec,
      resolution: opts.resolution,
      with_audio: opts.with_audio,
    });

    const rate = COST_PER_SECOND[opts.resolution];
    const cost_usd = rate * result.duration_sec;

    return {
      id: nanoid(),
      kind: 'video',
      generator: 'veo-3-1-lite',
      prompt_used: prompt,
      url: result.url,
      width: result.width,
      height: result.height,
      duration_sec: result.duration_sec,
      cost_usd,
      created_at: new Date(),
    };
  }
}
