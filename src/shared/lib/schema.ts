import { pgTable, text, serial, real, jsonb, timestamp } from 'drizzle-orm/pg-core';
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
export const waitlistEntries = pgTable('waitlist_entries', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  source: text('source').notNull().default('organic'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
