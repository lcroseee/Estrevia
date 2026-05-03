/**
 * Operational tool: verify the current production environment state for the
 * advertising agent. Reads `.env.production` from disk (operator must run
 * `vercel env pull --environment=production` first to refresh).
 *
 * Exit 0 if all required vars present + valid; exit 1 otherwise.
 *
 * Safety: this script does NOT spawn child processes. It does not call vercel
 * CLI itself — operator runs `vercel env pull` separately, this script only
 * reads the resulting file.
 *
 * Usage:
 *   vercel env pull --environment=production
 *   npm run advertising:verify-prod-state
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

type Stage = 'pre-flight' | 'autonomous' | 'all';

interface CheckSpec {
  name: string;
  expected?: string;
  expectedNotEmpty?: boolean;
  validate?: (v: string) => boolean;
  forStage: Stage;
  purpose: string;
}

const REQUIRED: CheckSpec[] = [
  {
    name: 'ADVERTISING_AGENT_ENABLED',
    expected: 'true',
    forStage: 'all',
    purpose: 'kill switch — true = cron logic runs, false = early-return',
  },
  {
    name: 'ADVERTISING_AGENT_DRY_RUN',
    expectedNotEmpty: true,
    forStage: 'all',
    purpose: 'act-layer short-circuit — true = no Meta API mutations',
  },
  {
    name: 'ADMIN_ALLOWED_EMAILS',
    expectedNotEmpty: true,
    forStage: 'all',
    validate: (v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .every((e) => e.includes('@')),
    purpose: '/admin/* auth allowlist (Clerk + email check)',
  },
  {
    name: 'META_ACCESS_TOKEN',
    expectedNotEmpty: true,
    forStage: 'all',
    purpose: 'Meta Graph API credential',
  },
  {
    name: 'META_AD_ACCOUNT_ID',
    expectedNotEmpty: true,
    forStage: 'all',
    purpose: 'Meta ad account scope',
  },
  {
    name: 'META_PIXEL_ID',
    expectedNotEmpty: true,
    forStage: 'all',
    purpose: 'server-side Pixel reference',
  },
  {
    name: 'GEMINI_API_KEY',
    expectedNotEmpty: true,
    forStage: 'all',
    purpose: 'vision-checker (brand + symbol checks)',
  },
  {
    name: 'NEXT_PUBLIC_META_PIXEL_ID',
    expectedNotEmpty: true,
    forStage: 'autonomous',
    purpose: 'browser-side Pixel script (Stage 0 of v3b)',
  },
  {
    name: 'META_CAPI_TOKEN',
    expectedNotEmpty: true,
    forStage: 'autonomous',
    purpose: 'CAPI auth (Stage 0 of v3b)',
  },
];

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

async function main() {
  console.log('=== Production env state for advertising agent ===\n');
  console.log(
    'Source: .env.production (run `vercel env pull --environment=production` first to refresh)\n',
  );

  const envPath = join(process.cwd(), '.env.production');
  if (!existsSync(envPath)) {
    console.error('ERROR: .env.production not found in project root.');
    console.error('Run: vercel env pull --environment=production');
    process.exit(1);
  }

  const env = loadEnvFile(envPath);
  let errors = 0;
  let warnings = 0;

  for (const spec of REQUIRED) {
    const value = env[spec.name];
    const set = value !== undefined && value !== '';

    if (!set) {
      console.log(
        `✗ ${spec.name} MISSING — ${spec.purpose} (stage: ${spec.forStage})`,
      );
      if (spec.forStage === 'all' || spec.forStage === 'pre-flight') errors++;
      else warnings++;
      continue;
    }

    if (spec.expected && value !== spec.expected) {
      console.log(
        `⚠ ${spec.name}=${value} (expected ${spec.expected}) — ${spec.purpose}`,
      );
      warnings++;
      continue;
    }

    if (spec.validate && !spec.validate(value)) {
      console.log(`✗ ${spec.name} invalid format — ${spec.purpose}`);
      errors++;
      continue;
    }

    console.log(`✓ ${spec.name} (${spec.forStage}) — ${spec.purpose}`);
  }

  console.log(`\n${errors} error(s), ${warnings} warning(s)`);
  process.exit(errors > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { loadEnvFile, REQUIRED };
