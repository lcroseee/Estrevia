import { nanoid } from 'nanoid';
import type {
  CreativeBundle,
  HookTemplate,
  ImageGenerator,
  VideoGenerator,
  ImageGenOptions,
  VideoGenOptions,
} from '@/shared/types/advertising';
import type { ClaudeClient } from '../safety/checks';
import { runAllChecks, isBlocked } from '../safety/checks';
import { advertisingCreatives } from '@/shared/lib/schema';

// ---------------------------------------------------------------------------
// Dependency interfaces
// ---------------------------------------------------------------------------

export interface DbClient {
  insert(table: typeof advertisingCreatives): {
    values(row: typeof advertisingCreatives.$inferInsert): Promise<void>;
  };
}

export interface BatchDeps {
  imageGen: ImageGenerator;
  videoGen: VideoGenerator;
  hookTemplates: HookTemplate[];
  claudeClient: ClaudeClient;
  db: DbClient;
}

export interface BatchOptions {
  /** Number of creatives per locale. Default: 11 */
  count_per_locale?: number;
  /** Locales to generate for. Default: ['en', 'es'] */
  locales?: ('en' | 'es')[];
}

export interface BatchSummary {
  generated: number;
  rejected: number;
  total_cost_usd: number;
  creatives: CreativeBundle[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IMAGE_OPTS: ImageGenOptions = {
  aspect: '9:16',
  width: 1080,
  height: 1920,
};

const VIDEO_OPTS: VideoGenOptions = {
  aspect: '9:16',
  duration_sec: 15,
  resolution: '720p',
  with_audio: false,
};

/**
 * Picks a template for the given locale+slot combination.
 * Cycles through available templates if there are fewer templates than slots.
 */
function pickTemplate(
  templates: HookTemplate[],
  locale: 'en' | 'es',
  slotIndex: number,
): HookTemplate {
  const forLocale = templates.filter((t) => t.locale === locale);
  // Fallback: if no locale-specific templates exist, use all templates.
  const pool = forLocale.length > 0 ? forLocale : templates;
  return pool[slotIndex % pool.length];
}

/**
 * Generates the copy for a creative by interpolating the template's
 * copy_template (MVP: use template copy as-is).
 */
function buildCopy(template: HookTemplate): string {
  // In a full implementation the copy_template has placeholders filled by
  // the LLM. For now we use the template directly — the real impl lives in
  // the composition module (S3).
  return template.copy_template;
}

/**
 * Generates the CTA text for a locale.
 */
function buildCta(locale: 'en' | 'es'): string {
  return locale === 'es' ? 'Calcula tu carta' : 'Calculate your chart';
}

// ---------------------------------------------------------------------------
// Core batch function
// ---------------------------------------------------------------------------

/**
 * Generates a launch batch of creatives across locales.
 *
 * For each (locale, slot) combination:
 *   1. Pick a hook template
 *   2. Call the appropriate generator (image or video depending on template)
 *   3. Run safety checks in parallel
 *   4. Persist to DB with status='pending_review'
 *
 * Returns a summary including counts, total cost, and the accepted bundles.
 */
export async function generateLaunchBatch(
  deps: BatchDeps,
  opts: BatchOptions = {},
): Promise<BatchSummary> {
  const count_per_locale = opts.count_per_locale ?? 11;
  const locales = opts.locales ?? (['en', 'es'] as const);

  let generated = 0;
  let rejected = 0;
  let total_cost_usd = 0;
  const creatives: CreativeBundle[] = [];

  for (const locale of locales) {
    for (let i = 0; i < count_per_locale; i++) {
      const template = pickTemplate(deps.hookTemplates, locale, i);
      const copy = buildCopy(template);
      const cta = buildCta(locale);

      // Generate asset — use video generator if template has a duration
      const asset =
        template.duration_sec !== undefined
          ? await deps.videoGen.generate(template.visual_mood, VIDEO_OPTS)
          : await deps.imageGen.generate(template.visual_mood, IMAGE_OPTS);

      total_cost_usd += asset.cost_usd;

      // Assemble bundle (without safety checks initially)
      const bundle: CreativeBundle = {
        id: nanoid(),
        hook_template_id: template.id,
        asset,
        copy,
        cta,
        locale,
        status: 'pending_review',
        safety_checks: [],
      };

      // Run safety checks
      const safetyResults = await runAllChecks(bundle, {
        claudeClient: deps.claudeClient,
      });
      bundle.safety_checks = safetyResults;

      if (isBlocked(safetyResults)) {
        rejected++;
        // Still persist to DB so founders can review what was blocked and why
        await deps.db
          .insert(advertisingCreatives)
          .values({
            id: bundle.id,
            hookTemplateId: bundle.hook_template_id,
            assetUrl: bundle.asset.url,
            assetKind: bundle.asset.kind,
            generator: bundle.asset.generator,
            costUsd: bundle.asset.cost_usd,
            copy: bundle.copy,
            cta: bundle.cta,
            locale: bundle.locale,
            status: 'rejected',
            safetyChecks: bundle.safety_checks,
            metaAdId: null,
            approvedBy: null,
            approvedAt: null,
          });
        continue;
      }

      // Persist accepted bundle
      await deps.db
        .insert(advertisingCreatives)
        .values({
          id: bundle.id,
          hookTemplateId: bundle.hook_template_id,
          assetUrl: bundle.asset.url,
          assetKind: bundle.asset.kind,
          generator: bundle.asset.generator,
          costUsd: bundle.asset.cost_usd,
          copy: bundle.copy,
          cta: bundle.cta,
          locale: bundle.locale,
          status: 'pending_review',
          safetyChecks: bundle.safety_checks,
          metaAdId: null,
          approvedBy: null,
          approvedAt: null,
        });

      generated++;
      creatives.push(bundle);
    }
  }

  return { generated, rejected, total_cost_usd, creatives };
}
