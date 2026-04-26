/**
 * Feature Gates — Task 7.3
 *
 * Manages advertising agent feature-gate lifecycle:
 *   - shadow → active_proposal  (when impressions + days criteria met with agreement)
 *   - active_proposal → active_auto  (after 5 founder approvals)
 *
 * State is persisted in the `advertising_feature_gates` DB table.
 * Transitions are logged via console.log stubs (audit table = S8 domain).
 *
 * Telegram alerts are NOT sent here (S9 domain). Callers inspect returned
 * FeatureGate[] and decide whether to alert.
 */

import { eq, sql } from 'drizzle-orm';
import { advertisingFeatureGates } from '@/shared/lib/schema';
import type { FeatureGate } from '@/shared/types/advertising';

// ---- DB client type ---------------------------------------------------------

// Accept the minimal Drizzle-like interface needed for select/insert/update.
// Using a structural type so tests can inject a mock without importing drizzle.
export type GatesDb = {
  select(): {
    from(table: typeof advertisingFeatureGates): Promise<Array<{
      featureId: string;
      mode: string;
      activationCriteria: unknown;
      currentState: unknown;
      activatedAt: Date | null;
      updatedAt: Date;
    }>>;
  };
  insert(table: typeof advertisingFeatureGates): {
    values(
      rows: Array<{
        featureId: string;
        mode: string;
        activationCriteria: Record<string, number | string>;
        currentState: Record<string, number>;
        activatedAt?: Date | null;
        updatedAt?: Date;
      }>,
    ): Promise<void>;
  };
  update(table: typeof advertisingFeatureGates): {
    set(values: Record<string, unknown>): {
      where(condition: ReturnType<typeof eq>): Promise<void>;
    };
  };
};

// ---- Static config ----------------------------------------------------------

export type Mode = 'off' | 'shadow' | 'active_proposal' | 'active_auto';

export interface ActivationCriteria {
  min_impressions_per_creative?: number;
  min_days_running?: number;
  min_audience_size?: number;
  shadow_agreement_threshold?: number;
  min_days_of_baseline?: number;
}

export interface FeatureGateConfig {
  initial_mode: Mode;
  activate_when: ActivationCriteria;
}

export const featureGatesConfig: Record<string, FeatureGateConfig> = {
  bayesianDecisions: {
    initial_mode: 'shadow',
    activate_when: {
      min_impressions_per_creative: 5_000,
      min_days_running: 14,
      shadow_agreement_threshold: 0.7,
    },
  },
  anomalyDetection: {
    initial_mode: 'shadow',
    activate_when: {
      min_days_of_baseline: 30,
    },
  },
  retargetingCampaigns: {
    initial_mode: 'off',
    activate_when: {
      min_audience_size: 200,
    },
  },
  exclusionsCampaigns: {
    initial_mode: 'off',
    activate_when: {
      min_audience_size: 100,
    },
  },
};

// ---- Approval count needed to transition active_proposal → active_auto ------

const APPROVALS_REQUIRED_FOR_AUTO = 5;

// ---- State passed to evaluateGates ------------------------------------------

export interface GatesEvalState {
  /** Total impressions across all creatives being evaluated. */
  total_impressions: number;
  /** Days the agent has been running. */
  days_running: number;
  /** Fraction of shadow decisions that agreed with active decisions (0..1). */
  shadow_agreement_rate?: number;
  /** Current audience sizes by audience kind. */
  audience_sizes?: { retargeting?: number; exclusions?: number };
  /** Days of baseline data collected for anomaly detection. */
  days_of_baseline?: number;
}

// ---- Internal helpers -------------------------------------------------------

function rowToGate(row: {
  featureId: string;
  mode: string;
  activationCriteria: unknown;
  currentState: unknown;
  activatedAt: Date | null;
}): FeatureGate {
  return {
    feature_id: row.featureId,
    mode: row.mode as Mode,
    activation_criteria: (row.activationCriteria as FeatureGate['activation_criteria']) ?? {},
    current_state: (row.currentState as Record<string, number>) ?? {},
    activated_at: row.activatedAt ?? undefined,
  };
}

function shadowCriteriamet(
  state: GatesEvalState,
  criteria: ActivationCriteria,
): boolean {
  if (
    criteria.min_impressions_per_creative !== undefined &&
    state.total_impressions < criteria.min_impressions_per_creative
  ) {
    return false;
  }
  if (
    criteria.min_days_running !== undefined &&
    state.days_running < criteria.min_days_running
  ) {
    return false;
  }
  if (
    criteria.shadow_agreement_threshold !== undefined &&
    (state.shadow_agreement_rate ?? 0) < criteria.shadow_agreement_threshold
  ) {
    return false;
  }
  if (
    criteria.min_days_of_baseline !== undefined &&
    (state.days_of_baseline ?? 0) < criteria.min_days_of_baseline
  ) {
    return false;
  }
  return true;
}

function offCriteriaMet(
  featureId: string,
  state: GatesEvalState,
  criteria: ActivationCriteria,
): boolean {
  if (featureId === 'retargetingCampaigns') {
    return (state.audience_sizes?.retargeting ?? 0) >= (criteria.min_audience_size ?? Infinity);
  }
  if (featureId === 'exclusionsCampaigns') {
    return (state.audience_sizes?.exclusions ?? 0) >= (criteria.min_audience_size ?? Infinity);
  }
  // Generic audience_size check
  if (criteria.min_audience_size !== undefined) {
    const maxSize = Math.max(
      state.audience_sizes?.retargeting ?? 0,
      state.audience_sizes?.exclusions ?? 0,
    );
    return maxSize >= criteria.min_audience_size;
  }
  return false;
}

// ---- Public API -------------------------------------------------------------

/**
 * Evaluate all feature gates against current state and persist any transitions.
 *
 * Transitions:
 *   off → shadow: not auto-transitioned (manual only)
 *   shadow → active_proposal: when all activation_criteria met
 *   active_proposal → active_auto: after founder_approval_count reaches 5
 *   off → active_proposal: for audience-gated features when criteria met
 *
 * @param state Current runtime metrics used to evaluate criteria
 * @param db    Drizzle-compatible DB client (injected for testability)
 */
export async function evaluateGates(
  state: GatesEvalState,
  db: GatesDb,
): Promise<FeatureGate[]> {
  const rows = await db.select().from(advertisingFeatureGates);
  const gates = rows.map(rowToGate);
  const updated: FeatureGate[] = [];

  for (const gate of gates) {
    const config = featureGatesConfig[gate.feature_id];
    const criteria = gate.activation_criteria;
    let newMode: Mode = gate.mode as Mode;
    let newState = { ...gate.current_state };
    let activatedAt = gate.activated_at;

    if (gate.mode === 'shadow') {
      const met = shadowCriteriamet(state, criteria);
      if (met) {
        newMode = 'active_proposal';
        activatedAt = new Date();
        console.log(`[feature-gates] ${gate.feature_id}: shadow → active_proposal`);
      }
    } else if (gate.mode === 'active_proposal') {
      const approvalCount = newState['founder_approval_count'] ?? 0;
      if (approvalCount >= APPROVALS_REQUIRED_FOR_AUTO) {
        newMode = 'active_auto';
        console.log(`[feature-gates] ${gate.feature_id}: active_proposal → active_auto (${approvalCount} approvals)`);
      }
    } else if (gate.mode === 'off' && config) {
      // Off gates with audience criteria can transition to active_proposal
      const met = offCriteriaMet(gate.feature_id, state, criteria);
      if (met) {
        newMode = 'active_proposal';
        activatedAt = new Date();
        console.log(`[feature-gates] ${gate.feature_id}: off → active_proposal (audience criteria met)`);
      }
    }

    if (newMode !== gate.mode || JSON.stringify(newState) !== JSON.stringify(gate.current_state)) {
      await db
        .update(advertisingFeatureGates)
        .set({
          mode: newMode,
          currentState: newState,
          activatedAt: activatedAt ?? null,
          updatedAt: new Date(),
        })
        .where(eq(advertisingFeatureGates.featureId, gate.feature_id));
    }

    updated.push({
      ...gate,
      mode: newMode,
      current_state: newState,
      activated_at: activatedAt ?? undefined,
    });
  }

  return updated;
}

/**
 * Record a founder approval for a feature gate in active_proposal mode.
 * Increments founder_approval_count in current_state.
 *
 * Returns the updated gate (or null if feature not found / not in active_proposal).
 */
export async function recordFounderApproval(
  featureId: string,
  db: GatesDb,
): Promise<FeatureGate | null> {
  const rows = await db.select().from(advertisingFeatureGates);
  const row = rows.find((r) => r.featureId === featureId);
  if (!row) return null;
  if (row.mode !== 'active_proposal') return null;

  const currentState = (row.currentState as Record<string, number>) ?? {};
  const prev = currentState['founder_approval_count'] ?? 0;
  const newState = { ...currentState, founder_approval_count: prev + 1 };

  await db
    .update(advertisingFeatureGates)
    .set({ currentState: newState, updatedAt: new Date() })
    .where(eq(advertisingFeatureGates.featureId, featureId));

  return {
    feature_id: featureId,
    mode: row.mode as Mode,
    activation_criteria: (row.activationCriteria as FeatureGate['activation_criteria']) ?? {},
    current_state: newState,
    activated_at: row.activatedAt ?? undefined,
  };
}

/**
 * Read the current mode for a feature gate directly from DB.
 *
 * Returns 'off' if the feature is not found in the DB.
 */
export async function currentMode(featureId: string, db: GatesDb): Promise<Mode> {
  const rows = await db.select().from(advertisingFeatureGates);
  const row = rows.find((r) => r.featureId === featureId);
  return row ? (row.mode as Mode) : 'off';
}

/**
 * Seed the feature gates table with defaults from featureGatesConfig.
 * Only inserts rows that are not already present — idempotent.
 */
export async function seedGates(db: GatesDb): Promise<void> {
  const existing = await db.select().from(advertisingFeatureGates);
  const existingIds = new Set(existing.map((r) => r.featureId));

  const toInsert = Object.entries(featureGatesConfig)
    .filter(([id]) => !existingIds.has(id))
    .map(([id, config]) => ({
      featureId: id,
      mode: config.initial_mode,
      activationCriteria: config.activate_when as Record<string, number | string>,
      currentState: {} as Record<string, number>,
      activatedAt: null,
      updatedAt: new Date(),
    }));

  if (toInsert.length > 0) {
    await db.insert(advertisingFeatureGates).values(toInsert);
    console.log(`[feature-gates] seeded ${toInsert.length} gate(s):`, toInsert.map((r) => r.featureId).join(', '));
  }
}
