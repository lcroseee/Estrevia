/**
 * A/B test assignment utilities.
 *
 * All assignment is deterministic (sha256-based hash), computed once at
 * record creation and stored in the DB. No runtime PostHog dependency.
 */

import { createHash } from 'node:crypto';

export type PaywallTeaserVariant = 'A' | 'B' | 'C';

const PAYWALL_TEASER_VARIANTS: PaywallTeaserVariant[] = ['A', 'B', 'C'];

/**
 * Assigns a paywall_teaser A/B test variant deterministically.
 *
 * Algorithm: sha256(leadId)[0] mod 3 → 'A' | 'B' | 'C'
 * - Same leadId always produces the same variant (replayable).
 * - Uniform distribution over a large population (~1/3 each).
 * - No external dependency at assignment time.
 *
 * NULL in DB means the row predates the experiment — excluded from analysis.
 * This function is called only at INSERT time for new leads.
 */
export function assignPaywallTeaserVariant(leadId: string): PaywallTeaserVariant {
  const hash = createHash('sha256').update(leadId).digest();
  const bucket = hash[0] % 3;
  return PAYWALL_TEASER_VARIANTS[bucket];
}
