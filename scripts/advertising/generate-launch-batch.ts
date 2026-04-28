import 'dotenv/config';
import type { HookTemplate, ImageGenerator, VideoGenerator } from '@/shared/types/advertising';
import { allHooks } from '@/modules/advertising/creative-gen/templates';
import { generateLaunchBatch } from '@/modules/advertising/creative-gen/batch';
import type { BatchDeps, DbClient } from '@/modules/advertising/creative-gen/batch';
import type { ClaudeClient } from '@/modules/advertising/creative-gen/safety/checks';
import { GeminiApiClient, ClaudeSafetyClient } from '@/modules/advertising/creative-gen/clients';
import { ImagenFast } from '@/modules/advertising/creative-gen/generators';
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

// ---------------------------------------------------------------------------
// runBatch
// ---------------------------------------------------------------------------

export interface RunBatchOpts {
  countPerLocale?: number;
  locales?: ('en' | 'es')[];
  db: DbClient;
  imageGen: ImageGenerator;
  claudeClient: ClaudeClient;
  videoGen?: VideoGenerator;
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
  const countPerLocale = opts.countPerLocale ?? 3;
  const locales = opts.locales ?? (['en', 'es'] as const);
  const imageOnlyHooks = stripDurationFromHooks(allHooks);

  const deps: BatchDeps = {
    imageGen: opts.imageGen,
    videoGen: opts.videoGen ?? STUB_VIDEO_GEN,
    hookTemplates: imageOnlyHooks,
    claudeClient: opts.claudeClient,
    db: opts.db,
  };

  const aggregate: RunBatchSummary = {
    generated: 0,
    rejected: 0,
    total_cost_usd: 0,
    creatives: [],
    failures: [],
  };

  for (const locale of locales) {
    for (let slot = 0; slot < countPerLocale; slot++) {
      try {
        const result = await generateLaunchBatch(deps, {
          count_per_locale: 1,
          locales: [locale],
        });
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

  const imageGen = new ImagenFast({ apiClient: geminiClient });

  const summary = await runBatch({
    countPerLocale: 3,
    locales: ['en', 'es'],
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
