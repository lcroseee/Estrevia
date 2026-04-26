export type HookArchetype = 'identity_reveal' | 'authority' | 'rarity'
  | 'identity_continuation' | 'paywall_nudge';

export interface HookTemplate {
  id: string;
  name: string;
  archetype: HookArchetype;
  copy_template: string;
  visual_mood: string;
  duration_sec?: number;
  aspect_ratios: ('9:16' | '1:1' | '4:5')[];
  locale: 'en' | 'es';
  policy_constraints: string[];
}

export interface GeneratedAsset {
  id: string;
  kind: 'image' | 'video';
  generator: 'imagen-4-fast' | 'imagen-4-ultra' | 'nano-banana-2'
    | 'ideogram-3' | 'veo-3-1-lite' | 'runway-gen-4' | 'satori';
  prompt_used: string;
  url: string; // Vercel Blob URL
  width: number;
  height: number;
  duration_sec?: number;
  cost_usd: number;
  created_at: Date;
}

export interface SafetyCheckResult {
  check_name: string;
  passed: boolean;
  reason?: string;
  severity: 'info' | 'warning' | 'block';
}

export interface CreativeBundle {
  id: string;
  hook_template_id: string;
  asset: GeneratedAsset;
  copy: string;
  cta: string;
  locale: 'en' | 'es';
  status: 'pending_review' | 'approved' | 'rejected' | 'uploaded' | 'live' | 'paused';
  safety_checks: SafetyCheckResult[];
  approved_by?: string;
  approved_at?: Date;
  meta_ad_id?: string;
}

export interface ImageGenOptions {
  aspect: '1:1' | '9:16' | '4:5';
  width: number;
  height: number;
  reference_images?: string[]; // for Nano Banana
}

export interface VideoGenOptions {
  aspect: '9:16' | '1:1' | '16:9';
  duration_sec: number;
  resolution: '720p' | '1080p';
  with_audio?: boolean;
}

export interface ImageGenerator {
  name: string;
  generate(prompt: string, opts: ImageGenOptions): Promise<GeneratedAsset>;
  cost_per_image_usd: number;
}

export interface VideoGenerator {
  name: string;
  generate(prompt: string, opts: VideoGenOptions): Promise<GeneratedAsset>;
  cost_per_second_usd: number;
}
