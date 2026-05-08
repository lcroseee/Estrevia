# Email-Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture email at the post-chart-calc moment of maximum intent via a modal gate, persist an idempotent `email_leads` row, and fire a deduped Meta Lead event (browser + CAPI) so cold-traffic ads accumulate a measurable mid-funnel intent signal.

**Architecture:** A `EmailGateModal` is mounted by `HeroCalculator` after chart-calc returns. Anonymous + first-time users see the gate; signed-in / returning users bypass. Submit → POST `/api/v1/leads` → INSERT ON CONFLICT in new `email_leads` table → server fires `trackServerEvent('email_lead_submitted', { $insert_id })` (which the existing analytics wrapper dispatches to PostHog + CAPI Lead). Browser fires `fbq('track','Lead', {}, { eventID })` with the same id only when `wasNew === true`. localStorage flag `email_gate_passed` prevents re-show within the same browser.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 6 strict · Drizzle ORM (Neon Postgres) · Upstash Redis (rate-limit) · `@clerk/nextjs` · `next-intl` · Zod · Vitest + jsdom · `nanoid` for IDs.

**Spec:** `docs/superpowers/specs/2026-05-07-email-gate-design.md`

---

## File structure

**Create:**

| Path | Responsibility |
|---|---|
| `src/shared/components/EmailGateModal.tsx` | Client modal UI, submit/dismiss flow, fbq fire on `wasNew=true` |
| `src/shared/components/__tests__/EmailGateModal.test.tsx` | Unit tests (~10 cases) |
| `src/app/api/v1/leads/route.ts` | POST endpoint: rate-limit, validate, insert-on-conflict, fire CAPI |
| `src/app/api/v1/leads/__tests__/route.test.ts` | Unit tests (~8 cases) |
| `src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx` | Integration tests for gate state-machine (~6 cases) |
| `drizzle/0008_<auto>_email_leads.sql` | Drizzle-generated migration. Filename is auto-named — verify after `db:generate` |

**Modify:**

| Path | Change |
|---|---|
| `src/shared/lib/schema.ts` | Add `emailLeads` `pgTable` + type alias |
| `src/shared/lib/rate-limit.ts` | Add `'leads'` bucket (10/hour) |
| `src/shared/lib/analytics.ts` | Add 3 `AnalyticsEvent` const values; add `'email_lead_submitted'` to `ESTREVIA_EVENT_NAMES` Set |
| `src/modules/advertising/meta-capi/types.ts` | Add `'email_lead_submitted'` to `EstreviaEvent` union |
| `src/modules/advertising/meta-capi/event-mapper.ts` | Add `email_lead_submitted: { pixel: 'Lead', capi: 'Lead' }` |
| `src/modules/astro-engine/components/HeroCalculator.tsx` | Add gate state machine; mount modal between form and result |
| `messages/en.json` | Add `emailGate` block (12 keys) |
| `messages/es.json` | Add `emailGate` block (12 keys, `tú` form, español neutro LATAM) |

**Conventions to follow (verified against current codebase):**
- IDs use `nanoid()` from `nanoid` (NOT `createId` from cuid2 — spec mentioned cuid2, but the codebase pattern is `nanoid`).
- API responses: `{ success: true, data: {...}, error: null }` on success; `{ success: false, data: null, error: 'CODE' }` on failure (mirrors `src/app/api/v1/chart/calculate/route.ts`).
- Sentry: dynamic `import('@sentry/nextjs')` inside `try/catch` to avoid hard dep.
- Modal patterns: focus trap, Escape key, `dialogRef`/`closeButtonRef`, backdrop, `role="dialog"`, `aria-modal="true"` (mirrors `src/shared/components/PaywallModal.tsx`).
- Tests for client components: `// @vitest-environment jsdom` directive at the top; mock `@clerk/nextjs` per `MetaPixelLeadEmitter.test.tsx`.

---

## Task 1: Add `email_leads` schema + generate migration

**Files:**
- Modify: `src/shared/lib/schema.ts` (append a new `pgTable` and a type alias)
- Create: `drizzle/0008_<auto>_email_leads.sql` (Drizzle-generated)

- [ ] **Step 1: Add `emailLeads` table definition + type alias**

Open `src/shared/lib/schema.ts`. Append immediately AFTER the `sentEmails` table block (around line 438, before the "Type aliases" section comment) and add the type alias inside the type-aliases section.

```ts
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
}, (table) => [
  index('email_leads_created_at_idx').on(table.createdAt),
  index('email_leads_converted_to_user_id_idx').on(table.convertedToUserId),
]);
```

Then in the "Type aliases" section near the bottom of the file, add:

```ts
export type EmailLead = typeof emailLeads.$inferSelect;
```

- [ ] **Step 2: Generate migration via Drizzle**

Run:

```bash
npm run db:generate
```

Expected: a new file appears at `drizzle/0008_<random_word>_email_leads.sql` (Drizzle auto-names with `<adjective>_<noun>` style — e.g. `0008_polite_warstar.sql`). Also a new `drizzle/meta/0008_snapshot.json` is produced.

Verify the SQL file contains:

```sql
CREATE TABLE "email_leads" (
        "id" text PRIMARY KEY NOT NULL,
        "email" text NOT NULL,
        "chart_id" text,
        "locale" text DEFAULT 'en' NOT NULL,
        "source" text DEFAULT 'hero_calculator' NOT NULL,
        "utm_source" text,
        "utm_medium" text,
        "utm_campaign" text,
        "utm_content" text,
        "utm_term" text,
        "anonymous_id" text,
        "ip_address_hash" text,
        "user_agent" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "converted_to_user_id" text,
        "converted_at" timestamp with time zone,
        "unsubscribed_at" timestamp with time zone,
        CONSTRAINT "email_leads_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "email_leads_created_at_idx" ON "email_leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_leads_converted_to_user_id_idx" ON "email_leads" USING btree ("converted_to_user_id");
```

If the SQL diverges (extra columns, missing index, locale enum check constraint), adjust the schema definition until it matches and re-generate.

- [ ] **Step 3: Verify typecheck still green**

Run:

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/schema.ts drizzle/0008_*.sql drizzle/meta/0008_snapshot.json drizzle/meta/0007_snapshot.json drizzle/meta/_journal.json
git commit -m "feat(email-gate/T1): add email_leads schema + migration 0008"
```

(`drizzle/meta/0007_snapshot.json` may be untracked from a prior generate run — include it so the journal stays consistent.)

---

## Task 2: Add `'leads'` rate-limit bucket

**Files:**
- Modify: `src/shared/lib/rate-limit.ts`

- [ ] **Step 1: Add `'leads'` entry to the limiters map**

In `src/shared/lib/rate-limit.ts`, locate the `limiters` object. Add an entry just below the `'support/contact'` entry (or anywhere; ordering does not matter):

```ts
  leads: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1h'),
    prefix: 'rl:leads',
  }),
```

Rationale: 10 submits per hour per IP. Real users submit once. The hourly window absorbs cross-tab retries without throttling first-time users.

- [ ] **Step 2: Verify typecheck**

Run:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/rate-limit.ts
git commit -m "feat(email-gate/T2): add 'leads' rate-limit bucket (10/hour)"
```

---

## Task 3: Wire `email_lead_submitted` event taxonomy

**Files:**
- Modify: `src/modules/advertising/meta-capi/types.ts`
- Modify: `src/modules/advertising/meta-capi/event-mapper.ts`
- Modify: `src/shared/lib/analytics.ts`

- [ ] **Step 1: Add event to `EstreviaEvent` union**

In `src/modules/advertising/meta-capi/types.ts`, modify the `EstreviaEvent` type:

```ts
export type EstreviaEvent =
  | 'landing_view'
  | 'chart_calculated'
  | 'passport_reshared'
  | 'user_registered'
  | 'email_lead_submitted'
  | 'paywall_opened'
  | 'subscription_started';
```

- [ ] **Step 2: Add CAPI mapping**

In `src/modules/advertising/meta-capi/event-mapper.ts`, modify `MAPPING_TABLE`:

```ts
export const MAPPING_TABLE: Record<EstreviaEvent, MappedEvent> = {
  landing_view: { pixel: 'PageView', capi: null },
  chart_calculated: { pixel: 'ViewContent', capi: 'ViewContent' },
  passport_reshared: { pixel: 'Share', capi: 'Share' },
  user_registered: { pixel: 'Lead', capi: 'Lead' },
  email_lead_submitted: { pixel: 'Lead', capi: 'Lead' },
  paywall_opened: { pixel: 'InitiateCheckout', capi: 'InitiateCheckout' },
  subscription_started: { pixel: null, capi: 'Subscribe' },
};
```

- [ ] **Step 3: Add `AnalyticsEvent` constants**

In `src/shared/lib/analytics.ts`, modify the `AnalyticsEvent` const. Add three entries near the existing `USER_REGISTERED` line (under "Auth" or grouped under a new "Email gate" comment):

```ts
  // Email gate — anonymous email-capture funnel
  EMAIL_LEAD_SUBMITTED: 'email_lead_submitted',
  EMAIL_LEAD_RESUBMITTED: 'email_lead_resubmitted', // PostHog only — no CAPI
  EMAIL_GATE_DISMISSED: 'email_gate_dismissed',     // PostHog only — no CAPI
```

- [ ] **Step 4: Add to `ESTREVIA_EVENT_NAMES` Set**

In the same file, modify `ESTREVIA_EVENT_NAMES` Set:

```ts
const ESTREVIA_EVENT_NAMES = new Set<EstreviaEvent>([
  'landing_view',
  'chart_calculated',
  'passport_reshared',
  'user_registered',
  'email_lead_submitted',
  'paywall_opened',
  'subscription_started',
]);
```

This Set gates CAPI dispatch in `trackServerEvent`. `email_lead_resubmitted` and `email_gate_dismissed` are PostHog-only by design — they must NOT be in this Set.

- [ ] **Step 5: Verify typecheck**

Run:

```bash
npm run typecheck
```

Expected: no errors. The `Record<EstreviaEvent, MappedEvent>` type forces all union members to be present in `MAPPING_TABLE`, so a missed mapping fails the build.

- [ ] **Step 6: Commit**

```bash
git add src/modules/advertising/meta-capi/types.ts src/modules/advertising/meta-capi/event-mapper.ts src/shared/lib/analytics.ts
git commit -m "feat(email-gate/T3): wire email_lead_submitted event taxonomy (Pixel+CAPI)"
```

---

## Task 4: Add `emailGate` i18n keys (EN + ES)

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/es.json`

- [ ] **Step 1: Add `emailGate` block to `messages/en.json`**

Insert this block as a top-level key. A safe location is immediately after the `paywall` block:

```json
  "emailGate": {
    "title": "See your sidereal chart",
    "subtitle": "Enter your email to reveal the chart we just calculated for you.",
    "emailLabel": "Email",
    "emailPlaceholder": "you@example.com",
    "submitCta": "See My Chart",
    "submittingCta": "Loading…",
    "dismissCta": "Skip for now",
    "privacyText": "By submitting, you agree to receive your chart and occasional astrology insights. Unsubscribe anytime.",
    "errInvalidEmail": "Please enter a valid email",
    "errRateLimited": "Too many attempts. Try again in a minute.",
    "errNetwork": "Connection issue. Try again.",
    "errGeneric": "Something went wrong. Try again."
  },
```

JSON commas: ensure the preceding block ends with `,` and the following block (or `}` if `emailGate` is last) is comma-handled correctly.

- [ ] **Step 2: Add `emailGate` block to `messages/es.json`**

Insert at the matching location. Use español neutro LATAM with `tú` form per `feedback_spanish_style`:

```json
  "emailGate": {
    "title": "Mira tu carta sideral",
    "subtitle": "Ingresa tu email para ver la carta que calculamos.",
    "emailLabel": "Email",
    "emailPlaceholder": "tu@ejemplo.com",
    "submitCta": "Ver mi carta",
    "submittingCta": "Cargando…",
    "dismissCta": "Saltar por ahora",
    "privacyText": "Al enviar, aceptas recibir tu carta y consejos ocasionales de astrología. Puedes cancelar la suscripción en cualquier momento.",
    "errInvalidEmail": "Por favor ingresa un email válido",
    "errRateLimited": "Demasiados intentos. Intenta de nuevo en un minuto.",
    "errNetwork": "Problema de conexión. Intenta de nuevo.",
    "errGeneric": "Algo salió mal. Intenta de nuevo."
  },
```

- [ ] **Step 3: Verify JSON validity**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));JSON.parse(require('fs').readFileSync('messages/es.json','utf8'));console.log('OK')"
```

Expected output: `OK`. If parse fails, fix the trailing-comma at the insertion point.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/es.json
git commit -m "feat(email-gate/T4): add emailGate i18n keys (en + es)"
```

---

## Task 5: POST `/api/v1/leads` route (TDD)

**Files:**
- Create: `src/app/api/v1/leads/route.ts`
- Create: `src/app/api/v1/leads/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/app/api/v1/leads/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ------------------------------------------------------------------
type LimitResult = { success: boolean };
const limitMock = vi.fn<(key: string) => Promise<LimitResult>>(async () => ({ success: true }));
vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({ limit: limitMock }),
}));

interface InsertedRow {
  id: string;
  email: string;
  ip_address_hash: string | null;
  utm_source: string | null;
}
const dbState: { rows: InsertedRow[] } = { rows: [] };
function resetDb() {
  dbState.rows = [];
}
const insertChain = {
  values: vi.fn(async (vals: Record<string, unknown>) => {
    const email = vals.email as string;
    if (dbState.rows.find((r) => r.email === email)) {
      return { rows: [] }; // ON CONFLICT DO NOTHING — no row returned
    }
    const row: InsertedRow = {
      id: vals.id as string,
      email,
      ip_address_hash: (vals.ipAddressHash as string | null) ?? null,
      utm_source: (vals.utmSource as string | null) ?? null,
    };
    dbState.rows.push(row);
    return { rows: [{ id: row.id }] };
  }),
};
const insertOnConflictDoNothing = {
  onConflictDoNothing: vi.fn(() => ({ returning: () => insertChain.values(lastInsertVals) })),
};
let lastInsertVals: Record<string, unknown> = {};
const insertBuilder = {
  values: vi.fn((vals: Record<string, unknown>) => {
    lastInsertVals = vals;
    return insertOnConflictDoNothing;
  }),
};
const selectChain = {
  from: vi.fn(() => ({
    where: vi.fn(async () => {
      const email = lastSelectEmail;
      const r = dbState.rows.find((row) => row.email === email);
      return r ? [{ id: r.id }] : [];
    }),
  })),
};
let lastSelectEmail = '';
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: () => insertBuilder,
    select: () => selectChain,
  }),
}));

const trackMock = vi.fn();
vi.mock('@/shared/lib/analytics', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/analytics')>('@/shared/lib/analytics');
  return { ...actual, trackServerEvent: trackMock };
});

// ---- Helpers ----------------------------------------------------------------
function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://test.local/api/v1/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.42', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetDb();
  limitMock.mockClear();
  trackMock.mockClear();
  insertBuilder.values.mockClear();
  insertOnConflictDoNothing.onConflictDoNothing.mockClear();
  // Default rate-limit allow
  limitMock.mockImplementation(async () => ({ success: true }));
  // Default select email
  lastSelectEmail = '';
  selectChain.from.mockClear();
});

// Lazy import so mocks register first
async function importPOST() {
  const mod = await import('../route');
  return mod.POST;
}

// ---- Tests ------------------------------------------------------------------
describe('POST /api/v1/leads', () => {
  it('returns 200 + wasNew=true and inserts a row for a fresh email', async () => {
    const POST = await importPOST();
    const req = makeRequest({
      email: 'jane@example.com',
      chartId: 'chart_123',
      locale: 'en',
    });
    const res = await POST(req);
    const json = await res.json() as { success: boolean; data: { leadId: string; eventId: string; wasNew: boolean } | null };
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data?.wasNew).toBe(true);
    expect(json.data?.leadId).toMatch(/^[A-Za-z0-9_-]{10,}$/);
    expect(json.data?.eventId).toBe(`${json.data!.leadId}:email_lead_submitted`);
    expect(dbState.rows).toHaveLength(1);
  });

  it('returns wasNew=false on second submit of the same email; only one row exists', async () => {
    const POST = await importPOST();
    const body = { email: 'dup@example.com', chartId: 'chart_x', locale: 'en' };
    const r1 = await POST(makeRequest(body));
    const j1 = await r1.json() as { data: { leadId: string; wasNew: boolean } };
    expect(j1.data.wasNew).toBe(true);

    // Re-insert: simulate select returning the existing id
    lastSelectEmail = 'dup@example.com';
    const r2 = await POST(makeRequest(body));
    const j2 = await r2.json() as { data: { leadId: string; wasNew: boolean } };
    expect(j2.data.wasNew).toBe(false);
    expect(j2.data.leadId).toBe(j1.data.leadId);
    expect(dbState.rows).toHaveLength(1);
  });

  it('returns 400 for invalid email format', async () => {
    const POST = await importPOST();
    const res = await POST(makeRequest({ email: 'not-an-email', locale: 'en' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when required field is missing', async () => {
    const POST = await importPOST();
    const res = await POST(makeRequest({ locale: 'en' }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limiter denies', async () => {
    limitMock.mockImplementation(async () => ({ success: false }));
    const POST = await importPOST();
    const res = await POST(makeRequest({ email: 'rl@example.com', locale: 'en' }));
    expect(res.status).toBe(429);
  });

  it('fires trackServerEvent with $insert_id on wasNew=true', async () => {
    const POST = await importPOST();
    await POST(makeRequest({
      email: 'tracked@example.com',
      chartId: 'chart_t',
      locale: 'en',
      utm_source: 'meta',
      utm_campaign: 'launch',
    }));
    expect(trackMock).toHaveBeenCalledTimes(1);
    const [, eventName, props] = trackMock.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(eventName).toBe('email_lead_submitted');
    expect(props.email).toBe('tracked@example.com');
    expect(props.utm_source).toBe('meta');
    expect(props.$insert_id).toMatch(/:email_lead_submitted$/);
  });

  it('does NOT fire trackServerEvent on wasNew=false', async () => {
    const POST = await importPOST();
    const body = { email: 'silent@example.com', chartId: 'chart_s', locale: 'en' };
    await POST(makeRequest(body));               // first → fires
    trackMock.mockClear();
    lastSelectEmail = 'silent@example.com';
    await POST(makeRequest(body));               // second → wasNew=false, no fire
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('hashes IP via SHA-256 (64 hex chars) — never stores plaintext', async () => {
    const POST = await importPOST();
    await POST(makeRequest(
      { email: 'iphash@example.com', locale: 'en' },
      { 'x-forwarded-for': '198.51.100.7' },
    ));
    const row = dbState.rows.find((r) => r.email === 'iphash@example.com');
    expect(row).toBeDefined();
    expect(row!.ip_address_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row!.ip_address_hash).not.toBe('198.51.100.7');
  });
});
```

- [ ] **Step 2: Run tests — verify they all FAIL**

Run:

```bash
npx vitest run src/app/api/v1/leads/__tests__/route.test.ts
```

Expected: all 8 tests fail with `Cannot find module '../route'` (route.ts not yet written).

- [ ] **Step 3: Implement the route handler**

Create `src/app/api/v1/leads/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { z, ZodError } from 'zod';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { emailLeads } from '@/shared/lib/schema';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { ApiResponse } from '@/shared/types';

interface LeadResponse {
  leadId: string;
  eventId: string;
  wasNew: boolean;
}

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  chartId: z.string().max(64).optional(),
  locale: z.enum(['en', 'es']).default('en'),
  utm_source: z.string().max(128).optional(),
  utm_medium: z.string().max(128).optional(),
  utm_campaign: z.string().max(128).optional(),
  utm_content: z.string().max(128).optional(),
  utm_term: z.string().max(128).optional(),
  anonymous_id: z.string().max(128).optional(),
});

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export async function POST(request: Request): Promise<NextResponse<ApiResponse<LeadResponse>>> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';

  const limiter = getRateLimiter('leads');
  const { success: rateLimitOk } = await limiter.limit(ip);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, data: null, error: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }
    throw err;
  }

  const userAgent = request.headers.get('user-agent') ?? null;
  const ipHash = ip === 'anonymous' ? null : sha256(ip);
  const newId = nanoid();

  let leadId: string;
  let wasNew: boolean;

  try {
    const db = getDb();
    const inserted = await db
      .insert(emailLeads)
      .values({
        id: newId,
        email: input.email,
        chartId: input.chartId ?? null,
        locale: input.locale,
        source: 'hero_calculator',
        utmSource: input.utm_source ?? null,
        utmMedium: input.utm_medium ?? null,
        utmCampaign: input.utm_campaign ?? null,
        utmContent: input.utm_content ?? null,
        utmTerm: input.utm_term ?? null,
        anonymousId: input.anonymous_id ?? null,
        ipAddressHash: ipHash,
        userAgent,
      })
      .onConflictDoNothing({ target: emailLeads.email })
      .returning({ id: emailLeads.id });

    if (inserted.length > 0) {
      leadId = inserted[0]!.id;
      wasNew = true;
    } else {
      const existing = await db
        .select({ id: emailLeads.id })
        .from(emailLeads)
        .where(eq(emailLeads.email, input.email));
      if (existing.length === 0) {
        // Race or unexpected state — treat as failure rather than fabricate an id.
        return NextResponse.json(
          { success: false, data: null, error: 'DATABASE_ERROR' },
          { status: 500 },
        );
      }
      leadId = existing[0]!.id;
      wasNew = false;
    }
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[leads] db error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }

  const eventId = `${leadId}:email_lead_submitted`;

  if (wasNew) {
    const distinctId = input.anonymous_id ?? `lead_${leadId}`;
    trackServerEvent(distinctId, AnalyticsEvent.EMAIL_LEAD_SUBMITTED, {
      email: input.email,
      $insert_id: eventId,
      utm_source: input.utm_source,
      utm_medium: input.utm_medium,
      utm_campaign: input.utm_campaign,
      utm_content: input.utm_content,
      utm_term: input.utm_term,
      source: 'hero_calculator',
      locale: input.locale,
    });
  }

  return NextResponse.json(
    { success: true, data: { leadId, eventId, wasNew }, error: null },
    { status: 200 },
  );
}
```

- [ ] **Step 4: Run tests — verify they all PASS**

Run:

```bash
npx vitest run src/app/api/v1/leads/__tests__/route.test.ts
```

Expected: 8/8 pass. If a test fails:
- "wasNew=false" test failing → check `lastSelectEmail` setup in the test mock (the second-call path triggers `select` only when `onConflictDoNothing.returning()` returns empty).
- "trackServerEvent fired" failing → confirm the mock factory uses `vi.importActual` (the route imports `AnalyticsEvent` AND `trackServerEvent` from the same module).
- "IP hashed" failing → confirm `request.headers.get('x-forwarded-for')` returns the override header in the test request.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/leads/route.ts src/app/api/v1/leads/__tests__/route.test.ts
git commit -m "feat(email-gate/T5): POST /api/v1/leads — insert on conflict + CAPI Lead"
```

---

## Task 6: `EmailGateModal` component (TDD)

**Files:**
- Create: `src/shared/components/EmailGateModal.tsx`
- Create: `src/shared/components/__tests__/EmailGateModal.test.tsx`

- [ ] **Step 1: Write the failing test file**

Create `src/shared/components/__tests__/EmailGateModal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// next-intl: simple identity-mapping mock — keys come back unchanged.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// PostHog client probe (window.posthog) — distinctId helper
beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete (window as unknown as { fbq?: unknown }).fbq;
  delete (window as unknown as { posthog?: unknown }).posthog;
});

function makeFbqMock() {
  const fbq = vi.fn();
  (window as unknown as { fbq: typeof fbq }).fbq = fbq;
  return fbq;
}

function makePosthogMock() {
  const ph = {
    get_distinct_id: vi.fn(() => 'ph_anon_xyz'),
    capture: vi.fn(),
  };
  (window as unknown as { posthog: typeof ph }).posthog = ph;
  return ph;
}

import { EmailGateModal } from '../EmailGateModal';

const baseProps = {
  open: true,
  chartId: 'chart_test_1',
  locale: 'en' as const,
  onSubmitted: vi.fn(),
  onDismiss: vi.fn(),
};

beforeEach(() => {
  baseProps.onSubmitted.mockClear();
  baseProps.onDismiss.mockClear();
});

describe('EmailGateModal', () => {
  it('renders when open=true', () => {
    render(<EmailGateModal {...baseProps} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('renders nothing when open=false', () => {
    render(<EmailGateModal {...baseProps} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('disables submit when email is empty', () => {
    render(<EmailGateModal {...baseProps} />);
    const submit = screen.getByRole('button', { name: 'submitCta' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('shows inline error and does NOT fetch for an invalid email', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(<EmailGateModal {...baseProps} />);
    const input = screen.getByLabelText('emailLabel') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => {
      expect(screen.getByText('errInvalidEmail')).toBeTruthy();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submits a valid email; on wasNew=true fires fbq Lead with returned eventID + writes localStorage flag + calls onSubmitted', async () => {
    makePosthogMock();
    const fbq = makeFbqMock();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { leadId: 'lead_abc', eventId: 'lead_abc:email_lead_submitted', wasNew: true }, error: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'good@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => expect(baseProps.onSubmitted).toHaveBeenCalled());
    expect(fbq).toHaveBeenCalledWith(
      'track',
      'Lead',
      {},
      { eventID: 'lead_abc:email_lead_submitted' },
    );
    expect(window.localStorage.getItem('email_gate_passed')).toBe('1');
  });

  it('on wasNew=false does NOT fire fbq but still sets flag, calls onSubmitted, and tracks email_lead_resubmitted', async () => {
    const ph = makePosthogMock();
    const fbq = makeFbqMock();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { leadId: 'lead_x', eventId: 'lead_x:email_lead_submitted', wasNew: false }, error: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'returning@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => expect(baseProps.onSubmitted).toHaveBeenCalled());
    expect(fbq).not.toHaveBeenCalled();
    expect(ph.capture).toHaveBeenCalledWith('email_lead_resubmitted', expect.any(Object));
    expect(window.localStorage.getItem('email_gate_passed')).toBe('1');
  });

  it('shows errRateLimited on 429 and does not fire fbq', async () => {
    const fbq = makeFbqMock();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: false, data: null, error: 'RATE_LIMITED' }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    ));
    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'rl@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => {
      expect(screen.getByText('errRateLimited')).toBeTruthy();
    });
    expect(fbq).not.toHaveBeenCalled();
  });

  it('shows errNetwork when fetch rejects', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'net@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => {
      expect(screen.getByText('errNetwork')).toBeTruthy();
    });
  });

  it('dismiss button calls onDismiss, sets flag, tracks email_gate_dismissed, no fbq', () => {
    const ph = makePosthogMock();
    const fbq = makeFbqMock();
    render(<EmailGateModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'dismissCta' }));
    expect(baseProps.onDismiss).toHaveBeenCalled();
    expect(window.localStorage.getItem('email_gate_passed')).toBe('1');
    expect(ph.capture).toHaveBeenCalledWith('email_gate_dismissed', expect.any(Object));
    expect(fbq).not.toHaveBeenCalled();
  });

  it('Escape key triggers onDismiss', () => {
    render(<EmailGateModal {...baseProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(baseProps.onDismiss).toHaveBeenCalled();
  });

  it('tolerates localStorage throwing on setItem (silent fail, still onSubmitted)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { leadId: 'lead_ls', eventId: 'lead_ls:email_lead_submitted', wasNew: true }, error: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    makeFbqMock();
    render(<EmailGateModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'ls@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'submitCta' }));
    await waitFor(() => expect(baseProps.onSubmitted).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run tests — verify they all FAIL**

Run:

```bash
npx vitest run src/shared/components/__tests__/EmailGateModal.test.tsx
```

Expected: all 11 tests fail with `Cannot find module '../EmailGateModal'`.

- [ ] **Step 3: Implement the modal component**

Create `src/shared/components/EmailGateModal.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { readUtmCookie } from '@/shared/lib/utm-cookie';

interface EmailGateModalProps {
  open: boolean;
  onSubmitted: () => void;
  onDismiss: () => void;
  chartId: string;
  locale: 'en' | 'es';
}

interface LeadOk {
  success: true;
  data: { leadId: string; eventId: string; wasNew: boolean };
  error: null;
}
interface LeadErr {
  success: false;
  data: null;
  error: string;
}
type LeadResponse = LeadOk | LeadErr;

type FbqGlobal = (
  command: 'track',
  event: 'Lead',
  data: Record<string, unknown>,
  options: { eventID: string },
) => void;

const STORAGE_FLAG = 'email_gate_passed';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getDistinctId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const ph = (window as unknown as { posthog?: { get_distinct_id?: () => string } }).posthog;
  try {
    return ph?.get_distinct_id?.();
  } catch {
    return undefined;
  }
}

function safeSetFlag(): void {
  try {
    window.localStorage.setItem(STORAGE_FLAG, '1');
  } catch {
    /* private mode / quota — ignore */
  }
}

export function EmailGateModal({ open, onSubmitted, onDismiss, chartId, locale }: EmailGateModalProps) {
  const t = useTranslations('emailGate');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Escape + focus-trap (mirrors PaywallModal pattern)
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleDismiss();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDismiss = useCallback(() => {
    safeSetFlag();
    trackEvent(AnalyticsEvent.EMAIL_GATE_DISMISSED, { chartId, locale });
    onDismiss();
  }, [chartId, locale, onDismiss]);

  if (!open) return null;

  const trimmed = email.trim();
  const submitDisabled = loading || trimmed.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (!EMAIL_REGEX.test(trimmed)) {
      setError(t('errInvalidEmail'));
      return;
    }

    setLoading(true);
    try {
      const utm = readUtmCookie() ?? {};
      const anonymous_id = getDistinctId();
      const res = await fetch('/api/v1/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed.toLowerCase(),
          chartId,
          locale,
          anonymous_id,
          ...utm,
        }),
      });

      if (res.status === 429) {
        setError(t('errRateLimited'));
        return;
      }

      let json: LeadResponse;
      try {
        json = (await res.json()) as LeadResponse;
      } catch {
        setError(t('errGeneric'));
        return;
      }

      if (!res.ok || !json.success) {
        setError(t('errGeneric'));
        return;
      }

      const { eventId, wasNew } = json.data;

      if (wasNew) {
        const fbq = (window as unknown as { fbq?: FbqGlobal }).fbq;
        if (typeof fbq === 'function') {
          try {
            fbq('track', 'Lead', {}, { eventID: eventId });
          } catch {
            /* fbq is best-effort */
          }
        }
      } else {
        trackEvent(AnalyticsEvent.EMAIL_LEAD_RESUBMITTED, { chartId, locale });
      }

      safeSetFlag();
      onSubmitted();
    } catch {
      setError(t('errNetwork'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleDismiss}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="relative z-10 w-full md:max-w-md md:rounded-2xl rounded-t-2xl bg-[#0F0F17] border border-white/8 shadow-2xl shadow-black/60 max-h-[90vh] overflow-y-auto"
      >
        <button
          ref={closeButtonRef}
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <form onSubmit={handleSubmit} noValidate className="px-6 pt-8 pb-6">
          <div className="text-center mb-6">
            <h2
              className="text-2xl font-light text-white mb-1"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('title')}
            </h2>
            <p className="text-sm text-white/45">{t('subtitle')}</p>
          </div>

          <label htmlFor="email-gate-input" className="block text-xs text-white/60 uppercase tracking-widest mb-2">
            {t('emailLabel')}
          </label>
          <input
            id="email-gate-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFD700]/40 focus:bg-white/8"
            aria-invalid={!!error}
            aria-describedby={error ? 'email-gate-error' : undefined}
          />

          {error && (
            <p id="email-gate-error" className="text-xs text-red-400 mt-2" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitDisabled}
            className="mt-4 w-full py-3.5 px-6 rounded-xl text-sm font-semibold tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #FFD700, #FFE033)',
              color: '#0A0A0F',
            }}
            aria-busy={loading}
          >
            {loading ? t('submittingCta') : t('submitCta')}
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="mt-2 w-full py-2.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            {t('dismissCta')}
          </button>

          <p className="text-[11px] text-white/25 text-center mt-3 leading-relaxed">
            {t('privacyText')}
          </p>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify they all PASS**

Run:

```bash
npx vitest run src/shared/components/__tests__/EmailGateModal.test.tsx
```

Expected: 11/11 pass. If a test fails:
- "renders dialog" failing → check that the `useTranslations` mock is hoisted before the import (it is via `vi.mock` — vitest hoists automatically).
- "submit disabled empty" failing → check `submitDisabled = loading || trimmed.length === 0`.
- "fbq fires" failing → confirm the test sets `window.fbq` BEFORE `render()` (the mock in beforeEach + makeFbqMock pattern handles this).

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/EmailGateModal.tsx src/shared/components/__tests__/EmailGateModal.test.tsx
git commit -m "feat(email-gate/T6): add EmailGateModal component (focus trap, dedup'd Lead fbq)"
```

---

## Task 7: `HeroCalculator` gate integration (TDD)

**Files:**
- Modify: `src/modules/astro-engine/components/HeroCalculator.tsx`
- Create: `src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`

- [ ] **Step 1: Write the failing test file**

Create `src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// next-intl mock — keys-as-values + locale
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocale: () => 'en',
}));

// Clerk mock — toggleable
let useUserReturn: { isSignedIn: boolean } = { isSignedIn: false };
vi.mock('@clerk/nextjs', () => ({
  useUser: () => useUserReturn,
}));

// next-intl navigation: identity Link
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('a', props, children),
}));

// Search params mock — URLSearchParams-driven
let searchParamsValue = new URLSearchParams();
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useSearchParams: () => searchParamsValue,
  };
});

// EmailGateModal stub: exposes calls so we can verify mounting + props
const onSubmittedHandlers: Array<() => void> = [];
const onDismissHandlers: Array<() => void> = [];
let lastModalProps: { open: boolean; chartId: string; locale: 'en' | 'es' } | null = null;
vi.mock('@/shared/components/EmailGateModal', () => ({
  EmailGateModal: (props: {
    open: boolean;
    chartId: string;
    locale: 'en' | 'es';
    onSubmitted: () => void;
    onDismiss: () => void;
  }) => {
    lastModalProps = { open: props.open, chartId: props.chartId, locale: props.locale };
    if (props.open) {
      onSubmittedHandlers.length = 0;
      onSubmittedHandlers.push(props.onSubmitted);
      onDismissHandlers.length = 0;
      onDismissHandlers.push(props.onDismiss);
    }
    return props.open ? React.createElement('div', { 'data-testid': 'gate-modal' }) : null;
  },
}));

// Stub child input components — too heavy + irrelevant to gate logic
vi.mock('../CityAutocomplete', () => ({
  CityAutocomplete: ({ onCitySelect, onChange }: {
    onCitySelect: (c: { name: string; latitude: number; longitude: number; timezone: string }) => void;
    onChange: (v: string) => void;
  }) => React.createElement('button', {
    'data-testid': 'pick-city',
    onClick: () => {
      onChange('Test City');
      onCitySelect({ name: 'Test City', latitude: 10, longitude: 20, timezone: 'UTC' });
    },
  }, 'pick city'),
}));
vi.mock('../DateInput', () => ({
  DateInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    React.createElement('input', {
      'data-testid': 'date-input',
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    }),
}));
vi.mock('../TimePickerField', () => ({
  TimePickerField: () => null,
}));

import { HeroCalculator } from '../HeroCalculator';

const fakeChartResponse = {
  success: true,
  data: {
    chartId: 'chart_int_1',
    chart: {
      planets: [{ planet: 'Sun', sign: 'Leo', signDegree: 12.34 }],
    },
  },
};

async function fillFormAndSubmit() {
  fireEvent.change(screen.getByTestId('date-input'), { target: { value: '1990-08-15' } });
  fireEvent.click(screen.getByTestId('pick-city'));
  fireEvent.click(screen.getByRole('button', { name: /submit/i }));
}

beforeEach(() => {
  useUserReturn = { isSignedIn: false };
  searchParamsValue = new URLSearchParams();
  window.localStorage.clear();
  lastModalProps = null;
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
    JSON.stringify(fakeChartResponse),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));
});

describe('HeroCalculator gate state machine', () => {
  it('mounts EmailGateModal with open=true after chart-calc when anonymous + no flag set', async () => {
    render(<HeroCalculator />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('gate-modal')).toBeTruthy();
    });
    expect(lastModalProps?.open).toBe(true);
    expect(lastModalProps?.chartId).toBe('chart_int_1');
  });

  it('does NOT mount the modal when user is signed in', async () => {
    useUserReturn = { isSignedIn: true };
    render(<HeroCalculator />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('Leo')).toBeTruthy();
    });
    expect(screen.queryByTestId('gate-modal')).toBeNull();
  });

  it('does NOT mount the modal when localStorage flag is already set', async () => {
    window.localStorage.setItem('email_gate_passed', '1');
    render(<HeroCalculator />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('Leo')).toBeTruthy();
    });
    expect(screen.queryByTestId('gate-modal')).toBeNull();
  });

  it('does NOT mount the modal when ?no_gate=1 is set', async () => {
    searchParamsValue = new URLSearchParams('no_gate=1');
    render(<HeroCalculator />);
    await fillFormAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('Leo')).toBeTruthy();
    });
    expect(screen.queryByTestId('gate-modal')).toBeNull();
  });

  it('on modal onSubmitted closes the gate and reveals the chart result', async () => {
    render(<HeroCalculator />);
    await fillFormAndSubmit();
    await waitFor(() => expect(screen.getByTestId('gate-modal')).toBeTruthy());
    expect(screen.queryByText('Leo')).toBeNull();

    act(() => {
      onSubmittedHandlers[0]?.();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('gate-modal')).toBeNull();
      expect(screen.getByText('Leo')).toBeTruthy();
    });
  });

  it('on modal onDismiss closes the gate and reveals the chart result', async () => {
    render(<HeroCalculator />);
    await fillFormAndSubmit();
    await waitFor(() => expect(screen.getByTestId('gate-modal')).toBeTruthy());

    act(() => {
      onDismissHandlers[0]?.();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('gate-modal')).toBeNull();
      expect(screen.getByText('Leo')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they all FAIL**

Run:

```bash
npx vitest run src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx
```

Expected: tests fail because the gate state machine is not yet implemented (the result will render immediately for the anonymous case).

- [ ] **Step 3: Modify `HeroCalculator.tsx` to add the gate state machine**

Open `src/modules/astro-engine/components/HeroCalculator.tsx`. Apply the following changes:

**(a)** Update imports at the top (around line 23):

```tsx
import { useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { EmailGateModal } from '@/shared/components/EmailGateModal';
import { CityAutocomplete } from './CityAutocomplete';
import { DateInput } from './DateInput';
import { TimePickerField } from './TimePickerField';
import type { CitySearchResult } from '@/shared/types';
```

**(b)** Inside the `HeroCalculator` component, immediately AFTER the existing `const t = useTranslations('heroCalc');` line (around line 150) and BEFORE the existing `const [form, setForm] = useState<FormState>(...)`, add ONLY these new lines (do not duplicate the `t` declaration):

```tsx
  const locale = useLocale() as 'en' | 'es';
  const { isSignedIn } = useUser();
  const searchParams = useSearchParams();
  const [gateOpen, setGateOpen] = useState(false);
  const [gateBypassed, setGateBypassed] = useState(false);
```

**(c)** Add the `shouldShowGate` helper as a private function inside the component, just after the `validate` callback definition (around line 195):

```tsx
  const shouldShowGate = useCallback((): boolean => {
    if (isSignedIn) return false;
    if (searchParams?.get('no_gate') === '1') return false;
    if (gateBypassed) return false;
    if (typeof window === 'undefined') return false;
    try {
      if (window.localStorage.getItem('email_gate_passed')) return false;
    } catch {
      /* private mode — fall through, gate shows */
    }
    return true;
  }, [isSignedIn, searchParams, gateBypassed]);
```

**(d)** In `handleSubmit`, after the `setResult({...})` line (around line 242), wrap the reveal:

```tsx
        const heroResult = {
          sunSign: sunPlanet.sign,
          sunDegree: sunPlanet.signDegree,
          chartId: json.data.chartId,
        };
        setResult(heroResult);
        if (shouldShowGate()) {
          setGateOpen(true);
        }
```

**(e)** Modify the result-render guard. The current code is `if (result) { return <result-card />; }`. Change it to render the gate alongside (or in place of) the result card:

```tsx
  // ── Result card + optional gate ──────────────────────────────────────────
  if (result) {
    const signInfo = SIGN_ELEMENTS[result.sunSign];
    const glyph = SIGN_GLYPHS[result.sunSign] ?? '';
    const elementLabel = signInfo ? t(`elements.${signInfo.element}`) : '';

    return (
      <>
        <style>{HERO_CALC_STYLES}</style>
        {gateOpen && (
          <EmailGateModal
            open={gateOpen}
            chartId={result.chartId}
            locale={locale}
            onSubmitted={() => { setGateOpen(false); setGateBypassed(true); }}
            onDismiss={() => { setGateOpen(false); setGateBypassed(true); }}
          />
        )}
        {!gateOpen && (
          <div
            key="result"
            className="w-full hc-result-card"
            role="region"
            aria-label={t('resultAria')}
            aria-live="polite"
          >
            {/* ... existing result-card JSX unchanged ... */}
          </div>
        )}
      </>
    );
  }
```

(Leave the inner result-card markup unchanged; only wrap with the `{!gateOpen && (...)}` conditional and add the modal alongside.)

**(f)** Update the `onClick` of the "Try Another" button (currently `() => setResult(null)`) to also reset `gateOpen` and `gateBypassed`:

```tsx
            onClick={() => {
              setResult(null);
              setGateOpen(false);
              setGateBypassed(false);
            }}
```

- [ ] **Step 4: Run tests — verify they all PASS**

Run:

```bash
npx vitest run src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx
```

Expected: 6/6 pass. Common issues:
- "mounts modal" failing → check `setGateOpen(true)` runs in the success branch BEFORE the early-`return` in `handleSubmit`'s catch path.
- "signed-in skips gate" failing → confirm `useUser()` mock returns `{ isSignedIn: true }` and `shouldShowGate` returns `false` first.
- "Try Another resets" → covered by the existing test if the previous render leaves `result=null` and `gateOpen=false`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/HeroCalculator.tsx src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx
git commit -m "feat(email-gate/T7): HeroCalculator gates anonymous result reveal behind email modal"
```

---

## Task 8: Final verification + green build

**Files:** none modified — verification only.

- [ ] **Step 1: Run full typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: zero errors. If a lint warning surfaces, fix it inline (no `// eslint-disable` unless surgical and with a one-line comment).

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass — including the 4 new files plus all pre-existing tests.

- [ ] **Step 4: Verify build produces no warnings**

```bash
npm run build
```

Expected: build completes without errors. Watch for:
- Drizzle pgcrypto / index syntax warnings → indicates `index('...')` import missing from schema.ts (already present from earlier).
- "useSearchParams() should be wrapped in a suspense boundary" → if it fires, wrap the component or its caller in `<Suspense>`. The landing page `app/[locale]/page.tsx` already imports HeroCalculator — verify it's already inside a Suspense boundary or add one.

- [ ] **Step 5: If any verification step failed, fix and re-commit**

```bash
# Example fix-up commit
git add <files>
git commit -m "fix(email-gate/T8): address typecheck/lint/build issue"
```

- [ ] **Step 6: Final commit (release notes)**

This step has no code changes — it's a marker that all verification gates passed. Skip this commit if Step 5 already produced one.

---

## Out-of-band founder steps (post-merge)

These are NOT for the implementer — they require credentials only the founder has. List them in the final PR / merge note, and in `MEMORY.md` after shipping.

1. **Run prod migrations.** Two migrations are pending against prod `DATABASE_URL`:
   - `0007_polite_warstar.sql` (already on `main`, never run against prod — `users.locale` column).
   - `0008_<auto>_email_leads.sql` (this plan).

   Both must run together: `npm run db:migrate` (with `DATABASE_URL` pointed at prod). Run once, monitor for failures.

2. **Vercel auto-deploys** the merge to `main`. No manual deploy step.

3. **Smoke test on prod:**
   - Open prod `/` in an incognito window.
   - Calculate a chart.
   - Confirm the modal appears.
   - Submit a test email (e.g. `smoke+<timestamp>@<your-domain>`).
   - Confirm chart renders.
   - Query `email_leads` table for the new row.
   - Open Meta Events Manager → Test Events tab → with `?fbclid=test_<random>` — confirm `Lead` event appears Browser+Server merged on one row with matching `event_id`.

4. **PostHog dashboard tile** — track:
   - `email_lead_submitted` count / day
   - `email_gate_dismissed` count / day
   - `email_lead_resubmitted` count / day
   - Ratio: `email_lead_submitted / chart_calculated` (gate conversion rate; expected: 30-60%).

5. **7-14 day monitor** — watch Meta Match Quality Score recalculation. Lead score should move from Low/Medium → Medium/High once events accumulate.

---

## Self-review checklist (post-write, pre-handoff)

**Spec coverage:**
- ✅ Schema (Task 1) — covers `email_leads` table from Spec §Architecture/schema.ts
- ✅ Migration (Task 1) — covers Spec §Migration
- ✅ Rate limit (Task 2) — covers Spec §POST `/api/v1/leads/route.ts` rate-limit
- ✅ Event taxonomy (Task 3) — covers Spec §analytics.ts + event-mapper.ts + types.ts
- ✅ i18n (Task 4) — covers Spec §i18n EN+ES
- ✅ API endpoint (Task 5) — covers Spec §POST /api/v1/leads route + tests (~7 cases)
- ✅ Modal (Task 6) — covers Spec §EmailGateModal + tests (~10 cases)
- ✅ HeroCalculator integration (Task 7) — covers Spec §HeroCalculator + tests
- ✅ Verification (Task 8) — covers Spec §Release checklist items 1-2

**Type consistency:**
- `email_leads` table column names match between schema (camelCase TS) and migration (snake_case SQL). Confirmed via Drizzle convention.
- API response shape `{ success, data: { leadId, eventId, wasNew }, error }` is consistent across route impl, route tests, and modal consumer.
- `EstreviaEvent` union, `MAPPING_TABLE` keys, `ESTREVIA_EVENT_NAMES` Set membership, and `AnalyticsEvent` const all reference the same string `'email_lead_submitted'`.

**Placeholder scan:** zero TBDs, zero "implement appropriate error handling", zero "similar to Task N". All steps include code blocks where code is required.

---

**Estimated effort:** 2-3 hours of subagent execution wall-clock (Tasks 1-8 sequentially with implementer + 2-stage review per task).
