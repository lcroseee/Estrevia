import { pgTable, text, serial, real, jsonb, timestamp, boolean, date, unique, integer, index } from 'drizzle-orm/pg-core';
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
