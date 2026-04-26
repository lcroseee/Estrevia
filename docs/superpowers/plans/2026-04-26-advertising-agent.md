# Advertising Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous Meta Ads management agent for Estrevia, decomposed into 10 independent work streams that can be implemented in parallel by separate subagents after a sequential foundation phase.

**Architecture:** Modular agent (`perceive` → `decide` → `act` → `audit`) with provider-agnostic creative generation (Imagen/Veo/Nano Banana/Ideogram/Runway swappable behind interfaces), layered decision rules (deterministic Tier 1 active from day 1; Bayesian Tier 2 in shadow until ≥5K impressions/creative; LLM Tier 3 for anomaly explanation), feature-gated activation based on data thresholds, hard spend caps, append-only audit log, and Telegram-based founder oversight. EN+ES parallel campaigns (70/30 split).

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), Drizzle ORM (PostgreSQL/Neon), Vitest, Vercel Cron, Vercel Functions (Fluid Compute), Meta Marketing API v22, Gemini Imagen 4 + Veo 3.1, Claude API (Anthropic SDK), Telegram Bot API, PostHog, Stripe webhooks, `@vercel/og` (Satori), Sharp (image post-processing), Upstash Redis (rate limiting + cache).

---

## Execution Strategy

```
                  ┌─────────────────────────────┐
                  │  PHASE 1: FOUNDATION (SEQ)  │
                  │  Types + schemas + stubs    │
                  │  ~1 day, BLOCKS all streams │
                  └──────────────┬──────────────┘
                                 │
       ┌───────┬───────┬─────────┼─────────┬───────┬───────┐
       │       │       │         │         │       │       │
   ┌───▼─┐ ┌──▼──┐ ┌──▼──┐ ┌────▼──┐ ┌────▼──┐ ┌─▼─┐ ┌──▼───┐
   │ S1  │ │ S2  │ │ S3  │ │  S4   │ │  S5   │ │S6 │ │ S7-10│
   │Perc.│ │GenA │ │GenB │ │ GenC  │ │ Aud   │ │Dec│ │ ...  │
   └───┬─┘ └──┬──┘ └──┬──┘ └────┬──┘ └────┬──┘ └─┬─┘ └──┬───┘
       │      │       │         │         │       │      │
       └──────┴───────┴─────────┼─────────┴───────┴──────┘
                                │
                  ┌─────────────▼──────────────┐
                  │  PHASE 3: INTEGRATION (SEQ)│
                  │  Wire-up + e2e + verify    │
                  │  ~1.5 days                 │
                  └────────────────────────────┘
```

### 10 Parallel Streams (start after Foundation completes)

| # | Stream | Files Owned | Estimate |
|---|--------|-------------|----------|
| 1 | Perceive Layer | `perceive/*` | 1.5 days |
| 2 | Creative Gen — Generators | `creative-gen/generators/*` | 1.5 days |
| 3 | Creative Gen — Templates & Composition | `creative-gen/{templates,composition}/*` | 1.5 days |
| 4 | Creative Gen — Safety, Batch, Upload | `creative-gen/{safety,batch,upload}/*` | 1.5 days |
| 5 | Audiences (Exclusions + Retargeting) | `audiences/*` | 1.5 days |
| 6 | Decide — Rules + Anomaly + Budget | `decide/{tier-1,tier-3,cross-campaign,orchestrator}.ts` | 2 days |
| 7 | Decide — Bayesian + Brand Voice + Gates | `decide/{tier-2,brand-voice,feature-gates}.ts` | 2 days |
| 8 | Act + Safety + Audit | `act/*`, `safety/*`, `audit/*` | 1.5 days |
| 9 | Alerts + Cron Jobs | `alerts/*`, `app/api/cron/advertising/*` | 1.5 days |
| 10 | Admin UI | `app/admin/advertising/*` | 2 days |

### Coordination Rules

1. **No cross-stream code dependencies.** Each stream imports only from `src/shared/types/advertising/` (foundation) and stdlib/npm. Other modules' interfaces are mocked in tests.
2. **One stream owns each file.** No two streams touch the same file. Conflicts = bug in this plan.
3. **All inter-module communication via foundation types.** If Stream X needs a function from Stream Y, it imports the type from foundation and uses dependency injection (passed as constructor arg or function parameter), with mocks in tests.
4. **Each task ends with a commit.** Direct-to-main per project convention. Use clear commit messages prefixed with stream number: `feat(advertising/s3): ...`
5. **Test isolation.** No stream's tests touch real external APIs. Mock Meta/Gemini/Claude/Telegram/Stripe/PostHog APIs.

---

## Phase 1: Foundation (Sequential — ~1 day)

Must complete in order before any parallel stream starts. All 5 foundation tasks should be done by one engineer/agent, sequentially.

### Task F1: Shared types

**Files:**
- Create: `src/shared/types/advertising/index.ts`
- Create: `src/shared/types/advertising/perceive.ts`
- Create: `src/shared/types/advertising/decide.ts`
- Create: `src/shared/types/advertising/creative.ts`
- Create: `src/shared/types/advertising/audience.ts`
- Create: `src/shared/types/advertising/audit.ts`

- [ ] **Step 1: Create perceive types**

```typescript
// src/shared/types/advertising/perceive.ts

export interface AdMetric {
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  date: string; // YYYY-MM-DD UTC
  impressions: number;
  clicks: number;
  spend_usd: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  reach: number;
  days_running: number;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'DISAPPROVED';
}

export interface FunnelEvent {
  event_name: 'landing_view' | 'chart_calculated' | 'passport_shared'
    | 'user_registered' | 'paywall_view' | 'subscription_started';
  count: number;
  unique_users: number;
  conversion_from_previous: number; // 0..1
}

export interface FunnelSnapshot {
  window_start: Date;
  window_end: Date;
  source_filter?: { utm_source?: string; ad_id?: string };
  steps: FunnelEvent[];
}

export interface StripeAttribution {
  subscription_id: string;
  user_id: string;
  amount_usd: number;
  created_at: Date;
  utm_source?: string;
  utm_campaign?: string;
  utm_content?: string; // ad_id
  first_touch_source?: string;
}

export interface ReconciliationResult {
  meta_clicks: number;
  posthog_landings: number;
  delta_pct: number;
  status: 'match' | 'minor_drift' | 'critical_drift';
  threshold_minor: 0.10;
  threshold_critical: 0.25;
}
```

- [ ] **Step 2: Create decide types**

```typescript
// src/shared/types/advertising/decide.ts

import { AdMetric } from './perceive';

export type DecisionAction = 
  | 'pause' | 'scale_up' | 'scale_down' 
  | 'maintain' | 'duplicate' | 'hold';

export type DecisionTier = 'tier_1_rules' | 'tier_2_bayesian' | 'tier_3_anomaly';

export interface AdDecision {
  ad_id: string;
  action: DecisionAction;
  delta_budget_usd?: number;
  reason: string;
  reasoning_tier: DecisionTier;
  confidence: number; // 0..1
  metrics_snapshot: AdMetric;
}

export interface BayesianPosterior {
  ad_id: string;
  metric: 'ctr' | 'cpc' | 'conversion_rate';
  alpha: number;
  beta: number;
  mean: number;
  ci_95_lower: number;
  ci_95_upper: number;
  p_above_threshold: number;
  sample_size: number;
}

export interface FeatureGate {
  feature_id: string;
  mode: 'off' | 'shadow' | 'active_proposal' | 'active_auto';
  activation_criteria: {
    min_impressions_per_creative?: number;
    min_days_running?: number;
    min_paying_customers?: number;
    min_audience_size?: number;
    shadow_agreement_threshold?: number;
  };
  current_state: Record<string, number>;
  activated_at?: Date;
}

export interface BrandVoiceScore {
  ad_id: string;
  depth: number; // 1-10
  scientific: number; // 1-10
  respectful: number; // 1-10
  no_manipulation: boolean;
  overall: number; // weighted avg
  needs_review: boolean;
  reviewed_by_claude_at: Date;
}
```

- [ ] **Step 3: Create creative types**

```typescript
// src/shared/types/advertising/creative.ts

export type HookArchetype = 'identity_reveal' | 'authority' | 'rarity'
  | 'identity_continuation' | 'paywall_nudge';

export interface HookTemplate {
  id: string;
  name: string;
  archetype: HookArchetype;
  copy_template: string;
  visual_mood: string;
  duration_sec?: number;
  aspect_ratios: ('9:16' | '1:1' | '4:5')[];
  locale: 'en' | 'es';
  policy_constraints: string[];
}

export interface GeneratedAsset {
  id: string;
  kind: 'image' | 'video';
  generator: 'imagen-4-fast' | 'imagen-4-ultra' | 'nano-banana-2'
    | 'ideogram-3' | 'veo-3-1-lite' | 'runway-gen-4' | 'satori';
  prompt_used: string;
  url: string; // Vercel Blob URL
  width: number;
  height: number;
  duration_sec?: number;
  cost_usd: number;
  created_at: Date;
}

export interface SafetyCheckResult {
  check_name: string;
  passed: boolean;
  reason?: string;
  severity: 'info' | 'warning' | 'block';
}

export interface CreativeBundle {
  id: string;
  hook_template_id: string;
  asset: GeneratedAsset;
  copy: string;
  cta: string;
  locale: 'en' | 'es';
  status: 'pending_review' | 'approved' | 'rejected' | 'uploaded' | 'live' | 'paused';
  safety_checks: SafetyCheckResult[];
  approved_by?: string;
  approved_at?: Date;
  meta_ad_id?: string;
}

// Provider-agnostic interfaces — stream 2 implements concrete generators
export interface ImageGenerator {
  name: string;
  generate(prompt: string, opts: ImageGenOptions): Promise<GeneratedAsset>;
  cost_per_image_usd: number;
}

export interface VideoGenerator {
  name: string;
  generate(prompt: string, opts: VideoGenOptions): Promise<GeneratedAsset>;
  cost_per_second_usd: number;
}

export interface ImageGenOptions {
  aspect: '1:1' | '9:16' | '4:5';
  width: number;
  height: number;
  reference_images?: string[]; // for Nano Banana
}

export interface VideoGenOptions {
  aspect: '9:16' | '1:1' | '16:9';
  duration_sec: number;
  resolution: '720p' | '1080p';
  with_audio?: boolean;
}
```

- [ ] **Step 4: Create audience types**

```typescript
// src/shared/types/advertising/audience.ts

export type AudienceKind = 'exclusion' | 'retargeting_calc_no_register'
  | 'retargeting_register_no_paid' | 'lookalike_seed';

export interface CustomAudience {
  id: string;
  kind: AudienceKind;
  meta_audience_id?: string;
  size: number;
  last_refreshed_at: Date;
  source_query: string;
  active_in_campaigns: string[];
}

export interface AudienceMember {
  email_hash?: string; // SHA-256
  fbp?: string;
  fbc?: string;
  ip_hash?: string;
  external_id_hash?: string;
}
```

- [ ] **Step 5: Create audit types**

```typescript
// src/shared/types/advertising/audit.ts

import { AdDecision } from './decide';
import { CreativeBundle } from './creative';

export interface DecisionRecord {
  id: string;
  timestamp: Date;
  decision: AdDecision;
  applied: boolean;
  apply_error?: string;
  applied_at?: Date;
  meta_response?: unknown;
}

export interface CreativeAuditRecord {
  id: string;
  creative_bundle_id: string;
  event: 'generated' | 'reviewed' | 'approved' | 'rejected' | 'uploaded' | 'paused';
  actor: 'agent' | 'founder' | 'meta';
  details: Record<string, unknown>;
  timestamp: Date;
}

export interface SpendCapState {
  date: string; // YYYY-MM-DD UTC
  spent_usd: number;
  cap_usd: number;
  remaining_usd: number;
  triggered_halt: boolean;
}
```

- [ ] **Step 6: Create barrel export**

```typescript
// src/shared/types/advertising/index.ts

export * from './perceive';
export * from './decide';
export * from './creative';
export * from './audience';
export * from './audit';
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to advertising types.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types/advertising/
git commit -m "feat(advertising/foundation): add shared types for advertising agent"
```

---

### Task F2: Drizzle schemas

**Files:**
- Create: `src/server/db/schema/advertising.ts`
- Modify: `src/server/db/schema/index.ts` (add export)

- [ ] **Step 1: Define schema tables**

```typescript
// src/server/db/schema/advertising.ts

import { pgTable, uuid, text, integer, real, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

// Append-only audit log of every agent decision
export const advertisingDecisions = pgTable('advertising_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  ad_id: text('ad_id').notNull(),
  action: text('action', { 
    enum: ['pause', 'scale_up', 'scale_down', 'maintain', 'duplicate', 'hold'] 
  }).notNull(),
  delta_budget_usd: real('delta_budget_usd'),
  reason: text('reason').notNull(),
  reasoning_tier: text('reasoning_tier', { 
    enum: ['tier_1_rules', 'tier_2_bayesian', 'tier_3_anomaly'] 
  }).notNull(),
  confidence: real('confidence').notNull(),
  metrics_snapshot: jsonb('metrics_snapshot').notNull(),
  applied: boolean('applied').notNull().default(false),
  applied_at: timestamp('applied_at', { withTimezone: true }),
  apply_error: text('apply_error'),
  meta_response: jsonb('meta_response'),
}, (table) => ({
  timestampIdx: index('adv_decisions_timestamp_idx').on(table.timestamp),
  adIdIdx: index('adv_decisions_ad_id_idx').on(table.ad_id),
}));

export const advertisingCreatives = pgTable('advertising_creatives', {
  id: uuid('id').primaryKey().defaultRandom(),
  hook_template_id: text('hook_template_id').notNull(),
  asset_url: text('asset_url').notNull(),
  asset_kind: text('asset_kind', { enum: ['image', 'video'] }).notNull(),
  generator: text('generator').notNull(),
  cost_usd: real('cost_usd').notNull(),
  copy: text('copy').notNull(),
  cta: text('cta').notNull(),
  locale: text('locale', { enum: ['en', 'es'] }).notNull(),
  status: text('status', { 
    enum: ['pending_review', 'approved', 'rejected', 'uploaded', 'live', 'paused'] 
  }).notNull().default('pending_review'),
  safety_checks: jsonb('safety_checks').notNull().default([]),
  meta_ad_id: text('meta_ad_id'),
  approved_by: text('approved_by'),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('adv_creatives_status_idx').on(table.status),
  metaAdIdIdx: index('adv_creatives_meta_ad_id_idx').on(table.meta_ad_id),
}));

export const advertisingFeatureGates = pgTable('advertising_feature_gates', {
  feature_id: text('feature_id').primaryKey(),
  mode: text('mode', { 
    enum: ['off', 'shadow', 'active_proposal', 'active_auto', 'stub'] 
  }).notNull(),
  activation_criteria: jsonb('activation_criteria').notNull(),
  current_state: jsonb('current_state').notNull().default({}),
  activated_at: timestamp('activated_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const advertisingSpendDaily = pgTable('advertising_spend_daily', {
  date: text('date').primaryKey(), // YYYY-MM-DD UTC
  spent_usd: real('spent_usd').notNull().default(0),
  cap_usd: real('cap_usd').notNull(),
  triggered_halt: boolean('triggered_halt').notNull().default(false),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const advertisingAudiences = pgTable('advertising_audiences', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { 
    enum: ['exclusion', 'retargeting_calc_no_register', 'retargeting_register_no_paid', 'lookalike_seed'] 
  }).notNull(),
  meta_audience_id: text('meta_audience_id'),
  size: integer('size').notNull().default(0),
  last_refreshed_at: timestamp('last_refreshed_at', { withTimezone: true }).defaultNow().notNull(),
  source_query: text('source_query').notNull(),
  active_in_campaigns: jsonb('active_in_campaigns').notNull().default([]),
});

export const advertisingShadowComparisons = pgTable('advertising_shadow_comparisons', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: text('date').notNull(),
  ad_id: text('ad_id').notNull(),
  active_decision: text('active_decision').notNull(),
  shadow_decision: text('shadow_decision').notNull(),
  agreement: boolean('agreement').notNull(),
  outcome_better: text('outcome_better', { enum: ['active', 'shadow', 'tie', 'unknown'] }),
  shadow_component: text('shadow_component').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Add to schema barrel export**

In `src/server/db/schema/index.ts`, add:
```typescript
export * from './advertising';
```

- [ ] **Step 3: Generate migration**

Run: `npx drizzle-kit generate`
Expected: new migration file created in `src/server/db/migrations/`.

- [ ] **Step 4: Apply migration to dev DB**

Run: `npx drizzle-kit migrate`
Expected: migrations applied, tables exist.

- [ ] **Step 5: Verify with introspection query**

Run: `npx drizzle-kit introspect` and verify all 6 tables present.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema/advertising.ts src/server/db/schema/index.ts src/server/db/migrations/
git commit -m "feat(advertising/foundation): add Drizzle schemas for agent state"
```

---

### Task F3: Module directory structure with stubs

**Files:**
- Create: `src/modules/advertising/index.ts`
- Create: stub files for all 10 streams

- [ ] **Step 1: Create directory structure**

Run:
```bash
mkdir -p src/modules/advertising/{perceive,creative-gen,decide,act,audit,safety,audiences,alerts}
mkdir -p src/modules/advertising/creative-gen/{generators,templates,composition,safety,batch,upload}
```

- [ ] **Step 2: Create stub for each module**

For each module, create an `index.ts` with:

```typescript
// src/modules/advertising/perceive/index.ts (and analogous for each)

// TODO: Implementation in stream 1 (perceive)
export const PERCEIVE_MODULE_STUB = true;
```

Modules to stub:
- `perceive/index.ts`
- `creative-gen/generators/index.ts`
- `creative-gen/templates/index.ts`
- `creative-gen/composition/index.ts`
- `creative-gen/safety/index.ts`
- `creative-gen/batch/index.ts`
- `creative-gen/upload/index.ts`
- `decide/index.ts`
- `act/index.ts`
- `audit/index.ts`
- `safety/index.ts`
- `audiences/index.ts`
- `alerts/index.ts`

- [ ] **Step 3: Top-level barrel**

```typescript
// src/modules/advertising/index.ts

export * as perceive from './perceive';
export * as creativeGen from './creative-gen/generators';
export * as decide from './decide';
export * as act from './act';
export * as audit from './audit';
export * as safety from './safety';
export * as audiences from './audiences';
export * as alerts from './alerts';
```

- [ ] **Step 4: Verify imports**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/advertising/
git commit -m "feat(advertising/foundation): scaffold module directory with stubs"
```

---

### Task F4: Test infrastructure

**Files:**
- Create: `src/modules/advertising/__tests__/setup.ts`
- Create: `src/modules/advertising/__tests__/fixtures/index.ts`
- Create: `src/modules/advertising/__tests__/mocks/meta-api.ts`
- Create: `src/modules/advertising/__tests__/mocks/posthog.ts`
- Create: `src/modules/advertising/__tests__/mocks/stripe.ts`
- Create: `src/modules/advertising/__tests__/mocks/gemini.ts`
- Create: `src/modules/advertising/__tests__/mocks/claude.ts`
- Create: `src/modules/advertising/__tests__/mocks/telegram.ts`

- [ ] **Step 1: Create fixture data**

```typescript
// src/modules/advertising/__tests__/fixtures/index.ts

import { AdMetric, FunnelSnapshot, StripeAttribution } from '@/shared/types/advertising';

export const mockAdMetric = (overrides?: Partial<AdMetric>): AdMetric => ({
  ad_id: 'ad_test_001',
  adset_id: 'adset_test_001',
  campaign_id: 'campaign_test_001',
  date: '2026-04-26',
  impressions: 5247,
  clicks: 87,
  spend_usd: 18.40,
  ctr: 0.0166,
  cpc: 0.21,
  cpm: 3.51,
  frequency: 1.4,
  reach: 3748,
  days_running: 7,
  status: 'ACTIVE',
  ...overrides,
});

export const mockFunnelSnapshot = (overrides?: Partial<FunnelSnapshot>): FunnelSnapshot => ({
  window_start: new Date('2026-04-25T00:00:00Z'),
  window_end: new Date('2026-04-26T00:00:00Z'),
  steps: [
    { event_name: 'landing_view', count: 87, unique_users: 87, conversion_from_previous: 1.0 },
    { event_name: 'chart_calculated', count: 39, unique_users: 39, conversion_from_previous: 0.45 },
    { event_name: 'passport_shared', count: 5, unique_users: 5, conversion_from_previous: 0.13 },
    { event_name: 'user_registered', count: 7, unique_users: 7, conversion_from_previous: 0.18 },
    { event_name: 'paywall_view', count: 6, unique_users: 6, conversion_from_previous: 0.86 },
    { event_name: 'subscription_started', count: 1, unique_users: 1, conversion_from_previous: 0.17 },
  ],
  ...overrides,
});

export const mockStripeAttribution = (overrides?: Partial<StripeAttribution>): StripeAttribution => ({
  subscription_id: 'sub_test_001',
  user_id: 'user_test_001',
  amount_usd: 9.99,
  created_at: new Date('2026-04-25T15:30:00Z'),
  utm_source: 'meta',
  utm_campaign: 'estrevia_launch_en',
  utm_content: 'ad_test_001',
  first_touch_source: 'meta',
  ...overrides,
});
```

- [ ] **Step 2: Mock Meta Marketing API**

```typescript
// src/modules/advertising/__tests__/mocks/meta-api.ts

import { vi } from 'vitest';
import { mockAdMetric } from '../fixtures';

export const mockMetaApi = () => ({
  getInsights: vi.fn().mockResolvedValue([mockAdMetric()]),
  pauseAd: vi.fn().mockResolvedValue({ success: true }),
  scaleBudget: vi.fn().mockResolvedValue({ success: true }),
  duplicateAd: vi.fn().mockResolvedValue({ ad_id: 'ad_new_001' }),
  uploadCreative: vi.fn().mockResolvedValue({ creative_id: 'cr_001', ad_id: 'ad_001' }),
  getAccountStatus: vi.fn().mockResolvedValue({ status: 'ACTIVE', disapproval_rate: 0.02 }),
  upsertCustomAudience: vi.fn().mockResolvedValue({ audience_id: 'aud_001' }),
});

export type MockMetaApi = ReturnType<typeof mockMetaApi>;
```

- [ ] **Step 3: Mock other external services**

Create analogous mocks for `posthog.ts`, `stripe.ts`, `gemini.ts`, `claude.ts`, `telegram.ts` following the same pattern: factory function that returns object with `vi.fn()` for each method, with sensible default return values.

```typescript
// src/modules/advertising/__tests__/mocks/gemini.ts

import { vi } from 'vitest';

export const mockGeminiApi = () => ({
  generateImage: vi.fn().mockResolvedValue({
    url: 'https://test.blob.vercel-storage.com/img-001.png',
    width: 1080,
    height: 1920,
    cost_usd: 0.06,
  }),
  generateVideo: vi.fn().mockResolvedValue({
    url: 'https://test.blob.vercel-storage.com/vid-001.mp4',
    width: 1080,
    height: 1920,
    duration_sec: 15,
    cost_usd: 0.75,
  }),
});

export type MockGeminiApi = ReturnType<typeof mockGeminiApi>;
```

```typescript
// src/modules/advertising/__tests__/mocks/claude.ts

import { vi } from 'vitest';

export const mockClaudeApi = () => ({
  moderationCheck: vi.fn().mockResolvedValue({ passed: true, reason: null }),
  brandVoiceScore: vi.fn().mockResolvedValue({
    depth: 8, scientific: 8, respectful: 9, no_manipulation: true, overall: 8.3,
  }),
  anomalyExplain: vi.fn().mockResolvedValue('Mercury retrograde started today'),
});
```

```typescript
// src/modules/advertising/__tests__/mocks/telegram.ts

import { vi } from 'vitest';

export const mockTelegramBot = () => ({
  sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
  sendApprovalRequest: vi.fn().mockResolvedValue({ approved: true }),
});
```

```typescript
// src/modules/advertising/__tests__/mocks/posthog.ts

import { vi } from 'vitest';
import { mockFunnelSnapshot } from '../fixtures';

export const mockPosthog = () => ({
  getFunnel: vi.fn().mockResolvedValue(mockFunnelSnapshot()),
  getEventsByUtm: vi.fn().mockResolvedValue([]),
});
```

```typescript
// src/modules/advertising/__tests__/mocks/stripe.ts

import { vi } from 'vitest';
import { mockStripeAttribution } from '../fixtures';

export const mockStripe = () => ({
  listSubscriptionsCreatedBetween: vi.fn().mockResolvedValue([mockStripeAttribution()]),
  listActiveCustomers: vi.fn().mockResolvedValue([{ email_hash: 'abc123', user_id: 'u1' }]),
});
```

- [ ] **Step 4: Test setup file**

```typescript
// src/modules/advertising/__tests__/setup.ts

import { afterEach, vi } from 'vitest';

afterEach(() => {
  vi.clearAllMocks();
});
```

- [ ] **Step 5: Verify Vitest picks up tests**

Run: `npx vitest run src/modules/advertising/`
Expected: 0 tests found (no tests yet), exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/modules/advertising/__tests__/
git commit -m "test(advertising/foundation): add mocks and fixtures for stream tests"
```

---

### Task F5: Environment variables + Cron schedule

**Files:**
- Modify: `.env.example`
- Modify: `vercel.ts` (or create if missing)

- [ ] **Step 1: Add ENV var template**

Append to `.env.example`:

```bash
# Advertising Agent
META_ACCESS_TOKEN="" # System User long-lived token
META_AD_ACCOUNT_ID="act_..."
META_BUSINESS_ID=""
META_PIXEL_ID=""
META_CAPI_TOKEN=""

GEMINI_API_KEY=""
IDEOGRAM_API_KEY="" # optional fallback
RUNWAY_API_KEY=""   # optional fallback

ANTHROPIC_API_KEY="" # for agent reasoning + brand voice

TELEGRAM_BOT_TOKEN=""
TELEGRAM_FOUNDER_CHAT_ID=""

# Hard caps (override per env if needed)
ADVERTISING_DAILY_SPEND_CAP_USD="80"
ADVERTISING_AGENT_ENABLED="false" # master kill switch
ADVERTISING_AGENT_DRY_RUN="true"  # log decisions, don't execute
```

- [ ] **Step 2: Add Cron schedule to vercel.ts**

```typescript
// vercel.ts (add to existing config)

import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  // ... existing config ...
  crons: [
    // existing crons preserved
    
    // Advertising agent
    { path: '/api/cron/advertising/triage-hourly', schedule: '0 * * * *' },
    { path: '/api/cron/advertising/triage-daily', schedule: '0 9 * * *' }, // 09:00 UTC
    { path: '/api/cron/advertising/retro-weekly', schedule: '0 9 * * 1' }, // Mondays 09:00 UTC
    { path: '/api/cron/advertising/audience-refresh', schedule: '0 6 * * *' }, // 06:00 UTC daily
    { path: '/api/cron/advertising/account-health-weekly', schedule: '0 10 * * 1' }, // Mondays
  ],
};
```

- [ ] **Step 3: Commit**

```bash
git add .env.example vercel.ts
git commit -m "chore(advertising/foundation): env vars + cron schedule"
```

---

## Phase 2: Parallel Streams (10 streams, ~5-7 days each in parallel)

After Foundation completes, **dispatch all 10 streams as separate subagents in parallel**. Each stream is self-contained and reads only from `src/shared/types/advertising/` foundation.

---

### Stream 1: Perceive Layer

**Owner files:** `src/modules/advertising/perceive/*`

**Goal:** Read metrics from Meta Insights API, PostHog, Stripe; reconcile sources; produce typed snapshots for decide layer.

#### Task 1.1: Meta Insights client

**Files:**
- Create: `src/modules/advertising/perceive/meta-insights.ts`
- Create: `src/modules/advertising/perceive/__tests__/meta-insights.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/modules/advertising/perceive/__tests__/meta-insights.test.ts

import { describe, it, expect } from 'vitest';
import { fetchMetaInsights } from '../meta-insights';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockAdMetric } from '../../__tests__/fixtures';

describe('fetchMetaInsights', () => {
  it('returns AdMetric[] for active ads in date range', async () => {
    const api = mockMetaApi();
    api.getInsights.mockResolvedValue([
      mockAdMetric({ ad_id: 'a1' }),
      mockAdMetric({ ad_id: 'a2' }),
    ]);

    const result = await fetchMetaInsights({
      apiClient: api,
      dateFrom: '2026-04-25',
      dateTo: '2026-04-26',
    });

    expect(result).toHaveLength(2);
    expect(result[0].ad_id).toBe('a1');
    expect(api.getInsights).toHaveBeenCalledWith({
      time_range: { since: '2026-04-25', until: '2026-04-26' },
      level: 'ad',
      fields: expect.arrayContaining(['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'frequency']),
    });
  });

  it('handles rate-limit errors with exponential backoff', async () => {
    const api = mockMetaApi();
    api.getInsights
      .mockRejectedValueOnce({ code: 17, message: 'rate limit' })
      .mockResolvedValueOnce([mockAdMetric()]);

    const result = await fetchMetaInsights({ apiClient: api, dateFrom: '2026-04-25', dateTo: '2026-04-26' });
    expect(result).toHaveLength(1);
    expect(api.getInsights).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test, verify fails**

Run: `npx vitest run src/modules/advertising/perceive/`
Expected: FAIL — `fetchMetaInsights` not defined.

- [ ] **Step 3: Implement minimal version**

```typescript
// src/modules/advertising/perceive/meta-insights.ts

import { AdMetric } from '@/shared/types/advertising';
import { MockMetaApi } from '../__tests__/mocks/meta-api';

interface FetchOptions {
  apiClient: MockMetaApi | RealMetaApi;
  dateFrom: string;
  dateTo: string;
}

export interface RealMetaApi {
  getInsights(opts: unknown): Promise<AdMetric[]>;
}

export async function fetchMetaInsights(opts: FetchOptions): Promise<AdMetric[]> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await opts.apiClient.getInsights({
        time_range: { since: opts.dateFrom, until: opts.dateTo },
        level: 'ad',
        fields: ['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm', 'frequency', 'reach'],
      });
    } catch (err: any) {
      if (err.code === 17 && attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 2 ** attempt * 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}
```

- [ ] **Step 4: Run test, verify passes**

Run: `npx vitest run src/modules/advertising/perceive/`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/advertising/perceive/
git commit -m "feat(advertising/s1): meta insights client with retry"
```

#### Task 1.2: PostHog funnel reader

**Files:**
- Create: `src/modules/advertising/perceive/posthog-funnel.ts`
- Create: `src/modules/advertising/perceive/__tests__/posthog-funnel.test.ts`

Test acceptance criteria (write tests first per TDD):
- Returns `FunnelSnapshot` for given window + UTM filter
- Conversion rates calculated correctly per step
- Handles empty result (no events) gracefully — returns snapshot with all counts=0

Implementation reads PostHog `/api/projects/:id/insights/funnels` endpoint. Use mocked `posthog` client in tests.

Steps follow same TDD pattern as Task 1.1 (test → fail → implement → pass → commit).

#### Task 1.3: Stripe attribution

**Files:**
- Create: `src/modules/advertising/perceive/stripe-attribution.ts`
- Create: `src/modules/advertising/perceive/__tests__/stripe-attribution.test.ts`

Test acceptance criteria:
- Lists subscriptions created in window
- Joins with `users` table to get utm_content (ad_id)
- Returns `StripeAttribution[]` with first_touch_source from cookie/localStorage forwarded server-side

#### Task 1.4: Reconciler

**Files:**
- Create: `src/modules/advertising/perceive/reconciler.ts`
- Create: `src/modules/advertising/perceive/__tests__/reconciler.test.ts`

Test acceptance criteria:
- Compares Meta clicks vs PostHog landing_view count
- Returns `ReconciliationResult` with delta_pct, status (`match` | `minor_drift` | `critical_drift`)
- Critical drift triggers Telegram alert (mock)

Implementation:

```typescript
export function reconcile(meta: AdMetric[], funnel: FunnelSnapshot): ReconciliationResult {
  const metaClicks = meta.reduce((acc, m) => acc + m.clicks, 0);
  const phLandings = funnel.steps.find(s => s.event_name === 'landing_view')?.count ?? 0;
  const delta_pct = phLandings === 0 ? 1.0 : Math.abs(metaClicks - phLandings) / phLandings;
  
  const status = delta_pct < 0.10 ? 'match'
    : delta_pct < 0.25 ? 'minor_drift'
    : 'critical_drift';

  return { meta_clicks: metaClicks, posthog_landings: phLandings, delta_pct, status, threshold_minor: 0.10, threshold_critical: 0.25 };
}
```

After all 4 tasks: integration test that wires perceive layer end-to-end with mocks.

---

### Stream 2: Creative Generation — Generators

**Owner files:** `src/modules/advertising/creative-gen/generators/*`

**Goal:** Provider-agnostic image and video generators implementing `ImageGenerator` and `VideoGenerator` interfaces from foundation.

#### Task 2.1: Imagen 4 implementation

**Files:**
- Create: `src/modules/advertising/creative-gen/generators/imagen.ts`
- Create: `src/modules/advertising/creative-gen/generators/__tests__/imagen.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// imagen.test.ts

import { describe, it, expect } from 'vitest';
import { ImagenUltra, ImagenFast } from '../imagen';
import { mockGeminiApi } from '../../../__tests__/mocks/gemini';

describe('ImagenUltra', () => {
  it('generates image with correct dimensions and cost', async () => {
    const api = mockGeminiApi();
    const gen = new ImagenUltra({ apiClient: api });

    const result = await gen.generate('cosmic background', { aspect: '9:16', width: 1080, height: 1920 });

    expect(result.kind).toBe('image');
    expect(result.generator).toBe('imagen-4-ultra');
    expect(result.cost_usd).toBe(0.06);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
  });
});

describe('ImagenFast', () => {
  it('costs $0.02 per image', async () => {
    const api = mockGeminiApi();
    const gen = new ImagenFast({ apiClient: api });

    const result = await gen.generate('background', { aspect: '1:1', width: 1080, height: 1080 });
    expect(result.cost_usd).toBe(0.02);
    expect(result.generator).toBe('imagen-4-fast');
  });
});
```

- [ ] **Step 2: Run, verify fails**

Run: `npx vitest run src/modules/advertising/creative-gen/`
Expected: FAIL — `ImagenUltra` not defined.

- [ ] **Step 3: Implement**

```typescript
// imagen.ts

import { ImageGenerator, ImageGenOptions, GeneratedAsset } from '@/shared/types/advertising';
import { v4 as uuidv4 } from 'uuid';

interface GeminiClient {
  generateImage(opts: { prompt: string; model: string; aspect: string }): Promise<{ url: string; width: number; height: number; cost_usd: number }>;
}

export class ImagenUltra implements ImageGenerator {
  name = 'imagen-4-ultra';
  cost_per_image_usd = 0.06;
  constructor(private deps: { apiClient: GeminiClient }) {}

  async generate(prompt: string, opts: ImageGenOptions): Promise<GeneratedAsset> {
    const result = await this.deps.apiClient.generateImage({
      prompt,
      model: 'imagen-4-ultra',
      aspect: opts.aspect,
    });
    return {
      id: uuidv4(),
      kind: 'image',
      generator: 'imagen-4-ultra',
      prompt_used: prompt,
      url: result.url,
      width: result.width,
      height: result.height,
      cost_usd: this.cost_per_image_usd,
      created_at: new Date(),
    };
  }
}

export class ImagenFast implements ImageGenerator {
  name = 'imagen-4-fast';
  cost_per_image_usd = 0.02;
  constructor(private deps: { apiClient: GeminiClient }) {}

  async generate(prompt: string, opts: ImageGenOptions): Promise<GeneratedAsset> {
    const result = await this.deps.apiClient.generateImage({
      prompt, model: 'imagen-4-fast', aspect: opts.aspect,
    });
    return {
      id: uuidv4(), kind: 'image', generator: 'imagen-4-fast',
      prompt_used: prompt, url: result.url, width: result.width, height: result.height,
      cost_usd: this.cost_per_image_usd, created_at: new Date(),
    };
  }
}
```

- [ ] **Step 4: Run, verify passes**

Run: `npx vitest run src/modules/advertising/creative-gen/`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/advertising/creative-gen/generators/
git commit -m "feat(advertising/s2): Imagen 4 Ultra/Fast generators"
```

#### Task 2.2: Veo 3.1 Lite video generator

**Files:**
- Create: `src/modules/advertising/creative-gen/generators/veo.ts`
- Create: `src/modules/advertising/creative-gen/generators/__tests__/veo.test.ts`

Acceptance: implements `VideoGenerator`, cost = $0.05/sec for 720p, $0.08/sec for 1080p, generates 8-15 sec videos with audio. Same TDD pattern.

#### Task 2.3: Nano Banana 2 (style consistency)

**Files:**
- Create: `src/modules/advertising/creative-gen/generators/nano-banana.ts`
- Create: `src/modules/advertising/creative-gen/generators/__tests__/nano-banana.test.ts`

Acceptance: implements `ImageGenerator`, accepts up to 14 reference images via `opts.reference_images`, used for batch generation with style consistency.

#### Task 2.4: Optional fallbacks (Ideogram + Runway)

**Files:**
- Create: `src/modules/advertising/creative-gen/generators/ideogram.ts`
- Create: `src/modules/advertising/creative-gen/generators/runway.ts`
- Create test files

Acceptance: implementations gated on env vars `IDEOGRAM_API_KEY` and `RUNWAY_API_KEY`. Throw informative error if key missing. Used for in-image text composition (Ideogram) and narrative video (Runway).

#### Task 2.5: Generator factory + barrel

**File:** `src/modules/advertising/creative-gen/generators/index.ts`

```typescript
export * from './imagen';
export * from './veo';
export * from './nano-banana';
export * from './ideogram';
export * from './runway';

import type { ImageGenerator, VideoGenerator } from '@/shared/types/advertising';
import { ImagenFast, ImagenUltra } from './imagen';
import { VeoLite } from './veo';
import { NanoBanana2 } from './nano-banana';
// ...

export function getDefaultImageGenerator(deps: any, opts?: { batchMode?: boolean }): ImageGenerator {
  if (opts?.batchMode) return new NanoBanana2(deps);
  return new ImagenUltra(deps);
}

export function getDefaultVideoGenerator(deps: any): VideoGenerator {
  return new VeoLite(deps);
}
```

---

### Stream 3: Creative Generation — Templates & Composition

**Owner files:** `src/modules/advertising/creative-gen/templates/*`, `src/modules/advertising/creative-gen/composition/*`

**Goal:** Hook templates (EN+ES), Cosmic Passport rendering via Satori, text overlay composition via Sharp.

#### Task 3.1: Hook templates (EN)

**Files:**
- Create: `src/modules/advertising/creative-gen/templates/hooks-en.ts`
- Create: `src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { hooksEn, getHookTemplate } from '../hooks-en';

describe('hooks-en', () => {
  it('contains 3 archetypes: identity_reveal, authority, rarity', () => {
    const archetypes = new Set(hooksEn.map(h => h.archetype));
    expect(archetypes).toContain('identity_reveal');
    expect(archetypes).toContain('authority');
    expect(archetypes).toContain('rarity');
  });

  it('all hooks use third-person framing (no "you are not")', () => {
    for (const h of hooksEn) {
      expect(h.copy_template.toLowerCase()).not.toMatch(/you are not|you're not/);
    }
  });

  it('all hooks have policy_constraints documented', () => {
    for (const h of hooksEn) {
      expect(h.policy_constraints.length).toBeGreaterThan(0);
    }
  });

  it('getHookTemplate returns correct hook by id', () => {
    const t = getHookTemplate('en-identity-reveal-1');
    expect(t).toBeDefined();
    expect(t?.locale).toBe('en');
  });
});
```

- [ ] **Step 2: Run, verify fails**

- [ ] **Step 3: Implement**

```typescript
// hooks-en.ts

import { HookTemplate } from '@/shared/types/advertising';

export const hooksEn: HookTemplate[] = [
  {
    id: 'en-identity-reveal-1',
    name: 'Identity Reveal — Tropical vs Sidereal',
    archetype: 'identity_reveal',
    copy_template: 'Most apps show your tropical sign. The actual stars say something different.',
    visual_mood: 'shock-then-revelation, dark cosmic gradient with subtle star animation',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'no second-person personal claims',
      'no predictive language',
      'no fortune-telling framing',
      'NASA/Swiss Ephemeris claims must include citation',
    ],
  },
  {
    id: 'en-authority-1',
    name: 'Authority — Astronomical fact',
    archetype: 'authority',
    copy_template: 'The zodiac shifted ~24° due to Earth\'s axial precession. Most astrology apps still use the old positions.',
    visual_mood: 'documentary, factual, satellite imagery + zodiac overlay',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'en',
    policy_constraints: ['scientific framing', 'cite Swiss Ephemeris when claiming accuracy'],
  },
  {
    id: 'en-rarity-1',
    name: 'Rarity — Sun-Moon-Rising combo',
    archetype: 'rarity',
    copy_template: 'See how rare your sun-moon-rising combination is.',
    visual_mood: 'premium, badge-of-honor, Cosmic Passport prominent',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: ['rarity claims must be substantiated', 'no exclusionary language'],
  },
  // ... add 4-6 more variations per archetype
];

export function getHookTemplate(id: string): HookTemplate | undefined {
  return hooksEn.find(h => h.id === id);
}
```

- [ ] **Step 4: Run, verify passes**
- [ ] **Step 5: Commit**

#### Task 3.2: Hook templates (ES) — español neutro LATAM

**Files:**
- Create: `src/modules/advertising/creative-gen/templates/hooks-es.ts`
- Create: `src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts`

Test acceptance:
- Uses tú form (per `feedback_spanish_style` memory)
- Sign names NOT translated (Aries, Tauro keep familiar form)
- Planet names translated (Mercurio, Venus, Marte)
- Same 3 archetypes
- All in español neutro LATAM (no regional slang)

Example:
```typescript
{
  id: 'es-identity-reveal-1',
  copy_template: 'La mayoría de apps usan zodíaco tropical. Las estrellas dicen otra cosa.',
  // ...
}
```

#### Task 3.3: Cosmic Passport renderer (Satori)

**Files:**
- Create: `src/modules/advertising/creative-gen/composition/passport-satori.tsx`
- Create: `src/modules/advertising/creative-gen/composition/__tests__/passport-satori.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { renderPassportCard } from '../passport-satori';

describe('renderPassportCard', () => {
  it('returns PNG buffer for valid passport data', async () => {
    const png = await renderPassportCard({
      sun_sign: 'Pisces',
      moon_sign: 'Sagittarius',
      rising_sign: 'Capricorn',
      rarity_label: '1 of 247',
      rarity_pct: 0.4,
      locale: 'en',
      width: 1080,
      height: 1920,
    });
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(1000);
  });

  it('renders ES locale with translated planet names', async () => {
    const png = await renderPassportCard({
      sun_sign: 'Piscis', moon_sign: 'Sagitario', rising_sign: 'Capricornio',
      rarity_label: '1 de 247', rarity_pct: 0.4,
      locale: 'es', width: 1080, height: 1920,
    });
    expect(png).toBeInstanceOf(Buffer);
  });
});
```

- [ ] **Step 2-5: Implement using ReactDOMServer + Satori + sharp**

```typescript
// passport-satori.tsx

import satori from 'satori';
import sharp from 'sharp';
import { readFileSync } from 'fs';

interface PassportProps {
  sun_sign: string;
  moon_sign: string;
  rising_sign: string;
  rarity_label: string;
  rarity_pct: number;
  locale: 'en' | 'es';
  width: number;
  height: number;
}

const labels = {
  en: { sun: 'Sun', moon: 'Moon', rising: 'Rising', rare: 'Rarity' },
  es: { sun: 'Sol', moon: 'Luna', rising: 'Asc.', rare: 'Rareza' },
};

export async function renderPassportCard(props: PassportProps): Promise<Buffer> {
  const fontGeist = readFileSync('public/fonts/Geist-Bold.ttf');
  const fontCrimson = readFileSync('public/fonts/CrimsonPro-Regular.ttf');
  const l = labels[props.locale];

  const svg = await satori(
    <div style={{
      width: props.width, height: props.height,
      background: 'linear-gradient(180deg, #0A0A0F 0%, #1a1a2e 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#F5B945', fontFamily: 'Geist',
    }}>
      <div style={{ fontSize: 48, opacity: 0.7, marginBottom: 20 }}>
        {props.locale === 'en' ? 'COSMIC PASSPORT' : 'PASAPORTE CÓSMICO'}
      </div>
      <Row label={l.sun} sign={props.sun_sign} color="#F5B945" />
      <Row label={l.moon} sign={props.moon_sign} color="#D8D8E0" />
      <Row label={l.rising} sign={props.rising_sign} color="#9B7EBC" />
      <div style={{ marginTop: 60, fontSize: 32, opacity: 0.6 }}>
        {l.rare}: {props.rarity_label}
      </div>
    </div>,
    {
      width: props.width, height: props.height,
      fonts: [
        { name: 'Geist', data: fontGeist, weight: 700, style: 'normal' },
        { name: 'Crimson', data: fontCrimson, weight: 400, style: 'normal' },
      ],
    }
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function Row({ label, sign, color }: { label: string; sign: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 20 }}>
      <span style={{ fontSize: 36, color: '#888' }}>{label}</span>
      <span style={{ fontSize: 96, color, fontWeight: 700 }}>{sign}</span>
    </div>
  );
}
```

#### Task 3.4: Sharp-based text overlay composition

**Files:**
- Create: `src/modules/advertising/creative-gen/composition/sharp-overlay.ts`
- Create: `src/modules/advertising/creative-gen/composition/__tests__/sharp-overlay.test.ts`

Acceptance:
- Function `composeWithText(backgroundUrl, text, position, font)` returns PNG buffer
- Text is rendered as SVG, overlaid on AI-generated background
- 100% text accuracy (no AI-rendered text)
- Supports A/B variations: same background, multiple text overlays

---

### Stream 4: Creative Generation — Safety, Batch, Upload

**Owner files:** `src/modules/advertising/creative-gen/{safety,batch,upload}/*`

**Goal:** Pre-upload safety checks, batch generation orchestration, Meta upload pipeline.

#### Task 4.1: Pre-upload safety checks

**Files:**
- Create: `src/modules/advertising/creative-gen/safety/checks.ts`
- Create: `src/modules/advertising/creative-gen/safety/__tests__/checks.test.ts`

Acceptance:
- `metaAdPolicyCheck(creative, claudeClient)` — Claude reviews against Meta ad policies
- `personalClaimCheck(copy)` — regex+LLM detection of "you are/aren't" personal claims
- `ocrTextAccuracyCheck(image, expectedText)` — OCR via Tesseract.js, compare to expected
- `brandConsistencyCheck(creative)` — color palette + style match
- `controversialSymbolCheck(image)` — detect occult-coded imagery (pentagrams, inverted crosses)
- All return `SafetyCheckResult`
- Pipeline `runAllChecks(creative): Promise<SafetyCheckResult[]>` runs in parallel, blocks creative if any has severity='block'

```typescript
// checks.ts

import { CreativeBundle, SafetyCheckResult } from '@/shared/types/advertising';

export interface SafetyDeps {
  claudeClient: { moderationCheck: (input: string) => Promise<{ passed: boolean; reason?: string }> };
  ocrClient: { recognize: (url: string) => Promise<string> };
}

export async function personalClaimCheck(copy: string): Promise<SafetyCheckResult> {
  const personalPatterns = [
    /\byou are not\b/i, /\byou're not\b/i,
    /\byou will\b/i, /\byour future\b/i,
    /\byou deserve\b/i, /\byou know that\b/i,
  ];
  for (const p of personalPatterns) {
    if (p.test(copy)) {
      return { check_name: 'personal_claim', passed: false, severity: 'block', 
        reason: `Matches Meta-flagged pattern: ${p.source}` };
    }
  }
  return { check_name: 'personal_claim', passed: true, severity: 'info' };
}

export async function metaAdPolicyCheck(
  creative: CreativeBundle, deps: SafetyDeps
): Promise<SafetyCheckResult> {
  const result = await deps.claudeClient.moderationCheck(
    `Does this ad violate Meta's ad policy? Copy: "${creative.copy}". Check: ` +
    `personal attribute claims, predictive language, fortune-telling, sensational health/wealth, ` +
    `body parts, sensitive content. Reply JSON: {passed: bool, reason: string}.`
  );
  return {
    check_name: 'meta_ad_policy',
    passed: result.passed,
    severity: result.passed ? 'info' : 'block',
    reason: result.reason,
  };
}

// ... ocrTextAccuracyCheck, brandConsistencyCheck, controversialSymbolCheck (similar pattern)

export async function runAllChecks(
  creative: CreativeBundle, deps: SafetyDeps
): Promise<SafetyCheckResult[]> {
  const checks = await Promise.all([
    personalClaimCheck(creative.copy),
    metaAdPolicyCheck(creative, deps),
    // ...
  ]);
  return checks;
}
```

#### Task 4.2: Batch generation orchestrator

**Files:**
- Create: `src/modules/advertising/creative-gen/batch/generate-launch-set.ts`
- Create: `src/modules/advertising/creative-gen/batch/__tests__/generate-launch-set.test.ts`

Acceptance:
- CLI entry point: `npm run advertising:generate-launch-batch`
- Generates configurable batch (default: 11 EN + 11 ES = 22 creatives)
- For each: pick template → call generator → run safety checks → save to DB with status `pending_review`
- Outputs cost summary
- Emits Telegram notification when ready for review

#### Task 4.3: Meta upload pipeline

**Files:**
- Create: `src/modules/advertising/creative-gen/upload/meta-upload.ts`
- Create: `src/modules/advertising/creative-gen/upload/__tests__/meta-upload.test.ts`

Acceptance:
- `uploadApprovedCreative(bundle): Promise<{meta_ad_id: string}>`
- Only uploads if `bundle.status === 'approved'`
- Fails loudly if not approved
- Updates DB: status → `uploaded`, sets `meta_ad_id`
- Adds proper UTM tags + tracking pixels
- Groups creatives into correct campaign/adset by hook archetype + locale

---

### Stream 5: Audiences (Exclusions + Retargeting)

**Owner files:** `src/modules/advertising/audiences/*`

**Goal:** Custom Audience management — exclusions for paying/registered users, retargeting for funnel drop-offs.

#### Task 5.1: Exclusions audience

**Files:**
- Create: `src/modules/advertising/audiences/exclusions.ts`
- Create: `src/modules/advertising/audiences/__tests__/exclusions.test.ts`

Acceptance:
- `refreshExclusions(deps)` daily:
  1. Pull active subscribers from Stripe (mocked)
  2. Pull recently registered users from PostHog (mocked) — last 30 days
  3. Hash emails (SHA-256)
  4. Upsert to Meta Custom Audience via API (mocked)
  5. Update DB `advertising_audiences` row
  6. Returns `{audience_id, size}`
- Skipped if size < 100 (Meta minimum) — logs reason

#### Task 5.2: Retargeting audiences

**Files:**
- Create: `src/modules/advertising/audiences/retargeting.ts`
- Create: `src/modules/advertising/audiences/__tests__/retargeting.test.ts`

Acceptance:
- Two retargeting audiences: `calc_no_register` (14d window) and `register_no_paid` (30d window)
- Source query against PostHog events
- Same Meta upsert pattern
- Activated by feature gate when audience_size > 200

#### Task 5.3: Refresh cycle

**Files:**
- Create: `src/modules/advertising/audiences/refresh-cycle.ts`
- Create: `src/modules/advertising/audiences/__tests__/refresh-cycle.test.ts`

Acceptance:
- `runDailyAudienceRefresh()` orchestrates all audiences
- Called from `/api/cron/advertising/audience-refresh` (cron handler in Stream 9)
- Logs stats per audience
- Handles partial failures (one audience fails, others continue)

---

### Stream 6: Decide — Rules + Anomaly + Budget

**Owner files:** `src/modules/advertising/decide/{tier-1-rules,tier-3-anomaly,cross-campaign-budget,orchestrator}.ts`

**Goal:** Deterministic rules (Tier 1, active day 1), anomaly detection (Tier 3, shadow), cross-campaign budget allocation, decision orchestrator.

#### Task 6.1: Tier 1 hard rules

**Files:**
- Create: `src/modules/advertising/decide/tier-1-rules.ts`
- Create: `src/modules/advertising/decide/__tests__/tier-1-rules.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { applyTier1Rules } from '../tier-1-rules';
import { mockAdMetric } from '../../__tests__/fixtures';

describe('applyTier1Rules', () => {
  it('pauses ad when frequency > 4', () => {
    const m = mockAdMetric({ frequency: 4.3, days_running: 7 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toContain('frequency');
  });

  it('pauses ad when CPC > $5', () => {
    const m = mockAdMetric({ cpc: 5.20, days_running: 5 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toContain('cpc');
  });

  it('holds during learning phase (days_running < 2)', () => {
    const m = mockAdMetric({ days_running: 1, frequency: 5.0, cpc: 6.00 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('learning_phase');
  });

  it('maintains ad with healthy metrics', () => {
    const m = mockAdMetric({ frequency: 1.4, cpc: 1.20, ctr: 0.022, days_running: 5 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('maintain');
    expect(decision.reasoning_tier).toBe('tier_1_rules');
  });
});
```

- [ ] **Step 2-5: Implement, run, commit**

```typescript
// tier-1-rules.ts

import { AdMetric, AdDecision } from '@/shared/types/advertising';

const FREQUENCY_CAP = 4.0;
const CPC_HARD_CAP = 5.0;
const SPEND_DAILY_OVERAGE = 25.0;
const LEARNING_PHASE_DAYS = 2;

export function applyTier1Rules(m: AdMetric): AdDecision {
  const baseDecision = {
    ad_id: m.ad_id,
    metrics_snapshot: m,
    reasoning_tier: 'tier_1_rules' as const,
    confidence: 1.0, // deterministic
  };

  if (m.days_running < LEARNING_PHASE_DAYS) {
    return { ...baseDecision, action: 'hold', reason: 'learning_phase_protection' };
  }
  if (m.frequency >= FREQUENCY_CAP) {
    return { ...baseDecision, action: 'pause', reason: `frequency_${m.frequency.toFixed(1)}` };
  }
  if (m.cpc >= CPC_HARD_CAP) {
    return { ...baseDecision, action: 'pause', reason: `cpc_${m.cpc.toFixed(2)}` };
  }
  if (m.spend_usd >= SPEND_DAILY_OVERAGE) {
    return { ...baseDecision, action: 'pause', reason: `spend_overage_${m.spend_usd.toFixed(2)}` };
  }
  return { ...baseDecision, action: 'maintain', reason: 'within_tier_1_thresholds' };
}
```

#### Task 6.2: Tier 3 anomaly detection

**Files:**
- Create: `src/modules/advertising/decide/tier-3-anomaly.ts`
- Create: `src/modules/advertising/decide/__tests__/tier-3-anomaly.test.ts`

Acceptance:
- Maintains 30-day rolling baseline of CPC, CPM, CTR
- z-score > 3 → flag as anomaly
- Calls Claude API to explain (mocked) — passes context: "today is X, recent astro events: ..."
- If LLM says "expected event" (eclipse, retrograde) → recommend HOLD, not pause
- Returns `AdDecision` with reasoning_tier='tier_3_anomaly'
- Until 30 days baseline accumulated → mode='shadow', logs only

#### Task 6.3: Cross-campaign budget allocator

**Files:**
- Create: `src/modules/advertising/decide/cross-campaign-budget.ts`
- Create: `src/modules/advertising/decide/__tests__/cross-campaign-budget.test.ts`

Acceptance:
- Function `allocateDailyBudget(totalUsd, campaigns)` returns budget per campaign
- Default split: 70% EN cold, 30% ES cold initially
- After retargeting active: 55% cold winners, 25% retargeting, 15% exploration, 5% retargeting register-no-paid
- Constraints: exploration ≥15%, retargeting ≥10%, no single campaign >60%
- Output: `Map<campaignId, budgetUsd>`

#### Task 6.4: Orchestrator

**Files:**
- Create: `src/modules/advertising/decide/orchestrator.ts`
- Create: `src/modules/advertising/decide/__tests__/orchestrator.test.ts`

Acceptance:
- `decide(metrics, gates)` produces final `AdDecision[]`
- Calls Tier 1 always
- Calls Tier 2 if gate active (delegates to Stream 7's bayesian module)
- Calls Tier 3 if baseline accumulated
- If multiple tiers disagree, **highest authority wins**: Tier 1 > Tier 3 > Tier 2
- Returns decisions + shadow logs (for tiers in shadow mode)

---

### Stream 7: Decide — Bayesian + Brand Voice + Gates

**Owner files:** `src/modules/advertising/decide/{tier-2-bayesian,brand-voice-audit,feature-gates}.ts`

**Goal:** Bayesian decision engine, brand voice audit, feature gate manager.

#### Task 7.1: Bayesian engine

**Files:**
- Create: `src/modules/advertising/decide/tier-2-bayesian.ts`
- Create: `src/modules/advertising/decide/__tests__/tier-2-bayesian.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { computePosterior, decideBayesian } from '../tier-2-bayesian';
import { mockAdMetric } from '../../__tests__/fixtures';

describe('computePosterior', () => {
  it('returns Beta(α+k, β+n-k) for CTR', () => {
    const post = computePosterior({
      metric: 'ctr',
      successes: 80,
      trials: 5000,
      prior_alpha: 20,
      prior_beta: 1980,
    });
    expect(post.alpha).toBe(100);
    expect(post.beta).toBe(6900);
    expect(post.mean).toBeCloseTo(100 / 7000, 4);
  });

  it('produces wider CI for smaller samples', () => {
    const small = computePosterior({ metric: 'ctr', successes: 1, trials: 100, prior_alpha: 20, prior_beta: 1980 });
    const large = computePosterior({ metric: 'ctr', successes: 100, trials: 10000, prior_alpha: 20, prior_beta: 1980 });
    const smallWidth = small.ci_95_upper - small.ci_95_lower;
    const largeWidth = large.ci_95_upper - large.ci_95_lower;
    expect(smallWidth).toBeGreaterThan(largeWidth);
  });
});

describe('decideBayesian', () => {
  it('recommends scale when P(CTR > 2%) > 0.95', () => {
    const m = mockAdMetric({ impressions: 5000, clicks: 130 }); // CTR 2.6%
    const d = decideBayesian(m);
    expect(d.action).toBe('scale_up');
  });

  it('recommends pause when P(CTR < 1%) > 0.95', () => {
    const m = mockAdMetric({ impressions: 5000, clicks: 30 }); // CTR 0.6%
    const d = decideBayesian(m);
    expect(d.action).toBe('pause');
  });

  it('holds when uncertain (sample too small)', () => {
    const m = mockAdMetric({ impressions: 200, clicks: 4 });
    const d = decideBayesian(m);
    expect(d.action).toBe('hold');
  });
});
```

- [ ] **Step 2-5: Implement using `jstat` or hand-coded Beta CDF**

```typescript
// tier-2-bayesian.ts

import { AdMetric, AdDecision, BayesianPosterior } from '@/shared/types/advertising';
import jstat from 'jstat';

interface PosteriorInput {
  metric: 'ctr' | 'cpc' | 'conversion_rate';
  successes: number;
  trials: number;
  prior_alpha: number;
  prior_beta: number;
}

export function computePosterior(input: PosteriorInput): BayesianPosterior {
  const alpha = input.prior_alpha + input.successes;
  const beta = input.prior_beta + (input.trials - input.successes);
  const mean = alpha / (alpha + beta);
  const ci_95_lower = jstat.beta.inv(0.025, alpha, beta);
  const ci_95_upper = jstat.beta.inv(0.975, alpha, beta);
  return {
    ad_id: '', metric: input.metric, alpha, beta, mean,
    ci_95_lower, ci_95_upper,
    p_above_threshold: 0, // computed by caller
    sample_size: input.trials,
  };
}

const PRIOR_CTR = { alpha: 20, beta: 1980 }; // industry baseline ~1%
const SCALE_THRESHOLD_CTR = 0.02;
const PAUSE_THRESHOLD_CTR = 0.01;
const CONFIDENCE = 0.95;

export function decideBayesian(m: AdMetric): AdDecision {
  if (m.impressions < 1000) {
    return makeDecision(m, 'hold', 'insufficient_sample', 0);
  }

  const post = computePosterior({
    metric: 'ctr',
    successes: m.clicks,
    trials: m.impressions,
    prior_alpha: PRIOR_CTR.alpha,
    prior_beta: PRIOR_CTR.beta,
  });

  // P(CTR > scale_threshold)
  const pScale = 1 - jstat.beta.cdf(SCALE_THRESHOLD_CTR, post.alpha, post.beta);
  if (pScale > CONFIDENCE) {
    return makeDecision(m, 'scale_up', `bayesian_scale_p_${pScale.toFixed(2)}`, pScale);
  }

  const pPause = jstat.beta.cdf(PAUSE_THRESHOLD_CTR, post.alpha, post.beta);
  if (pPause > CONFIDENCE) {
    return makeDecision(m, 'pause', `bayesian_pause_p_${pPause.toFixed(2)}`, pPause);
  }

  return makeDecision(m, 'hold', 'bayesian_uncertain', Math.max(pScale, pPause));
}

function makeDecision(m: AdMetric, action: AdDecision['action'], reason: string, confidence: number): AdDecision {
  return {
    ad_id: m.ad_id, action, reason, confidence,
    reasoning_tier: 'tier_2_bayesian',
    metrics_snapshot: m,
    delta_budget_usd: action === 'scale_up' ? 5 : action === 'scale_down' ? -5 : undefined,
  };
}
```

#### Task 7.2: Brand voice audit

**Files:**
- Create: `src/modules/advertising/decide/brand-voice-audit.ts`
- Create: `src/modules/advertising/decide/__tests__/brand-voice-audit.test.ts`

Acceptance:
- `auditTopCreatives(creatives, claudeClient)` weekly
- Picks top 10 by spend last 7 days
- Calls Claude with brand voice rubric (depth/scientific/respectful 1-10 + no_manipulation bool)
- Returns `BrandVoiceScore[]`
- If avg < 7.5 OR any < 6 → flag `needs_review: true`
- Sends Telegram alert if drift detected (delegated to Stream 9)

#### Task 7.3: Feature gates manager

**Files:**
- Create: `src/modules/advertising/decide/feature-gates.ts`
- Create: `src/modules/advertising/decide/__tests__/feature-gates.test.ts`

Acceptance:
- `evaluateGates(state)`: reads `advertising_feature_gates` table, evaluates each criterion against current state, transitions modes (shadow → active_proposal → active_auto)
- Mode transitions logged to audit
- Founder approval flow: gate `mode='active_proposal'` requires N successful approvals before auto
- `currentMode(featureId)` accessor for orchestrator

```typescript
const featureGatesConfig = {
  bayesianDecisions: {
    initial_mode: 'shadow',
    activate_when: {
      min_impressions_per_creative: 5000,
      min_days_running: 14,
      shadow_agreement_threshold: 0.7,
    },
  },
  anomalyDetection: {
    initial_mode: 'shadow',
    activate_when: { min_days_of_baseline: 30 },
  },
  retargetingCampaigns: {
    initial_mode: 'off',
    activate_when: { min_audience_size: 200 },
  },
  exclusionsCampaigns: {
    initial_mode: 'off',
    activate_when: { min_audience_size: 100 },
  },
  // ...
};
```

---

### Stream 8: Act + Safety + Audit

**Owner files:** `src/modules/advertising/act/*`, `src/modules/advertising/safety/*`, `src/modules/advertising/audit/*`

**Goal:** Execute decisions via Meta API, enforce safety rails, append-only audit log.

#### Task 8.1: Act layer

**Files:**
- Create: `src/modules/advertising/act/meta-marketing.ts`
- Create: `src/modules/advertising/act/pause.ts`
- Create: `src/modules/advertising/act/scale.ts`
- Create: `src/modules/advertising/act/duplicate.ts`
- Create: `src/modules/advertising/act/__tests__/*.test.ts`

Acceptance:
- Each function takes `AdDecision` + Meta API client
- Pre-flight: checks `safety/spend-cap` allows action
- Pre-flight: checks `safety/kill-switch` not engaged
- Executes via Meta API (mocked)
- Writes audit record (success or failure)
- Updates DB
- Throws on safety violation; doesn't catch (let caller handle)

#### Task 8.2: Spend cap

**Files:**
- Create: `src/modules/advertising/safety/spend-cap.ts`
- Create: `src/modules/advertising/safety/__tests__/spend-cap.test.ts`

Acceptance:
- `checkSpendCap(plannedDeltaUsd): Promise<{allowed: boolean; reason?: string}>`
- Reads today's spent from Meta Insights (real-time, not cached) + `advertising_spend_daily` table
- Hard cap from env `ADVERTISING_DAILY_SPEND_CAP_USD`
- If `today + planned > cap` → block + Telegram alert
- Updates DB row

#### Task 8.3: Kill switch

**Files:**
- Create: `src/modules/advertising/safety/kill-switch.ts`
- Create: `src/modules/advertising/safety/__tests__/kill-switch.test.ts`

Acceptance:
- `isKillSwitchEngaged(): boolean` reads env `ADVERTISING_AGENT_ENABLED`
- If disabled, all act operations throw `KillSwitchError`
- Health check endpoint (Stream 9) surfaces this state

#### Task 8.4: Disapproval handler

**Files:**
- Create: `src/modules/advertising/safety/disapproval-notify.ts`
- Create: `src/modules/advertising/safety/__tests__/disapproval-notify.test.ts`

Acceptance:
- Webhook handler for Meta disapproval events
- Logs to audit
- Sends Telegram alert with: ad_id, reason from Meta, hook archetype
- Pauses related ad (no auto-fix — explicitly per scope decision)
- Tracks disapproval rate per `hook_archetype` for future feedback

#### Task 8.5: Audit log

**Files:**
- Create: `src/modules/advertising/audit/decision-log.ts`
- Create: `src/modules/advertising/audit/creative-log.ts`
- Create: `src/modules/advertising/audit/__tests__/*.test.ts`

Acceptance:
- `logDecision(decision, applied, error?)` writes to `advertising_decisions`
- `logCreativeEvent(bundleId, event, actor, details)` writes to creative audit
- Both append-only — no UPDATE/DELETE allowed (DB constraint or app-level)
- Query helpers: `getDecisionsForAd(adId, since)`, `getCreativeAudit(bundleId)`

---

### Stream 9: Alerts + Cron Jobs

**Owner files:** `src/modules/advertising/alerts/*`, `src/app/api/cron/advertising/*`

**Goal:** Telegram bot integration, drop-off monitoring, account health checks, all cron job HTTP handlers.

#### Task 9.1: Telegram bot

**Files:**
- Create: `src/modules/advertising/alerts/telegram-bot.ts`
- Create: `src/modules/advertising/alerts/__tests__/telegram-bot.test.ts`

Acceptance:
- Wrapper around Telegram Bot API
- `sendDailyDigest(report)` formats per spec (numbers + actions + shadow log + founder action)
- `sendAlert(severity, message)` for critical events
- `requestApproval(question, options)` returns Promise that resolves on user button click (with timeout, default 30 min for LOW_RISK, no timeout for HIGH_RISK)
- Auto-approve LOW_RISK after 4h timeout (configurable)

#### Task 9.2: Drop-off monitor

**Files:**
- Create: `src/modules/advertising/alerts/drop-off-monitor.ts`
- Create: `src/modules/advertising/alerts/__tests__/drop-off-monitor.test.ts`

Acceptance:
- Maintains 14-day rolling baseline of conversion rates per funnel step
- Daily check: today's rate vs baseline → if Δ > 30% → Telegram alert
- Inactive (only collecting baseline) for first 14 days
- LLM-based context analysis on alert: "What might cause this drop?"

#### Task 9.3: Weekly account health reminder

**Files:**
- Create: `src/modules/advertising/alerts/weekly-account-health.ts`
- Create: `src/modules/advertising/alerts/__tests__/weekly-account-health.test.ts`

Acceptance:
- Mondays 10:00 UTC, sends Telegram template message:
  "Weekly account health check — please review Meta Business Manager → Account Quality. Flag any new issues here."
- Logs that reminder was sent

#### Task 9.4: Cron handlers

**Files:**
- Create: `src/app/api/cron/advertising/triage-hourly/route.ts`
- Create: `src/app/api/cron/advertising/triage-daily/route.ts`
- Create: `src/app/api/cron/advertising/retro-weekly/route.ts`
- Create: `src/app/api/cron/advertising/audience-refresh/route.ts`
- Create: `src/app/api/cron/advertising/account-health-weekly/route.ts`
- Create: `src/app/api/cron/advertising/__tests__/*.test.ts`

Acceptance for each:
- Verifies Vercel cron secret header
- Returns 401 if not authenticated
- Calls relevant orchestration function (mocked in tests)
- Returns JSON `{success, summary}` for cron dashboard
- Catches errors → logs to Sentry → returns 500

Example for triage-hourly:

```typescript
// app/api/cron/advertising/triage-hourly/route.ts

import { NextResponse } from 'next/server';
import { isKillSwitchEngaged } from '@/modules/advertising/safety/kill-switch';
import { runHourlyTriage } from '@/modules/advertising/decide/orchestrator';

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (isKillSwitchEngaged()) {
    return NextResponse.json({ success: false, reason: 'kill_switch' });
  }
  try {
    const summary = await runHourlyTriage();
    return NextResponse.json({ success: true, summary });
  } catch (e) {
    console.error('triage-hourly failed', e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
```

---

### Stream 10: Admin UI

**Owner files:** `src/app/admin/advertising/*`, `src/app/api/admin/creatives/*`

**Goal:** Founder-facing dashboard for creative approval, decision review, agent state.

#### Task 10.1: Layout + auth gate

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/advertising/layout.tsx`

Acceptance:
- Root admin layout uses Clerk allowlist (env `ADMIN_ALLOWED_EMAILS`)
- Redirects non-allowlisted users to `/`
- Advertising sublayout has nav: Creatives | Decisions | Gates | Audiences | Spend

#### Task 10.2: Creative review page

**Files:**
- Create: `src/app/admin/advertising/creatives/review/page.tsx`
- Create: `src/app/admin/advertising/creatives/review/CreativeCard.tsx`
- Create: `src/app/admin/advertising/creatives/review/__tests__/*.test.tsx`

Acceptance:
- Server component fetches `pending_review` creatives from DB
- Renders grid of `CreativeCard` (image preview, copy, brand match score, policy result)
- Each card has Approve / Reject / Regenerate buttons → API calls
- Bulk: "Approve top 6 by score"
- Mobile responsive

#### Task 10.3: Approve/reject API routes

**Files:**
- Create: `src/app/api/admin/creatives/[id]/approve/route.ts`
- Create: `src/app/api/admin/creatives/[id]/reject/route.ts`

Acceptance:
- POST endpoints, gated by Clerk allowlist
- Approve: sets status, calls Meta upload (Stream 4), logs audit
- Reject: sets status='rejected', logs audit with reason from body

#### Task 10.4: Decisions log page

**Files:**
- Create: `src/app/admin/advertising/decisions/page.tsx`

Acceptance:
- Paginated table of recent decisions
- Filter by tier, action, ad_id
- Click row → expand reasoning + metrics_snapshot

#### Task 10.5: Feature gates page

**Files:**
- Create: `src/app/admin/advertising/gates/page.tsx`

Acceptance:
- Shows each feature's current mode + activation criteria + progress to activation
- Manual override (with confirmation) for emergency mode change

#### Task 10.6: Spend overview

**Files:**
- Create: `src/app/admin/advertising/spend/page.tsx`

Acceptance:
- Today's spend / cap with progress bar
- 7-day spend chart
- Per-campaign breakdown
- Read-only (no controls — actual spend changes go through Meta UI or agent)

---

## Phase 3: Integration (Sequential — ~1.5 days)

After all 10 streams complete, sequential integration phase wires everything together.

### Task I1: Wire orchestrator with all real modules

**Files:**
- Modify: `src/modules/advertising/decide/orchestrator.ts`

- [ ] **Step 1: Replace mocks with real imports**

Update orchestrator to use real `perceive`, `decide.*`, `act.*`, `audit`, `alerts` modules (from streams 1, 6, 7, 8, 9).

- [ ] **Step 2: End-to-end test (mocked external APIs)**

```typescript
// src/modules/advertising/__tests__/integration/end-to-end.test.ts

it('runs full daily triage cycle with mocked APIs', async () => {
  const result = await runDailyTriage({
    metaApi: mockMetaApi(),
    posthog: mockPosthog(),
    stripe: mockStripe(),
    claude: mockClaudeApi(),
    telegram: mockTelegramBot(),
  });

  expect(result.metrics_pulled).toBeGreaterThan(0);
  expect(result.decisions_made).toBeGreaterThan(0);
  expect(result.actions_executed).toBeGreaterThanOrEqual(0);
  expect(result.audit_records_written).toBe(result.decisions_made);
});
```

- [ ] **Step 3: Run + fix failures**

Run: `npx vitest run src/modules/advertising/__tests__/integration/`

- [ ] **Step 4: Commit**

```bash
git add src/modules/advertising/
git commit -m "feat(advertising/integration): wire orchestrator end-to-end"
```

### Task I2: Pre-launch verification checklist

**Files:**
- Create: `scripts/advertising/pre-launch-check.ts`

- [ ] **Step 1: Implement checklist runner**

Script verifies:
- All env vars present
- Meta API token valid (test call)
- CAPI token valid + EMQ ≥ 6.0 (warning if not)
- Telegram bot reachable
- Gemini API working
- Claude API working
- All cron paths return 200 with secret
- All feature gates have proper config
- DB tables exist + indexes present

- [ ] **Step 2: Run script**

Command: `npx tsx scripts/advertising/pre-launch-check.ts`
Expected: all checks pass, summary printed.

- [ ] **Step 3: Document in `docs/marketing.md`** as part of cold-start checklist

### Task I3: Smoke test in dry-run mode

- [ ] **Step 1: Set env**

```bash
ADVERTISING_AGENT_ENABLED=true
ADVERTISING_AGENT_DRY_RUN=true
```

- [ ] **Step 2: Trigger triage manually**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://localhost:3000/api/cron/advertising/triage-hourly
```

Expected: response 200, decisions logged but not applied (dry_run logged in audit).

- [ ] **Step 3: Verify Telegram report received**

Check Telegram channel: founder receives daily-digest format message with "DRY RUN" prefix.

- [ ] **Step 4: Commit smoke-test results**

Add `scripts/advertising/dry-run-results.md` with pasted output of dry-run cycle. Commit.

### Task I4: Production activation

- [ ] **Step 1: Disable dry-run**

```bash
vercel env add ADVERTISING_AGENT_DRY_RUN "false" production
```

- [ ] **Step 2: Verify kill switch ready**

Confirm `ADVERTISING_AGENT_ENABLED` can be flipped from Vercel UI in <30 sec.

- [ ] **Step 3: Initial creative batch generation**

```bash
npm run advertising:generate-launch-batch
```

Output: 22 creatives (11 EN + 11 ES) pending review at `/admin/advertising/creatives/review`.

- [ ] **Step 4: Founder reviews, approves 8-12**

Manual step. Approved creatives upload to Meta (paused).

- [ ] **Step 5: Activate first cron cycle (paused state)**

Verify first triage runs, reports `0 actions` (kampaigns paused), Telegram message OK.

- [ ] **Step 6: Manual launch via Meta UI**

Founder un-pauses campaigns in Meta. Agent observes from this point.

---

## Self-Review

**Spec coverage:**
- ✅ Perceive: Stream 1 (Meta + PostHog + Stripe + Reconciler)
- ✅ Creative gen hybrid stack: Streams 2 (generators), 3 (templates + Satori + Sharp), 4 (safety + batch + upload)
- ✅ Audiences: Stream 5
- ✅ Decide layered: Streams 6 (Tier 1 + 3 + budget) and 7 (Tier 2 Bayesian + brand voice + gates)
- ✅ Act + Safety + Audit: Stream 8
- ✅ Alerts + Cron: Stream 9
- ✅ Admin UI: Stream 10
- ✅ EN+ES locales: Foundation types + Stream 3 hooks-en/hooks-es + Stream 6 budget allocator
- ✅ Cold start strategy referenced in Task I2 verification
- ✅ Brand voice drift detection: Stream 7
- ✅ Spend caps + kill switch: Stream 8
- ✅ Disapproval handling (notify-only): Stream 8
- ✅ Drop-off monitoring: Stream 9
- ✅ Account health weekly reminder: Stream 9

**Placeholder scan:** All tasks have explicit code or test acceptance criteria. Tasks marked "follow same TDD pattern" reference adjacent tasks with full code shown — engineer reads from prior task. Acceptable per skill guidance.

**Type consistency:** All streams import from `@/shared/types/advertising/index` (foundation barrel). Shared types defined in F1 are used consistently across streams (verified via TS strict mode in CI).

**Stream independence:** Each stream owns disjoint files. Cross-stream calls go through types-only interfaces, with mocks in tests. Conflict detection: no two streams modify the same file.

**Coordination overhead:** Foundation phase (~1 day) creates strict contract surface. After that, 10 streams genuinely parallel for ~5-7 days. Integration phase (~1.5 days) reassembles. Total: ~10 calendar days with 10 parallel agents (sequential equivalent: ~16 days).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-26-advertising-agent.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks. For 10 parallel streams: dispatch all 10 subagents simultaneously after Foundation phase, with two-stage review per stream.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
