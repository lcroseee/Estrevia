import { describe, it, expect, vi } from 'vitest';
import {
  personalClaimCheck,
  metaAdPolicyCheck,
  ocrTextAccuracyCheck,
  brandConsistencyCheck,
  controversialSymbolCheck,
  runAllChecks,
  isBlocked,
  newVisionCostAccumulator,
  recordVisionCall,
  BRAND_PALETTE,
} from '../checks';
import type { SafetyDeps } from '../checks';
import type { VisionClient } from '../vision-checker';
import type { CreativeBundle, GeneratedAsset } from '@/shared/types/advertising';

// ---------------------------------------------------------------------------
// Vision client helpers (used by brand + symbol check tests)
// ---------------------------------------------------------------------------

const makeVision = (json: Record<string, unknown>): VisionClient => ({
  analyzeImage: vi.fn().mockResolvedValue({ json, cost_usd: 0.0002 }),
});

const makeVisionError = (msg: string): VisionClient => ({
  analyzeImage: vi.fn().mockRejectedValue(new Error(msg)),
});

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
// brandConsistencyCheck (Gemini Vision)
// ---------------------------------------------------------------------------
describe('brandConsistencyCheck', () => {
  it('skips with info severity when no visionClient is provided', async () => {
    const r = await brandConsistencyCheck(mockBundle());
    expect(r.passed).toBe(true);
    expect(r.severity).toBe('info');
    expect(r.check_name).toBe('brand_consistency');
    expect(r.reason).toMatch(/skipped/i);
  });

  it('passes when Gemini returns passed=true', async () => {
    const r = await brandConsistencyCheck(mockBundle(), {
      visionClient: makeVision({
        passed: true,
        dominantColors: ['#FFD700'],
        reason: 'gold dominant',
      }),
    });
    expect(r).toEqual({
      check_name: 'brand_consistency',
      passed: true,
      severity: 'info',
      reason: 'gold dominant',
    });
  });

  it('warns (passed=false, severity=warning) when Gemini returns passed=false', async () => {
    const r = await brandConsistencyCheck(mockBundle(), {
      visionClient: makeVision({
        passed: false,
        dominantColors: ['#FF00FF'],
        reason: 'magenta off-brand',
      }),
    });
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('warning');
    expect(r.check_name).toBe('brand_consistency');
  });

  it('falls back to dominantColors message when reason is missing', async () => {
    const r = await brandConsistencyCheck(mockBundle(), {
      visionClient: makeVision({ passed: false, dominantColors: ['#112233', '#445566'] }),
    });
    expect(r.reason).toContain('#112233');
    expect(r.reason).toContain('#445566');
  });

  it('soft-passes with warning when vision call throws (asymmetric error handling)', async () => {
    const r = await brandConsistencyCheck(mockBundle(), {
      visionClient: makeVisionError('rate limit'),
    });
    expect(r.passed).toBe(true);
    expect(r.severity).toBe('warning');
    expect(r.reason).toMatch(/Vision check failed/);
    expect(r.reason).toContain('rate limit');
  });
});

// ---------------------------------------------------------------------------
// controversialSymbolCheck (Gemini Vision)
// ---------------------------------------------------------------------------
describe('controversialSymbolCheck', () => {
  it('skips with info severity when no visionClient is provided', async () => {
    const r = await controversialSymbolCheck('https://example.com/img.png');
    expect(r.passed).toBe(true);
    expect(r.severity).toBe('info');
    expect(r.check_name).toBe('controversial_symbol');
  });

  it('passes when no symbols found', async () => {
    const r = await controversialSymbolCheck('https://example.com/img.png', {
      visionClient: makeVision({ found: false }),
    });
    expect(r).toEqual({
      check_name: 'controversial_symbol',
      passed: true,
      severity: 'info',
      reason: undefined,
    });
  });

  it('blocks when controversial symbols found', async () => {
    const r = await controversialSymbolCheck('https://example.com/img.png', {
      visionClient: makeVision({
        found: true,
        items: ['pentagram'],
        reason: 'inverted star',
      }),
    });
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('block');
    expect(r.reason).toContain('pentagram');
  });

  it('fails (passed=false, severity=warning) when vision throws — fail-closed', async () => {
    const r = await controversialSymbolCheck('https://example.com/img.png', {
      visionClient: makeVisionError('quota exceeded'),
    });
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('warning');
    expect(r.reason).toMatch(/manual review/);
    expect(r.reason).toContain('quota exceeded');
  });
});

// ---------------------------------------------------------------------------
// VisionCostAccumulator
// ---------------------------------------------------------------------------
describe('VisionCostAccumulator', () => {
  it('starts empty', () => {
    const acc = newVisionCostAccumulator();
    expect(acc.total_usd).toBe(0);
    expect(acc.call_count).toBe(0);
  });

  it('accumulates cost across multiple calls', () => {
    const acc = newVisionCostAccumulator();
    recordVisionCall(acc, { cost_usd: 0.0002 });
    recordVisionCall(acc, { cost_usd: 0.0002 });
    recordVisionCall(acc, undefined);
    expect(acc.total_usd).toBeCloseTo(0.0004, 5);
    expect(acc.call_count).toBe(2);
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

// ---------------------------------------------------------------------------
// Patch 01 — bilingual brand-policy hardening
// ---------------------------------------------------------------------------
describe('personalClaimCheck — Patch 01 bilingual brand-policy hardening', () => {
  it.each([
    // EN fortune-telling beyond second person
    ['fate awaits all of us'],
    ['this is your destiny'],
    ['what awaits you in the cosmos'],
    ['predict your future'],
    ['ancient mystics could foretell this'],
    // ES predictive
    ['predice tu futuro de manera precisa'],
    ['mira tu futuro en las estrellas'],
    ['descubre tu destino'],
    ['te espera una semana intensa'],
    ['adivina tu signo'],
    // EN absolutism
    ['all aries are stubborn'],
    ['every leo loves attention'],
    ['every person with this placement experiences chaos'],
    // ES absolutism — masculine + feminine
    ['todos los aries son impulsivos'],
    ['todas las leo son extrovertidas'],
    // ES "usted" form
    ['usted recibirá grandes cambios'],
    // Translated sign names that diverge from Latin
    ['Tauro es leal'],
    ['Géminis tiene dos caras'],
    ['Escorpio es intenso'],
    ['Sagitario ama viajar'],
    ['Capricornio es disciplinado'],
    ['Acuario es independiente'],
    ['Piscis es soñador'],
  ])('blocks: %s', async (copy) => {
    const result = await personalClaimCheck(copy);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('block');
  });

  it.each([
    // CRITICAL: Latin canonical forms required by CLAUDE.md i18n rules — must NOT be blocked
    ['Cáncer es emocional'],          // Cáncer is the canonical Latin form in ES
    ['Virgo placement matters'],      // Virgo is identical EN/ES, canonical
    ['Aries can be impulsive at times'],  // No "all"/"every" → not absolutist
    ['explore your sidereal placements'], // Reflection, not prediction
  ])('passes Latin canonical sign names: %s', async (copy) => {
    const result = await personalClaimCheck(copy);
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
  });
});

describe('META_POLICY_PROMPT — Patch 01 brand-voice extensions', () => {
  it('includes fluff-phrase forbidden examples', async () => {
    const deps = makeDeps();
    await metaAdPolicyCheck(mockBundle(), deps);
    const [promptArg] = (deps.claudeClient.moderationCheck as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(promptArg).toMatch(/cosmic dance/);
    expect(promptArg).toMatch(/stars whisper/);
    expect(promptArg).toMatch(/celestial tapestry/);
  });

  it('includes apologizing-language clause', async () => {
    const deps = makeDeps();
    await metaAdPolicyCheck(mockBundle(), deps);
    const [promptArg] = (deps.claudeClient.moderationCheck as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(promptArg).toMatch(/some believe/);
    expect(promptArg).toMatch(/according to astrologers/);
    expect(promptArg).toMatch(/whether you believe/);
  });

  it('includes Title Case + Book of Thoth + Eshelman clauses', async () => {
    const deps = makeDeps();
    await metaAdPolicyCheck(mockBundle(), deps);
    const [promptArg] = (deps.claudeClient.moderationCheck as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(promptArg).toMatch(/Title Case/);
    expect(promptArg).toMatch(/Book of Thoth/);
    expect(promptArg).toMatch(/Eshelman/);
  });

  it('mentions tropical-astrology mocking is forbidden', async () => {
    const deps = makeDeps();
    await metaAdPolicyCheck(mockBundle(), deps);
    const [promptArg] = (deps.claudeClient.moderationCheck as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(promptArg).toMatch(/mocking tropical astrology/);
  });
});

describe('BRAND_PALETTE — Patch 01 canonical palette', () => {
  it('matches docs/design.md canonical four colors in canonical order', () => {
    expect([...BRAND_PALETTE]).toEqual(['#0A0A0F', '#12121A', '#F0F0F5', '#FFD700']);
  });

  it('BRAND_PROMPT names colors consistent with new palette indices', async () => {
    const visionClient = makeVision({ passed: true, dominantColors: [] });
    await brandConsistencyCheck(mockBundle(), { visionClient });
    const [, prompt] = (visionClient.analyzeImage as ReturnType<typeof vi.fn>).mock.calls[0];
    // Stale labels must be gone
    expect(prompt).not.toMatch(/silver \(#/);
    expect(prompt).not.toMatch(/deep purple/);
    // New labels paired with correct hex
    expect(prompt).toMatch(/deep space \(#0A0A0F\)/i);
    expect(prompt).toMatch(/dark navy \(#12121A\)/i);
    expect(prompt).toMatch(/ivory \(#F0F0F5\)/i);
    expect(prompt).toMatch(/gold \(#FFD700\)/i);
  });
});
