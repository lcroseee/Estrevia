import { describe, it, expect } from 'vitest';
import { allocateDailyBudget } from '../cross-campaign-budget';
import type { CampaignSpec } from '../cross-campaign-budget';

// Helpers

function makeCampaign(
  id: string,
  kind: CampaignSpec['kind'],
  performance = 1.0,
  currentSpendShare = 0.5,
): CampaignSpec {
  return { id, kind, performance, currentSpendShare };
}

function sumValues(map: Map<string, number>): number {
  return Array.from(map.values()).reduce((s, v) => s + v, 0);
}

describe('allocateDailyBudget', () => {
  // --- Edge cases ---

  it('returns empty map for empty campaign list', () => {
    const result = allocateDailyBudget(100, []);
    expect(result.size).toBe(0);
  });

  it('returns zero allocations for zero total budget', () => {
    const campaigns = [makeCampaign('en', 'cold_en'), makeCampaign('es', 'cold_es')];
    const result = allocateDailyBudget(0, campaigns);
    expect(result.get('en')).toBe(0);
    expect(result.get('es')).toBe(0);
  });

  // --- Default split (no retargeting) ---

  it('applies 70/30 split for EN/ES cold with default mode', () => {
    const campaigns = [
      makeCampaign('en', 'cold_en'),
      makeCampaign('es', 'cold_es'),
    ];
    const result = allocateDailyBudget(100, campaigns);
    const enBudget = result.get('en')!;
    const esBudget = result.get('es')!;

    // Allow 1 cent rounding tolerance
    expect(enBudget).toBeCloseTo(70, 0);
    expect(esBudget).toBeCloseTo(30, 0);
    expect(enBudget + esBudget).toBeCloseTo(100, 0);
  });

  it('total budget is distributed across all campaigns', () => {
    const campaigns = [
      makeCampaign('en', 'cold_en'),
      makeCampaign('es', 'cold_es'),
    ];
    const result = allocateDailyBudget(200, campaigns);
    expect(sumValues(result)).toBeCloseTo(200, 0);
  });

  it('uses performance weight to split budget within same kind', () => {
    // Three cold_en campaigns at different performance levels. The 60% cap only
    // applies if a campaign exceeds that threshold — with 3 campaigns sharing 70%,
    // max any one can get is 70% * (perf/total_perf). With 3:1:1 distribution,
    // top campaign gets 70%*3/5=42% — well below the cap.
    const campaigns = [
      makeCampaign('en1', 'cold_en', 3.0),
      makeCampaign('en2', 'cold_en', 1.0),
      makeCampaign('en3', 'cold_en', 1.0),
      makeCampaign('es', 'cold_es', 1.0),
    ];
    const result = allocateDailyBudget(100, campaigns);

    // en1 has 3× the performance of en2 and en3, so it should get 3× their budget
    const en1 = result.get('en1')!;
    const en2 = result.get('en2')!;
    expect(en1).toBeGreaterThan(en2);
    // Within the cold_en kind: en1 gets 3/(3+1+1)=60% of kind budget,
    // en2 gets 1/5=20%. Ratio = 3.0
    expect(en1 / en2).toBeCloseTo(3.0, 0);
  });

  // --- Retargeting active split ---

  it('activates retargeting-active split when retargeting campaigns exist', () => {
    const campaigns = [
      makeCampaign('en', 'cold_en'),
      makeCampaign('es', 'cold_es'),
      makeCampaign('rt', 'retargeting'),
      makeCampaign('exp', 'exploration'),
    ];
    const result = allocateDailyBudget(100, campaigns);

    // Retargeting should get ~25%, exploration ~15%
    const rt = result.get('rt')!;
    const exp = result.get('exp')!;
    // With normalisation, proportions should hold approximately
    expect(rt).toBeGreaterThan(0);
    expect(exp).toBeGreaterThan(0);
    // Cold campaigns combined should be ≥ retargeting
    const cold = (result.get('en') ?? 0) + (result.get('es') ?? 0);
    expect(cold).toBeGreaterThan(rt);
  });

  it('includes retargeting_no_paid in retargeting-active mode', () => {
    const campaigns = [
      makeCampaign('en', 'cold_en'),
      makeCampaign('es', 'cold_es'),
      makeCampaign('rt', 'retargeting'),
      makeCampaign('rt_np', 'retargeting_no_paid'),
      makeCampaign('exp', 'exploration'),
    ];
    const result = allocateDailyBudget(1000, campaigns);

    expect(result.get('rt_np')).toBeGreaterThan(0);
    // Total still sums to budget
    expect(sumValues(result)).toBeCloseTo(1000, 0);
  });

  // --- Constraint: exploration ≥ 15% ---

  it('enforces exploration ≥ 15% of total budget', () => {
    const campaigns = [
      makeCampaign('en', 'cold_en', 10.0), // dominant performer
      makeCampaign('es', 'cold_es', 1.0),
      makeCampaign('exp', 'exploration', 0.1), // weak performer
    ];
    const total = 1000;
    const result = allocateDailyBudget(total, campaigns);
    const expShare = (result.get('exp') ?? 0) / total;

    // exploration must be at least MIN_EXPLORATION_SHARE (15%)
    expect(expShare).toBeGreaterThanOrEqual(0.149); // 0.001 tolerance for rounding
  });

  // --- Constraint: retargeting ≥ 10% when present ---

  it('enforces retargeting ≥ 10% of total budget when retargeting campaigns exist', () => {
    const campaigns = [
      makeCampaign('en', 'cold_en', 50.0), // very dominant
      makeCampaign('rt', 'retargeting', 0.01), // tiny performance
      makeCampaign('exp', 'exploration', 1.0),
    ];
    const total = 1000;
    const result = allocateDailyBudget(total, campaigns);
    const rtShare = (result.get('rt') ?? 0) / total;

    expect(rtShare).toBeGreaterThanOrEqual(0.09); // ≥10% with tolerance
  });

  // --- Constraint: no single campaign > 60% within same kind ---

  it('caps a single campaign at 60% when multiple campaigns share the same kind', () => {
    // Two cold_en campaigns — the higher-performer would otherwise get nearly all of the 70% cold_en allocation
    // but both are competing within the same kind; the 60% cap limits runaway concentration.
    const campaigns = [
      makeCampaign('en1', 'cold_en', 100.0), // extremely dominant
      makeCampaign('en2', 'cold_en', 0.0001), // near-zero performer
      makeCampaign('es', 'cold_es', 1.0),
    ];
    const total = 500;
    const result = allocateDailyBudget(total, campaigns);
    const en1Share = (result.get('en1') ?? 0) / total;

    expect(en1Share).toBeLessThanOrEqual(0.601); // 0.001 tolerance for float
  });

  // --- Total invariant ---

  it('total allocated always equals totalUsd for various scenarios', () => {
    const scenarios: [number, CampaignSpec[]][] = [
      [50, [makeCampaign('a', 'cold_en'), makeCampaign('b', 'cold_es')]],
      [
        300,
        [
          makeCampaign('en', 'cold_en'),
          makeCampaign('es', 'cold_es'),
          makeCampaign('rt', 'retargeting'),
          makeCampaign('exp', 'exploration'),
        ],
      ],
      [1000, [makeCampaign('single', 'cold_en', 1.0)]],
    ];

    for (const [total, campaigns] of scenarios) {
      const result = allocateDailyBudget(total, campaigns);
      expect(sumValues(result)).toBeCloseTo(total, 0);
    }
  });

  // --- All campaign IDs present in output ---

  it('returns an entry for every input campaign', () => {
    const campaigns = [
      makeCampaign('a', 'cold_en'),
      makeCampaign('b', 'cold_es'),
      makeCampaign('c', 'exploration'),
    ];
    const result = allocateDailyBudget(100, campaigns);

    expect(result.has('a')).toBe(true);
    expect(result.has('b')).toBe(true);
    expect(result.has('c')).toBe(true);
  });
});
