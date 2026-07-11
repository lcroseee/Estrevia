import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * .env.example completeness (SP-F D5): every env var read via
 * `process.env.<NAME>` in src/ must be documented in .env.example, except
 * a small allowlist of platform/framework-injected vars that are never
 * set by the developer (Node/Next.js/Vercel/Vitest inject these
 * automatically).
 */

const ROOT = process.cwd();
const SRC_DIR = path.resolve(ROOT, 'src');
const CODE_FILE_RE = /\.(ts|tsx|js|jsx|mjs)$/;
const ENV_READ_RE = /process\.env\.([A-Z0-9_]+)/g;

// Platform/framework-injected vars — spec D5 records these as deliberately
// skipped. Never add these to .env.example; the runtime sets them.
const PLATFORM_INJECTED_ALLOWLIST = new Set([
  'NODE_ENV',
  'NEXT_RUNTIME',
  'VERCEL_ENV',
  'VERCEL_URL',
  'NEXT_PUBLIC_VERCEL_URL',
  'VITEST',
]);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, files);
    } else if (CODE_FILE_RE.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function collectEnvReads(): Set<string> {
  const found = new Set<string>();
  for (const file of walk(SRC_DIR)) {
    const contents = readFileSync(file, 'utf8');
    for (const match of contents.matchAll(ENV_READ_RE)) {
      found.add(match[1]);
    }
  }
  return found;
}

const envExample = readFileSync(path.resolve(ROOT, '.env.example'), 'utf8');
const declaredKeys = new Set(
  envExample
    .split('\n')
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => line.split('=')[0]),
);

describe('.env.example completeness', () => {
  // Pinned regression guard: these were the concrete gaps found by the
  // SP-F Task 5 audit grep. TRIAL_WINBACK_COUPON_CODE is intentionally NOT
  // pinned here: SP-C T8 removes its only src/ read, and SP-C T6 owns the
  // coupon block in .env.example — pinning it would go red the moment
  // SP-C's src/ read is (re)introduced without an accompanying entry.
  it.each([
    'DRY_RUN',
    'CART_ABANDON_DRY_RUN',
    'DUNNING_DRY_RUN',
    'META_CAPI_GRAPH_VERSION',
    'COMPANY_POSTAL_ADDRESS',
  ])('documents %s', (key) => {
    expect(declaredKeys.has(key)).toBe(true);
  });

  it('has no undocumented process.env reads under src/ (excluding platform-injected allowlist)', () => {
    const envReads = collectEnvReads();
    const undocumented = [...envReads]
      .filter((key) => !declaredKeys.has(key) && !PLATFORM_INJECTED_ALLOWLIST.has(key))
      .sort();

    expect(undocumented, `Undocumented env vars found in src/: ${undocumented.join(', ')}`).toEqual(
      [],
    );
  });
});
