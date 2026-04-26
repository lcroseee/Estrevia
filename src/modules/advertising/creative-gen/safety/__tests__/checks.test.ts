import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  personalClaimCheck,
  metaAdPolicyCheck,
  ocrTextAccuracyCheck,
  brandConsistencyCheck,
  controversialSymbolCheck,
  runAllChecks,
  isBlocked,
} from '../checks';
import type { SafetyDeps } from '../checks';
import type { CreativeBundle, GeneratedAsset } from '@/shared/types/advertising';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const mockAsset = (overrides?: Partial<GeneratedAsset>): GeneratedAsset => ({
  id: 'asset-001',
  kind: 'image',
  generator: 'imagen-4-ultra',
  prompt_used: 'sidereal astrology background',
  url: 'https://test.blob.vercel-storage.com/img-001.png',
  width: 1080,
  height: 1920,
  cost_usd: 0.06,
  created_at: new Date('2026-04-26T00:00:00Z'),
  ...overrides,
});

const mockBundle = (overrides?: Partial<CreativeBundle>): CreativeBundle => ({
  id: 'bundle-001',
  hook_template_id: 'tpl-001',
  asset: mockAsset(),
  copy: 'Discover your cosmic blueprint.',
  cta: 'Calculate your chart',
  locale: 'en',
  status: 'pending_review',
  safety_checks: [],
  ...overrides,
});

const makeDeps = (overrides?: Partial<SafetyDeps>): SafetyDeps => ({
  claudeClient: {
    moderationCheck: vi.fn().mockResolvedValue({ passed: true, reason: undefined }),
  },
  ...overrides,
});

// ---------------------------------------------------------------------------
// personalClaimCheck
// ---------------------------------------------------------------------------
describe('personalClaimCheck', () => {
  it('passes clean copy', async () => {
    const result = await personalClaimCheck('Discover your sidereal sun sign.');
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
    expect(result.check_name).toBe('personal_claim');
  });

  it.each([
    ['you are not alone in this cosmos'],
    ["you're not ready for this truth"],
    ['you will unlock your potential'],
    ['your future is written in the stars'],
    ['you deserve to know your chart'],
    ['you know that astrology works'],
  ])('blocks copy containing flagged pattern: %s', async (copy) => {
    const result = await personalClaimCheck(copy);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('block');
    expect(result.reason).toContain('Meta-flagged pattern');
  });

  it('is case-insensitive', async () => {
    const result = await personalClaimCheck('YOU WILL see your cosmic truth');
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('block');
  });
});

// ---------------------------------------------------------------------------
// metaAdPolicyCheck
// ---------------------------------------------------------------------------
describe('metaAdPolicyCheck', () => {
  it('returns passed=true when Claude approves', async () => {
    const deps = makeDeps();
    const result = await metaAdPolicyCheck(mockBundle(), deps);

    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
    expect(result.check_name).toBe('meta_ad_policy');
    expect(deps.claudeClient.moderationCheck).toHaveBeenCalledOnce();
  });

  it('returns passed=false + block severity when Claude rejects', async () => {
    const deps = makeDeps({
      claudeClient: {
        moderationCheck: vi.fn().mockResolvedValue({
          passed: false,
          reason: 'Fortune-telling language detected',
        }),
      },
    });

    const result = await metaAdPolicyCheck(mockBundle(), deps);

    expect(result.passed).toBe(false);
    expect(result.severity).toBe('block');
    expect(result.reason).toBe('Fortune-telling language detected');
  });

  it('includes ad copy in the prompt sent to Claude', async () => {
    const deps = makeDeps();
    const bundle = mockBundle({ copy: 'Mars in Scorpio awaits you' });

    await metaAdPolicyCheck(bundle, deps);

    const [promptArg] = (deps.claudeClient.moderationCheck as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(promptArg).toContain('Mars in Scorpio awaits you');
  });

  it('propagates claudeClient errors', async () => {
    const deps = makeDeps({
      claudeClient: {
        moderationCheck: vi.fn().mockRejectedValue(new Error('Claude API unavailable')),
      },
    });

    await expect(metaAdPolicyCheck(mockBundle(), deps)).rejects.toThrow('Claude API unavailable');
  });
});

// ---------------------------------------------------------------------------
// ocrTextAccuracyCheck
// ---------------------------------------------------------------------------
describe('ocrTextAccuracyCheck', () => {
  it('skips and passes when no ocrClient injected (MVP deferred)', async () => {
    const deps = makeDeps({ ocrClient: undefined });
    const result = await ocrTextAccuracyCheck('https://example.com/img.png', 'Calculate now', deps);

    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
    expect(result.reason).toContain('skipped');
  });

  it('passes when OCR output contains expected text', async () => {
    const deps = makeDeps({
      ocrClient: {
        recognize: vi.fn().mockResolvedValue('Calculate now — free chart'),
      },
    });

    const result = await ocrTextAccuracyCheck('https://example.com/img.png', 'Calculate now', deps);
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
  });

  it('warns (not blocks) when OCR output does not match expected text', async () => {
    const deps = makeDeps({
      ocrClient: {
        recognize: vi.fn().mockResolvedValue('Some unrelated text here'),
      },
    });

    const result = await ocrTextAccuracyCheck('https://example.com/img.png', 'Calculate now', deps);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('warning');
    expect(result.reason).toBeTruthy();
  });

  it('is case-insensitive in matching', async () => {
    const deps = makeDeps({
      ocrClient: {
        recognize: vi.fn().mockResolvedValue('CALCULATE NOW — discover your chart'),
      },
    });

    const result = await ocrTextAccuracyCheck('https://example.com/img.png', 'calculate now', deps);
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// brandConsistencyCheck
// ---------------------------------------------------------------------------
describe('brandConsistencyCheck', () => {
  it('returns passed=true (MVP stub)', async () => {
    const result = await brandConsistencyCheck(mockBundle());
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
    expect(result.check_name).toBe('brand_consistency');
    expect(result.reason).toContain('TODO');
  });
});

// ---------------------------------------------------------------------------
// controversialSymbolCheck
// ---------------------------------------------------------------------------
describe('controversialSymbolCheck', () => {
  it('returns passed=true (MVP stub)', async () => {
    const result = await controversialSymbolCheck('https://example.com/img.png');
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
    expect(result.check_name).toBe('controversial_symbol');
    expect(result.reason).toContain('TODO');
  });
});

// ---------------------------------------------------------------------------
// runAllChecks
// ---------------------------------------------------------------------------
describe('runAllChecks', () => {
  it('returns array of 5 results', async () => {
    const deps = makeDeps();
    const results = await runAllChecks(mockBundle(), deps);
    expect(results).toHaveLength(5);
  });

  it('runs all checks in parallel (all check_names present)', async () => {
    const deps = makeDeps();
    const results = await runAllChecks(mockBundle(), deps);

    const names = results.map((r) => r.check_name);
    expect(names).toContain('personal_claim');
    expect(names).toContain('meta_ad_policy');
    expect(names).toContain('ocr_text_accuracy');
    expect(names).toContain('brand_consistency');
    expect(names).toContain('controversial_symbol');
  });

  it('includes a blocking result when copy has personal claim', async () => {
    const deps = makeDeps();
    const bundle = mockBundle({ copy: 'your future is written in the stars' });

    const results = await runAllChecks(bundle, deps);
    const blocked = results.find((r) => r.severity === 'block');
    expect(blocked).toBeDefined();
    expect(blocked?.check_name).toBe('personal_claim');
  });

  it('includes a blocking result when Claude rejects', async () => {
    const deps = makeDeps({
      claudeClient: {
        moderationCheck: vi.fn().mockResolvedValue({
          passed: false,
          reason: 'Sensational health claim',
        }),
      },
    });

    const results = await runAllChecks(mockBundle(), deps);
    const blocked = results.filter((r) => r.severity === 'block');
    expect(blocked.length).toBeGreaterThanOrEqual(1);
  });

  it('all pass for clean bundle with passing Claude', async () => {
    const deps = makeDeps();
    const results = await runAllChecks(mockBundle(), deps);
    expect(results.every((r) => r.passed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isBlocked
// ---------------------------------------------------------------------------
describe('isBlocked', () => {
  it('returns false when no blocking results', () => {
    const results = [
      { check_name: 'a', passed: true, severity: 'info' as const },
      { check_name: 'b', passed: true, severity: 'info' as const },
    ];
    expect(isBlocked(results)).toBe(false);
  });

  it('returns true when any result has severity=block', () => {
    const results = [
      { check_name: 'a', passed: true, severity: 'info' as const },
      { check_name: 'b', passed: false, severity: 'block' as const, reason: 'bad' },
    ];
    expect(isBlocked(results)).toBe(true);
  });

  it('returns false when result has severity=warning but not block', () => {
    const results = [
      { check_name: 'a', passed: false, severity: 'warning' as const, reason: 'minor' },
    ];
    expect(isBlocked(results)).toBe(false);
  });
});
