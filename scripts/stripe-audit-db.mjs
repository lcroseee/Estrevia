/**
 * DB portion of Stripe audit — 2026-05-24
 * READ-ONLY.
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// User stats
const userStats = await sql`
  SELECT
    COUNT(*) as total_users,
    COUNT(stripe_customer_id) as users_with_stripe_customer,
    COUNT(*) - COUNT(stripe_customer_id) as users_without_stripe_customer,
    COUNT(stripe_subscription_id) as users_with_stripe_sub_id,
    COUNT(CASE WHEN subscription_status NOT IN ('free') THEN 1 END) as users_with_non_free_status,
    COUNT(CASE WHEN plan != 'free' THEN 1 END) as users_with_paid_plan
  FROM users
`;

// Sub status distribution in DB
const subStatusDist = await sql`
  SELECT subscription_status, plan, COUNT(*) as count
  FROM users
  WHERE subscription_status != 'free' OR plan != 'free'
  GROUP BY subscription_status, plan
  ORDER BY count DESC
`;

// All users with non-free status — for cross-reference
const nonFreeUsers = await sql`
  SELECT id, email, stripe_customer_id, stripe_subscription_id,
         subscription_status, plan, trial_end, current_period_end,
         subscription_expires_at, created_at
  FROM users
  WHERE subscription_status != 'free' OR plan != 'free'
  ORDER BY created_at DESC
`;

// Recent users (14d)
const recentUsers = await sql`
  SELECT id, email, stripe_customer_id, stripe_subscription_id,
         subscription_status, plan, created_at, locale
  FROM users
  WHERE created_at >= NOW() - INTERVAL '14 days'
  ORDER BY created_at DESC
`;

// All users with stripe_customer_id
const usersWithStripe = await sql`
  SELECT id, email, stripe_customer_id, stripe_subscription_id,
         subscription_status, plan
  FROM users
  WHERE stripe_customer_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 50
`;

// Lead charts (email captures) in last 14d
let leadChartStats = null;
try {
  leadChartStats = await sql`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN resend_message_id IS NOT NULL THEN 1 END) as with_resend_id,
           COUNT(CASE WHEN resend_message_id IS NULL THEN 1 END) as without_resend_id,
           COUNT(CASE WHEN stripe_customer_id IS NOT NULL THEN 1 END) as with_stripe_id
    FROM lead_charts
    WHERE created_at >= NOW() - INTERVAL '14 days'
  `;
} catch (e) {
  leadChartStats = [{ error: e.message }];
}

const dbData = {
  user_stats: userStats[0],
  sub_status_dist: subStatusDist,
  non_free_users: nonFreeUsers,
  recent_users_14d: recentUsers,
  users_with_stripe_id: usersWithStripe.map(u => ({
    ...u,
    // keep email for cross-reference
  })),
  lead_chart_stats_14d: leadChartStats,
};

const outputPath = path.resolve(__dirname, '../tmp/audit-2026-05-24/stripe-db.json');
fs.writeFileSync(outputPath, JSON.stringify(dbData, null, 2));
console.log('User stats:', JSON.stringify(userStats[0], null, 2));
console.log('Sub status dist:', JSON.stringify(subStatusDist, null, 2));
console.log('Non-free users:', nonFreeUsers.length);
console.log('Recent users (14d):', recentUsers.length);
console.log(`Data written to: ${outputPath}`);
