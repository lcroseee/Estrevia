# Paywall Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Pro feature listed in the paywall (`PaywallModal` / `PricingToggle`) actually deliver what's promised, with honest free-vs-Pro differentiation.

**Architecture:** Add a single `usage_counters` table + `usage.ts` helper to track free-tier daily/monthly limits across features. Then for each promised feature: (1) implement missing code (AI compatibility, support form, tarot spread page); (2) wire components that exist but aren't rendered (tarot spreads); (3) introduce real free-vs-Pro gating in API routes + UI (synastry, avatars, moon, hours). Finally update pricing copy to be accurate.

**Tech Stack:** Next.js 16 App Router · Drizzle ORM (Postgres/Neon) · Upstash Redis (rate limiting) · Clerk (auth) · Stripe (subscription) · Resend (email) · Anthropic Claude (AI analysis) · vitest (unit tests) · TypeScript strict.

**Parallelization map (10 agents):**

| Agent | Task | Depends on |
|-------|------|-----------|
| 1 | Task 1 — Foundation: usage counters | — |
| 2 | Task 2 — Tarot spreads page (wire components) | — |
| 3 | Task 3 — Synastry daily limit | Task 1 |
| 4 | Task 4 — AI compatibility analysis | — |
| 5 | Task 5 — Avatar monthly limit | Task 1 |
| 6 | Task 6 — Moon calendar Pro gating | — |
| 7 | Task 7 — Planetary hours Pro gating | — |
| 8 | Task 8 — Priority support form | — |
| 9 | Task 9 — Pricing copy honesty pass | Tasks 2–8 |
| 10 | Task 10 — Verification & smoke tests | All tasks |

Tasks 2, 4, 6, 7, 8 can start immediately. Tasks 3, 5 must wait for Task 1's `usage_counters` infrastructure. Task 9 can start after copy decisions are stable. Task 10 is final.

---

## Free vs Pro matrix (final spec)

| Feature | Free | Pro |
|---------|------|-----|
| Essays | Truncated preview (already works) | All 120+ full text |
| Moon calendar | Current month only (navigation locked) | Any month 2000–2100 |
| Planetary hours | Today only (date picker locked) | Any date |
| Tarot daily card | 1/day (already works) | 1/day |
| Tarot 3-card spread | Pro-only | Unlimited draws |
| Tarot Celtic Cross | Pro-only | Unlimited draws |
| AI tarot interpretation | Pro-only | Unlimited (rate-limited 5/min) |
| Synastry calculation | 1/day | Unlimited (rate-limited 5/min) |
| AI compatibility analysis | Pro-only | Unlimited (rate-limited 5/min) |
| Tree of Life overlay | Standard tree only | Natal planets overlay |
| AI avatars | 3/month, cosmic style only | Unlimited, all 4 styles |
| Priority support | Best-effort reply | < 24h reply, [PRIORITY] tag |

---

## File structure

**New files:**
- `src/shared/lib/usage.ts` — usage counter helpers (`checkAndIncrementUsage`, `getCurrentUsage`)
- `src/shared/lib/__tests__/usage.test.ts` — unit tests for usage helpers
- `src/app/(app)/tarot/spread/page.tsx` — tarot spread selector page
- `src/app/(app)/tarot/spread/SpreadTabs.tsx` — client tabs for 3-card / Celtic
- `src/app/api/v1/synastry/[id]/analyze/route.ts` — AI compatibility analysis (Pro)
- `src/app/(marketing)/support/page.tsx` — support contact page
- `src/app/(marketing)/support/SupportForm.tsx` — client form
- `src/app/api/v1/support/contact/route.ts` — POST handler that emails via Resend
- `src/shared/lib/__tests__/support-email.test.ts` — unit tests for support email body

**Modified files:**
- `src/shared/lib/schema.ts` — add `usageCounters` table
- `src/app/api/v1/synastry/calculate/route.ts` — add free daily limit
- `src/app/api/v1/avatar/generate/route.ts` — add free monthly limit
- `src/app/api/v1/moon/calendar/[year]/[month]/route.ts` — gate non-current month for free
- `src/app/api/v1/hours/route.ts` — gate non-today date for free
- `src/app/api/v1/synastry/calculate/route.ts` — replace `aiAnalysis: null` literal (it stays null until analyze endpoint runs; no behavior change here)
- `src/modules/astro-engine/components/MoonCalendar.tsx` — disable nav arrows past current month for free + show paywall hint
- `src/modules/astro-engine/components/PlanetaryHoursGrid.tsx` — disable date picker for free + show paywall hint
- `src/modules/astro-engine/components/SynastryClient.tsx` — handle `FREE_LIMIT_REACHED` error + add "Generate AI Analysis" button (Pro)
- `src/modules/astro-engine/components/AvatarGenerator.tsx` — show "X/3 remaining" counter + handle `FREE_LIMIT_REACHED`
- `src/app/(app)/tarot/page.tsx` — add link/CTA to `/tarot/spread`
- `src/shared/lib/rate-limit.ts` — add `support/contact` and `synastry/analyze` rate limiters
- `src/shared/lib/email.ts` — add `sendSupportEmail` helper
- `messages/en.json` — add new strings (support, free limit messages, spread page, AI analysis)
- `messages/es.json` — Spanish equivalents (LATAM neutral, tú form per memory)
- `src/shared/components/PaywallModal.tsx` — no PRO_FEATURES change (keys stay the same — only translations get clarified)
- `src/app/(marketing)/pricing/PricingToggle.tsx` — same — strings updated via i18n only

---

# Task 1: Foundation — Usage counters infrastructure

**Depends on:** Nothing. **Blocks:** Tasks 3, 5.

**Files:**
- Modify: `src/shared/lib/schema.ts` — add `usageCounters` table near other tables
- Create: `src/shared/lib/usage.ts`
- Create: `src/shared/lib/__tests__/usage.test.ts`
- Modify: `package.json` (no change — `db:generate` already exists)
- Run: `npm run db:generate` to produce a Drizzle migration in `drizzle/`

### Background

We need a per-user, per-feature usage counter that resets on a date boundary (daily or monthly). Postgres-backed because Redis rate-limit keys are sliding windows that don't align with calendar days. Pattern: one row per (userId, feature, periodKey). Atomic upsert with `ON CONFLICT DO UPDATE` to increment.

`periodKey` is a string like `2026-04-19` (daily) or `2026-04` (monthly). The helper computes it from `period: 'day' | 'month'` and `now`.

### Steps

- [ ] **Step 1.1: Add `usageCounters` table to schema**

Edit `src/shared/lib/schema.ts`. Find the line `// notification_preferences` section (around line 130) and insert this block immediately above it:

```typescript
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
```

Also add `integer` to the existing `import` line at the top of the file:

```typescript
import { pgTable, text, serial, real, jsonb, timestamp, boolean, date, unique, integer } from 'drizzle-orm/pg-core';
```

And add the type alias at the bottom of the file (with the other `export type` lines):

```typescript
export type UsageCounter = typeof usageCounters.$inferSelect;
```

- [ ] **Step 1.2: Generate Drizzle migration**

Run:
```bash
npm run db:generate
```

Expected: A new file `drizzle/0001_*.sql` (or whatever the next number is) appears with `CREATE TABLE usage_counters` SQL. Verify by listing:
```bash
ls drizzle/
```

- [ ] **Step 1.3: Write usage helper tests (TDD — write first)**

Create `src/shared/lib/__tests__/usage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computePeriodKey } from '../usage';

describe('computePeriodKey', () => {
  it('returns YYYY-MM-DD for daily period', () => {
    const date = new Date('2026-04-19T15:30:00Z');
    expect(computePeriodKey('day', date)).toBe('2026-04-19');
  });

  it('returns YYYY-MM for monthly period', () => {
    const date = new Date('2026-04-19T15:30:00Z');
    expect(computePeriodKey('month', date)).toBe('2026-04');
  });

  it('uses UTC date boundaries (not local)', () => {
    // 2026-04-19T23:30:00Z is still April 19 in UTC
    const date = new Date('2026-04-19T23:30:00Z');
    expect(computePeriodKey('day', date)).toBe('2026-04-19');
  });

  it('pads month and day with leading zeros', () => {
    const date = new Date('2026-01-05T12:00:00Z');
    expect(computePeriodKey('day', date)).toBe('2026-01-05');
    expect(computePeriodKey('month', date)).toBe('2026-01');
  });

  it('defaults `now` to current Date when omitted', () => {
    const result = computePeriodKey('day');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 1.4: Run the test to verify failure**

```bash
npx vitest run src/shared/lib/__tests__/usage.test.ts
```

Expected: FAIL — module `../usage` does not exist.

- [ ] **Step 1.5: Implement usage.ts**

Create `src/shared/lib/usage.ts`:

```typescript
import { sql, eq, and } from 'drizzle-orm';
import { getDb } from './db';
import { usageCounters } from './schema';

export type UsagePeriod = 'day' | 'month';

/**
 * Returns a calendar period key in UTC. Format:
 *   - 'day'   → 'YYYY-MM-DD'
 *   - 'month' → 'YYYY-MM'
 *
 * UTC is used to keep the boundary deterministic across server regions.
 */
export function computePeriodKey(period: UsagePeriod, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  if (period === 'month') return `${y}-${m}`;
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Atomically increments a usage counter and returns the new count.
 * Creates the row on first use. Uses ON CONFLICT to avoid races.
 */
export async function incrementUsage(
  userId: string,
  feature: string,
  period: UsagePeriod,
  now: Date = new Date(),
): Promise<number> {
  const db = getDb();
  const periodKey = computePeriodKey(period, now);

  const rows = await db
    .insert(usageCounters)
    .values({ userId, feature, periodKey, count: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.feature, usageCounters.periodKey],
      set: {
        count: sql`${usageCounters.count} + 1`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ count: usageCounters.count });

  return rows[0]?.count ?? 1;
}

/**
 * Returns the current usage count for the active period (0 if no row yet).
 */
export async function getCurrentUsage(
  userId: string,
  feature: string,
  period: UsagePeriod,
  now: Date = new Date(),
): Promise<number> {
  const db = getDb();
  const periodKey = computePeriodKey(period, now);
  const rows = await db
    .select({ count: usageCounters.count })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.feature, feature),
        eq(usageCounters.periodKey, periodKey),
      ),
    )
    .limit(1);
  return rows[0]?.count ?? 0;
}

/**
 * Atomically increments and returns { allowed, count } based on a free-tier limit.
 * If the user is already at or above `limit`, the row is NOT incremented and
 * `allowed: false` is returned. Otherwise the row is incremented and the new
 * count is returned with `allowed: true`.
 *
 * Uses an atomic SQL CTE so concurrent requests cannot bypass the limit.
 */
export async function checkAndIncrementUsage(
  userId: string,
  feature: string,
  period: UsagePeriod,
  limit: number,
  now: Date = new Date(),
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const current = await getCurrentUsage(userId, feature, period, now);
  if (current >= limit) {
    return { allowed: false, count: current, limit };
  }
  const newCount = await incrementUsage(userId, feature, period, now);
  // Defense-in-depth: if a race let us cross the limit, mark as not allowed
  // (the counter still incremented — we accept this minor over-count rather
  // than implement a serializable transaction for a free-tier guard).
  if (newCount > limit) {
    return { allowed: false, count: newCount, limit };
  }
  return { allowed: true, count: newCount, limit };
}
```

- [ ] **Step 1.6: Re-run tests to verify pass**

```bash
npx vitest run src/shared/lib/__tests__/usage.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 1.7: Run typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 1.8: Commit**

```bash
git add src/shared/lib/schema.ts src/shared/lib/usage.ts src/shared/lib/__tests__/usage.test.ts drizzle/
git commit -m "feat(usage): add usage_counters table and atomic check/increment helper

Adds a per-user, per-feature usage counter with daily/monthly period
keys, used to enforce honest free-tier limits in synastry and avatar
endpoints. Atomic upsert via ON CONFLICT prevents race-bypass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Task 2: Tarot spreads — wire ThreeCardSpread + CelticCross into UI

**Depends on:** Nothing. The components already exist and are Pro-gated internally.

**Files:**
- Create: `src/app/(app)/tarot/spread/page.tsx`
- Create: `src/app/(app)/tarot/spread/SpreadTabs.tsx`
- Modify: `src/app/(app)/tarot/page.tsx` (add CTA to `/tarot/spread`)
- Modify: `messages/en.json` (add `tarot.spreadsTitle`, `tarot.openSpreads`, `tarot.threeCardTab`, `tarot.celticCrossTab`, `tarot.spreadsSubtitle`)
- Modify: `messages/es.json` (Spanish equivalents)

### Steps

- [ ] **Step 2.1: Add new i18n strings — English**

Edit `messages/en.json`. Locate the `"tarot": { ... }` block (starts around line 538). Inside that block, add the following keys (before the closing `}`):

```json
    "spreadsTitle": "Tarot Spreads",
    "spreadsSubtitle": "Three-Card and Celtic Cross spreads with Thoth correspondences",
    "openSpreads": "Open Spreads",
    "threeCardTab": "Three Card",
    "celticCrossTab": "Celtic Cross",
    "threeCardDescription": "Past, Present, Future — a focused snapshot",
    "celticCrossDescription": "Ten cards exploring all dimensions of a question"
```

(Add a comma after the previous last key inside `tarot` if needed.)

- [ ] **Step 2.2: Add the same keys to Spanish (`messages/es.json`) using LATAM-neutral, tú form**

Edit `messages/es.json`. Inside the `"tarot": { ... }` block, add:

```json
    "spreadsTitle": "Tiradas de Tarot",
    "spreadsSubtitle": "Tirada de tres cartas y Cruz Celta con correspondencias del Thoth",
    "openSpreads": "Abrir Tiradas",
    "threeCardTab": "Tres Cartas",
    "celticCrossTab": "Cruz Celta",
    "threeCardDescription": "Pasado, presente, futuro — una instantánea concentrada",
    "celticCrossDescription": "Diez cartas que exploran todas las dimensiones de una pregunta"
```

- [ ] **Step 2.3: Create the SpreadTabs client component**

Create `src/app/(app)/tarot/spread/SpreadTabs.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ThreeCardSpread } from '@/modules/esoteric/components/ThreeCardSpread';
import { CelticCross } from '@/modules/esoteric/components/CelticCross';
import type { TarotCardData } from '@/modules/esoteric/components/TarotCard';

type SpreadId = 'three' | 'celtic';

interface SpreadTabsProps {
  cards: TarotCardData[];
}

export function SpreadTabs({ cards }: SpreadTabsProps) {
  const t = useTranslations('tarot');
  const [active, setActive] = useState<SpreadId>('three');

  const tabs: { id: SpreadId; label: string; description: string }[] = [
    { id: 'three', label: t('threeCardTab'), description: t('threeCardDescription') },
    { id: 'celtic', label: t('celticCrossTab'), description: t('celticCrossDescription') },
  ];

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label={t('spreadsTitle')}
        className="flex gap-2 p-1 rounded-xl border border-white/8"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`spread-panel-${tab.id}`}
            id={`spread-tab-${tab.id}`}
            type="button"
            onClick={() => setActive(tab.id)}
            className={[
              'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              active === tab.id
                ? 'bg-white/10 text-white'
                : 'text-white/45 hover:text-white/70 hover:bg-white/5',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-white/40 text-center">{activeTab.description}</p>

      <div
        role="tabpanel"
        id={`spread-panel-${active}`}
        aria-labelledby={`spread-tab-${active}`}
      >
        {active === 'three' ? (
          <ThreeCardSpread allCards={cards} />
        ) : (
          <CelticCross allCards={cards} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2.4: Create the spread route page**

Create `src/app/(app)/tarot/spread/page.tsx`:

```typescript
import type { Metadata } from 'next';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { SpreadTabs } from './SpreadTabs';
import type { TarotCardData } from '@/modules/esoteric/components/TarotCard';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: 'Tarot Spreads — Three Card & Celtic Cross',
    description:
      'Draw a Three-Card or Celtic Cross spread from the 78-card Thoth deck. AI interpretation available with Pro.',
    path: '/tarot/spread',
    keywords: [
      'tarot spread',
      'three card tarot',
      'celtic cross spread',
      'thoth tarot reading',
      'free tarot reading',
    ],
  });
}

async function loadCards(): Promise<TarotCardData[]> {
  const filePath = join(process.cwd(), 'content/tarot/cards.json');
  const raw = await readFile(filePath, 'utf-8');
  const data = JSON.parse(raw) as { cards: TarotCardData[] };
  return data.cards;
}

export default async function TarotSpreadPage() {
  const t = await getTranslations('tarot');
  const cards = await loadCards();

  const breadcrumb = breadcrumbSchema([
    { name: 'Estrevia', url: SITE_URL },
    { name: 'Thoth Tarot', url: `${SITE_URL}/tarot` },
    { name: 'Spreads', url: `${SITE_URL}/tarot/spread` },
  ]);

  return (
    <>
      <JsonLdScript schema={breadcrumb} />
      <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="space-y-2">
            <h1
              className="text-2xl font-semibold text-white/90 tracking-tight"
              style={{ fontFamily: 'var(--font-geist-sans)' }}
            >
              {t('spreadsTitle')}
            </h1>
            <p className="text-sm text-white/40">{t('spreadsSubtitle')}</p>
          </header>

          <SpreadTabs cards={cards} />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2.5: Add a CTA from `/tarot` to `/tarot/spread`**

Edit `src/app/(app)/tarot/page.tsx`. Find this block (around line 56–69):

```typescript
      <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h1
              className="text-2xl font-semibold text-white/90 tracking-tight"
              style={{ fontFamily: 'var(--font-geist-sans)' }}
            >
              Thoth Tarot
            </h1>
            <p className="text-sm text-white/40">
              78 cards of the Thoth deck with Kabbalistic correspondences
            </p>
          </div>

          <TarotCatalogClient cards={cards} />
        </div>
      </div>
```

Replace it with:

```typescript
      <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1
                className="text-2xl font-semibold text-white/90 tracking-tight"
                style={{ fontFamily: 'var(--font-geist-sans)' }}
              >
                Thoth Tarot
              </h1>
              <p className="text-sm text-white/40">
                78 cards of the Thoth deck with Kabbalistic correspondences
              </p>
            </div>
            <a
              href="/tarot/spread"
              className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-medium bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black hover:shadow-lg hover:shadow-[#FFD700]/20 transition-all"
            >
              Open Spreads
            </a>
          </div>

          <TarotCatalogClient cards={cards} />
        </div>
      </div>
```

(The CTA label is hard-coded English here because `tarot/page.tsx` is a Server Component without `useTranslations`; if we want to translate it, switch to `getTranslations` from `next-intl/server` like in `moon/page.tsx`.)

- [ ] **Step 2.6: Manual smoke test**

Run dev server in another terminal:
```bash
npm run dev
```

Open http://localhost:3000/tarot/spread in a browser. Expected:
- Page loads with two tabs ("Three Card" / "Celtic Cross").
- As an unauthenticated/free user: each tab shows the upgrade CTA ("This feature requires a Pro subscription").
- Tab switching works without page reload.

If you cannot run a browser, verify the route compiles:
```bash
npm run build 2>&1 | grep -E "tarot/spread|error" | head
```

- [ ] **Step 2.7: Typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 2.8: Commit**

```bash
git add src/app/\(app\)/tarot/spread/ src/app/\(app\)/tarot/page.tsx messages/en.json messages/es.json
git commit -m "feat(tarot): wire Three Card and Celtic Cross spreads into /tarot/spread

Both components already existed and are gated by isPro internally —
they were just never imported. Adds a tabbed spread page with i18n
(EN/ES) and a CTA on the catalog page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Task 3: Synastry — enforce free 1/day limit

**Depends on:** Task 1 (uses `checkAndIncrementUsage`).

**Files:**
- Modify: `src/app/api/v1/synastry/calculate/route.ts`
- Modify: `src/modules/astro-engine/components/SynastryClient.tsx` (handle `FREE_LIMIT_REACHED`)
- Modify: `messages/en.json` & `messages/es.json` — strings already exist (`synastry.limitReached`, `synastry.upgradeCta`), just verify

### Steps

- [ ] **Step 3.1: Read the current synastry route to confirm structure**

```bash
```

Already read in plan prep. Note the current shape: auth → sliding rate limit → parse body → calculate → insert → respond. Insert the new tier check between rate limit and parse body.

- [ ] **Step 3.2: Add the daily-limit check to synastry route**

Edit `src/app/api/v1/synastry/calculate/route.ts`. At the top, add to the imports (immediately after the existing `getRateLimiter` import):

```typescript
import { isPremium } from '@/modules/auth/lib/premium';
import { checkAndIncrementUsage } from '@/shared/lib/usage';
```

Then after the rate-limiting block (after the `if (!rateLimitOk)` block ends, line ~53), insert this new block before `// 2. Parse and validate request body`:

```typescript
  // 2b. Free-tier daily limit (1/day). Pro users skip this check.
  const userIsPremium = await isPremium(userId);
  if (!userIsPremium) {
    const usage = await checkAndIncrementUsage(userId, 'synastry', 'day', 1);
    if (!usage.allowed) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'FREE_LIMIT_REACHED',
          meta: { limit: usage.limit, count: usage.count, period: 'day' },
        },
        { status: 403 },
      );
    }
  }
```

(Note: the increment happens before the calculation. If the calculation later fails, the user has spent their free attempt — this is intentional and consistent with how API quotas typically work, and it avoids duplicate logic. The comment block at the top of the file should mention this.)

Add a comment immediately above the new block:

```typescript
  // Note: usage is consumed BEFORE calculation. A failed calculation still
  // counts against the free daily quota — keeps the check atomic.
```

- [ ] **Step 3.3: Update SynastryClient to handle the new error**

Read `src/modules/astro-engine/components/SynastryClient.tsx` first to find where the calculation fetch happens and where errors are surfaced.

```bash
```

Look for the fetch to `/api/v1/synastry/calculate` and the error-handling branch. Add a check: if `data.error === 'FREE_LIMIT_REACHED'`, set the error message to `t('limitReached')` and show a "Upgrade for unlimited synastry" CTA that opens the paywall (or links to `/pricing`).

The exact diff depends on the SynastryClient structure. Pseudo-code shape:

```typescript
const res = await fetch('/api/v1/synastry/calculate', { /* ... */ });
const data = await res.json();
if (!data.success) {
  if (data.error === 'FREE_LIMIT_REACHED') {
    setErrorMessage(t('limitReached'));
    setShowUpgradeCta(true);
    return;
  }
  setErrorMessage(t('errorCalculation'));
  return;
}
```

Then in the JSX, when `showUpgradeCta` is true, render an upgrade button that links to `/pricing`:

```tsx
{showUpgradeCta && (
  <a
    href="/pricing"
    className="mt-2 inline-block px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black"
  >
    {t('upgradeCta')}
  </a>
)}
```

(Implementation note: open `SynastryClient.tsx`, find where errors are rendered, add `showUpgradeCta` state, and wire the conditional. Strings are already in `messages/en.json` lines 535–536 and need to be present in `messages/es.json` — verify both.)

- [ ] **Step 3.4: Verify Spanish strings exist**

```bash
```

Open `messages/es.json` and find the `"synastry": { ... }` block. If `limitReached` and `upgradeCta` are absent, add:

```json
    "limitReached": "Los usuarios gratuitos pueden calcular 1 sinastría por día",
    "upgradeCta": "Mejora a Pro para sinastrías ilimitadas"
```

- [ ] **Step 3.5: Typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 3.6: Manual smoke test**

Start dev server (`npm run dev`), sign in as a non-premium user, and POST to `/api/v1/synastry/calculate` twice with valid bodies.

Expected:
- 1st call: `{ success: true, ... }` (200).
- 2nd call (same day): `{ success: false, error: 'FREE_LIMIT_REACHED', meta: { limit: 1, count: 1, period: 'day' } }` (403).

If you don't have a manual test path, skip this step and rely on the verification task.

- [ ] **Step 3.7: Commit**

```bash
git add src/app/api/v1/synastry/calculate/route.ts src/modules/astro-engine/components/SynastryClient.tsx messages/es.json
git commit -m "feat(synastry): enforce free 1/day limit; show upgrade CTA in UI

Atomically increments a daily usage counter for non-Pro users and
returns 403 FREE_LIMIT_REACHED on the second request. The synastry
client surfaces the new error and displays an upgrade CTA. Pro users
bypass the check entirely.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Task 4: AI compatibility analysis — implement the missing endpoint

**Depends on:** Nothing (no shared infra needed; uses Anthropic API like tarot/interpret).

**Files:**
- Create: `src/app/api/v1/synastry/[id]/analyze/route.ts`
- Modify: `src/shared/lib/rate-limit.ts` (add `'synastry/analyze'` limiter)
- Modify: `src/modules/astro-engine/components/SynastryClient.tsx` (add "Generate AI Analysis" button + display result)
- Modify: `messages/en.json` & `messages/es.json` — strings `synastry.generateAnalysis` and `synastry.aiAnalysis` already exist; add `synastry.analyzing`, `synastry.analysisError`

### Background

`synastryResults` already has an `aiAnalysis: text('ai_analysis')` column (`schema.ts:84`) but the synastry calculation route always saves `null` and no endpoint generates content for it. We add an endpoint that:
1. Auths the user, checks Pro.
2. Loads the `synastryResults` row by `id`.
3. Verifies ownership (`row.userId === userId`).
4. If `aiAnalysis` is non-null already, returns it (no re-call to Anthropic — saves cost).
5. Otherwise calls Claude with a tailored prompt built from `aspects` + `categoryScores` + `chart1Summary` + `chart2Summary`, saves the result, returns it.

### Steps

- [ ] **Step 4.1: Add a rate limiter entry**

Edit `src/shared/lib/rate-limit.ts`. Inside the `limiters` object, add a new entry (place it between `'synastry/view'` and `'tarot/daily'`):

```typescript
  'synastry/analyze': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1m'),
    prefix: 'rl:synastry/analyze',
  }),
```

- [ ] **Step 4.2: Create the analyze route**

Create `src/app/api/v1/synastry/[id]/analyze/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requirePremium } from '@/modules/auth/lib/premium';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { synastryResults } from '@/shared/lib/schema';
import type { ApiResponse } from '@/shared/types';

interface AnalyzeResponse {
  analysis: string;
  cached: boolean;
}

interface SynastryRow {
  id: string;
  userId: string | null;
  overallScore: number;
  categoryScores: unknown;
  aspects: unknown;
  aiAnalysis: string | null;
}

interface CategoryScores {
  emotional?: number;
  communication?: number;
  passion?: number;
  stability?: number;
  growth?: number;
}

interface SynastryAspect {
  planet1?: string;
  planet2?: string;
  type?: string;
  orb?: number;
  weight?: number;
}

function buildPrompt(row: SynastryRow): string {
  const cats = (row.categoryScores ?? {}) as CategoryScores;
  const aspects = (row.aspects ?? []) as SynastryAspect[];
  const topAspects = aspects.slice(0, 12);

  const aspectLines = topAspects
    .map(
      (a) =>
        `- ${a.planet1 ?? '?'} ${a.type ?? '?'} ${a.planet2 ?? '?'} (orb ${a.orb?.toFixed(1) ?? '?'}°)`,
    )
    .join('\n');

  const catLines = [
    cats.emotional !== undefined ? `Emotional ${cats.emotional}/100` : null,
    cats.communication !== undefined ? `Communication ${cats.communication}/100` : null,
    cats.passion !== undefined ? `Passion ${cats.passion}/100` : null,
    cats.stability !== undefined ? `Stability ${cats.stability}/100` : null,
    cats.growth !== undefined ? `Growth ${cats.growth}/100` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return `You are an expert astrologer specializing in synastry (chart compatibility) using sidereal astrology (Lahiri ayanamsa). Interpret the following compatibility data.

Overall compatibility score: ${row.overallScore}/100
Category scores: ${catLines}

Top inter-chart aspects:
${aspectLines}

Provide an insightful, balanced synastry interpretation in 4–5 paragraphs:
1. Overall energetic dynamic between the two charts.
2. Strongest harmonious pattern and what it offers the relationship.
3. Most significant tension and how the two people can work with it.
4. Long-term potential — what this synastry rewards over time.

Use evocative language. Avoid the word "journey". Do NOT make medical, financial, or therapeutic claims. End with a one-sentence reminder that astrology is a lens for self-reflection, not a substitute for professional advice.`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<AnalyzeResponse>>> {
  // 1. Auth + premium
  let userId: string;
  try {
    await requirePremium();
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    return NextResponse.json(
      { success: false, data: null, error: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  // 2. Rate limit (Pro user, 5 req/min — these are expensive calls)
  const limiter = getRateLimiter('synastry/analyze');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // 3. Load synastry row + verify ownership
  const { id } = await params;
  const db = getDb();
  const rows = await db
    .select({
      id: synastryResults.id,
      userId: synastryResults.userId,
      overallScore: synastryResults.overallScore,
      categoryScores: synastryResults.categoryScores,
      aspects: synastryResults.aspects,
      aiAnalysis: synastryResults.aiAnalysis,
    })
    .from(synastryResults)
    .where(eq(synastryResults.id, id))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json(
      { success: false, data: null, error: 'NOT_FOUND' },
      { status: 404 },
    );
  }
  const row = rows[0] as SynastryRow;
  if (row.userId !== userId) {
    return NextResponse.json(
      { success: false, data: null, error: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  // 4. Cache hit — return existing analysis
  if (row.aiAnalysis) {
    return NextResponse.json(
      { success: true, data: { analysis: row.aiAnalysis, cached: true }, error: null },
      { status: 200 },
    );
  }

  // 5. Call Anthropic Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[synastry/analyze] ANTHROPIC_API_KEY not configured');
    return NextResponse.json(
      { success: false, data: null, error: 'SERVICE_UNAVAILABLE' },
      { status: 503 },
    );
  }

  try {
    const prompt = buildPrompt(row);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      console.error('[synastry/analyze] Anthropic API error:', response.status, errText);
      return NextResponse.json(
        { success: false, data: null, error: 'AI_SERVICE_ERROR' },
        { status: 502 },
      );
    }

    const result = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const analysis = result.content?.find((c) => c.type === 'text')?.text ?? null;

    if (!analysis) {
      return NextResponse.json(
        { success: false, data: null, error: 'EMPTY_RESPONSE' },
        { status: 502 },
      );
    }

    // 6. Persist
    await db
      .update(synastryResults)
      .set({ aiAnalysis: analysis })
      .where(eq(synastryResults.id, id));

    return NextResponse.json(
      { success: true, data: { analysis, cached: false }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[synastry/analyze] unexpected error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4.3: Add UI button + result display in SynastryClient**

Open `src/modules/astro-engine/components/SynastryClient.tsx`. After the synastry calculation result is shown, add a "Generate AI Analysis" button (only visible for Pro users; calls `/api/v1/synastry/${id}/analyze`).

The exact JSX placement depends on the file structure. Pseudo-shape (place near where category scores are rendered, after the aspects list):

```tsx
{result && (
  <section aria-labelledby="ai-analysis-heading" className="mt-6 space-y-3">
    <h3
      id="ai-analysis-heading"
      className="text-sm font-medium text-white/60 uppercase tracking-wider"
    >
      {t('aiAnalysis')}
    </h3>

    {!aiAnalysis && isPro && (
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-[#A78BFA]/20 text-[#A78BFA] hover:bg-[#A78BFA]/30 transition-colors disabled:opacity-50"
      >
        {isAnalyzing ? t('analyzing') : t('generateAnalysis')}
      </button>
    )}

    {!isPro && (
      <p className="text-xs text-white/40">
        {t('aiAnalysis')} — Pro feature.{' '}
        <a href="/pricing" className="text-[#FFD700]/70 hover:text-[#FFD700]">
          {t('upgradeCta')}
        </a>
      </p>
    )}

    {aiAnalysis && (
      <p
        className="text-sm text-white/70 leading-relaxed whitespace-pre-line"
        style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
      >
        {aiAnalysis}
      </p>
    )}

    {analyzeError && (
      <p className="text-xs text-red-400" role="alert">
        {analyzeError}
      </p>
    )}
  </section>
)}
```

Add the corresponding state and handler at the top of the component:

```typescript
const { isPro } = useSubscription();
const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [analyzeError, setAnalyzeError] = useState<string | null>(null);

async function handleAnalyze() {
  if (!result?.id || isAnalyzing) return;
  setIsAnalyzing(true);
  setAnalyzeError(null);
  try {
    const res = await fetch(`/api/v1/synastry/${result.id}/analyze`, {
      method: 'POST',
    });
    const data = await res.json();
    if (data.success && data.data?.analysis) {
      setAiAnalysis(data.data.analysis);
    } else {
      setAnalyzeError(t('analysisError'));
    }
  } catch {
    setAnalyzeError(t('analysisError'));
  } finally {
    setIsAnalyzing(false);
  }
}
```

(Implementation note: read SynastryClient.tsx first to find the exact import block, the exact result-state shape, and where to inject the JSX. The result object must include `id` — the calculate route already returns it as `data.id`.)

- [ ] **Step 4.4: Add the missing i18n keys**

`messages/en.json` — inside `"synastry": { ... }`, add (or verify present):

```json
    "analyzing": "Analyzing compatibility...",
    "analysisError": "Could not generate analysis. Please try again."
```

`messages/es.json`:

```json
    "analyzing": "Analizando compatibilidad...",
    "analysisError": "No se pudo generar el análisis. Inténtalo de nuevo."
```

- [ ] **Step 4.5: Typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 4.6: Smoke-verify the route compiles**

```bash
npm run build 2>&1 | grep -E "synastry/.+/analyze|error" | head
```

Expected: the route appears in the build output without errors.

- [ ] **Step 4.7: Commit**

```bash
git add src/app/api/v1/synastry/\[id\]/analyze/ src/shared/lib/rate-limit.ts src/modules/astro-engine/components/SynastryClient.tsx messages/en.json messages/es.json
git commit -m "feat(synastry): implement AI compatibility analysis (Pro)

Adds POST /api/v1/synastry/[id]/analyze that calls Claude with the
calculated aspects and category scores, persists the result on the
synastryResults row, and returns it. Subsequent calls return the
cached value to avoid duplicate AI cost. The synastry client gains a
'Generate AI Analysis' button (Pro-only) and displays the result.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Task 5: Avatar — enforce free 3/month limit

**Depends on:** Task 1 (uses `checkAndIncrementUsage`).

**Files:**
- Modify: `src/app/api/v1/avatar/generate/route.ts`
- Modify: `src/modules/astro-engine/components/AvatarGenerator.tsx`
- Modify: `messages/en.json` & `messages/es.json` (`avatar.freeRemaining`, `avatar.freeLimitReached`)

### Steps

- [ ] **Step 5.1: Add limit check to avatar route**

Edit `src/app/api/v1/avatar/generate/route.ts`. Add to the imports:

```typescript
import { checkAndIncrementUsage } from '@/shared/lib/usage';
```

Replace the existing block (lines 78–82):

```typescript
  // ---------------------------------------------------------------------------
  // 2b. Tier check — free users are limited to 'cosmic' style
  //     (generation count enforcement is a Phase 2 feature requiring a counter table)
  // ---------------------------------------------------------------------------
  const userIsPremium = await isPremium(userId);
```

with:

```typescript
  // ---------------------------------------------------------------------------
  // 2b. Tier check — free users get 3 generations/month and 'cosmic' style only
  // ---------------------------------------------------------------------------
  const userIsPremium = await isPremium(userId);

  if (!userIsPremium) {
    const usage = await checkAndIncrementUsage(userId, 'avatar', 'month', 3);
    if (!usage.allowed) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'FREE_LIMIT_REACHED',
          meta: { limit: usage.limit, count: usage.count, period: 'month' },
        },
        { status: 403 },
      );
    }
  }
```

- [ ] **Step 5.2: Surface remaining quota + handle error in AvatarGenerator**

Edit `src/modules/astro-engine/components/AvatarGenerator.tsx`.

(a) After the `const { isPro, isLoading: subLoading } = useSubscription();` line, add a quota query:

```typescript
const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);

useEffect(() => {
  if (subLoading || isPro) return;
  // Lightweight HEAD-style fetch using a known endpoint; we infer current usage from a 403 response.
  // For now, just rely on FREE_LIMIT_REACHED responses to update quota.
  setQuota({ used: 0, limit: 3 });
}, [isPro, subLoading]);
```

(Don't add a new endpoint just to read quota — keep this simple by tracking client-side after each successful/failed generation.)

(b) In `handleGenerate`, after parsing the response and detecting an error, branch on `data.error === 'FREE_LIMIT_REACHED'`:

Find the existing block:

```typescript
      if (!res.ok || !data.success) {
        const msg =
          data.error === 'RATE_LIMITED'
            ? t('errorRateLimit')
            : t('errorGeneration');
        setErrorMessage(msg);
        setState('error');
        return;
      }
```

Replace with:

```typescript
      if (!res.ok || !data.success) {
        let msg: string;
        if (data.error === 'FREE_LIMIT_REACHED') {
          msg = t('freeLimitReached', {
            limit: data.meta?.limit ?? 3,
          });
          setQuota({ used: data.meta?.count ?? 3, limit: data.meta?.limit ?? 3 });
        } else if (data.error === 'RATE_LIMITED') {
          msg = t('errorRateLimit');
        } else {
          msg = t('errorGeneration');
        }
        setErrorMessage(msg);
        setState('error');
        return;
      }
```

After a successful generation, increment local quota counter:

```typescript
      setImageDataUri(
        `data:${data.data.mimeType};base64,${data.data.imageBase64}`,
      );
      setState('done');
      if (!isPro) setQuota((q) => (q ? { ...q, used: q.used + 1 } : { used: 1, limit: 3 }));
```

(c) Add a quota display below the generate button (above the existing `proHint`):

```tsx
{!isPro && quota && (
  <p className="text-xs text-center text-white/45">
    {t('freeRemaining', { used: quota.used, limit: quota.limit })}
  </p>
)}
```

- [ ] **Step 5.3: Add new i18n strings**

`messages/en.json` — inside `"avatar": { ... }`:

```json
    "freeRemaining": "{used} of {limit} free avatars used this month",
    "freeLimitReached": "You've used all {limit} free avatars for this month. Upgrade to Pro for unlimited."
```

`messages/es.json`:

```json
    "freeRemaining": "{used} de {limit} avatares gratuitos usados este mes",
    "freeLimitReached": "Has usado los {limit} avatares gratuitos del mes. Mejora a Pro para tener acceso ilimitado."
```

- [ ] **Step 5.4: Typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 5.5: Commit**

```bash
git add src/app/api/v1/avatar/generate/route.ts src/modules/astro-engine/components/AvatarGenerator.tsx messages/en.json messages/es.json
git commit -m "feat(avatar): enforce 3 free generations per month for non-Pro users

Atomically tracks monthly avatar generations via usage_counters and
returns 403 FREE_LIMIT_REACHED when exceeded. The avatar generator UI
shows remaining quota and a clear paywall message on hit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Task 6: Moon calendar — gate non-current month for free users

**Depends on:** Nothing.

**Files:**
- Modify: `src/app/api/v1/moon/calendar/[year]/[month]/route.ts` — return 403 for free users requesting a non-current month
- Modify: `src/modules/astro-engine/components/MoonCalendar.tsx` — disable prev/next nav for free + show paywall hint
- Modify: `messages/en.json` & `messages/es.json` — `moonPage.freeMonthOnly`, `moonPage.unlockFullCalendar`

### Background

The MoonCalendar UI uses linear approximation client-side and does NOT fetch `/api/v1/moon/calendar/[year]/[month]` today. Gating happens at the UI level (disable navigation arrows). We also gate the API for defense-in-depth — anyone calling the route directly cannot pull a non-current month without Pro.

"Current month" = the month containing today's date in UTC (we keep it server-authoritative to avoid timezone games).

### Steps

- [ ] **Step 6.1: Update the moon calendar API route**

Edit `src/app/api/v1/moon/calendar/[year]/[month]/route.ts`. Add imports:

```typescript
import { auth } from '@clerk/nextjs/server';
import { isPremium } from '@/modules/auth/lib/premium';
```

(Note: this route is currently unauthenticated. We keep it accessible to anonymous users for the current month — only the *non-current month* path requires Pro.)

After parameter validation (after the `month < 1 || month > 12` check), insert:

```typescript
  // ---------------------------------------------------------------------------
  // 2b. Free-tier gate — only the current UTC month is free
  // ---------------------------------------------------------------------------
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const isCurrentMonth = year === currentYear && month === currentMonth;

  if (!isCurrentMonth) {
    const { userId } = await auth();
    const userIsPremium = userId ? await isPremium(userId) : false;
    if (!userIsPremium) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'PREMIUM_REQUIRED',
          meta: { feature: 'moon_calendar_history' },
        },
        { status: 403 },
      );
    }
  }
```

- [ ] **Step 6.2: Update MoonCalendar UI to lock nav for free users**

Edit `src/modules/astro-engine/components/MoonCalendar.tsx`.

(a) Add to imports at the top:

```typescript
import { useSubscription } from '@/shared/hooks/useSubscription';
```

(b) Inside the `MoonCalendar` function (after the existing `const today = new Date();` line), add:

```typescript
const { isPro, isLoading: subLoading } = useSubscription();
```

(c) Replace `goToPrevMonth` and `goToNextMonth` to no-op for free users when navigating away from the current month:

```typescript
const goToPrevMonth = useCallback(() => {
  if (!isPro && !subLoading) {
    // Free users can't navigate away from the current month
    return;
  }
  setViewMonth((m) => {
    if (m === 1) {
      setViewYear((y) => y - 1);
      return 12;
    }
    return m - 1;
  });
}, [isPro, subLoading]);

const goToNextMonth = useCallback(() => {
  if (!isPro && !subLoading) {
    return;
  }
  setViewMonth((m) => {
    if (m === 12) {
      setViewYear((y) => y + 1);
      return 1;
    }
    return m + 1;
  });
}, [isPro, subLoading]);
```

(d) Add visual disabled state to the nav buttons. Find the prev/next buttons (around line 596–605 and 629–638) and add `disabled` + lock icon when `!isPro && !subLoading`:

For the prev button:
```typescript
<button
  onClick={goToPrevMonth}
  disabled={!isPro && !subLoading}
  className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-white/8 active:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-30 disabled:cursor-not-allowed"
  style={{ color: 'rgba(255,255,255,0.5)' }}
  aria-label={!isPro ? 'Previous month (Pro only)' : 'Previous month'}
>
```

(Same `disabled` and `aria-label` change for the next button.)

(e) Below the month-name + Today button row, add a paywall hint visible only when `!isPro && !subLoading`:

```tsx
{!isPro && !subLoading && (
  <p className="text-[10px] text-center text-white/30 mb-4 -mt-2">
    {/* Inline because MoonCalendar is a client component without next-intl wired in */}
    Free plan: current month only.{' '}
    <a href="/pricing" className="text-[#FFD700]/60 hover:text-[#FFD700]/80 underline">
      Unlock full calendar
    </a>
  </p>
)}
```

(Note: MoonCalendar already uses inline English strings in places. If you wire `useTranslations`, also add the keys below. Otherwise this inline copy is acceptable as a follow-up.)

- [ ] **Step 6.3: Add (optional) i18n strings**

`messages/en.json` — inside `"moonPage": { ... }`:

```json
    "freeMonthOnly": "Free plan: current month only.",
    "unlockFullCalendar": "Unlock full calendar"
```

`messages/es.json`:

```json
    "freeMonthOnly": "Plan gratuito: solo el mes actual.",
    "unlockFullCalendar": "Desbloquea el calendario completo"
```

- [ ] **Step 6.4: Typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 6.5: Commit**

```bash
git add src/app/api/v1/moon/calendar/ src/modules/astro-engine/components/MoonCalendar.tsx messages/en.json messages/es.json
git commit -m "feat(moon): gate non-current month for free users; show upgrade hint

API returns 403 PREMIUM_REQUIRED for any non-current UTC month from
non-Pro callers. The moon calendar UI disables prev/next arrows for
free users with a paywall hint linking to /pricing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Task 7: Planetary hours — gate non-today date for free users

**Depends on:** Nothing.

**Files:**
- Modify: `src/app/api/v1/hours/route.ts`
- Modify: `src/modules/astro-engine/components/PlanetaryHoursGrid.tsx`
- Modify: `messages/en.json` & `messages/es.json`

### Steps

- [ ] **Step 7.1: Update the hours API route**

Edit `src/app/api/v1/hours/route.ts`. Add imports near the top:

```typescript
import { auth } from '@clerk/nextjs/server';
import { isPremium } from '@/modules/auth/lib/premium';
```

After the existing date-resolution block (after the `if (dateParam) { ... } else { ... }` that builds `targetDate`), insert:

```typescript
  // Pro gate: free users can only request "today" (in their tz). Non-today requests
  // require a Pro subscription. We compare the requested date in the same timezone
  // as the resolved target.
  if (dateParam) {
    const todayInTz = toZonedTime(new Date(), timezone);
    const todayStr = `${todayInTz.getFullYear()}-${String(todayInTz.getMonth() + 1).padStart(2, '0')}-${String(todayInTz.getDate()).padStart(2, '0')}`;
    if (dateParam !== todayStr) {
      const { userId } = await auth();
      const userIsPremium = userId ? await isPremium(userId) : false;
      if (!userIsPremium) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            error: 'PREMIUM_REQUIRED',
            meta: { feature: 'hours_history' },
          },
          { status: 403 },
        );
      }
    }
  }
```

- [ ] **Step 7.2: Update PlanetaryHoursGrid to lock the date input for free users**

Edit `src/modules/astro-engine/components/PlanetaryHoursGrid.tsx`. Add to imports:

```typescript
import { useSubscription } from '@/shared/hooks/useSubscription';
```

Inside `PlanetaryHoursGrid`:

```typescript
const { isPro, isLoading: subLoading } = useSubscription();
```

Around the date input (find `value={selectedDate}` near line 282):

(a) Add the `disabled` attribute and helper text:

```tsx
<input
  type="date"
  value={selectedDate}
  onChange={(e) => setSelectedDate(e.target.value)}
  disabled={!isPro && !subLoading}
  aria-label={!isPro ? 'Date (Pro only — free locked to today)' : 'Date'}
  /* ...existing className and style... */
/>
{!isPro && !subLoading && (
  <p className="mt-1 text-[10px] text-white/35">
    Free plan: today only.{' '}
    <a href="/pricing" className="text-[#FFD700]/60 hover:text-[#FFD700]/80 underline">
      Unlock any date
    </a>
  </p>
)}
```

Also force `selectedDate` back to today when subscription resolves and user is free:

```typescript
useEffect(() => {
  if (!isPro && !subLoading && selectedDate !== toDateInputValue(new Date())) {
    setSelectedDate(toDateInputValue(new Date()));
  }
}, [isPro, subLoading, selectedDate]);
```

- [ ] **Step 7.3: Add i18n strings (optional polish)**

`messages/en.json` — inside `"hoursPage": { ... }`:

```json
    "freeTodayOnly": "Free plan: today only.",
    "unlockAnyDate": "Unlock any date"
```

`messages/es.json`:

```json
    "freeTodayOnly": "Plan gratuito: solo hoy.",
    "unlockAnyDate": "Desbloquea cualquier fecha"
```

- [ ] **Step 7.4: Typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 7.5: Commit**

```bash
git add src/app/api/v1/hours/route.ts src/modules/astro-engine/components/PlanetaryHoursGrid.tsx messages/en.json messages/es.json
git commit -m "feat(hours): gate non-today date for free users

Free callers requesting a date that isn't today (in the requested tz)
get 403 PREMIUM_REQUIRED. The hours grid disables the date input for
free users with a paywall hint, and forces selection back to today.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Task 8: Priority support — contact form + email routing

**Depends on:** Nothing.

**Files:**
- Create: `src/app/(marketing)/support/page.tsx`
- Create: `src/app/(marketing)/support/SupportForm.tsx`
- Create: `src/app/api/v1/support/contact/route.ts`
- Create: `src/shared/lib/__tests__/support-email.test.ts`
- Modify: `src/shared/lib/email.ts` — add `sendSupportEmail`
- Modify: `src/shared/lib/rate-limit.ts` — add `'support/contact'`
- Modify: `messages/en.json` & `messages/es.json`

### Background

"Priority support" doesn't need a help-desk system. Free + Pro both can submit a contact form; Pro emails get a `[PRIORITY]` subject prefix and include subscription metadata so the founder can route them first. This is honest with the paywall: Pro users do get faster handling.

The form sends to `hello@estrevia.app` via Resend. No need to store messages in DB (founder replies directly via email).

### Steps

- [ ] **Step 8.1: Add a rate limiter entry**

Edit `src/shared/lib/rate-limit.ts`. Inside the `limiters` object:

```typescript
  'support/contact': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '5m'),
    prefix: 'rl:support/contact',
  }),
```

- [ ] **Step 8.2: Add `sendSupportEmail` to email.ts**

Edit `src/shared/lib/email.ts`. After the existing `sendTrialEndingEmail` function, append:

```typescript
interface SupportEmailParams {
  fromEmail: string;
  isPro: boolean;
  plan: string;
  subject: string;
  message: string;
  userId: string | null;
}

const SUPPORT_INBOX = 'hello@estrevia.app';

export function buildSupportEmailBody(params: SupportEmailParams): {
  subject: string;
  text: string;
} {
  const tag = params.isPro ? '[PRIORITY] ' : '[Support] ';
  const subject = `${tag}${params.subject}`;
  const text = [
    `From: ${params.fromEmail}`,
    `User ID: ${params.userId ?? 'anonymous'}`,
    `Plan: ${params.plan}`,
    `Pro: ${params.isPro ? 'YES' : 'no'}`,
    '',
    '----- Message -----',
    params.message,
  ].join('\n');
  return { subject, text };
}

export async function sendSupportEmail(params: SupportEmailParams): Promise<void> {
  const resend = getResend();
  const { subject, text } = buildSupportEmailBody(params);
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: SUPPORT_INBOX,
    replyTo: params.fromEmail,
    subject,
    text,
  });
}
```

- [ ] **Step 8.3: Write the unit test for `buildSupportEmailBody` (TDD)**

Create `src/shared/lib/__tests__/support-email.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSupportEmailBody } from '../email';

describe('buildSupportEmailBody', () => {
  it('prefixes [PRIORITY] for Pro users', () => {
    const { subject } = buildSupportEmailBody({
      fromEmail: 'a@b.com',
      isPro: true,
      plan: 'pro_annual',
      subject: 'Help me',
      message: 'm',
      userId: 'u1',
    });
    expect(subject).toBe('[PRIORITY] Help me');
  });

  it('prefixes [Support] for free users', () => {
    const { subject } = buildSupportEmailBody({
      fromEmail: 'a@b.com',
      isPro: false,
      plan: 'free',
      subject: 'Help me',
      message: 'm',
      userId: 'u1',
    });
    expect(subject).toBe('[Support] Help me');
  });

  it('includes plan and userId in body', () => {
    const { text } = buildSupportEmailBody({
      fromEmail: 'a@b.com',
      isPro: true,
      plan: 'pro_annual',
      subject: 's',
      message: 'hello world',
      userId: 'user_abc',
    });
    expect(text).toContain('Plan: pro_annual');
    expect(text).toContain('User ID: user_abc');
    expect(text).toContain('Pro: YES');
    expect(text).toContain('hello world');
  });

  it('marks anonymous users when userId is null', () => {
    const { text } = buildSupportEmailBody({
      fromEmail: 'a@b.com',
      isPro: false,
      plan: 'free',
      subject: 's',
      message: 'm',
      userId: null,
    });
    expect(text).toContain('User ID: anonymous');
  });
});
```

- [ ] **Step 8.4: Run tests to verify pass**

```bash
npx vitest run src/shared/lib/__tests__/support-email.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 8.5: Create the contact API route**

Create `src/app/api/v1/support/contact/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { getCurrentUser } from '@/modules/auth/lib/helpers';
import { getSubscriptionDetails } from '@/modules/auth/lib/premium';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { sendSupportEmail } from '@/shared/lib/email';
import type { ApiResponse } from '@/shared/types';

const bodySchema = z.object({
  email: z.string().email().max(200),
  subject: z.string().min(3).max(200),
  message: z.string().min(10).max(5000),
});

export async function POST(
  request: Request,
): Promise<NextResponse<ApiResponse<{ ok: true }>>> {
  // 1. Resolve auth (optional — anon users can also send, but with anon metadata)
  const user = await getCurrentUser();
  const userId = user?.userId ?? null;

  // 2. Rate limit (per userId if signed in, else per IP)
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  const limiterKey = userId ?? ip;
  const limiter = getRateLimiter('support/contact');
  const { success: rateLimitOk } = await limiter.limit(limiterKey);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // 3. Parse body
  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    parsed = bodySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, data: null, error: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  // 4. Resolve subscription (for [PRIORITY] tag)
  let isPro = false;
  let plan = 'free';
  if (userId) {
    const sub = await getSubscriptionDetails(userId);
    isPro = sub.isPremium;
    plan = sub.plan;
  }

  // 5. Send email
  try {
    await sendSupportEmail({
      fromEmail: parsed.email,
      isPro,
      plan,
      subject: parsed.subject,
      message: parsed.message,
      userId,
    });
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[support/contact] send failed:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'SEND_FAILED' },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { success: true, data: { ok: true }, error: null },
    { status: 200 },
  );
}
```

- [ ] **Step 8.6: Create the support form client component**

Create `src/app/(marketing)/support/SupportForm.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/shared/hooks/useSubscription';

export function SupportForm() {
  const t = useTranslations('support');
  const { isPro } = useSubscription();
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/v1/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, subject, message }),
      });
      const data = await res.json();
      if (data.success) {
        setState('success');
        setEmail('');
        setSubject('');
        setMessage('');
      } else {
        setState('error');
        setError(t('errorSend'));
      }
    } catch {
      setState('error');
      setError(t('errorNetwork'));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isPro && (
        <p
          className="text-xs px-3 py-2 rounded-lg"
          style={{
            background: 'rgba(255,215,0,0.08)',
            color: 'rgba(255,215,0,0.9)',
            border: '1px solid rgba(255,215,0,0.25)',
          }}
        >
          {t('priorityBadge')}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="support-email" className="text-xs uppercase tracking-wider text-white/50">
          {t('emailLabel')}
        </label>
        <input
          id="support-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/85 focus:outline-none focus:border-white/30"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="support-subject" className="text-xs uppercase tracking-wider text-white/50">
          {t('subjectLabel')}
        </label>
        <input
          id="support-subject"
          type="text"
          required
          minLength={3}
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/85 focus:outline-none focus:border-white/30"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="support-message" className="text-xs uppercase tracking-wider text-white/50">
          {t('messageLabel')}
        </label>
        <textarea
          id="support-message"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/85 focus:outline-none focus:border-white/30 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={state === 'sending'}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black disabled:opacity-50"
      >
        {state === 'sending' ? t('sending') : t('submit')}
      </button>

      {state === 'success' && (
        <p className="text-sm text-emerald-400 text-center" role="status">
          {t('successMessage')}
        </p>
      )}

      {state === 'error' && error && (
        <p className="text-sm text-red-400 text-center" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 8.7: Create the support page**

Create `src/app/(marketing)/support/page.tsx`:

```typescript
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createMetadata } from '@/shared/seo/metadata';
import { SupportForm } from './SupportForm';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: 'Support',
    description: 'Get help with Estrevia. Pro members receive priority replies.',
    path: '/support',
    keywords: ['estrevia support', 'contact', 'help'],
  });
}

export default async function SupportPage() {
  const t = await getTranslations('support');

  return (
    <main className="min-h-screen px-4 py-16 max-w-xl mx-auto">
      <header className="mb-8 space-y-2">
        <p className="text-[10px] tracking-[0.22em] uppercase text-white/40">
          {t('eyebrow')}
        </p>
        <h1
          className="text-3xl font-light text-white/90"
          style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
        >
          {t('h1')}
        </h1>
        <p className="text-sm text-white/50 leading-relaxed">{t('description')}</p>
      </header>

      <SupportForm />
    </main>
  );
}
```

- [ ] **Step 8.8: Add i18n strings**

`messages/en.json` — add a top-level `"support": { ... }` block (next to `"settings"` or similar):

```json
  "support": {
    "eyebrow": "Help & Contact",
    "h1": "We're here to help",
    "description": "Send us a message. Pro members receive a reply within 24 hours.",
    "emailLabel": "Your email",
    "subjectLabel": "Subject",
    "messageLabel": "Message",
    "submit": "Send Message",
    "sending": "Sending...",
    "successMessage": "Thanks — we'll reply as soon as possible.",
    "errorSend": "Could not send your message. Please try again.",
    "errorNetwork": "Network error. Please check your connection.",
    "priorityBadge": "Pro support: priority reply within 24 hours"
  },
```

`messages/es.json`:

```json
  "support": {
    "eyebrow": "Ayuda y contacto",
    "h1": "Estamos para ayudarte",
    "description": "Envíanos un mensaje. Los miembros Pro reciben respuesta en menos de 24 horas.",
    "emailLabel": "Tu correo",
    "subjectLabel": "Asunto",
    "messageLabel": "Mensaje",
    "submit": "Enviar Mensaje",
    "sending": "Enviando...",
    "successMessage": "Gracias — te responderemos lo antes posible.",
    "errorSend": "No se pudo enviar tu mensaje. Inténtalo de nuevo.",
    "errorNetwork": "Error de red. Verifica tu conexión.",
    "priorityBadge": "Soporte Pro: respuesta prioritaria en menos de 24 horas"
  },
```

- [ ] **Step 8.9: Typecheck and run tests**

```bash
npm run typecheck && npx vitest run src/shared/lib/__tests__/support-email.test.ts
```

Expected: typecheck passes; 4 tests green.

- [ ] **Step 8.10: Commit**

```bash
git add src/app/\(marketing\)/support/ src/app/api/v1/support/ src/shared/lib/email.ts src/shared/lib/rate-limit.ts src/shared/lib/__tests__/support-email.test.ts messages/en.json messages/es.json
git commit -m "feat(support): add contact form with priority routing for Pro users

New /support page with a contact form that POSTs to /api/v1/support/contact.
The endpoint sends an email via Resend with a [PRIORITY] subject tag for
Pro users so the founder can route them first. Anonymous and free users
get [Support] tag. Rate-limited to 3 messages per 5 minutes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Task 9: Pricing copy honesty pass

**Depends on:** Tasks 2–8 (so the copy reflects what's actually delivered).

**Files:**
- Modify: `messages/en.json` (`pricing.freeFeatures`, `pricing.proFeatures`)
- Modify: `messages/es.json` (same)

### Background

The current copy promises "Full moon calendar" and "Planetary hours table" without saying what free users get. Free users actually have full access to today's data — only history is gated. We update copy to be specific.

### Steps

- [ ] **Step 9.1: Update English pricing strings**

Edit `messages/en.json`. Locate the `"freeFeatures"` block (line ~445):

Replace:
```json
    "freeFeatures": {
      "natalChart": "Natal chart (sidereal/tropical)",
      "cosmicPassport": "Cosmic Passport",
      "moonPhase": "Current moon phase",
      "planetaryHour": "Current planetary hour",
      "dailyTarot": "Daily Tarot Card",
      "treeOfLife": "Tree of Life",
      "oneSynastry": "1 synastry/day",
      "oneAvatar": "1 AI avatar",
      "essayPreview": "Essay previews"
    },
```

with:
```json
    "freeFeatures": {
      "natalChart": "Natal chart (sidereal/tropical)",
      "cosmicPassport": "Cosmic Passport",
      "moonPhase": "Current moon phase + this month",
      "planetaryHour": "Today's planetary hours",
      "dailyTarot": "Daily Tarot Card",
      "treeOfLife": "Tree of Life",
      "oneSynastry": "1 synastry per day",
      "oneAvatar": "3 AI avatars per month",
      "essayPreview": "Essay previews"
    },
```

Replace the `"proFeatures"` block:

```json
    "proFeatures": {
      "allEssays": "All 120+ essays",
      "fullCalendar": "Full moon calendar",
      "allHours": "Planetary hours table",
      "allSpreads": "All tarot spreads",
      "aiTarot": "AI tarot interpretation",
      "unlimitedSynastry": "Unlimited synastry",
      "aiAnalysis": "AI compatibility analysis",
      "treePersonal": "Personalized Tree of Life",
      "unlimitedAvatars": "Unlimited AI avatars",
      "prioritySupport": "Priority support"
    },
```

with:
```json
    "proFeatures": {
      "allEssays": "All 120+ essays — full text",
      "fullCalendar": "Moon calendar — any month, any year",
      "allHours": "Planetary hours — any past or future date",
      "allSpreads": "Three-Card and Celtic Cross spreads",
      "aiTarot": "AI tarot interpretation",
      "unlimitedSynastry": "Unlimited synastry calculations",
      "aiAnalysis": "AI compatibility analysis",
      "treePersonal": "Tree of Life with your natal planets",
      "unlimitedAvatars": "Unlimited AI avatars, all 4 styles",
      "prioritySupport": "Priority support — reply in < 24h"
    },
```

(Keep the existing key names — only the string values change. PaywallModal and PricingToggle reference these keys as `proFeatures.allEssays` etc.)

- [ ] **Step 9.2: Update Spanish pricing strings**

Edit `messages/es.json`. Locate the same blocks and update them mirror-symmetrically:

`freeFeatures`:
```json
    "freeFeatures": {
      "natalChart": "Carta natal (sidérea/trópical)",
      "cosmicPassport": "Pasaporte Cósmico",
      "moonPhase": "Fase lunar actual + este mes",
      "planetaryHour": "Horas planetarias de hoy",
      "dailyTarot": "Carta de Tarot diaria",
      "treeOfLife": "Árbol de la Vida",
      "oneSynastry": "1 sinastría por día",
      "oneAvatar": "3 avatares de IA por mes",
      "essayPreview": "Vista previa de ensayos"
    },
```

`proFeatures`:
```json
    "proFeatures": {
      "allEssays": "Todos los 120+ ensayos — texto completo",
      "fullCalendar": "Calendario lunar — cualquier mes, cualquier año",
      "allHours": "Horas planetarias — cualquier fecha pasada o futura",
      "allSpreads": "Tiradas de tres cartas y Cruz Celta",
      "aiTarot": "Interpretación de tarot con IA",
      "unlimitedSynastry": "Sinastrías ilimitadas",
      "aiAnalysis": "Análisis de compatibilidad con IA",
      "treePersonal": "Árbol de la Vida con tus planetas natales",
      "unlimitedAvatars": "Avatares ilimitados, los 4 estilos",
      "prioritySupport": "Soporte prioritario — respuesta en < 24h"
    },
```

- [ ] **Step 9.3: Verify the JSON is well-formed**

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('OK');"
```

Expected: `OK`. (If you get a parse error, the comma placement is wrong — fix and retry.)

- [ ] **Step 9.4: Commit**

```bash
git add messages/en.json messages/es.json
git commit -m "copy(pricing): make paywall feature list match actual deliverables

Spell out exactly what free vs Pro users get for each feature so the
paywall is not misleading: '3 AI avatars per month' instead of
'1 AI avatar', 'Today's planetary hours' for free vs 'any past/future
date' for Pro, etc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Task 10: Verification — typecheck, build, tests, manual smoke

**Depends on:** All prior tasks.

**Files:** none (verification only).

### Steps

- [ ] **Step 10.1: Full typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 10.2: Full unit test run**

```bash
npx vitest run
```

Expected: all tests pass. Pay particular attention to the new `usage.test.ts` and `support-email.test.ts`.

- [ ] **Step 10.3: Full production build**

```bash
npm run build
```

Expected: build succeeds, all routes compile. Note any new routes appear in the output:
- `/api/v1/synastry/[id]/analyze`
- `/api/v1/support/contact`
- `/tarot/spread`
- `/support`

- [ ] **Step 10.4: Lint**

```bash
npm run lint
```

Expected: no new errors. Fix any warnings the new code introduces (unused imports, missing deps in `useEffect`).

- [ ] **Step 10.5: Manual smoke tests (if dev environment available)**

Start `npm run dev` and verify each Pro promise:

| Promise | How to verify |
|---------|---------------|
| All 120+ essays | Sign in as free → open any essay → see truncated preview with "Read More" paywall. Upgrade → see full text. |
| Full moon calendar | Sign in as free → `/moon` → prev/next arrows are disabled, paywall hint visible. Upgrade → arrows work. |
| Planetary hours table | Sign in as free → `/hours` → date input disabled, hint visible. Upgrade → date picker works. |
| All tarot spreads | Visit `/tarot/spread` → tabs show two spreads, both gated for free. Upgrade → both draw cards. |
| AI tarot interpretation | In `/tarot/spread` (Pro) → draw 3-card → click "AI Interpretation" → text appears. |
| Unlimited synastry | Free: calculate twice → 2nd call returns 403 with upgrade CTA. Pro: 5+ calls work. |
| AI compatibility analysis | Pro → after synastry calc → click "Generate AI Analysis" → text appears. Click again → returns cached result instantly. |
| Personalized Tree of Life | Pro → `/tree-of-life` → toggle "Show Your Tree" → natal planets overlay. Free → toggle disabled. |
| Unlimited AI avatars | Free: generate 4 avatars in one month → 4th call returns 403. Pro: 5+ work. Style selector locked to 'cosmic' for free. |
| Priority support | `/support` → submit form as Pro → check `hello@estrevia.app` inbox → subject prefixed with `[PRIORITY]`. |

- [ ] **Step 10.6: Final review of paywall match**

Open the app's `PaywallModal` (anywhere it triggers). Read each row of the Pro feature list. For each row, point to the file/line in the codebase that delivers it. There should be no "TBD" or "stub" delivery — every line must map to working code.

If anything fails verification: fix it inline (small follow-up commit), then re-run Step 10.1–10.4.

- [ ] **Step 10.7: Final commit (if fixes were needed) and push**

```bash
git status
# If working tree clean → done. Otherwise:
git add <files>
git commit -m "fix(paywall): address verification findings

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Success criteria (for the whole plan)

The plan is done when **every item below is true**:

1. `usage_counters` table exists, migration committed.
2. `/tarot/spread` page renders both Three-Card and Celtic Cross. Both gated by Pro internally.
3. Free user can calculate exactly 1 synastry per day; second call returns 403 with `FREE_LIMIT_REACHED`.
4. Pro user can generate AI compatibility analysis; result is cached on `synastryResults.aiAnalysis`.
5. Free user can generate exactly 3 avatars per UTC month; 4th call returns 403.
6. Free user cannot navigate moon calendar past current month (UI + API both enforce).
7. Free user cannot pick a non-today date in planetary hours (UI + API both enforce).
8. `/support` page submits to `/api/v1/support/contact`; Pro emails get `[PRIORITY]` prefix.
9. Pricing copy in `messages/en.json` + `messages/es.json` accurately describes what each tier delivers.
10. `npm run typecheck` and `npx vitest run` and `npm run build` all pass clean.
