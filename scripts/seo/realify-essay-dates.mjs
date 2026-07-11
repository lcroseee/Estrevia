#!/usr/bin/env node
// One-time: replace fake 2024-01-15 essay dates with real git dates.
// publishedAt = first-commit author date; updatedAt = last-commit date.
// Files never committed yet (git returns empty) keep today's date.
//
// Surgical replacement: rewrites ONLY the `publishedAt:`/`updatedAt:` frontmatter
// lines (first occurrence each, which live in the top frontmatter block),
// preserving every other line's exact formatting. Deliberately avoids
// gray-matter's stringify — reserializing the YAML would reformat quotes and the
// inline `keywords` array across all 240 files, producing a huge noisy diff.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = join(process.cwd(), 'content/essays');
const files = [
  ...readdirSync(root).filter((f) => f.endsWith('.mdx')).map((f) => join(root, f)),
  ...readdirSync(join(root, 'es')).filter((f) => f.endsWith('.mdx')).map((f) => join(root, 'es', f)),
];

function gitDate(file, order) {
  try {
    const args = order === 'first'
      ? ['log', '--diff-filter=A', '--follow', '--format=%aI', '--', file]
      : ['log', '-1', '--format=%cI', '--', file];
    const out = execFileSync('git', args, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    const iso = order === 'first' ? out[out.length - 1] : out[0];
    return iso ? iso.slice(0, 10) : null; // YYYY-MM-DD
  } catch {
    return null;
  }
}

let changed = 0;
for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  const published = gitDate(file, 'first') ?? today;
  const updated = gitDate(file, 'last') ?? published;

  const next = raw
    .replace(/^publishedAt:.*$/m, `publishedAt: "${published}"`)
    .replace(/^updatedAt:.*$/m, `updatedAt: "${updated}"`);

  if (next !== raw) {
    writeFileSync(file, next);
    changed += 1;
  }
}
console.log(`realified ${changed}/${files.length} essay files`);
