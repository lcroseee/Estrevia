import { pgTable, text, serial, real, jsonb, timestamp, boolean, date, unique, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { ChartResult } from '@/shared/types/astrology';

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email').notNull().unique(),
  consentAt: timestamp('consent_at', { withTimezone: true }),
  // Stripe integration
  stripeCustomerId: text('stripe_customer_id'),
  subscriptionTier: text('subscription_tier', { enum: ['free', 'premium'] })
    .notNull()
    .default('free'),
  subscriptionExpiresAt: timestamp('subscription_expires_at', { withTimezone: true }),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: text('plan', { enum: ['free', 'pro_monthly', 'pro_annual'] }).notNull().default('free'),
  subscriptionStatus: text('subscription_status', {
    enum: ['free', 'trialing', 'active', 'canceled', 'past_due', 'incomplete', 'unpaid'],
  }).default('free'),
  trialEnd: timestamp('trial_end', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  locale: text('locale', { enum: ['en', 'es'] }).notNull().default('en'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  marketingEmailOptIn: boolean('marketing_email_opt_in').notNull().default(true),
  emailUndeliverable: boolean('email_undeliverable').notNull().default(false),
});

// ---------------------------------------------------------------------------
// natal_charts
// ---------------------------------------------------------------------------
export const natalCharts = pgTable('natal_charts', {
  id: text('id').primaryKey(), // nanoid
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }), // nullable — temp charts
  name: text('name'), // optional user-defined name for saved charts
  status: text('status', { enum: ['temp', 'saved'] }).notNull().default('temp'),
  encryptedBirthData: text('encrypted_birth_data').notNull(), // AES-256-GCM
  houseSystem: text('house_system').notNull().default('Placidus'),
  ayanamsa: text('ayanamsa').notNull().default('lahiri'),
  chartData: jsonb('chart_data').$type<ChartResult>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// cosmic_passports
// ---------------------------------------------------------------------------
export const cosmicPassports = pgTable('cosmic_passports', {
  id: text('id').primaryKey(), // nanoid
  chartId: text('chart_id')
    .notNull()
    .references(() => natalCharts.id, { onDelete: 'cascade' }),
  sunSign: text('sun_sign').notNull(),
  moonSign: text('moon_sign').notNull(),
  ascendantSign: text('ascendant_sign'), // nullable — unknown birth time
  element: text('element').notNull(),
  rulingPlanet: text('ruling_planet').notNull(),
  rarityPercent: real('rarity_percent').notNull(),
  // locale: determines OG image language; default 'en' for rows created before T4.
  locale: text('locale', { enum: ['en', 'es'] }).notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// chart_readings — cached AI interpretations of natal charts.
// Keyed by (chart_id, locale) so EN + ES readings of the same chart coexist.
// Cascade-deletes when the underlying natal_chart is purged.
// ---------------------------------------------------------------------------
export const chartReadings = pgTable(
  'chart_readings',
  {
    id: text('id').primaryKey(), // nanoid
    chartId: text('chart_id')
      .notNull()
      .references(() => natalCharts.id, { onDelete: 'cascade' }),
    locale: text('locale', { enum: ['en', 'es'] }).notNull(),
    body: text('body').notNull(),
    model: text('model').notNull().default('claude-sonnet-4-20250514'),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqChartLocale: uniqueIndex('chart_readings_chart_locale_uniq').on(
      t.chartId,
      t.locale,
    ),
  }),
);

export type ChartReading = typeof chartReadings.$inferSelect;

// ---------------------------------------------------------------------------
// waitlist_entries
// ---------------------------------------------------------------------------
// Retention policy (GDPR Art. 5(1)(e) — storage limitation):
//   Waitlist e-mail addresses are personal data. Entries are retained for
//   90 days from `created_at`. The cron `/api/cron/cleanup-temp-charts`
//   (schedule: `0 3 * * *`) deletes rows older than 90 days every night.
//   Users who register are migrated to `users.email`; orphaned waitlist
//   rows after 90 days are purged.
// ---------------------------------------------------------------------------
export const waitlistEntries = pgTable('waitlist_entries', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  source: text('source').notNull().default('organic'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// synastry_results
// ---------------------------------------------------------------------------
export const synastryResults = pgTable('synastry_results', {
  id: text('id').primaryKey(), // nanoid
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  chart1Id: text('chart1_id')
    .notNull()
    .references(() => natalCharts.id, { onDelete: 'cascade' }),
  chart2Id: text('chart2_id')
    .notNull()
    .references(() => natalCharts.id, { onDelete: 'cascade' }),
  overallScore: real('overall_score').notNull(),
  categoryScores: jsonb('category_scores').notNull(),
  aspects: jsonb('aspects').notNull(),
  aiAnalysis: text('ai_analysis'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// tarot_readings
// ---------------------------------------------------------------------------
export const tarotReadings = pgTable('tarot_readings', {
  id: text('id').primaryKey(), // nanoid
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  spreadType: text('spread_type', { enum: ['daily', 'three_card', 'celtic_cross'] }).notNull(),
  cards: jsonb('cards').notNull(), // array of {position, cardId, reversed}
  aiInterpretation: text('ai_interpretation'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// daily_cards
// ---------------------------------------------------------------------------
export const dailyCards = pgTable('daily_cards', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  cardId: text('card_id').notNull(),
  reversed: boolean('reversed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('daily_cards_user_date_unique').on(table.userId, table.date),
]);

// ---------------------------------------------------------------------------
// push_subscriptions
// ---------------------------------------------------------------------------
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// usage_counters — per-user free-tier feature usage (daily/monthly)
// ---------------------------------------------------------------------------
export const usageCounters = pgTable('usage_counters', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  feature: text('feature').notNull(), // e.g. 'synastry', 'avatar'
  periodKey: text('period_key').notNull(), // e.g. '2026-04-19' or '2026-04'
  count: integer('count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('usage_counters_user_feature_period_unique').on(table.userId, table.feature, table.periodKey),
]);

// ---------------------------------------------------------------------------
// notification_preferences
// ---------------------------------------------------------------------------
export const notificationPreferences = pgTable('notification_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  dailyMoonPhase: boolean('daily_moon_phase').notNull().default(false),
  fullNewMoon: boolean('full_new_moon').notNull().default(false),
  planetaryHourChange: boolean('planetary_hour_change').notNull().default(false),
  weeklyDigest: boolean('weekly_digest').notNull().default(false),
  preferredTime: text('preferred_time').notNull().default('08:00'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// processed_stripe_events — webhook idempotency deduplication table
// ---------------------------------------------------------------------------
export const processedStripeEvents = pgTable('processed_stripe_events', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// advertising_decisions  — append-only audit log of every agent decision
// ---------------------------------------------------------------------------
export const advertisingDecisions = pgTable('advertising_decisions', {
  id: text('id').primaryKey(), // nanoid
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  adId: text('ad_id').notNull(),
  action: text('action', {
    enum: ['pause', 'scale_up', 'scale_down', 'maintain', 'duplicate', 'hold'],
  }).notNull(),
  deltaBudgetUsd: real('delta_budget_usd'),
  reason: text('reason').notNull(),
  reasoningTier: text('reasoning_tier', {
    enum: ['tier_1_rules', 'tier_2_bayesian', 'tier_3_anomaly'],
  }).notNull(),
  confidence: real('confidence').notNull(),
  metricsSnapshot: jsonb('metrics_snapshot').notNull(),
  applied: boolean('applied').notNull().default(false),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  applyError: text('apply_error'),
  metaResponse: jsonb('meta_response'),
}, (table) => [
  index('adv_decisions_timestamp_idx').on(table.timestamp),
  index('adv_decisions_ad_id_idx').on(table.adId),
]);

// ---------------------------------------------------------------------------
// advertising_brand_voice_scores  — weekly Claude audit results, append-only.
// Rows from one audit run share a run_id. /status?include=brand_voice reads
// the most recent run by reviewedByClaudeAt.
// ---------------------------------------------------------------------------
export const advertisingBrandVoiceScores = pgTable('advertising_brand_voice_scores', {
  id: text('id').primaryKey(), // nanoid
  runId: text('run_id').notNull(),
  adId: text('ad_id').notNull(),
  depth: real('depth').notNull(),
  scientific: real('scientific').notNull(),
  respectful: real('respectful').notNull(),
  noManipulation: boolean('no_manipulation').notNull(),
  overall: real('overall').notNull(),
  needsReview: boolean('needs_review').notNull(),
  reviewedByClaudeAt: timestamp('reviewed_by_claude_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('abv_run_id_idx').on(table.runId),
  index('abv_reviewed_at_idx').on(table.reviewedByClaudeAt),
]);

// ---------------------------------------------------------------------------
// advertising_creatives  — generated creative bundles awaiting review/upload
// ---------------------------------------------------------------------------
export const advertisingCreatives = pgTable('advertising_creatives', {
  id: text('id').primaryKey(), // nanoid
  hookTemplateId: text('hook_template_id').notNull(),
  assetUrl: text('asset_url').notNull(),
  assetKind: text('asset_kind', { enum: ['image', 'video'] }).notNull(),
  generator: text('generator').notNull(),
  costUsd: real('cost_usd').notNull(),
  copy: text('copy').notNull(),
  cta: text('cta').notNull(),
  locale: text('locale', { enum: ['en', 'es'] }).notNull(),
  status: text('status', {
    enum: ['pending_review', 'approved', 'rejected', 'uploaded', 'live', 'paused'],
  }).notNull().default('pending_review'),
  safetyChecks: jsonb('safety_checks').notNull().default([]),
  metaAdId: text('meta_ad_id'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('adv_creatives_status_idx').on(table.status),
  index('adv_creatives_meta_ad_id_idx').on(table.metaAdId),
]);

// ---------------------------------------------------------------------------
// advertising_feature_gates  — runtime feature-gate state per agent component
// ---------------------------------------------------------------------------
export const advertisingFeatureGates = pgTable('advertising_feature_gates', {
  featureId: text('feature_id').primaryKey(),
  mode: text('mode', {
    enum: ['off', 'shadow', 'active_proposal', 'active_auto', 'stub'],
  }).notNull(),
  activationCriteria: jsonb('activation_criteria').notNull(),
  currentState: jsonb('current_state').notNull().default({}),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// advertising_spend_daily  — daily spend tracking for hard cap enforcement
// ---------------------------------------------------------------------------
export const advertisingSpendDaily = pgTable('advertising_spend_daily', {
  date: text('date').primaryKey(), // YYYY-MM-DD UTC
  spentUsd: real('spent_usd').notNull().default(0),
  capUsd: real('cap_usd').notNull(),
  triggeredHalt: boolean('triggered_halt').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// advertising_audiences  — Meta Custom Audiences managed by the agent
// ---------------------------------------------------------------------------
export const advertisingAudiences = pgTable('advertising_audiences', {
  id: text('id').primaryKey(), // nanoid
  kind: text('kind', {
    enum: ['exclusion', 'retargeting_calc_no_register', 'retargeting_register_no_paid', 'lookalike_seed'],
  }).notNull(),
  metaAudienceId: text('meta_audience_id'),
  size: integer('size').notNull().default(0),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull().defaultNow(),
  sourceQuery: text('source_query').notNull(),
  activeInCampaigns: jsonb('active_in_campaigns').notNull().default([]),
});

// ---------------------------------------------------------------------------
// advertising_shadow_comparisons  — shadow-mode vs active decision comparison
// ---------------------------------------------------------------------------
export const advertisingShadowComparisons = pgTable('advertising_shadow_comparisons', {
  id: text('id').primaryKey(), // nanoid
  date: text('date').notNull(),
  adId: text('ad_id').notNull(),
  activeDecision: text('active_decision').notNull(),
  shadowDecision: text('shadow_decision').notNull(),
  agreement: boolean('agreement').notNull(),
  outcomeBetter: text('outcome_better', { enum: ['active', 'shadow', 'tie', 'unknown'] }),
  shadowComponent: text('shadow_component').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// advertising_recon_state  — singleton row tracking reconciler suspend state
// ---------------------------------------------------------------------------
//
// When the reconciler detects critical_drift between Meta clicks and PostHog
// landing_view counts (>= 25%), the agent suspends all non-emergency
// decisions for 24h auto-resume. The founder can override via the admin UI
// at /admin/advertising/recon-state.
//
// Singleton-row pattern: id defaults to 'singleton'; the table holds at most
// one row. The seed migration inserts the initial row with suspended=false.
// ---------------------------------------------------------------------------
export const advertisingReconState = pgTable('advertising_recon_state', {
  id: text('id').primaryKey().default('singleton'),
  suspended: boolean('suspended').notNull().default(false),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  suspendReason: text('suspend_reason'),
  autoResumeAt: timestamp('auto_resume_at', { withTimezone: true }),
  lastDriftPct: real('last_drift_pct'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// advertising_ad_set_state — current phase + maturity + counters per ad set
// ---------------------------------------------------------------------------
export const advertisingAdSetState = pgTable('advertising_ad_set_state', {
  adSetId: text('ad_set_id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  locale: text('locale').notNull(),
  currentPhase: text('current_phase').notNull().default('A'),         // 'A' | 'B' | 'C' | 'D' | 'PAUSED' | 'RETIRED'
  phaseEnteredAt: timestamp('phase_entered_at', { withTimezone: true }).notNull().defaultNow(),
  dataMaturityMode: text('data_maturity_mode').notNull().default('COLD_START'),  // 'COLD_START' | 'CALIBRATING' | 'AUTONOMOUS'
  maturityEnteredAt: timestamp('maturity_entered_at', { withTimezone: true }).notNull().defaultNow(),
  optimizationEvent: text('optimization_event').notNull().default('landing_page_view'),
  conversions7dMeta: integer('conversions_7d_meta').notNull().default(0),
  conversions14dMeta: integer('conversions_14d_meta').notNull().default(0),
  conversionsTotalMeta: integer('conversions_total_meta').notNull().default(0),
  daysWithPixelData: integer('days_with_pixel_data').notNull().default(0),
  conversions7dPosthog: integer('conversions_7d_posthog').notNull().default(0),
  roas7d: real('roas_7d'),
  cpa7d: real('cpa_7d'),
  frequencyCurrent: real('frequency_current'),
  parentAdSetId: text('parent_ad_set_id'),
  duplicatesCount: integer('duplicates_count').notNull().default(0),
  lastActionTakenAt: timestamp('last_action_taken_at', { withTimezone: true }),
  flaggedForReview: boolean('flagged_for_review').notNull().default(false),
  flagReason: text('flag_reason'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  byCurrentPhase: index('idx_ad_set_state_current_phase').on(table.currentPhase),
  byDataMaturity: index('idx_ad_set_state_data_maturity').on(table.dataMaturityMode),
  byParent: index('idx_ad_set_state_parent').on(table.parentAdSetId),
  flagged: index('idx_ad_set_state_flagged').on(table.flaggedForReview).where(sql`${table.flaggedForReview} = true`),
}));

// ---------------------------------------------------------------------------
// advertising_ad_set_metric_history — daily snapshot for baselines + comparable-window
// ---------------------------------------------------------------------------
export const advertisingAdSetMetricHistory = pgTable('advertising_ad_set_metric_history', {
  id: text('id').primaryKey(),
  adSetId: text('ad_set_id').notNull(),
  date: text('date').notNull(),                       // YYYY-MM-DD UTC
  dayOfWeek: integer('day_of_week').notNull(),        // 0-6 for Tue-vs-Tue queries
  impressions: integer('impressions').notNull(),
  clicks: integer('clicks').notNull(),
  spendUsd: real('spend_usd').notNull(),
  ctr: real('ctr').notNull(),
  cpc: real('cpc').notNull(),
  cpm: real('cpm').notNull(),
  frequency: real('frequency').notNull(),
  conversionsMeta: integer('conversions_meta').notNull(),
  conversionsPosthog: integer('conversions_posthog').notNull(),
  revenueUsd: real('revenue_usd').notNull().default(0),
  roas: real('roas'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  byAdSetDate: uniqueIndex('uq_metric_history_adset_date').on(table.adSetId, table.date),
  byAdSetDow: index('idx_metric_history_adset_dow').on(table.adSetId, table.dayOfWeek),
}));

// ---------------------------------------------------------------------------
// advertising_ad_set_phase_transitions — append-only audit log
// ---------------------------------------------------------------------------
export const advertisingAdSetPhaseTransitions = pgTable('advertising_ad_set_phase_transitions', {
  id: text('id').primaryKey(),
  adSetId: text('ad_set_id').notNull(),
  transitionKind: text('transition_kind').notNull(),  // 'phase' | 'maturity'
  fromValue: text('from_value').notNull(),
  toValue: text('to_value').notNull(),
  reason: text('reason').notNull(),
  metricSnapshot: jsonb('metric_snapshot').notNull(),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  byAdSet: index('idx_phase_transitions_adset').on(table.adSetId, table.triggeredAt),
}));

// ---------------------------------------------------------------------------
// advertising_thresholds — DB-stored thresholds with code-default fallback (Q17)
// ---------------------------------------------------------------------------
export const advertisingThresholds = pgTable('advertising_thresholds', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),                     // 'global' | 'campaign' | 'ad_set'
  scopeId: text('scope_id'),                          // NULL for global; campaign_id or ad_set_id otherwise
  metricName: text('metric_name').notNull(),
  value: real('value').notNull(),
  source: text('source').notNull(),                   // 'default' | 'auto_calibrated' | 'founder_override'
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  baselineMetricSnapshot: jsonb('baseline_metric_snapshot'),
  changedBy: text('changed_by').notNull(),            // 'system_calibrator' | 'founder' | 'migration'
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  byScope: uniqueIndex('uq_thresholds_scope_metric_eff').on(
    table.scope, table.scopeId, table.metricName, table.effectiveFrom,
  ),
  byLookup: index('idx_thresholds_lookup').on(table.scope, table.scopeId, table.metricName, table.effectiveFrom),
}));

// ---------------------------------------------------------------------------
// sent_emails — idempotency + audit log for all outbound emails
// ---------------------------------------------------------------------------
export const sentEmails = pgTable('sent_emails', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailType: text('email_type', {
    enum: [
      'welcome',
      'purchase_confirmation',
      'subscription_canceled',
      'account_deletion',
      'trial_ending',
      're_engagement_28d',
    ],
  }).notNull(),
  resendMessageId: text('resend_message_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('sent_emails_oneshot_idx')
    .on(table.userId, table.emailType)
    .where(sql`${table.emailType} IN ('welcome', 'account_deletion')`),
  index('sent_emails_user_type_idx')
    .on(table.userId, table.emailType, table.sentAt),
]);

export type SentEmail = typeof sentEmails.$inferSelect;

// ---------------------------------------------------------------------------
// email_leads — anonymous email captures from the email-gate funnel
//
// Created when an anonymous visitor submits email after chart-calc.
// `email` is UNIQUE — INSERT ON CONFLICT DO NOTHING enforces idempotency.
// `email` is NOT encrypted: per CLAUDE.md, PII = birth date/time/location;
// email is auth-tier (already plaintext in `users.email`). GDPR consent is
// captured in the modal copy + handled by the `/unsubscribe` flow
// (extension to flip `unsubscribed_at` is a separate spec).
// ---------------------------------------------------------------------------
export const emailLeads = pgTable('email_leads', {
  id: text('id').primaryKey(), // nanoid
  email: text('email').notNull().unique(),
  chartId: text('chart_id'),
  locale: text('locale', { enum: ['en', 'es'] }).notNull().default('en'),
  source: text('source').notNull().default('hero_calculator'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmContent: text('utm_content'),
  utmTerm: text('utm_term'),
  anonymousId: text('anonymous_id'),
  ipAddressHash: text('ip_address_hash'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  convertedToUserId: text('converted_to_user_id'),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
  // Preparatory column — not used in this spec; populated by follow-up
  // /unsubscribe extension.
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  // Nurture drip state — set by /api/v1/leads waitUntil + /api/cron/lead-nurture
  nurtureStep: integer('nurture_step').notNull().default(0),
  nurtureNextAt: timestamp('nurture_next_at', { withTimezone: true }),
  emailUndeliverable: boolean('email_undeliverable').notNull().default(false),
}, (table) => [
  index('email_leads_created_at_idx').on(table.createdAt),
  index('email_leads_converted_to_user_id_idx').on(table.convertedToUserId),
  index('email_leads_nurture_due_idx')
    .on(table.nurtureNextAt)
    .where(sql`nurture_step < 6 AND converted_to_user_id IS NULL AND unsubscribed_at IS NULL AND email_undeliverable = false`),
]);

// ---------------------------------------------------------------------------
// sent_lead_emails — idempotency + audit log for nurture drip
// ---------------------------------------------------------------------------
export const sentLeadEmails = pgTable('sent_lead_emails', {
  id: serial('id').primaryKey(),
  leadId: text('lead_id')
    .notNull()
    .references(() => emailLeads.id, { onDelete: 'cascade' }),
  emailType: text('email_type', {
    enum: [
      'lead_chart',
      'lead_moon_asc',
      'lead_paywall_teaser',
      'lead_saturn_weekly',
      'lead_mini_reading',
      'lead_synastry_teaser',
    ],
  }).notNull(),
  resendMessageId: text('resend_message_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('sent_lead_emails_oneshot_idx').on(table.leadId, table.emailType),
  index('sent_lead_emails_lead_id_idx').on(table.leadId),
]);

export type SentLeadEmail = typeof sentLeadEmails.$inferSelect;
export type NewSentLeadEmail = typeof sentLeadEmails.$inferInsert;

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------
export type User = typeof users.$inferSelect;
export type NatalChart = typeof natalCharts.$inferSelect;
export type CosmicPassport = typeof cosmicPassports.$inferSelect;
export type SynastryResult = typeof synastryResults.$inferSelect;
export type TarotReading = typeof tarotReadings.$inferSelect;
export type DailyCard = typeof dailyCards.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type UsageCounter = typeof usageCounters.$inferSelect;
export type ProcessedStripeEvent = typeof processedStripeEvents.$inferSelect;
export type AdvertisingDecision = typeof advertisingDecisions.$inferSelect;
export type AdvertisingCreative = typeof advertisingCreatives.$inferSelect;
export type AdvertisingFeatureGate = typeof advertisingFeatureGates.$inferSelect;
export type AdvertisingSpendDaily = typeof advertisingSpendDaily.$inferSelect;
export type AdvertisingAudience = typeof advertisingAudiences.$inferSelect;
export type AdvertisingShadowComparison = typeof advertisingShadowComparisons.$inferSelect;
export type AdvertisingReconState = typeof advertisingReconState.$inferSelect;
export type AdvertisingAdSetState = typeof advertisingAdSetState.$inferSelect;
export type AdvertisingAdSetMetricHistory = typeof advertisingAdSetMetricHistory.$inferSelect;
export type AdvertisingAdSetPhaseTransition = typeof advertisingAdSetPhaseTransitions.$inferSelect;
export type AdvertisingThreshold = typeof advertisingThresholds.$inferSelect;
export type EmailLead = typeof emailLeads.$inferSelect;
