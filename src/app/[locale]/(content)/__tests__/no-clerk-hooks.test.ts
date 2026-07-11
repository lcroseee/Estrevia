import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GROUP = join(process.cwd(), 'src/app/[locale]/(content)');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === '__tests__') return [];
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe('(content) route group is Clerk-client-hook-free', () => {
  it('no useUser/useAuth/useClerk/useSession/useSignIn/useSignUp in the tree', () => {
    for (const file of walk(GROUP)) {
      const src = readFileSync(file, 'utf-8');
      expect(src, `${file} must not call a Clerk client hook`)
        .not.toMatch(/\buse(User|Auth|Clerk|Session|SignIn|SignUp)\s*\(/);
    }
  });
});
