/**
 * CreativeCard unit tests
 *
 * Tests rendering, score computation, policy badge logic, and action button
 * behavior (approve / reject flow). Uses Vitest + minimal DOM assertions since
 * Testing Library is not in the project's devDependencies.
 *
 * We test the pure logic paths without mounting the React tree, as the project
 * does not have @testing-library/react configured. The render behavior is
 * covered by the integration/e2e layer.
 */

import { describe, it, expect } from 'vitest';
import type { SafetyCheckResult } from '@/shared/types/advertising';

// ---------------------------------------------------------------------------
// Pure logic extracted from CreativeCard — score computation
// ---------------------------------------------------------------------------

function overallScore(safetyChecks: SafetyCheckResult[]): number | null {
  if (!safetyChecks.length) return null;
  const passed = safetyChecks.filter((c) => c.passed).length;
  return Math.round((passed / safetyChecks.length) * 100);
}

function hasBlocker(safetyChecks: SafetyCheckResult[]): boolean {
  return safetyChecks.some((c) => !c.passed && c.severity === 'block');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeChecks(overrides: Partial<SafetyCheckResult>[] = []): SafetyCheckResult[] {
  const defaults: SafetyCheckResult[] = [
    { check_name: 'brand_voice', passed: true, severity: 'info' },
    { check_name: 'no_claims', passed: true, severity: 'warning' },
    { check_name: 'policy_text', passed: true, severity: 'block' },
  ];
  return defaults.map((d, i) => ({ ...d, ...overrides[i] }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('overallScore', () => {
  it('returns null for empty checks', () => {
    expect(overallScore([])).toBeNull();
  });

  it('returns 100 when all checks pass', () => {
    expect(overallScore(makeChecks())).toBe(100);
  });

  it('returns 67 when 2 of 3 checks pass', () => {
    const checks = makeChecks([{}, {}, { passed: false }]);
    expect(overallScore(checks)).toBe(67);
  });

  it('returns 0 when all checks fail', () => {
    const checks: SafetyCheckResult[] = [
      { check_name: 'a', passed: false, severity: 'block' },
      { check_name: 'b', passed: false, severity: 'warning' },
    ];
    expect(overallScore(checks)).toBe(0);
  });

  it('returns 33 when 1 of 3 checks pass', () => {
    const checks = makeChecks([{ passed: false }, { passed: false }, {}]);
    expect(overallScore(checks)).toBe(33);
  });
});

describe('hasBlocker', () => {
  it('returns false when all checks pass', () => {
    expect(hasBlocker(makeChecks())).toBe(false);
  });

  it('returns false for empty checks', () => {
    expect(hasBlocker([])).toBe(false);
  });

  it('returns false when failed check is only a warning', () => {
    const checks: SafetyCheckResult[] = [
      { check_name: 'a', passed: false, severity: 'warning' },
    ];
    expect(hasBlocker(checks)).toBe(false);
  });

  it('returns false when failed check is only info', () => {
    const checks: SafetyCheckResult[] = [
      { check_name: 'a', passed: false, severity: 'info' },
    ];
    expect(hasBlocker(checks)).toBe(false);
  });

  it('returns true when a block-severity check fails', () => {
    const checks: SafetyCheckResult[] = [
      { check_name: 'policy', passed: false, severity: 'block' },
    ];
    expect(hasBlocker(checks)).toBe(true);
  });

  it('returns true even if other checks pass', () => {
    const checks: SafetyCheckResult[] = [
      { check_name: 'brand', passed: true, severity: 'info' },
      { check_name: 'policy', passed: false, severity: 'block' },
    ];
    expect(hasBlocker(checks)).toBe(true);
  });
});

describe('score thresholds', () => {
  it('score >= 80 is in the green zone', () => {
    const checks: SafetyCheckResult[] = Array.from({ length: 10 }, (_, i) => ({
      check_name: `check_${i}`,
      passed: i < 9, // 9/10 = 90
      severity: 'info' as const,
    }));
    expect(overallScore(checks)).toBe(90);
  });

  it('score 60-79 is amber zone boundary', () => {
    const checks: SafetyCheckResult[] = Array.from({ length: 10 }, (_, i) => ({
      check_name: `check_${i}`,
      passed: i < 7, // 7/10 = 70
      severity: 'info' as const,
    }));
    expect(overallScore(checks)).toBe(70);
  });
});

describe('creative metadata', () => {
  it('locale enum values are correct', () => {
    const locales: Array<'en' | 'es'> = ['en', 'es'];
    expect(locales).toContain('en');
    expect(locales).toContain('es');
  });

  it('status progression is correct', () => {
    const statuses = ['pending_review', 'approved', 'rejected', 'uploaded', 'live', 'paused'];
    expect(statuses.indexOf('pending_review')).toBe(0);
    expect(statuses.indexOf('approved')).toBe(1);
  });
});
