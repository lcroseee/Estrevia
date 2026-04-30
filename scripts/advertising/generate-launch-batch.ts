import 'dotenv/config';
import type {
  HookArchetype,
  HookTemplate,
  ImageGenerator,
  VideoGenerator,
} from '@/shared/types/advertising';
import { allHooks } from '@/modules/advertising/creative-gen/templates';
import { generateLaunchBatch } from '@/modules/advertising/creative-gen/batch';
import type { BatchDeps, BatchSummary, DbClient } from '@/modules/advertising/creative-gen/batch';
import type { ClaudeClient } from '@/modules/advertising/creative-gen/safety/checks';
import { GeminiApiClient, ClaudeSafetyClient } from '@/modules/advertising/creative-gen/clients';
import { ImagenFast, ImagenUltra } from '@/modules/advertising/creative-gen/generators';
import { getDb } from '@/shared/lib/db';

const REQUIRED_ENV_VARS = [
  'GEMINI_API_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'ANTHROPIC_API_KEY',
  'DATABASE_URL',
] as const;

export type ValidateEnvResult =
  | { ok: true }
  | { ok: false; missing: string[] };

export function validateEnv(): ValidateEnvResult {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true };
}

export function stripDurationFromHooks(hooks: HookTemplate[]): HookTemplate[] {
  return hooks.map((hook) => ({ ...hook, duration_sec: undefined }));
}

/**
 * Build a per-locale slot plan that rotates archetypes for genuine A/B mix.
 *
 * Slot N picks archetype N % archetypeCount, variant floor(N / archetypeCount).
 * For 3 archetypes the order is identity → authority → rarity → identity-2 → ...
 * Insertion order of archetypes follows their first appearance in the input.
 */
export function buildArchetypePlan(
  templates: HookTemplate[],
  locale: 'en' | 'es',
  count: number,
): HookTemplate[] {
  if (count <= 0) return [];
  const pool = templates.filter((t) => t.locale === locale);
  if (pool.length === 0) return [];

  const byArchetype = new Map<HookArchetype, HookTemplate[]>();
  for (const t of pool) {
    const list = byArchetype.get(t.archetype) ?? [];
    list.push(t);
    byArchetype.set(t.archetype, list);
  }
  const archetypes = [...byArchetype.keys()];

  const plan: HookTemplate[] = [];
  for (let i = 0; i < count; i++) {
    const archetype = archetypes[i % archetypes.length];
    const variants = byArchetype.get(archetype)!;
    const variantIndex = Math.floor(i / archetypes.length) % variants.length;
    plan.push(variants[variantIndex]);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// runBatch
// ---------------------------------------------------------------------------

export interface RunBatchOpts {
  countPerLocale?: number;
  locales?: ('en' | 'es')[];
  /**
   * Targeted regeneration mode. When non-empty, archetype rotation is bypassed
   * and each listed template id is generated `samples` times in parallel.
   */
  templateIds?: string[];
  /** Generations per template id when `templateIds` is provided. Default 1. */
  samples?: number;
  db: DbClient;
  imageGen: ImageGenerator;
  claudeClient: ClaudeClient;
  videoGen?: VideoGenerator;
}

export type ModelChoice = 'fast' | 'ultra';

export interface CliArgs {
  templateIds?: string[];
  samples?: number;
  model?: ModelChoice;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--templates' && next !== undefined) {
      out.templateIds = next
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      i++;
    } else if (arg === '--samples' && next !== undefined) {
      const n = Number.parseInt(next, 10);
      if (!Number.isNaN(n)) out.samples = n;
      i++;
    } else if (arg === '--model' && next !== undefined) {
      if (next === 'fast' || next === 'ultra') out.model = next;
      i++;
    }
  }
  return out;
}

export interface RunBatchSummary {
  generated: number;
  rejected: number;
  total_cost_usd: number;
  creatives: Array<{ id: string; locale: 'en' | 'es'; status: string; url: string; templateId: string }>;
  failures: Array<{ locale: 'en' | 'es'; slot: number; error: string }>;
}

const STUB_VIDEO_GEN: VideoGenerator = {
  name: 'stub-noop',
  cost_per_second_usd: 0,
  generate: () => Promise.reject(new Error('VIDEO_NOT_IMPLEMENTED')),
};

export async function runBatch(opts: RunBatchOpts): Promise<RunBatchSummary> {
  const imageOnlyHooks = stripDurationFromHooks(allHooks);

  const aggregate: RunBatchSummary = {
    generated: 0,
    rejected: 0,
    total_cost_usd: 0,
    creatives: [],
    failures: [],
  };

  const mergeOne = (locale: 'en' | 'es', slot: number, result: BatchSummary): void => {
    aggregate.generated += result.generated;
    aggregate.rejected += result.rejected;
    aggregate.total_cost_usd += result.total_cost_usd;
    for (const c of result.creatives) {
      aggregate.creatives.push({
        id: c.id,
        locale: c.locale,
        status: c.status,
        url: c.asset.url,
        templateId: c.hook_template_id,
      });
    }
    void slot;
  };

  const runOneSlot = async (
    template: HookTemplate,
    locale: 'en' | 'es',
  ): Promise<BatchSummary> => {
    // Single-element pool → pickTemplate(0) deterministically returns this template.
    const deps: BatchDeps = {
      imageGen: opts.imageGen,
      videoGen: opts.videoGen ?? STUB_VIDEO_GEN,
      hookTemplates: [template],
      claudeClient: opts.claudeClient,
      db: opts.db,
    };
    return generateLaunchBatch(deps, { count_per_locale: 1, locales: [locale] });
  };

  // ── Targeted mode: templateIds × samples in parallel ─────────────────────
  if (opts.templateIds && opts.templateIds.length > 0) {
    const samples = opts.samples ?? 1;

    interface SlotJob {
      template: HookTemplate | null;
      missingId: string | null;
      locale: 'en' | 'es';
      slot: number;
    }

    const jobs: SlotJob[] = [];
    for (const id of opts.templateIds) {
      const template = imageOnlyHooks.find((t) => t.id === id) ?? null;
      const locale = (template?.locale ?? 'en') as 'en' | 'es';
      for (let s = 0; s < samples; s++) {
        jobs.push({
          template,
          missingId: template ? null : id,
          locale,
          slot: jobs.length,
        });
      }
    }

    const settled = await Promise.allSettled(
      jobs.map((job) => {
        if (!job.template) {
          return Promise.reject(new Error(`Unknown template id: ${job.missingId}`));
        }
        return runOneSlot(job.template, job.locale);
      }),
    );

    for (let i = 0; i < settled.length; i++) {
      const job = jobs[i];
      const result = settled[i];
      if (result.status === 'fulfilled') {
        mergeOne(job.locale, job.slot, result.value);
      } else {
        aggregate.failures.push({
          locale: job.locale,
          slot: job.slot,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
    return aggregate;
  }

  // ── Default mode: archetype rotation per locale, sequential ──────────────
  const countPerLocale = opts.countPerLocale ?? 3;
  const locales = opts.locales ?? (['en', 'es'] as const);

  for (const locale of locales) {
    // buildArchetypePlan rotates archetypes (identity → authority → rarity →
    // identity-2 → …) so each slot exercises a different copy archetype rather
    // than re-using the first identity-reveal template every time.
    const plan = buildArchetypePlan(imageOnlyHooks, locale, countPerLocale);

    for (let slot = 0; slot < plan.length; slot++) {
      const template = plan[slot];
      try {
        const result = await runOneSlot(template, locale);
        mergeOne(locale, slot, result);
      } catch (err) {
        aggregate.failures.push({
          locale,
          slot,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return aggregate;
}

// ---------------------------------------------------------------------------
// CLI entry: main + printSummary
// ---------------------------------------------------------------------------

export function printSummary(summary: RunBatchSummary): void {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Generated:   ${summary.generated}`);
  console.log(`  Rejected:    ${summary.rejected}`);
  console.log(`  Failed:      ${summary.failures.length}`);
  console.log(`  Total cost:  $${summary.total_cost_usd.toFixed(2)}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  if (summary.creatives.length > 0) {
    console.log('Creatives:');
    for (const c of summary.creatives) {
      console.log(`  [${c.locale}/${c.templateId}] ${c.status}: ${c.url}`);
    }
    console.log('');
  }
  if (summary.failures.length > 0) {
    console.log('Failures:');
    for (const f of summary.failures) {
      console.log(`  [${f.locale} slot ${f.slot}] ${f.error}`);
    }
    console.log('');
  }
  console.log('Review pending creatives at /admin/advertising/creatives/review (after deploy).');
}

async function main(): Promise<void> {
  const envCheck = validateEnv();
  if (!envCheck.ok) {
    console.error(`Missing required env vars: ${envCheck.missing.join(', ')}`);
    process.exit(1);
  }

  const geminiClient = new GeminiApiClient({
    geminiApiKey: process.env.GEMINI_API_KEY!,
    blobToken: process.env.BLOB_READ_WRITE_TOKEN!,
  });

  const claudeClient = new ClaudeSafetyClient({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const cli = parseCliArgs(process.argv.slice(2));

  // Default to Ultra ($0.06/image) for production-grade marketing creatives.
  // Pass --model fast to fall back to ImagenFast ($0.02/image) for cheap drafts.
  const imageGen =
    cli.model === 'fast'
      ? new ImagenFast({ apiClient: geminiClient })
      : new ImagenUltra({ apiClient: geminiClient });
  console.log(`Using image generator: ${imageGen.name} ($${imageGen.cost_per_image_usd}/image)`);

  const summary = await runBatch({
    countPerLocale: cli.templateIds ? undefined : 3,
    locales: cli.templateIds ? undefined : ['en', 'es'],
    templateIds: cli.templateIds,
    samples: cli.samples,
    // Drizzle's insert(...).values(...) resolves with a query result, but the
    // DbClient interface (creative-gen/batch) declares Promise<void>. The
    // resolved value is unused — the cast bridges the variance.
    db: getDb() as unknown as DbClient,
    imageGen,
    claudeClient,
  });

  printSummary(summary);
}

if (process.argv[1]?.endsWith('generate-launch-batch.ts')) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
