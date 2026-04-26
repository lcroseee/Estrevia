import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateGates,
  recordFounderApproval,
  currentMode,
  seedGates,
  featureGatesConfig,
  type GatesDb,
  type GatesEvalState,
} from '../feature-gates';
import { advertisingFeatureGates } from '@/shared/lib/schema';

// ---- In-memory mock DB ------------------------------------------------------

type GateRow = {
  featureId: string;
  mode: string;
  activationCriteria: Record<string, number | string>;
  currentState: Record<string, number>;
  activatedAt: Date | null;
  updatedAt: Date;
};

function makeMockDb(initialRows: GateRow[] = []): GatesDb & { _rows: GateRow[] } {
  const rows: GateRow[] = [...initialRows];

  return {
    _rows: rows,
    select() {
      return {
        from(_table: typeof advertisingFeatureGates) {
          return Promise.resolve([...rows]);
        },
      };
    },
    insert(_table: typeof advertisingFeatureGates) {
      return {
        values(newRows: GateRow[]) {
          rows.push(...newRows);
          return Promise.resolve();
        },
      };
    },
    update(_table: typeof advertisingFeatureGates) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(condition: unknown) {
              // Extract featureId from the eq() condition — it's stored as the comparison value
              // We detect it by scanning for a matching row via a hack-free approach:
              // The real Drizzle eq() returns a Drizzle SQL object. Our mock receives it as an opaque
              // value. We instead accept the update eagerly and apply it to the last referenced row.
              // Callers always call where(eq(table.featureId, someId)) — we parse the value from
              // the set payload when featureId is present, or fall back to updating all rows.

              // Rows that match the pending set operation are identified by comparing mode transitions
              // or we require the caller to pass a featureId marker.
              // Simplest safe approach: keep a pending-update queue, apply to all (idempotent in tests).
              // For accuracy, check if any value changed per row.
              const conditionObj = condition as Record<string, Record<string, unknown>>;
              const rightVal = conditionObj?.['right']?.['value'];
              const featureIdFromValues =
                typeof rightVal === 'string' ? rightVal : null;

              // If we can extract the featureId from condition, update only that row
              if (featureIdFromValues) {
                const idx = rows.findIndex((r) => r.featureId === featureIdFromValues);
                if (idx !== -1) {
                  Object.assign(rows[idx], mapSetValues(values));
                }
              } else {
                // Fallback: update all rows (safe in tests where only one row changes at a time)
                for (const row of rows) {
                  Object.assign(row, mapSetValues(values));
                }
              }
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
}

function mapSetValues(values: Record<string, unknown>): Partial<GateRow> {
  const mapped: Partial<GateRow> = {};
  if ('mode' in values) mapped.mode = values['mode'] as string;
  if ('currentState' in values) mapped.currentState = values['currentState'] as Record<string, number>;
  if ('activatedAt' in values) mapped.activatedAt = values['activatedAt'] as Date | null;
  if ('updatedAt' in values) mapped.updatedAt = values['updatedAt'] as Date;
  return mapped;
}

// ---- Prebuilt gate rows for tests -------------------------------------------

function shadowGateRow(overrides: Partial<GateRow> = {}): GateRow {
  return {
    featureId: 'bayesianDecisions',
    mode: 'shadow',
    activationCriteria: {
      min_impressions_per_creative: 5000,
      min_days_running: 14,
      shadow_agreement_threshold: 0.7,
    },
    currentState: {},
    activatedAt: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

function proposalGateRow(overrides: Partial<GateRow> = {}): GateRow {
  return {
    featureId: 'bayesianDecisions',
    mode: 'active_proposal',
    activationCriteria: {
      min_impressions_per_creative: 5000,
      min_days_running: 14,
      shadow_agreement_threshold: 0.7,
    },
    currentState: {},
    activatedAt: new Date('2026-04-01'),
    updatedAt: new Date(),
    ...overrides,
  };
}

function offGateRow(featureId: string, audienceSize: number, overrides: Partial<GateRow> = {}): GateRow {
  return {
    featureId,
    mode: 'off',
    activationCriteria: {
      min_audience_size: audienceSize,
    },
    currentState: {},
    activatedAt: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---- evaluateGates ----------------------------------------------------------

describe('evaluateGates — shadow → active_proposal', () => {
  it('transitions shadow gate to active_proposal when all criteria are met', async () => {
    const db = makeMockDb([shadowGateRow()]);
    const state: GatesEvalState = {
      total_impressions: 6000,   // ≥ 5000
      days_running: 15,          // ≥ 14
      shadow_agreement_rate: 0.8, // ≥ 0.7
    };

    const gates = await evaluateGates(state, db as GatesDb);
    const gate = gates.find((g) => g.feature_id === 'bayesianDecisions');
    expect(gate?.mode).toBe('active_proposal');
    expect(gate?.activated_at).toBeInstanceOf(Date);
  });

  it('does NOT transition when impressions criteria is not met', async () => {
    const db = makeMockDb([shadowGateRow()]);
    const state: GatesEvalState = {
      total_impressions: 4999,   // < 5000
      days_running: 15,
      shadow_agreement_rate: 0.8,
    };

    const gates = await evaluateGates(state, db as GatesDb);
    const gate = gates.find((g) => g.feature_id === 'bayesianDecisions');
    expect(gate?.mode).toBe('shadow');
  });

  it('does NOT transition when days_running criteria is not met', async () => {
    const db = makeMockDb([shadowGateRow()]);
    const state: GatesEvalState = {
      total_impressions: 6000,
      days_running: 13,          // < 14
      shadow_agreement_rate: 0.8,
    };

    const gates = await evaluateGates(state, db as GatesDb);
    const gate = gates.find((g) => g.feature_id === 'bayesianDecisions');
    expect(gate?.mode).toBe('shadow');
  });

  it('does NOT transition when agreement rate is below threshold', async () => {
    const db = makeMockDb([shadowGateRow()]);
    const state: GatesEvalState = {
      total_impressions: 6000,
      days_running: 20,
      shadow_agreement_rate: 0.65, // < 0.7
    };

    const gates = await evaluateGates(state, db as GatesDb);
    const gate = gates.find((g) => g.feature_id === 'bayesianDecisions');
    expect(gate?.mode).toBe('shadow');
  });
});

describe('evaluateGates — active_proposal → active_auto', () => {
  it('transitions to active_auto when founder_approval_count reaches 5', async () => {
    const db = makeMockDb([
      proposalGateRow({ currentState: { founder_approval_count: 5 } }),
    ]);

    const gates = await evaluateGates({ total_impressions: 0, days_running: 0 }, db as GatesDb);
    const gate = gates.find((g) => g.feature_id === 'bayesianDecisions');
    expect(gate?.mode).toBe('active_auto');
  });

  it('does NOT transition to active_auto with only 4 approvals', async () => {
    const db = makeMockDb([
      proposalGateRow({ currentState: { founder_approval_count: 4 } }),
    ]);

    const gates = await evaluateGates({ total_impressions: 0, days_running: 0 }, db as GatesDb);
    const gate = gates.find((g) => g.feature_id === 'bayesianDecisions');
    expect(gate?.mode).toBe('active_proposal');
  });

  it('transitions with count > 5 (e.g., 7)', async () => {
    const db = makeMockDb([
      proposalGateRow({ currentState: { founder_approval_count: 7 } }),
    ]);

    const gates = await evaluateGates({ total_impressions: 0, days_running: 0 }, db as GatesDb);
    const gate = gates.find((g) => g.feature_id === 'bayesianDecisions');
    expect(gate?.mode).toBe('active_auto');
  });
});

describe('evaluateGates — off → active_proposal for audience gates', () => {
  it('transitions retargetingCampaigns off → active_proposal when audience size met', async () => {
    const db = makeMockDb([offGateRow('retargetingCampaigns', 200)]);
    const state: GatesEvalState = {
      total_impressions: 0,
      days_running: 0,
      audience_sizes: { retargeting: 250 }, // ≥ 200
    };

    const gates = await evaluateGates(state, db as GatesDb);
    const gate = gates.find((g) => g.feature_id === 'retargetingCampaigns');
    expect(gate?.mode).toBe('active_proposal');
  });

  it('keeps retargetingCampaigns off when audience too small', async () => {
    const db = makeMockDb([offGateRow('retargetingCampaigns', 200)]);
    const state: GatesEvalState = {
      total_impressions: 0,
      days_running: 0,
      audience_sizes: { retargeting: 150 }, // < 200
    };

    const gates = await evaluateGates(state, db as GatesDb);
    const gate = gates.find((g) => g.feature_id === 'retargetingCampaigns');
    expect(gate?.mode).toBe('off');
  });

  it('transitions exclusionsCampaigns off → active_proposal when exclusion audience met', async () => {
    const db = makeMockDb([offGateRow('exclusionsCampaigns', 100)]);
    const state: GatesEvalState = {
      total_impressions: 0,
      days_running: 0,
      audience_sizes: { exclusions: 120 }, // ≥ 100
    };

    const gates = await evaluateGates(state, db as GatesDb);
    const gate = gates.find((g) => g.feature_id === 'exclusionsCampaigns');
    expect(gate?.mode).toBe('active_proposal');
  });
});

describe('evaluateGates — multiple gates', () => {
  it('evaluates all gates independently and returns all', async () => {
    const db = makeMockDb([
      shadowGateRow({ featureId: 'bayesianDecisions' }),
      offGateRow('retargetingCampaigns', 200),
      {
        featureId: 'anomalyDetection',
        mode: 'shadow',
        activationCriteria: { min_days_of_baseline: 30 },
        currentState: {},
        activatedAt: null,
        updatedAt: new Date(),
      },
    ]);

    const state: GatesEvalState = {
      total_impressions: 6000,
      days_running: 20,
      shadow_agreement_rate: 0.8,
      days_of_baseline: 35, // ≥ 30 → anomalyDetection should transition
      audience_sizes: { retargeting: 50 }, // < 200 → retargeting stays off
    };

    const gates = await evaluateGates(state, db as GatesDb);
    expect(gates).toHaveLength(3);

    const bayesian = gates.find((g) => g.feature_id === 'bayesianDecisions');
    const anomaly = gates.find((g) => g.feature_id === 'anomalyDetection');
    const retargeting = gates.find((g) => g.feature_id === 'retargetingCampaigns');

    expect(bayesian?.mode).toBe('active_proposal');
    expect(anomaly?.mode).toBe('active_proposal');
    expect(retargeting?.mode).toBe('off');
  });
});

// ---- recordFounderApproval --------------------------------------------------

describe('recordFounderApproval', () => {
  it('increments founder_approval_count from 0 to 1', async () => {
    const db = makeMockDb([proposalGateRow({ currentState: {} })]);
    const gate = await recordFounderApproval('bayesianDecisions', db as GatesDb);
    expect(gate?.current_state['founder_approval_count']).toBe(1);
  });

  it('increments approval count from existing value', async () => {
    const db = makeMockDb([proposalGateRow({ currentState: { founder_approval_count: 3 } })]);
    const gate = await recordFounderApproval('bayesianDecisions', db as GatesDb);
    expect(gate?.current_state['founder_approval_count']).toBe(4);
  });

  it('returns null when feature is not found', async () => {
    const db = makeMockDb([]);
    const result = await recordFounderApproval('nonexistentFeature', db as GatesDb);
    expect(result).toBeNull();
  });

  it('returns null when feature is not in active_proposal mode', async () => {
    const db = makeMockDb([shadowGateRow()]);
    const result = await recordFounderApproval('bayesianDecisions', db as GatesDb);
    expect(result).toBeNull();
  });

  it('preserves other keys in current_state when incrementing', async () => {
    const db = makeMockDb([
      proposalGateRow({ currentState: { founder_approval_count: 2, other_counter: 99 } }),
    ]);
    const gate = await recordFounderApproval('bayesianDecisions', db as GatesDb);
    expect(gate?.current_state['founder_approval_count']).toBe(3);
    expect(gate?.current_state['other_counter']).toBe(99);
  });
});

// ---- currentMode ------------------------------------------------------------

describe('currentMode', () => {
  it('returns the mode of a known feature', async () => {
    const db = makeMockDb([shadowGateRow()]);
    const mode = await currentMode('bayesianDecisions', db as GatesDb);
    expect(mode).toBe('shadow');
  });

  it('returns off for an unknown feature', async () => {
    const db = makeMockDb([]);
    const mode = await currentMode('unknownFeature', db as GatesDb);
    expect(mode).toBe('off');
  });

  it('returns active_proposal correctly', async () => {
    const db = makeMockDb([proposalGateRow()]);
    const mode = await currentMode('bayesianDecisions', db as GatesDb);
    expect(mode).toBe('active_proposal');
  });
});

// ---- seedGates --------------------------------------------------------------

describe('seedGates', () => {
  it('inserts all 4 default gates into empty DB', async () => {
    const db = makeMockDb([]);
    await seedGates(db as GatesDb);
    const rows = await db.select().from(advertisingFeatureGates);
    expect(rows).toHaveLength(4);
    const ids = rows.map((r) => r.featureId).sort();
    expect(ids).toEqual([
      'anomalyDetection',
      'bayesianDecisions',
      'exclusionsCampaigns',
      'retargetingCampaigns',
    ]);
  });

  it('is idempotent — does not insert duplicates', async () => {
    const db = makeMockDb([shadowGateRow()]);
    await seedGates(db as GatesDb);
    const rows = await db.select().from(advertisingFeatureGates);
    // bayesianDecisions was already there; 3 more inserted
    const bayesianCount = rows.filter((r) => r.featureId === 'bayesianDecisions').length;
    expect(bayesianCount).toBe(1);
  });

  it('sets correct initial mode per featureGatesConfig', async () => {
    const db = makeMockDb([]);
    await seedGates(db as GatesDb);
    const rows = await db.select().from(advertisingFeatureGates);

    const byId = Object.fromEntries(rows.map((r) => [r.featureId, r.mode]));
    expect(byId['bayesianDecisions']).toBe('shadow');
    expect(byId['anomalyDetection']).toBe('shadow');
    expect(byId['retargetingCampaigns']).toBe('off');
    expect(byId['exclusionsCampaigns']).toBe('off');
  });

  it('sets empty currentState for all seeded gates', async () => {
    const db = makeMockDb([]);
    await seedGates(db as GatesDb);
    const rows = await db.select().from(advertisingFeatureGates);
    for (const row of rows) {
      expect(row.currentState).toEqual({});
    }
  });
});

// ---- featureGatesConfig -----------------------------------------------------

describe('featureGatesConfig static config', () => {
  it('has exactly 4 feature gates defined', () => {
    expect(Object.keys(featureGatesConfig)).toHaveLength(4);
  });

  it('bayesianDecisions: initial_mode=shadow, min_impressions=5000, min_days=14, agreement=0.7', () => {
    const c = featureGatesConfig['bayesianDecisions'];
    expect(c.initial_mode).toBe('shadow');
    expect(c.activate_when.min_impressions_per_creative).toBe(5000);
    expect(c.activate_when.min_days_running).toBe(14);
    expect(c.activate_when.shadow_agreement_threshold).toBe(0.7);
  });

  it('anomalyDetection: initial_mode=shadow, min_days_of_baseline=30', () => {
    const c = featureGatesConfig['anomalyDetection'];
    expect(c.initial_mode).toBe('shadow');
    expect(c.activate_when.min_days_of_baseline).toBe(30);
  });

  it('retargetingCampaigns: initial_mode=off, min_audience_size=200', () => {
    const c = featureGatesConfig['retargetingCampaigns'];
    expect(c.initial_mode).toBe('off');
    expect(c.activate_when.min_audience_size).toBe(200);
  });

  it('exclusionsCampaigns: initial_mode=off, min_audience_size=100', () => {
    const c = featureGatesConfig['exclusionsCampaigns'];
    expect(c.initial_mode).toBe('off');
    expect(c.activate_when.min_audience_size).toBe(100);
  });
});

// ---- Step-by-step transition flow -------------------------------------------

describe('end-to-end transition flow', () => {
  it('follows shadow → active_proposal → active_auto with 5 approvals', async () => {
    const db = makeMockDb([shadowGateRow()]);

    // Step 1: shadow with insufficient impressions — stays shadow
    const gates1 = await evaluateGates(
      { total_impressions: 2000, days_running: 5, shadow_agreement_rate: 0.6 },
      db as GatesDb,
    );
    expect(gates1[0].mode).toBe('shadow');

    // Step 2: criteria met — transitions to active_proposal
    // We need to re-check the db since evaluateGates is stateful via the mock
    const gates2 = await evaluateGates(
      { total_impressions: 6000, days_running: 20, shadow_agreement_rate: 0.75 },
      db as GatesDb,
    );
    expect(gates2[0].mode).toBe('active_proposal');

    // Step 3: 4 founder approvals — stays in active_proposal
    for (let i = 0; i < 4; i++) {
      await recordFounderApproval('bayesianDecisions', db as GatesDb);
    }
    const gates3 = await evaluateGates(
      { total_impressions: 7000, days_running: 25 },
      db as GatesDb,
    );
    expect(gates3[0].mode).toBe('active_proposal');

    // Step 4: 5th approval — evaluateGates now transitions to active_auto
    await recordFounderApproval('bayesianDecisions', db as GatesDb);
    const gates4 = await evaluateGates(
      { total_impressions: 7000, days_running: 25 },
      db as GatesDb,
    );
    expect(gates4[0].mode).toBe('active_auto');
  });
});
