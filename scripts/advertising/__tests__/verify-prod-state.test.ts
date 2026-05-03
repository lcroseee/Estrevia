import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadEnvFile, REQUIRED } from '../verify-prod-state';

describe('verify-prod-state', () => {
  it('REQUIRED is non-empty and entries have name + purpose', () => {
    expect(REQUIRED.length).toBeGreaterThan(0);
    for (const r of REQUIRED) {
      expect(r.name).toMatch(/^[A-Z_][A-Z0-9_]*$/);
      expect(r.purpose).toBeTruthy();
    }
  });

  it('REQUIRED entries declare a valid stage', () => {
    const stages = new Set(['pre-flight', 'autonomous', 'all']);
    for (const r of REQUIRED) {
      expect(stages.has(r.forStage)).toBe(true);
    }
  });

  it('REQUIRED includes the v3a kill switch + dry-run flags', () => {
    const names = REQUIRED.map((r) => r.name);
    expect(names).toContain('ADVERTISING_AGENT_ENABLED');
    expect(names).toContain('ADVERTISING_AGENT_DRY_RUN');
    expect(names).toContain('ADMIN_ALLOWED_EMAILS');
  });

  it('ADMIN_ALLOWED_EMAILS validator accepts comma-separated emails and rejects non-emails', () => {
    const spec = REQUIRED.find((r) => r.name === 'ADMIN_ALLOWED_EMAILS');
    expect(spec?.validate).toBeTypeOf('function');
    expect(spec!.validate!('a@x.com,b@y.com')).toBe(true);
    expect(spec!.validate!('a@x.com')).toBe(true);
    expect(spec!.validate!('not-an-email')).toBe(false);
    expect(spec!.validate!('a@x.com,broken')).toBe(false);
  });

  it('loadEnvFile parses KEY=VALUE pairs and strips surrounding quotes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'envt-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'A=1\nB="two"\nC=\n# comment\n');
    expect(loadEnvFile(file)).toEqual({ A: '1', B: 'two', C: '' });
  });

  it('loadEnvFile ignores lines that do not match KEY=VALUE shape', () => {
    const dir = mkdtempSync(join(tmpdir(), 'envt-'));
    const file = join(dir, '.env');
    writeFileSync(
      file,
      ['# comment', '', 'lowercase=ignored', 'GOOD=value', '   leading=ignored'].join('\n'),
    );
    expect(loadEnvFile(file)).toEqual({ GOOD: 'value' });
  });

  it('loadEnvFile returns {} for missing file', () => {
    expect(loadEnvFile('/nonexistent/path/.env.fake')).toEqual({});
  });
});
