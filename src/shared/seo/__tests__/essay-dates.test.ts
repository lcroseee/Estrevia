import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

function essayFiles(): string[] {
  const root = join(process.cwd(), 'content/essays');
  const en = readdirSync(root).filter((f) => f.endsWith('.mdx')).map((f) => join(root, f));
  const es = readdirSync(join(root, 'es')).filter((f) => f.endsWith('.mdx')).map((f) => join(root, 'es', f));
  return [...en, ...es];
}

describe('essay frontmatter dates are real (T11a)', () => {
  it('no essay uses the 2024-01-15 placeholder', () => {
    const offenders = essayFiles().filter((f) => {
      const { data } = matter(readFileSync(f, 'utf8'));
      return data.publishedAt === '2024-01-15' || data.updatedAt === '2024-01-15';
    });
    expect(offenders).toEqual([]);
  });
});
