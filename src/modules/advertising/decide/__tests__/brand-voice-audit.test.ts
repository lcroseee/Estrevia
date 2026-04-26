import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  auditTopCreatives,
  computeWeightedOverall,
  needsReview,
  TOP_N,
  OVERALL_REVIEW_THRESHOLD,
  DIMENSION_MIN_THRESHOLD,
  type CreativeBundleWithSpend,
  type ClaudeClientForBrandVoice,
} from '../brand-voice-audit';
import { mockClaudeApi } from '../../__tests__/mocks/claude';
import type { MockClaudeApi } from '../../__tests__/mocks/claude';

// ---- helpers ----------------------------------------------------------------

function makeCreative(overrides: Partial<CreativeBundleWithSpend> & { spend_usd: number }): CreativeBundleWithSpend {
  return {
    id: `ad_${Math.random().toString(36).slice(2, 8)}`,
    hook_template_id: 'hook_001',
    asset: {
      id: 'asset_001',
      kind: 'image',
      generator: 'imagen-4-fast',
      prompt_used: 'celestial background',
      url: 'https://blob.vercel.app/img.jpg',
      width: 1080,
      height: 1080,
      cost_usd: 0.02,
      created_at: new Date(),
    },
    copy: 'Your cosmic blueprint awaits.',
    cta: 'Discover Your Chart',
    locale: 'en',
    status: 'live',
    safety_checks: [],
    ...overrides,
  };
}

function makeClaudeClient(mock: MockClaudeApi): ClaudeClientForBrandVoice {
  return {
    brandVoiceScore: async (adId: string, copy: string) => {
      return mock.brandVoiceScore(adId, copy);
    },
  };
}

// ---- computeWeightedOverall -------------------------------------------------

describe('computeWeightedOverall', () => {
  it('computes correct weighted sum with manipulation=true', () => {
    // depth*0.3 + scientific*0.3 + respectful*0.3 + 1
    const result = computeWeightedOverall(8, 8, 9, true);
    expect(result).toBeCloseTo(8 * 0.3 + 8 * 0.3 + 9 * 0.3 + 1, 5);
    expect(result).toBeCloseTo(8.5, 5);
  });

  it('computes correct weighted sum without manipulation bonus', () => {
    const result = computeWeightedOverall(8, 8, 9, false);
    expect(result).toBeCloseTo(8 * 0.3 + 8 * 0.3 + 9 * 0.3 + 0, 5);
    expect(result).toBeCloseTo(7.5, 5);
  });

  it('produces max of 10 for perfect scores with no_manipulation=true', () => {
    const result = computeWeightedOverall(10, 10, 10, true);
    expect(result).toBeCloseTo(10, 5);
  });

  it('produces 0 for all-zero scores with manipulation', () => {
    const result = computeWeightedOverall(0, 0, 0, false);
    expect(result).toBe(0);
  });
});

// ---- needsReview ------------------------------------------------------------

describe('needsReview', () => {
  it('returns false when all dimensions are above thresholds', () => {
    // overall = 8.5 (above 7.5), all dims ≥ 6
    expect(needsReview(8.5, 8, 8, 9)).toBe(false);
  });

  it('flags when overall < 7.5', () => {
    // overall = 7.4 triggers review
    expect(needsReview(7.4, 8, 8, 8)).toBe(true);
  });

  it('flags when overall exactly equals threshold (not less)', () => {
    // 7.5 is NOT < 7.5
    expect(needsReview(7.5, 8, 8, 8)).toBe(false);
  });

  it('flags when depth < 6', () => {
    expect(needsReview(8.5, 5, 8, 8)).toBe(true);
  });

  it('flags when scientific < 6', () => {
    expect(needsReview(8.5, 8, 5, 8)).toBe(true);
  });

  it('flags when respectful < 6', () => {
    expect(needsReview(8.5, 8, 8, 5)).toBe(true);
  });

  it('flags when both overall < 7.5 AND a dimension < 6', () => {
    expect(needsReview(6.0, 4, 7, 8)).toBe(true);
  });

  it('respects OVERALL_REVIEW_THRESHOLD and DIMENSION_MIN_THRESHOLD exports', () => {
    expect(OVERALL_REVIEW_THRESHOLD).toBe(7.5);
    expect(DIMENSION_MIN_THRESHOLD).toBe(6);
  });
});

// ---- auditTopCreatives ------------------------------------------------------

describe('auditTopCreatives', () => {
  let mock: MockClaudeApi;

  beforeEach(() => {
    mock = mockClaudeApi();
  });

  it('returns BrandVoiceScore for each audited creative', async () => {
    const creatives = [
      makeCreative({ id: 'ad_001', spend_usd: 100 }),
      makeCreative({ id: 'ad_002', spend_usd: 50 }),
    ];

    const scores = await auditTopCreatives(creatives, makeClaudeClient(mock));
    expect(scores).toHaveLength(2);
    expect(scores[0].ad_id).toBeDefined();
    expect(scores[0].depth).toBeDefined();
    expect(scores[0].reviewed_by_claude_at).toBeInstanceOf(Date);
  });

  it('picks top 10 by spend_usd when more creatives are provided', async () => {
    const creatives = Array.from({ length: 15 }, (_, i) =>
      makeCreative({ id: `ad_${i.toString().padStart(3, '0')}`, spend_usd: i * 10 }),
    );

    const scores = await auditTopCreatives(creatives, makeClaudeClient(mock));
    expect(scores).toHaveLength(TOP_N);
    // Highest spend should be at index 0 (sorted descending)
    expect(mock.brandVoiceScore).toHaveBeenCalledTimes(TOP_N);
  });

  it('audits fewer than 10 when fewer creatives are provided', async () => {
    const creatives = [
      makeCreative({ id: 'ad_001', spend_usd: 200 }),
      makeCreative({ id: 'ad_002', spend_usd: 100 }),
      makeCreative({ id: 'ad_003', spend_usd: 50 }),
    ];

    const scores = await auditTopCreatives(creatives, makeClaudeClient(mock));
    expect(scores).toHaveLength(3);
  });

  it('returns an empty array when no creatives are provided', async () => {
    const scores = await auditTopCreatives([], makeClaudeClient(mock));
    expect(scores).toHaveLength(0);
    expect(mock.brandVoiceScore).not.toHaveBeenCalled();
  });

  it('sets needs_review=false when mock returns high scores', async () => {
    // Default mock: depth=8, scientific=8, respectful=9, no_manipulation=true
    // overall = 8*0.3 + 8*0.3 + 9*0.3 + 1 = 8.5 → no review needed
    const creatives = [makeCreative({ id: 'ad_001', spend_usd: 100 })];
    const scores = await auditTopCreatives(creatives, makeClaudeClient(mock));
    expect(scores[0].needs_review).toBe(false);
    expect(scores[0].overall).toBeCloseTo(8.5, 2);
  });

  it('sets needs_review=true when overall < 7.5', async () => {
    mock.brandVoiceScore.mockResolvedValue({
      depth: 7,
      scientific: 6,
      respectful: 7,
      no_manipulation: false,
      overall: 5.0, // raw overall from mock — we recompute
    });

    // Our computed: 7*0.3 + 6*0.3 + 7*0.3 + 0 = 6 → needs_review
    const creatives = [makeCreative({ id: 'ad_001', spend_usd: 100 })];
    const scores = await auditTopCreatives(creatives, makeClaudeClient(mock));
    expect(scores[0].needs_review).toBe(true);
  });

  it('sets needs_review=true when any dimension < 6', async () => {
    mock.brandVoiceScore.mockResolvedValue({
      depth: 5,   // below threshold
      scientific: 8,
      respectful: 9,
      no_manipulation: true,
      overall: 8.0,
    });

    const creatives = [makeCreative({ id: 'ad_001', spend_usd: 100 })];
    const scores = await auditTopCreatives(creatives, makeClaudeClient(mock));
    // depth=5 < 6 → needs_review even if our computed overall is ≥ 7.5
    // computed = 5*0.3 + 8*0.3 + 9*0.3 + 1 = 7.6 — above 7.5 but depth fails
    expect(scores[0].needs_review).toBe(true);
  });

  it('selects by spend descending (highest spend is audited first)', async () => {
    const auditedIds: string[] = [];
    mock.brandVoiceScore.mockImplementation(async (adId: string) => {
      auditedIds.push(adId);
      return { depth: 8, scientific: 8, respectful: 9, no_manipulation: true, overall: 8.5 };
    });

    const creatives = [
      makeCreative({ id: 'ad_low', spend_usd: 10 }),
      makeCreative({ id: 'ad_high', spend_usd: 1000 }),
      makeCreative({ id: 'ad_mid', spend_usd: 500 }),
    ];

    await auditTopCreatives(creatives, makeClaudeClient(mock));
    expect(auditedIds[0]).toBe('ad_high');
    expect(auditedIds[1]).toBe('ad_mid');
    expect(auditedIds[2]).toBe('ad_low');
  });

  it('does not mutate the input array order', async () => {
    const creatives = [
      makeCreative({ id: 'ad_001', spend_usd: 50 }),
      makeCreative({ id: 'ad_002', spend_usd: 200 }),
      makeCreative({ id: 'ad_003', spend_usd: 100 }),
    ];
    const originalOrder = creatives.map((c) => c.id);

    await auditTopCreatives(creatives, makeClaudeClient(mock));
    expect(creatives.map((c) => c.id)).toEqual(originalOrder);
  });

  it('computes weighted overall from raw dimension scores (ignores mock overall)', async () => {
    mock.brandVoiceScore.mockResolvedValue({
      depth: 10,
      scientific: 10,
      respectful: 10,
      no_manipulation: true,
      overall: 0, // mock overall is wrong — our code should recompute
    });

    const creatives = [makeCreative({ id: 'ad_001', spend_usd: 100 })];
    const scores = await auditTopCreatives(creatives, makeClaudeClient(mock));
    // 10*0.3 + 10*0.3 + 10*0.3 + 1 = 10
    expect(scores[0].overall).toBeCloseTo(10, 2);
  });

  it('TOP_N constant equals 10', () => {
    expect(TOP_N).toBe(10);
  });
});
