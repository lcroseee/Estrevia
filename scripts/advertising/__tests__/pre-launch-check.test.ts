/**
 * Unit tests for pre-launch check helper logic.
 *
 * Tests validate the shape and severity of results returned by individual
 * check helpers without making real network or DB calls.
 *
 * Run via: npx vitest scripts/advertising/__tests__/pre-launch-check.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal type matching the script's CheckResult
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

// ---------------------------------------------------------------------------
// Inline re-implementations of pure helpers from pre-launch-check.ts
// These are extracted here so tests don't need to import the side-effectful
// script (which calls main() at import time via the top-level await chain).
// ---------------------------------------------------------------------------

function checkEnvVar(opts: {
  name: string;
  severity: 'info' | 'warning' | 'error';
  formatHint?: (v: string) => string;
}): CheckResult {
  const value = process.env[opts.name];
  if (!value) {
    return { name: `ENV: ${opts.name}`, passed: false, message: 'not set', severity: opts.severity };
  }
  const hint = opts.formatHint ? ` — ${opts.formatHint(value)}` : '';
  return {
    name: `ENV: ${opts.name}`,
    passed: true,
    message: `set, ${value.length} chars${hint}`,
    severity: 'info',
  };
}

function checkCronSecretLength(secret: string | undefined): CheckResult {
  if (!secret) {
    return { name: 'CONFIG: CRON_SECRET', passed: false, message: 'not set', severity: 'error' };
  }
  if (secret.length < 32) {
    return {
      name: 'CONFIG: CRON_SECRET',
      passed: false,
      message: `too short (${secret.length} chars, minimum 32)`,
      severity: 'error',
    };
  }
  return {
    name: 'CONFIG: CRON_SECRET',
    passed: true,
    message: `length OK (${secret.length} chars)`,
    severity: 'info',
  };
}

function checkAdAccountStatus(
  status: number,
  name: string,
): CheckResult {
  if (status !== 1) {
    return {
      name: 'API: Meta ad account',
      passed: false,
      message: `account "${name}" is not active (account_status=${status})`,
      severity: 'error',
    };
  }
  return {
    name: 'API: Meta ad account',
    passed: true,
    message: `active — "${name}"`,
    severity: 'info',
  };
}

function checkEmqScore(score: number): CheckResult {
  if (score < 6.0) {
    return {
      name: 'API: CAPI test event',
      passed: true,
      message: `200 OK — EMQ score ${score.toFixed(1)} (recommend ≥6.0 — improve email/phone hashing)`,
      severity: 'warning',
    };
  }
  return {
    name: 'API: CAPI test event',
    passed: true,
    message: `200 OK — EMQ score ${score.toFixed(1)} (good)`,
    severity: 'info',
  };
}

function classifyMissingTables(
  expected: readonly string[],
  found: string[],
): CheckResult {
  const foundSet = new Set(found);
  const missing = expected.filter((t) => !foundSet.has(t));
  if (missing.length > 0) {
    return {
      name: 'DB: advertising tables',
      passed: false,
      message: `missing ${missing.length} table(s): ${missing.join(', ')}`,
      severity: 'error',
    };
  }
  return {
    name: 'DB: advertising tables',
    passed: true,
    message: `all ${expected.length} advertising_* tables present`,
    severity: 'info',
  };
}

function classifyMissingGates(
  expected: readonly string[],
  found: string[],
): CheckResult {
  const foundSet = new Set(found);
  const missing = expected.filter((id) => !foundSet.has(id));
  if (missing.length > 0) {
    return {
      name: 'DB: feature gates seeded',
      passed: false,
      message: `${missing.length} gate(s) missing: ${missing.join(', ')} — run npm run advertising:seed-gates`,
      severity: 'warning',
    };
  }
  return {
    name: 'DB: feature gates seeded',
    passed: true,
    message: `all ${expected.length} gates present`,
    severity: 'info',
  };
}

// ---------------------------------------------------------------------------
// ENV checks
// ---------------------------------------------------------------------------

describe('checkEnvVar', () => {
  const ORIG = { ...process.env };

  afterEach(() => {
    // Restore only the keys we may have mutated
    for (const key of ['TEST_CRITICAL_VAR', 'TEST_OPTIONAL_VAR']) {
      delete process.env[key];
    }
    if (ORIG['TEST_CRITICAL_VAR'] !== undefined) process.env['TEST_CRITICAL_VAR'] = ORIG['TEST_CRITICAL_VAR'];
  });

  it('returns passed=false + severity=error when critical var is missing', () => {
    delete process.env['TEST_CRITICAL_VAR'];
    const result = checkEnvVar({ name: 'TEST_CRITICAL_VAR', severity: 'error' });
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toBe('not set');
    expect(result.name).toBe('ENV: TEST_CRITICAL_VAR');
  });

  it('returns passed=false + severity=warning when optional var is missing', () => {
    delete process.env['TEST_OPTIONAL_VAR'];
    const result = checkEnvVar({ name: 'TEST_OPTIONAL_VAR', severity: 'warning' });
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('warning');
  });

  it('returns passed=true when var is set', () => {
    process.env['TEST_CRITICAL_VAR'] = 'abc123';
    const result = checkEnvVar({ name: 'TEST_CRITICAL_VAR', severity: 'error' });
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
    expect(result.message).toContain('6 chars');
  });

  it('includes formatHint output when provided', () => {
    process.env['TEST_CRITICAL_VAR'] = 'act_12345';
    const result = checkEnvVar({
      name: 'TEST_CRITICAL_VAR',
      severity: 'error',
      formatHint: (v) => (v.startsWith('act_') ? 'format act_*' : 'unknown format'),
    });
    expect(result.passed).toBe(true);
    expect(result.message).toContain('format act_*');
  });

  it('does NOT include the actual value in the message', () => {
    process.env['TEST_CRITICAL_VAR'] = 'supersecretkey';
    const result = checkEnvVar({ name: 'TEST_CRITICAL_VAR', severity: 'error' });
    expect(result.message).not.toContain('supersecretkey');
  });
});

// ---------------------------------------------------------------------------
// CRON_SECRET entropy check
// ---------------------------------------------------------------------------

describe('checkCronSecretLength', () => {
  it('fails when secret is undefined', () => {
    const r = checkCronSecretLength(undefined);
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('error');
    expect(r.message).toContain('not set');
  });

  it('fails when secret is shorter than 32 chars', () => {
    const r = checkCronSecretLength('short');
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('error');
    expect(r.message).toContain('5 chars');
    expect(r.message).toContain('minimum 32');
  });

  it('passes when secret is exactly 32 chars', () => {
    const r = checkCronSecretLength('a'.repeat(32));
    expect(r.passed).toBe(true);
    expect(r.severity).toBe('info');
    expect(r.message).toContain('32 chars');
  });

  it('passes when secret is 64 chars', () => {
    const r = checkCronSecretLength('z'.repeat(64));
    expect(r.passed).toBe(true);
    expect(r.message).toContain('64 chars');
  });

  it('does NOT include the actual secret value in the message', () => {
    const secret = 'a'.repeat(40);
    const r = checkCronSecretLength(secret);
    expect(r.message).not.toContain(secret);
  });
});

// ---------------------------------------------------------------------------
// Meta ad account status
// ---------------------------------------------------------------------------

describe('checkAdAccountStatus', () => {
  it('returns passed=false when account_status is not 1', () => {
    const r = checkAdAccountStatus(3, 'My Account');
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('error');
    expect(r.message).toContain('account_status=3');
  });

  it('returns passed=true when account_status is 1', () => {
    const r = checkAdAccountStatus(1, 'Estrevia Ads');
    expect(r.passed).toBe(true);
    expect(r.message).toContain('active');
    expect(r.message).toContain('Estrevia Ads');
  });
});

// ---------------------------------------------------------------------------
// CAPI EMQ score
// ---------------------------------------------------------------------------

describe('checkEmqScore', () => {
  it('returns passed=true + severity=warning when EMQ score < 6.0', () => {
    const r = checkEmqScore(5.4);
    expect(r.passed).toBe(true);
    expect(r.severity).toBe('warning');
    expect(r.message).toContain('5.4');
    expect(r.message).toContain('recommend ≥6.0');
  });

  it('returns passed=true + severity=info when EMQ score >= 6.0', () => {
    const r = checkEmqScore(7.2);
    expect(r.passed).toBe(true);
    expect(r.severity).toBe('info');
    expect(r.message).toContain('7.2');
    expect(r.message).not.toContain('recommend');
  });

  it('returns warning at exactly the threshold boundary (5.9)', () => {
    const r = checkEmqScore(5.9);
    expect(r.severity).toBe('warning');
  });

  it('returns info at exactly 6.0', () => {
    const r = checkEmqScore(6.0);
    expect(r.severity).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// DB: advertising tables
// ---------------------------------------------------------------------------

const EXPECTED_TABLES = [
  'advertising_decisions',
  'advertising_creatives',
  'advertising_feature_gates',
  'advertising_spend_daily',
  'advertising_audiences',
  'advertising_shadow_comparisons',
] as const;

describe('classifyMissingTables', () => {
  it('passes when all 6 tables are present', () => {
    const r = classifyMissingTables(EXPECTED_TABLES, [...EXPECTED_TABLES]);
    expect(r.passed).toBe(true);
    expect(r.message).toContain('6');
  });

  it('fails when any table is missing', () => {
    const present = EXPECTED_TABLES.slice(1); // drop first
    const r = classifyMissingTables(EXPECTED_TABLES, [...present]);
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('error');
    expect(r.message).toContain('advertising_decisions');
  });

  it('fails when all tables are missing', () => {
    const r = classifyMissingTables(EXPECTED_TABLES, []);
    expect(r.passed).toBe(false);
    expect(r.message).toContain('missing 6');
  });
});

// ---------------------------------------------------------------------------
// DB: feature gates seeded
// ---------------------------------------------------------------------------

const EXPECTED_GATES = [
  'bayesianDecisions',
  'anomalyDetection',
  'retargetingCampaigns',
  'exclusionsCampaigns',
] as const;

describe('classifyMissingGates', () => {
  it('passes when all 4 gates are seeded', () => {
    const r = classifyMissingGates(EXPECTED_GATES, [...EXPECTED_GATES]);
    expect(r.passed).toBe(true);
    expect(r.message).toContain('4');
  });

  it('returns warning (not error) when gates are missing', () => {
    const r = classifyMissingGates(EXPECTED_GATES, ['bayesianDecisions']);
    expect(r.passed).toBe(false);
    // Gates missing is a warning, not error — suggest seed command
    expect(r.severity).toBe('warning');
    expect(r.message).toContain('seed-gates');
  });

  it('lists all missing gate IDs in the message', () => {
    const r = classifyMissingGates(EXPECTED_GATES, []);
    expect(r.message).toContain('bayesianDecisions');
    expect(r.message).toContain('anomalyDetection');
    expect(r.message).toContain('retargetingCampaigns');
    expect(r.message).toContain('exclusionsCampaigns');
  });
});
