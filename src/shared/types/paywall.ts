/**
 * Identifier for the paywall trigger surface — where the user clicked the
 * CTA. Used to (a) select contextual modal headline copy and (b) add a
 * `trigger` dimension to paywall analytics events for per-surface funnel
 * analysis.
 *
 * Kebab-case values match repo conventions for analytics props and UTM
 * parameters. In i18n keys, the dot-safe camelCase variant is used (e.g.
 * `paywall.contextualTitles.celticCross`).
 */
export type PaywallTrigger =
  | 'essay'
  | 'celtic-cross'
  | 'three-card'
  | 'synastry-ai'
  | 'natal-chart'
  | 'generic';
