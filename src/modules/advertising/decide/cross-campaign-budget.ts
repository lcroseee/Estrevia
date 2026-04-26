/**
 * Cross-campaign budget allocator.
 *
 * Distributes the daily total budget across active campaigns using predefined
 * strategic splits, then applies hard minimum/maximum constraints.
 *
 * Two modes:
 * 1. Pre-retargeting (default): 70% EN cold, 30% ES cold
 * 2. Post-retargeting active: 55% cold winners, 25% retargeting, 15% exploration,
 *    5% retargeting register-no-paid
 */

export type CampaignKind =
  | 'cold_en'
  | 'cold_es'
  | 'retargeting'
  | 'retargeting_no_paid'
  | 'exploration';

export interface CampaignSpec {
  id: string;
  kind: CampaignKind;
  /** Current spend share (0..1) — used for proportional allocation within kind groups */
  currentSpendShare: number;
  /** Composite performance score — used for winner-biased allocation */
  performance: number;
}

// Default split — before retargeting is active
const DEFAULT_SPLIT: Record<CampaignKind, number> = {
  cold_en: 0.70,
  cold_es: 0.30,
  retargeting: 0.00,
  retargeting_no_paid: 0.00,
  exploration: 0.00,
};

// Split once retargeting campaigns are active
const RETARGETING_ACTIVE_SPLIT: Record<CampaignKind, number> = {
  cold_en: 0.40,       // part of "cold winners"
  cold_es: 0.15,       // part of "cold winners"  (0.40+0.15 = 0.55 cold total)
  retargeting: 0.25,
  retargeting_no_paid: 0.05,
  exploration: 0.15,
};

// Hard constraints applied after split calculation
const MIN_EXPLORATION_SHARE = 0.15;
const MIN_RETARGETING_SHARE = 0.10;
const MAX_SINGLE_CAMPAIGN_SHARE = 0.60;

function hasRetargetingCampaigns(campaigns: CampaignSpec[]): boolean {
  return campaigns.some(
    (c) => c.kind === 'retargeting' || c.kind === 'retargeting_no_paid',
  );
}

/**
 * Allocate daily budget across campaigns.
 *
 * Steps:
 * 1. Pick split table (default vs retargeting-active)
 * 2. Distribute kind-level budget proportionally by performance within the kind
 * 3. Apply hard constraints (min exploration, min retargeting, max single)
 * 4. Re-normalise so allocations sum to totalUsd
 *
 * @returns Map of campaign id → allocated USD amount
 */
export function allocateDailyBudget(
  totalUsd: number,
  campaigns: CampaignSpec[],
): Map<string, number> {
  if (campaigns.length === 0) return new Map();
  if (totalUsd <= 0) {
    return new Map(campaigns.map((c) => [c.id, 0]));
  }

  const retargetingActive = hasRetargetingCampaigns(campaigns);
  const split = retargetingActive ? RETARGETING_ACTIVE_SPLIT : DEFAULT_SPLIT;

  // Group campaigns by kind
  const byKind = new Map<CampaignKind, CampaignSpec[]>();
  for (const campaign of campaigns) {
    const group = byKind.get(campaign.kind) ?? [];
    group.push(campaign);
    byKind.set(campaign.kind, group);
  }

  // Assign raw shares per campaign based on kind budget + performance weight
  const rawShares = new Map<string, number>();

  for (const [kind, group] of byKind.entries()) {
    const kindShare = split[kind];
    if (kindShare === 0 || group.length === 0) {
      for (const c of group) rawShares.set(c.id, 0);
      continue;
    }

    const totalPerf = group.reduce((s, c) => s + Math.max(c.performance, 0), 0);
    for (const c of group) {
      const perfWeight = totalPerf > 0 ? Math.max(c.performance, 0) / totalPerf : 1 / group.length;
      rawShares.set(c.id, kindShare * perfWeight);
    }
  }

  // Apply constraints
  const constrained = applyConstraints(rawShares, campaigns);

  // Convert shares to USD amounts
  const result = new Map<string, number>();
  for (const [id, share] of constrained.entries()) {
    result.set(id, parseFloat((totalUsd * share).toFixed(2)));
  }

  return result;
}

/**
 * Normalise a share map so that all values sum to 1.
 */
function normalise(shares: Map<string, number>): Map<string, number> {
  const total = Array.from(shares.values()).reduce((s, v) => s + v, 0);
  if (total <= 0) return shares;
  const result = new Map<string, number>();
  for (const [id, share] of shares.entries()) {
    result.set(id, share / total);
  }
  return result;
}

/**
 * Enforce hard constraints on a normalised share map (shares must sum to 1).
 *
 * Constraints applied iteratively:
 * 1. Group minimum for exploration (≥ 15%) — transfer from over-allocated groups
 * 2. Group minimum for retargeting (≥ 10%) — transfer from over-allocated groups
 * 3. Per-campaign cap (≤ 60%) when multiple campaigns share a kind — excess
 *    redistributed to peers within the kind first, then globally
 *
 * The 60% cap does NOT apply to a kind with exactly one campaign, since the
 * spec explicitly allows cold_en to receive 70% in the default two-campaign mode.
 * After all adjustments the map is re-normalised once to correct any float drift.
 */
function applyConstraints(
  rawShares: Map<string, number>,
  campaigns: CampaignSpec[],
): Map<string, number> {
  // Work on normalised shares
  let shares = normalise(new Map(rawShares));

  // Build kind groups
  const byKind = new Map<CampaignKind, string[]>();
  for (const c of campaigns) {
    const group = byKind.get(c.kind) ?? [];
    group.push(c.id);
    byKind.set(c.kind, group);
  }

  const explorationIds = byKind.get('exploration') ?? [];
  const retargetingIds = [
    ...(byKind.get('retargeting') ?? []),
    ...(byKind.get('retargeting_no_paid') ?? []),
  ];

  // All campaign ids that are neither exploration nor retargeting
  const otherIds = campaigns
    .filter((c) => c.kind !== 'exploration' && c.kind !== 'retargeting' && c.kind !== 'retargeting_no_paid')
    .map((c) => c.id);

  // --- 1. Enforce exploration group minimum ---
  if (explorationIds.length > 0) {
    const currentExploration = explorationIds.reduce((s, id) => s + (shares.get(id) ?? 0), 0);
    if (currentExploration < MIN_EXPLORATION_SHARE) {
      const deficit = MIN_EXPLORATION_SHARE - currentExploration;
      // Add to exploration
      const addPerExploration = deficit / explorationIds.length;
      for (const id of explorationIds) {
        shares.set(id, (shares.get(id) ?? 0) + addPerExploration);
      }
      // Subtract from other campaigns proportionally
      const otherTotal = otherIds.reduce((s, id) => s + (shares.get(id) ?? 0), 0);
      if (otherTotal > 0) {
        for (const id of otherIds) {
          const weight = (shares.get(id) ?? 0) / otherTotal;
          shares.set(id, (shares.get(id) ?? 0) - deficit * weight);
        }
      }
    }
  }

  // --- 2. Enforce retargeting group minimum ---
  if (retargetingIds.length > 0) {
    const currentRetargeting = retargetingIds.reduce((s, id) => s + (shares.get(id) ?? 0), 0);
    if (currentRetargeting < MIN_RETARGETING_SHARE) {
      const deficit = MIN_RETARGETING_SHARE - currentRetargeting;
      const addPerRetargeting = deficit / retargetingIds.length;
      for (const id of retargetingIds) {
        shares.set(id, (shares.get(id) ?? 0) + addPerRetargeting);
      }
      // Subtract from cold campaigns proportionally
      const coldIds = campaigns
        .filter((c) => c.kind === 'cold_en' || c.kind === 'cold_es')
        .map((c) => c.id);
      const coldTotal = coldIds.reduce((s, id) => s + (shares.get(id) ?? 0), 0);
      if (coldTotal > 0) {
        for (const id of coldIds) {
          const weight = (shares.get(id) ?? 0) / coldTotal;
          shares.set(id, (shares.get(id) ?? 0) - deficit * weight);
        }
      }
    }
  }

  // --- 3. Cap per-campaign at MAX_SINGLE_CAMPAIGN_SHARE (only within multi-campaign kinds) ---
  // Re-normalise first so caps are applied to fresh proportions
  shares = normalise(shares);

  for (const kindIds of byKind.values()) {
    if (kindIds.length <= 1) continue; // single-campaign kinds are exempt

    for (const id of kindIds) {
      const share = shares.get(id) ?? 0;
      if (share > MAX_SINGLE_CAMPAIGN_SHARE) {
        const excess = share - MAX_SINGLE_CAMPAIGN_SHARE;
        shares.set(id, MAX_SINGLE_CAMPAIGN_SHARE);
        // Distribute excess to other campaigns in the same kind
        const peers = kindIds.filter((pid) => pid !== id);
        const peerTotal = peers.reduce((s, pid) => s + (shares.get(pid) ?? 0), 0);
        if (peerTotal > 0) {
          for (const pid of peers) {
            const weight = (shares.get(pid) ?? 0) / peerTotal;
            shares.set(pid, (shares.get(pid) ?? 0) + excess * weight);
          }
        }
      }
    }
  }

  // Final normalise to correct float drift
  return normalise(shares);
}

export {
  DEFAULT_SPLIT,
  RETARGETING_ACTIVE_SPLIT,
  MIN_EXPLORATION_SHARE,
  MIN_RETARGETING_SHARE,
  MAX_SINGLE_CAMPAIGN_SHARE,
};
