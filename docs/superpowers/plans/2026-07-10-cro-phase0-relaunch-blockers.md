# CRO Phase 0 — Relaunch Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the four verified money-path P0s + relaunch instrumentation + ES pre-spend blockers + the tarot SSR crash, in one deploy, so Meta re-spend is unblocked.

**Architecture:** Seven independent tracks over existing code (two webhooks, PaywallModal, /chart page, PostHogProvider, i18n messages, tarot page) plus four new ops scripts (2 backfills, 2 Meta Graph API) and one migration applier. No new services; no schema changes beyond already-committed migration 0018. Spec: `docs/superpowers/specs/2026-07-10-cro-phase0-relaunch-blockers-design.md`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Drizzle ORM 0.45.2 + Neon, Clerk, Stripe, PostHog (posthog-js + posthog-node), Resend, Vitest + Playwright, Meta Graph API v23.0.

## Global Constraints

- i18n message files live at `messages/en.json` and `messages/es.json` (repo root) — NOT `src/i18n/messages/`.
- Placeholder email literal: `` `stripe-pending-${clerkUserId}@placeholder.invalid` `` — match with SQL `LIKE 'stripe-pending-%@placeholder.invalid'`.
- Webhooks must never log raw errors or emails (PII rule); log `{ message, name }` only. Non-fatal side-effects use try/catch + `console.warn`/`console.error` + Sentry and never fail the webhook.
- All prod-mutating scripts are dry-run by default with `--apply` gate (house convention: `const APPLY = process.argv.includes('--apply')`).
- Never run `npm run db:migrate` against prod (journal drift 0013–0017; `__drizzle_migrations` empty). Apply SQL via Neon `Pool` + `ws` (HTTP driver silently fails DDL — `docs/runbooks/2026-05-24-discount-launch-executed.md:18`).
- Tests: `npx vitest run <path>` for single files; full gate = `npx vitest run` + `npm run typecheck` + `npm run lint` (lint: ignore `.claude/worktrees/**` noise). E2E: `npm run test:e2e` (workers=1, dev server auto-started).
- Component tests need `// @vitest-environment jsdom` pragma (vitest default env is node).
- Commit style: `fix(cro-phase0/T<n>): <what>` / `feat(cro-phase0/T<n>): <what>` / `test(...)` / `chore(...)`.
- Do not touch `content/` except nothing in this plan touches it (tarot fix is code-side, NOT a cards.json backfill).
- `session.customer_details?.email` is nullable — every use must handle null.

---

### Task 1: Shared unique-violation helper

**Files:**
- Create: `src/shared/lib/db-errors.ts`
- Test: `src/shared/lib/__tests__/db-errors.test.ts`

**Interfaces:**
- Produces: `isUniqueViolation(err: unknown): boolean` — true when a Postgres error (or its `cause`) has `code === '23505'`. Consumed by Tasks 2 and 3.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/__tests__/db-errors.test.ts
import { describe, it, expect } from 'vitest';
import { isUniqueViolation } from '../db-errors';

describe('isUniqueViolation', () => {
  it('detects a direct code property', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });
  it('detects a nested cause.code (drizzle/neon wrapping)', () => {
    const err = new Error('duplicate key value violates unique constraint "users_email_unique"');
    (err as Error & { cause?: unknown }).cause = { code: '23505' };
    expect(isUniqueViolation(err)).toBe(true);
  });
  it('rejects other codes and non-objects', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/lib/__tests__/db-errors.test.ts`
Expected: FAIL — `Cannot find module '../db-errors'`

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/lib/db-errors.ts
/**
 * Postgres unique-violation detector (SQLSTATE 23505).
 * Drizzle + @neondatabase/serverless surface the code either directly on the
 * thrown object or on its `cause` — check both.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } | null };
  if (e.code === '23505') return true;
  if (typeof e.cause === 'object' && e.cause !== null && e.cause.code === '23505') return true;
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/lib/__tests__/db-errors.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/db-errors.ts src/shared/lib/__tests__/db-errors.test.ts
git commit -m "feat(cro-phase0/T1): isUniqueViolation helper for webhook email fixes"
```

---

### Task 2: Stripe webhook + recover route — replace placeholder email with the real payer address (P0-1a)

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (the `checkout.session.completed` case; users upsert ends ~line 416; lead-link at ~line 280)
- Modify: `src/app/api/v1/checkout/recover/route.ts` (mirror-contract header at lines 23–25; upsert ends ~line 290)
- Test: `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` (extend)

**Interfaces:**
- Consumes: `isUniqueViolation` from Task 1 (`@/shared/lib/db-errors`).
- Produces: after any completed checkout, `users.email` holds the real payer address whenever the stored value is a `stripe-pending-*` placeholder. Purchase-confirmation email (route.ts:479-502) re-selects `users.email` AFTER this point, so it starts delivering with no further change.

**Design (settled):** do NOT rewrite the existing state upsert. Add a follow-up guarded `UPDATE` immediately after it — non-fatal, PII-safe, mirrors the in-file non-fatal-side-effect pattern. The `LIKE` guard means real (Clerk-owned) emails are never clobbered by whatever the payer typed into Stripe Checkout; the `try/catch` + `isUniqueViolation` means an email already owned by another row logs and continues (webhook still succeeds).

- [ ] **Step 1: Write the failing tests**

Add to `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` (uses its existing `dbUpdateCalls` capture array + `PgDialect` SQL rendering + `makeSessionCompletedEvent` factory):

```ts
describe('placeholder email replacement (P0-1)', () => {
  it('updates users.email to the payer email, guarded by the placeholder LIKE', async () => {
    getUserListMock.mockResolvedValue({ totalCount: 1, data: [{ id: 'user_abc123' }] });
    const req = makeSessionCompletedEvent({ email: 'real.payer@example.com' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const emailUpdate = dbUpdateCalls.find(
      (c) => renderSql(c.where).includes('stripe-pending-%@placeholder.invalid'),
    );
    expect(emailUpdate).toBeDefined();
    expect(emailUpdate!.set.email).toBe('real.payer@example.com');
    expect(emailUpdate!.set.emailUndeliverable).toBe(false);
  });

  it('unique-violation on the email update logs and still returns 200', async () => {
    getUserListMock.mockResolvedValue({ totalCount: 1, data: [{ id: 'user_abc123' }] });
    // Make ONLY the guarded email update throw 23505; other updates succeed.
    failNextUpdateMatching('stripe-pending-%@placeholder.invalid', { code: '23505' });
    const req = makeSessionCompletedEvent({ email: 'taken@example.com' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
```

Implementation notes for the test file: `renderSql` = render a drizzle SQL fragment via the file's existing `PgDialect` import; `failNextUpdateMatching` = extend the existing `db.update().set().where()` thenable shim (lines 43–72) to reject when the rendered `where` contains the given substring. Both are small local helpers in this test file — write them fully, following the shim that already captures `dbUpdateCalls`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: FAIL — no update call matches the placeholder LIKE (feature absent)

- [ ] **Step 3: Implement in the webhook**

In `src/app/api/webhooks/stripe/route.ts`, `case 'checkout.session.completed'`, immediately AFTER the users upsert (the `.onConflictDoUpdate({ target: users.id, ... })` block ending ~line 416), insert:

```ts
        // P0-1: replace the stripe-pending placeholder with the real payer
        // address so lifecycle/dunning/trial email can reach anonymous payers.
        // LIKE guard: never clobber a real (Clerk-owned) email with checkout
        // input. Non-fatal: a unique-violation (email already on another row)
        // must not fail the webhook.
        const payerEmail = session.customer_details?.email ?? null;
        if (payerEmail) {
          try {
            await db
              .update(users)
              .set({ email: payerEmail, emailUndeliverable: false, updatedAt: new Date() })
              .where(
                and(
                  eq(users.id, clerkUserId),
                  like(users.email, 'stripe-pending-%@placeholder.invalid'),
                ),
              );
          } catch (err) {
            if (isUniqueViolation(err)) {
              console.warn('[stripe-webhook] payer email already owned by another user row — kept placeholder', {
                userId: clerkUserId,
              });
            } else {
              throw err;
            }
          }
        }
```

Imports to add at top of file: `like` (extend the existing `drizzle-orm` import that already has `and`, `eq`, `sql`) and `import { isUniqueViolation } from '@/shared/lib/db-errors';`.

- [ ] **Step 4: Normalize the lead-link email match (same case block)**

At ~route.ts:280–282 the lead-link uses `eq(emailLeads.email, email)` — leads are stored lowercase (leads route normalizes; Clerk webhook lowercases at clerk/route.ts:123), so an uppercase Stripe email silently misses. Change both occurrences inside the anonymous branch's lead-link `where` to:

```ts
eq(emailLeads.email, email.toLowerCase()),
```

- [ ] **Step 5: Mirror in the recover route**

`src/app/api/v1/checkout/recover/route.ts` has the mirror contract (header lines 23–25). Its `email` const (line 183) is already in scope and non-null-guarded. Immediately after its users upsert (ends ~line 290), add the same block as Step 3 verbatim, minus the `payerEmail` const (use the in-scope `email`):

```ts
    // P0-1 mirror of webhooks/stripe checkout.session.completed (see header contract).
    try {
      await db
        .update(users)
        .set({ email, emailUndeliverable: false, updatedAt: new Date() })
        .where(
          and(
            eq(users.id, clerkUserId),
            like(users.email, 'stripe-pending-%@placeholder.invalid'),
          ),
        );
    } catch (err) {
      if (isUniqueViolation(err)) {
        console.warn('[checkout/recover] payer email already owned by another user row — kept placeholder', {
          userId: clerkUserId,
        });
      } else {
        throw err;
      }
    }
```

Add the same two imports to this file.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/`
Expected: PASS (all three stripe webhook test files — the two new tests plus no regressions)

- [ ] **Step 7: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/app/api/v1/checkout/recover/route.ts src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts
git commit -m "fix(cro-phase0/T2): P0-1a — real payer email replaces stripe-pending placeholder (webhook + recover)"
```

---

### Task 3: Clerk webhook — onConflictDoUpdate so signup heals Stripe-created rows (P0-1b)

**Files:**
- Modify: `src/app/api/webhooks/clerk/route.ts:92-101` (user.created insert)
- Test: `src/app/api/webhooks/clerk/__tests__/route.test.ts` (mock rename + new tests)

**Interfaces:**
- Consumes: `isUniqueViolation` from Task 1.
- Produces: a `user.created` event overwrites a pre-existing (Stripe-created) row's `email`/`locale` with Clerk's authoritative values. Empty Clerk email (`''`) never clobbers. Unique violation → warn + continue (route still 200, lead-linking below still runs).

- [ ] **Step 1: Update the test mock wiring (it will break otherwise)**

In `src/app/api/webhooks/clerk/__tests__/route.test.ts`:
- Line 10: rename hoisted mock `onConflictDoNothing` → `onConflictDoUpdate` (keep `vi.fn().mockResolvedValue(undefined)`).
- Line 31: `mocks.values.mockImplementation(() => ({ onConflictDoUpdate: mocks.onConflictDoUpdate }));`
- Line 101 (beforeEach clear) and assertions at lines 213, 330, 409: rename to `mocks.onConflictDoUpdate`.

- [ ] **Step 2: Write the failing tests**

Append to the user.created describe block:

```ts
  it('onConflictDoUpdate carries email + locale so Stripe-created placeholder rows heal', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_heal1',
        email_addresses: [{ email_address: 'Real@Example.com' }],
        unsafe_metadata: { locale: 'es' },
      },
    });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const conflictArg = mocks.onConflictDoUpdate.mock.calls[0][0];
    expect(conflictArg.set.email).toBe('Real@Example.com');
    expect(conflictArg.set.locale).toBe('es');
  });

  it('empty Clerk email is not written into the conflict set', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: { id: 'user_noemail', email_addresses: [], unsafe_metadata: null },
    });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const conflictArg = mocks.onConflictDoUpdate.mock.calls[0][0];
    expect(conflictArg.set).not.toHaveProperty('email');
  });

  it('unique violation on insert logs and still returns 200', async () => {
    mocks.onConflictDoUpdate.mockRejectedValueOnce({ code: '23505' });
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: { id: 'user_dup', email_addresses: [{ email_address: 'dup@example.com' }], unsafe_metadata: null },
    });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
  });
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run src/app/api/webhooks/clerk/__tests__/route.test.ts`
Expected: FAIL — route still calls `.onConflictDoNothing()` (TypeError) and/or new assertions fail

- [ ] **Step 4: Implement**

Replace `src/app/api/webhooks/clerk/route.ts:92-101` with:

```ts
      try {
        await db
          .insert(users)
          .values({
            id: data.id,
            email,
            locale,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: users.id,
            set: {
              // Heal Stripe-created rows: Clerk's email/locale are authoritative
              // at signup. Guard: never clobber with '' (payload without addresses).
              ...(email ? { email, locale } : { locale }),
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        if (isUniqueViolation(err)) {
          // The real email already belongs to another users row (e.g. an old
          // orphan). Keep both rows; log-and-continue so Clerk doesn't retry-loop.
          console.warn('[clerk-webhook] user.created email conflicts with existing row — insert skipped', {
            userId: data.id,
          });
        } else {
          throw err;
        }
      }
```

Add import: `import { isUniqueViolation } from '@/shared/lib/db-errors';`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/api/webhooks/clerk/__tests__/route.test.ts`
Expected: PASS (all tests incl. 3 new)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/clerk/route.ts src/app/api/webhooks/clerk/__tests__/route.test.ts
git commit -m "fix(cro-phase0/T3): P0-1b — Clerk user.created heals placeholder rows via onConflictDoUpdate"
```

---

### Task 4: Backfill A — repair existing placeholder rows (P0-1c)

**Files:**
- Create: `scripts/advertising/_backfill_placeholder_emails_2026_07_10.mjs`

**Interfaces:**
- Consumes: prod env from `.env` (`DATABASE_URL`, `STRIPE_SECRET_KEY`, `CLERK_SECRET_KEY`).
- Produces: `users.email` = real address + `email_undeliverable=false` for every `stripe-pending-*` row (expected: 2 rows — mpidarling90's and lainiekayg's Clerk-materialized rows).

No unit test — one-shot ops script; the dry-run output IS the verification (house convention, cf. `_repair_orphan_anon_payers_2026_05_30.mjs`).

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
/**
 * Backfill A (CRO Phase 0, P0-1c): replace `stripe-pending-*@placeholder.invalid`
 * emails in `users` with the real address, resolved from Stripe customer email
 * (primary) or Clerk (fallback for user_* ids). Also resets email_undeliverable
 * (the 14 bounces since 05-29 likely flipped it via the Resend webhook, which
 * would keep lifecycle crons suppressing these users even after repair).
 *
 * Dry-run by default. `node scripts/advertising/_backfill_placeholder_emails_2026_07_10.mjs --apply`
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';
import { createClerkClient } from '@clerk/backend';

const APPLY = process.argv.includes('--apply');
for (const k of ['DATABASE_URL', 'STRIPE_SECRET_KEY', 'CLERK_SECRET_KEY']) {
  if (!process.env[k]) {
    console.error(`${k} missing — abort`);
    process.exit(1);
  }
}
const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const rows = await sql`
  SELECT id, email, stripe_customer_id, email_undeliverable
  FROM users
  WHERE email LIKE 'stripe-pending-%@placeholder.invalid'
`;
console.log(`${rows.length} placeholder rows${APPLY ? '' : ' (DRY-RUN — pass --apply to write)'}\n`);

let fixed = 0;
let skipped = 0;
for (const r of rows) {
  let email = null;
  let source = null;
  if (r.stripe_customer_id) {
    try {
      const cust = await stripe.customers.retrieve(r.stripe_customer_id);
      email = cust && !cust.deleted ? cust.email : null;
      if (email) source = 'stripe';
    } catch (e) {
      console.warn(`  [${r.id}] stripe lookup failed: ${e.message}`);
    }
  }
  if (!email && String(r.id).startsWith('user_')) {
    try {
      const u = await clerk.users.getUser(r.id);
      email = u.emailAddresses[0]?.emailAddress ?? null;
      if (email) source = 'clerk';
    } catch (e) {
      console.warn(`  [${r.id}] clerk lookup failed: ${e.message}`);
    }
  }
  console.log(`  ${r.id}: ${r.email} -> ${email ?? 'UNRESOLVED'} (${source ?? '-'}) undeliverable=${r.email_undeliverable}`);
  if (!APPLY) continue;
  if (!email) {
    console.log('    SKIP: no email resolvable');
    skipped += 1;
    continue;
  }
  const taken = await sql`SELECT id FROM users WHERE lower(email) = ${email.toLowerCase()} AND id <> ${r.id}`;
  if (taken.length) {
    console.log(`    SKIP: email already on ${taken[0].id} — resolve manually (orphan-row case)`);
    skipped += 1;
    continue;
  }
  await sql`
    UPDATE users
    SET email = ${email}, email_undeliverable = false, updated_at = now()
    WHERE id = ${r.id}
  `;
  fixed += 1;
  console.log('    FIXED');
}
console.log(`\ndone: fixed=${fixed} skipped=${skipped}`);
```

- [ ] **Step 2: Dry-run against prod (read-only) to validate the report**

Run: `node scripts/advertising/_backfill_placeholder_emails_2026_07_10.mjs`
Expected: lists the placeholder rows (audit says 2) with resolved real emails, no writes. If it lists >2 or resolves emails that look wrong, STOP and investigate before `--apply` (which happens in Task 17, founder-confirmed).

- [ ] **Step 3: Commit**

```bash
git add scripts/advertising/_backfill_placeholder_emails_2026_07_10.mjs
git commit -m "feat(cro-phase0/T4): backfill A — repair placeholder emails from Stripe/Clerk"
```

---

### Task 5: Backfill B — link email_leads to anonymous payers (P0-1d)

**Files:**
- Create: `scripts/advertising/_backfill_converted_leads_2026_07_10.mjs`

**Interfaces:**
- Consumes: same env as Task 4. Run AFTER Backfill A (needs real emails in `users`).
- Produces: `email_leads.converted_to_user_id` set for every lead whose email matches a payer's user/Stripe email — which is what actually stops drip sales sends (every drip sender already filters `converted_to_user_id IS NULL`; research confirmed the filters exist — the missed LINKING is the defect).

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
/**
 * Backfill B (CRO Phase 0, P0-1d): set email_leads.converted_to_user_id for
 * leads belonging to payers. Match key: lower(lead.email) IN
 * { lower(users.email), lower(stripe customer email) }.
 *
 * Why: every drip sender already filters converted_to_user_id IS NULL
 * (lead-nurture route.ts:143, cart-abandon:77, blast script:75) — the defect
 * is that webhook-time linking missed for anon payers (audit: the sole active
 * payer was cross-sold lead_paywall_teaser after paying). Run after Backfill A.
 *
 * Dry-run by default. `node scripts/advertising/_backfill_converted_leads_2026_07_10.mjs --apply`
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';

const APPLY = process.argv.includes('--apply');
for (const k of ['DATABASE_URL', 'STRIPE_SECRET_KEY']) {
  if (!process.env[k]) {
    console.error(`${k} missing — abort`);
    process.exit(1);
  }
}
const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

const payers = await sql`
  SELECT id, email, stripe_customer_id
  FROM users
  WHERE stripe_customer_id IS NOT NULL
    AND email NOT LIKE 'stripe-pending-%@placeholder.invalid'
`;
console.log(`${payers.length} users with a Stripe customer${APPLY ? '' : ' (DRY-RUN — pass --apply to write)'}\n`);

let linked = 0;
for (const u of payers) {
  const emails = new Set([u.email.toLowerCase()]);
  try {
    const cust = await stripe.customers.retrieve(u.stripe_customer_id);
    if (cust && !cust.deleted && cust.email) emails.add(cust.email.toLowerCase());
  } catch (e) {
    console.warn(`  [${u.id}] stripe lookup failed: ${e.message}`);
  }
  const leads = await sql`
    SELECT id, email, nurture_step
    FROM email_leads
    WHERE lower(email) = ANY(${[...emails]})
      AND converted_to_user_id IS NULL
  `;
  if (leads.length === 0) continue;
  for (const l of leads) {
    console.log(`  lead ${l.id} (${l.email}, step=${l.nurture_step}) -> user ${u.id}`);
  }
  if (!APPLY) continue;
  const ids = leads.map((l) => l.id);
  await sql`
    UPDATE email_leads
    SET converted_to_user_id = ${u.id}, converted_at = now()
    WHERE id = ANY(${ids})
  `;
  linked += leads.length;
}
console.log(`\ndone: linked=${linked}${APPLY ? '' : ' (dry-run; nothing written)'}`);
```

- [ ] **Step 2: Dry-run**

Run: `node scripts/advertising/_backfill_converted_leads_2026_07_10.mjs`
Expected: at minimum lainiekayg's lead (`p4-9KWBf1wRma…` per audit P0-1) appears in the report. No writes.

- [ ] **Step 3: Commit**

```bash
git add scripts/advertising/_backfill_converted_leads_2026_07_10.mjs
git commit -m "feat(cro-phase0/T5): backfill B — link email_leads to anon payers by email match"
```

---

### Task 6: PaywallModal — portal + z-[60] + default plan monthly (P0-2 code + Track 4)

**Files:**
- Modify: `src/shared/components/PaywallModal.tsx` (root JSX ~line 149; plan state line 52)
- Test: `src/shared/components/__tests__/PaywallModal.trigger.test.tsx` (assertion flip line 163 + new default-plan context)

**Interfaces:**
- Consumes: `createPortal` from `react-dom`; portal precedent `src/shared/components/EmailGateModal.tsx:192-200`.
- Produces: PaywallModal DOM lives under `document.body` with `z-[60]` (cookie banner is `z-50` mounted after `{children}` in `src/app/layout.tsx:85` — portal + higher z beats both DOM order and stacking contexts). Props interface unchanged — all 5 mount sites (ThreeCardSpread:322, CelticCross:364, EssayPageClient:58, SynastryClient:257, ChartReadingSection:216) unaffected.

- [ ] **Step 1: Flip the default-plan test and add a portal smoke test**

In `PaywallModal.trigger.test.tsx` line 163: change `plan: 'pro_annual'` → `plan: 'pro_monthly'`. Then append:

```ts
  it('renders via portal into document.body with z-[60] (P0-2: must beat cookie banner z-50)', () => {
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    const overlay = document.body.querySelector('.z-\\[60\\]');
    expect(overlay).not.toBeNull();
    expect(overlay!.parentElement).toBe(document.body);
  });
```

Also check `PaywallModal.utm.test.tsx` for `pro_annual` assertions — research says there are none, but verify with `grep -n pro_annual src/shared/components/__tests__/PaywallModal.utm.test.tsx` and flip any found.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.trigger.test.tsx`
Expected: FAIL — plan is still `pro_annual`; no `.z-[60]` element; overlay parent is the RTL container, not body

- [ ] **Step 3: Implement**

In `src/shared/components/PaywallModal.tsx`:

1. Line 52: `useState<'pro_monthly' | 'pro_annual'>('pro_annual')` → `useState<'pro_monthly' | 'pro_annual'>('pro_monthly')`. (Annual per-month note at 230-234 and ES currency equiv at 241 already branch on `plan` — no other change.)
2. Add import: `import { createPortal } from 'react-dom';`
3. Wrap the return (root div currently `fixed inset-0 z-50 …` at line 150):

```tsx
  // Portal to document.body (same pattern + rationale as EmailGateModal):
  // escapes ancestor stacking contexts, and z-[60] beats the cookie banner
  // (z-50, mounted after {children} in the root layout — DOM order would
  // otherwise put the banner on top of an inline-rendered modal).
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      {/* …everything inside unchanged… */}
    </div>,
    document.body,
  );
```

(The dialog's `max-h-[90vh] overflow-y-auto` small-viewport scrolling already exists at line 164 — no change needed.)

- [ ] **Step 4: Run the modal test files**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.trigger.test.tsx src/shared/components/__tests__/PaywallModal.utm.test.tsx src/modules/astro-engine/components/__tests__/ChartReadingSection.test.tsx`
Expected: PASS (ChartReadingSection queries `role=dialog` via RTL baseElement — portal keeps it findable)

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/PaywallModal.tsx src/shared/components/__tests__/PaywallModal.trigger.test.tsx
git commit -m "fix(cro-phase0/T6): P0-2 portal PaywallModal above cookie banner + default plan monthly"
```

---

### Task 7: Playwright regression — trial CTA tappable pre-consent at 390×844 (P0-2 test)

**Files:**
- Create: `tests/e2e/paywall-mobile-consent.spec.ts`

**Interfaces:**
- Consumes: chart-page flow + selectors from `tests/e2e/paywall-cta.spec.ts` (email-gate bypass `localStorage['email_gate_passed']='1'` + `no_gate=1` param, testids `natal-chart-result` / `chart-reading-section`, dialog role); banner `aria-label="Cookie consent"` (`CookieConsent.tsx:60`); consent key `estrevia_cookie_consent` — deliberately NOT set here.

- [ ] **Step 1: Write the test**

Open `tests/e2e/paywall-cta.spec.ts` first and copy its exact chart URL + paywall-open steps (lines ~93–117); the skeleton below marks the two lines to take from there:

```ts
import { test, expect } from '@playwright/test';

/**
 * P0-2 regression (CRO audit 2026-07-10, LIVE-1): pre-consent on a phone
 * viewport, the cookie banner (z-50) used to sit ON TOP of the paywall trial
 * CTA — elementFromPoint at the CTA center returned the banner. The modal now
 * portals to document.body with z-[60]. This test drives the real flow WITHOUT
 * accepting consent and asserts the CTA wins the hit-test.
 */
test('paywall trial CTA hit-test beats cookie banner at 390x844 pre-consent', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  // Bypass ONLY the email gate; estrevia_cookie_consent stays absent so the banner renders.
  await page.addInitScript(() => {
    window.localStorage.setItem('email_gate_passed', '1');
  });

  // >>> copy the chart URL from paywall-cta.spec.ts (bd/bt/ktb/lat/lon/place/tz + no_gate=1) <<<
  await page.goto(
    'http://localhost:3000/en/chart?bd=1990-06-15&bt=14%3A30&ktb=1&lat=40.7128&lon=-74.006&place=New%20York&tz=America%2FNew_York&no_gate=1',
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
  await page.waitForSelector('[data-testid="natal-chart-result"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="chart-reading-section"]', { timeout: 15_000 });

  // Banner must actually be showing (otherwise this test proves nothing).
  await expect(page.getByLabel('Cookie consent')).toBeVisible();

  // >>> copy the paywall-open click from paywall-cta.spec.ts (reading-section CTA) <<<
  await page.locator('[data-testid="chart-reading-section"]').getByRole('button').first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const cta = dialog.getByRole('button', { name: /start 3-day free trial/i });
  await expect(cta).toBeVisible();

  const ctaWinsHitTest = await cta.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return top === el || el.contains(top) || (top !== null && top.contains(el) === false && el.contains(top));
  });
  expect(ctaWinsHitTest).toBe(true);
  await ctx.close();
});
```

Simplify the final predicate to `top === el || el.contains(top)` if the CTA has no overlaying children quirks.

- [ ] **Step 2: Run it against the fixed code**

Run: `npx playwright test tests/e2e/paywall-mobile-consent.spec.ts`
Expected: PASS. Sanity-check the regression detection: temporarily revert the `z-[60]` to `z-50` + remove the portal in PaywallModal, re-run, expect FAIL, then restore.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/paywall-mobile-consent.spec.ts
git commit -m "test(cro-phase0/T7): P0-2 regression — pre-consent CTA hit-test at 390x844"
```

---

### Task 8: /chart?chartId= server handoff (P0-3)

**Files:**
- Modify: `src/app/[locale]/(app)/chart/page.tsx` (async server component, currently takes no props — line 50)
- Modify: `src/modules/astro-engine/components/ChartDisplay.tsx` (no props today — line 153; state at 177-178)
- Test: `src/app/[locale]/(app)/chart/__tests__/page.test.tsx` (new), `src/modules/astro-engine/components/__tests__/ChartDisplay.initial.test.tsx` (new)

**Interfaces:**
- Consumes: `fetchTempChart(chartId): Promise<ChartResult | null>` from `@/shared/lib/temp-chart` (exists, server-only, already null-safe on missing/deleted rows).
- Produces: `ChartDisplay` gains optional props `{ initialChart?: ChartResult; initialChartId?: string }`. No PII involved: temp charts store ONLY computed positions (`encrypted_birth_data='PENDING'`); the URL carries only the unguessable nanoid.
- Reality check vs spec: the spec says "hydrates ChartDisplay with the birth data" — birth data is NOT recoverable from a temp chart. We hydrate the computed `ChartResult`, which is exactly what ChartDisplay renders (result view + ChartReadingSection + PassportSection). The empty-form fallback stays for missing/expired ids — and WILL be common: the cleanup cron deletes temp charts after 7 days, so T+7d/T+14d/T+21d drip clicks land on the form by design.

- [ ] **Step 1: Write the failing ChartDisplay test**

```tsx
// src/modules/astro-engine/components/__tests__/ChartDisplay.initial.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { ChartResult } from '@/shared/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// Heavy children are irrelevant to the hydration behavior — stub them.
vi.mock('../ChartReadingSection', () => ({
  ChartReadingSection: () => <div data-testid="reading-stub" />,
}));
vi.mock('../PassportSection', () => ({
  PassportSection: () => <div data-testid="passport-stub" />,
}));
vi.mock('../BirthDataForm', () => ({
  BirthDataForm: () => <div data-testid="birth-form-stub" />,
}));

import { ChartDisplay } from '../ChartDisplay';

const chartFixture = {
  planets: [],
  houses: null,
  aspects: [],
  ascendant: null,
  midheaven: null,
  ayanamsa: 24.21,
  system: 'sidereal',
  houseSystem: null,
  nodeType: 'true',
  calculatedAt: '2026-07-10T00:00:00Z',
} as unknown as ChartResult;

describe('ChartDisplay server hydration (P0-3)', () => {
  it('renders the result view (not the form) when initialChart is provided', () => {
    render(<ChartDisplay initialChart={chartFixture} initialChartId="abc123" />);
    expect(screen.queryByTestId('birth-form-stub')).toBeNull();
    expect(screen.getByTestId('reading-stub')).toBeTruthy();
    expect(screen.getByTestId('passport-stub')).toBeTruthy();
  });

  it('renders the birth form when no initial props (unchanged default)', () => {
    render(<ChartDisplay />);
    expect(screen.getByTestId('birth-form-stub')).toBeTruthy();
  });
});
```

Adjust the mock module paths to ChartDisplay's actual imports (open the file's import block; e.g. `@/modules/astro-engine/components/BirthDataForm` vs relative — mirror exactly). The fixture only needs enough shape for render; if the SVG chart component requires planets, stub the chart-svg component the same way.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/ChartDisplay.initial.test.tsx`
Expected: FAIL — `initialChart` prop does not exist / form renders in both cases

- [ ] **Step 3: Implement ChartDisplay props**

In `src/modules/astro-engine/components/ChartDisplay.tsx`:

```tsx
interface ChartDisplayProps {
  /** Server-fetched temp chart (P0-3 /chart?chartId= handoff). Positions only — no PII. */
  initialChart?: ChartResult;
  initialChartId?: string;
}

export function ChartDisplay({ initialChart, initialChartId }: ChartDisplayProps = {}) {
```

and seed the existing state (lines 177-178):

```tsx
  const [chart, setChart] = useState<ChartResult | null>(initialChart ?? null);
  const [chartId, setChartId] = useState<string | null>(initialChartId ?? null);
```

The `bd/bt/...` mount-params auto-calc effect is untouched (chartId links never carry bd params — mutually exclusive in practice).

- [ ] **Step 4: Implement the page**

Replace the signature + render of `src/app/[locale]/(app)/chart/page.tsx:50-67`:

```tsx
export default async function ChartPage({
  searchParams,
}: {
  searchParams: Promise<{ chartId?: string }>;
}) {
  const { chartId } = await searchParams;
  // P0-3: drip emails + the hero CTA link /chart?chartId=… — fetch the stored
  // temp chart server-side (no PII in URL; nanoid → computed positions only).
  // Missing/expired id (cleanup cron deletes after 7d) → null → empty form.
  const initialChart = chartId ? await fetchTempChart(chartId) : null;
  const t = await getTranslations('chart');
  /* …existing schema/breadcrumb code unchanged… */
  return (
    <>
      {/* …JsonLdScript lines unchanged… */}
      <Suspense fallback={await ChartSkeleton()}>
        <ChartDisplay
          initialChart={initialChart ?? undefined}
          initialChartId={initialChart && chartId ? chartId : undefined}
        />
      </Suspense>
    </>
  );
}
```

Add import: `import { fetchTempChart } from '@/shared/lib/temp-chart';`.

- [ ] **Step 5: Write the page test**

```tsx
// src/app/[locale]/(app)/chart/__tests__/page.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const fetchTempChartMock = vi.hoisted(() => vi.fn());
const chartDisplayProps = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/shared/lib/temp-chart', () => ({ fetchTempChart: fetchTempChartMock }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  getLocale: async () => 'en',
}));
vi.mock('@/modules/astro-engine/components/ChartDisplay', () => ({
  ChartDisplay: (props: unknown) => {
    chartDisplayProps.current = props;
    return React.createElement('div', { 'data-testid': 'chart-display-stub' });
  },
}));

import ChartPage from '../page';

beforeEach(() => {
  fetchTempChartMock.mockReset();
  chartDisplayProps.current = null;
});

describe('/chart?chartId= server handoff (P0-3)', () => {
  it('fetches by chartId and passes initialChart + initialChartId', async () => {
    const fake = { planets: [], calculatedAt: 'x' };
    fetchTempChartMock.mockResolvedValue(fake);
    await ChartPage({ searchParams: Promise.resolve({ chartId: 'abc123' }) });
    expect(fetchTempChartMock).toHaveBeenCalledWith('abc123');
    expect(chartDisplayProps.current).toMatchObject({ initialChart: fake, initialChartId: 'abc123' });
  });

  it('expired/unknown chartId degrades to no props (empty form)', async () => {
    fetchTempChartMock.mockResolvedValue(null);
    await ChartPage({ searchParams: Promise.resolve({ chartId: 'gone' }) });
    expect(chartDisplayProps.current).toMatchObject({ initialChart: undefined, initialChartId: undefined });
  });

  it('no chartId → no fetch', async () => {
    await ChartPage({ searchParams: Promise.resolve({}) });
    expect(fetchTempChartMock).not.toHaveBeenCalled();
  });
});
```

Note: rendering the returned JSX is unnecessary — invoking the async page and asserting the stub captured props is enough; if the page's other imports (JsonLdScript, seo schema fns, ChartSkeleton) execute at module load and throw under jsdom, mock those modules the same way (mirror the page's import block).

- [ ] **Step 6: Run all Task 8 tests**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/ChartDisplay.initial.test.tsx "src/app/[locale]/(app)/chart/__tests__/page.test.tsx"`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/(app)/chart/page.tsx" src/modules/astro-engine/components/ChartDisplay.tsx src/modules/astro-engine/components/__tests__/ChartDisplay.initial.test.tsx "src/app/[locale]/(app)/chart/__tests__/page.test.tsx"
git commit -m "fix(cro-phase0/T8): P0-3 — /chart?chartId= fetches temp chart server-side"
```

---

### Task 9: PaywallModal l10n + ES 'gratis' copy + locale-aware trial date (Track 6 code)

**Files:**
- Modify: `src/shared/components/PaywallModal.tsx` (lines 37-45 date fn; 128/133/143 errors; 171 aria-label; 279 loading label)
- Modify: `messages/es.json` (lines 959, 1040)
- Test: `src/shared/components/__tests__/PaywallModal.l10n.test.tsx` (new)

**Interfaces:**
- Consumes: existing hooks in the component — `t = useTranslations('paywall')`, `tPage = useTranslations('pricingPage')`, `locale = useLocale()` (lines 48-51). Existing UNUSED es/en keys: `pricingPage.errUnexpected` / `.errGeneric` / `.errNetwork` / `.redirecting` (es.json:1011-1014), `common.close` (es.json:12).
- Produces: zero hardcoded user-visible English in the modal (research found 5 strings, not the audit's 4 — the extra is `aria-label="Close"`); ES trial-end date renders in Spanish.

- [ ] **Step 1: Write the failing test**

```tsx
// src/shared/components/__tests__/PaywallModal.l10n.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Translator mock echoes namespaced keys so assertions can target them.
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = ((key: string) => `${ns}.${key}`) as ((k: string) => string) & { has: (k: string) => boolean };
    t.has = () => false;
    return t;
  },
  useLocale: () => 'es',
}));
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));
vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmLastTouch: vi.fn().mockReturnValue({}),
}));

import { PaywallModal } from '../PaywallModal';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('PaywallModal l10n (Track 6)', () => {
  it('close button uses the common.close key, not hardcoded English', () => {
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'common.close' })).toBeTruthy();
  });

  it('trial-end date renders in Spanish for locale=es (+3 days)', () => {
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    // 2026-07-13 in es-MX short-month format contains 'jul'
    expect(document.body.textContent).toMatch(/jul/i);
    expect(document.body.textContent).not.toMatch(/Jul 13, 2026/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.l10n.test.tsx`
Expected: FAIL — close button is literal "Close"; date is "Jul 13, 2026"

- [ ] **Step 3: Implement the component changes**

In `src/shared/components/PaywallModal.tsx`:

1. Date fn (lines 37-45):
```tsx
function formatTrialEndDate(locale: string): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
```
and the call site (line 104): `const trialEndDate = formatTrialEndDate(locale);` (move the call below the `useLocale()` line if needed).

2. Add hook next to the existing ones (line ~50): `const tCommon = useTranslations('common');`

3. String swaps:
- line 128: `setError('Unexpected response from server. Please try again.');` → `setError(tPage('errUnexpected'));`
- line 133: → `setError(tPage('errGeneric'));`
- line 143: → `setError(tPage('errNetwork'));`
- line 171: `aria-label="Close"` → `aria-label={tCommon('close')}`
- line 279: `{loading ? 'Redirecting...' : t('trialCta')}` → `{loading ? tPage('redirecting') : t('trialCta')}`

Note: the error setters live inside `handleCheckout` (a callback) — `tPage` is in scope from the component body; if `handleCheckout` is wrapped in `useCallback`, add `tPage` to its dependency array.

- [ ] **Step 4: ES 'gratis' copy**

In `messages/es.json`:
- line 959: `"startTrial": "Comenzar prueba de 3 días"` → `"startTrial": "Comienza tu prueba gratis de 3 días"`
- line 1040: `"trialCta": "Comenzar prueba de 3 días"` → `"trialCta": "Comienza tu prueba gratis de 3 días"`

(Mirrors the already-fixed `paywall.cta.ctaLabel` at es.json:1058. EN needs nothing — already "Start 3-Day Free Trial".)

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/shared/components/__tests__/`
Expected: PASS — new l10n tests + trigger/utm tests unaffected (their translator mock echoes unknown keys, so `pricingPage.errNetwork` etc. render as keys, which none of their assertions touch)

- [ ] **Step 6: Commit**

```bash
git add src/shared/components/PaywallModal.tsx messages/es.json src/shared/components/__tests__/PaywallModal.l10n.test.tsx
git commit -m "fix(cro-phase0/T9): Track 6 — modal l10n (5 strings + locale date) + ES gratis copy"
```

---

### Task 10: PostHog locale super-prop prefix fix (Track 5a)

**Files:**
- Modify: `src/shared/components/PostHogProvider.tsx:89,164`
- Test: `src/shared/components/__tests__/PostHogProvider.test.tsx` (extend both describes)

**Interfaces:**
- Produces: `locale` super-prop is `es` ONLY for `/es` and `/es/*` paths; `/essays/*` labels `en`. Until deployed, analysts derive locale from `$pathname` (already noted in memory) — this ends that workaround.

- [ ] **Step 1: Write the failing tests**

Add to the "locale super-property" describe (route-change path, cf. existing test at lines 49-55):

```ts
  it('does NOT mislabel /essays/* as es (startsWith bug)', async () => {
    hoisted.mockUsePathname.mockReturnValue('/essays/what-is-sidereal');
    render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'en' });
    });
  });

  it('labels the bare /es root as es', async () => {
    hoisted.mockUsePathname.mockReturnValue('/es');
    render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'es' });
    });
  });
```

Add the same `/essays/*` case to the "first-pageview locale via loaded callback" describe, following its existing pattern (set env key + consent, delete window stub, invoke `options.loaded(fakePh)`, assert `fakePh.register` got `{ locale: 'en' }`).

- [ ] **Step 2: Run to verify the /essays test fails**

Run: `npx vitest run src/shared/components/__tests__/PostHogProvider.test.tsx`
Expected: FAIL — `/essays/...` currently registers `{ locale: 'es' }`

- [ ] **Step 3: Implement**

Both sites, identical expression:
- line 89: `const initialLocale = pathname === '/es' || pathname?.startsWith('/es/') ? 'es' : 'en';`
- line 164: `const locale = pathname === '/es' || pathname?.startsWith('/es/') ? 'es' : 'en';`

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/shared/components/__tests__/PostHogProvider.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/PostHogProvider.tsx src/shared/components/__tests__/PostHogProvider.test.tsx
git commit -m "fix(cro-phase0/T10): Track 5 — locale super-prop no longer mislabels /essays/* as es"
```

---

### Task 11: Server-side landing_view (Track 5b)

**Files:**
- Create: `src/shared/lib/landing-view-server.ts`
- Modify: `src/app/[locale]/(marketing)/page.tsx` (async server component, line 34)
- Test: `src/shared/lib/__tests__/landing-view-server.test.ts`

**Interfaces:**
- Consumes: `trackServerEvent(distinctId, name, properties)` from `@/shared/lib/analytics` (exists; posthog-node singleton + `waitUntil(client.shutdown())` flush — the exact fire-and-forget the spec requires); `ANONYMOUS_ID_COOKIE` from `@/shared/lib/anonymous-id` (httpOnly cookie minted by middleware for page routes).
- Produces: `captureServerLandingView(locale: 'en' | 'es'): Promise<void>` — never throws. Event name stays `landing_view` (already in `ESTREVIA_EVENT_NAMES`, analytics.ts:108; CAPI mapping is `capi: null` so NO Meta side-effect); server events are distinguishable from the client tracker by `$lib='posthog-node'` + `source:'server'` (the audit's verify script already splits on `$lib`). Client `LandingViewTracker` stays — post-consent client events keep powering existing funnels; the server event is the consent-independent guardrail count.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/__tests__/landing-view-server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const trackServerEventMock = vi.hoisted(() => vi.fn());
const cookieGetMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/analytics', () => ({ trackServerEvent: trackServerEventMock }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGetMock }),
}));

import { captureServerLandingView } from '../landing-view-server';

beforeEach(() => {
  trackServerEventMock.mockReset();
  cookieGetMock.mockReset();
});

describe('captureServerLandingView (Track 5b)', () => {
  it('captures landing_view with the anonymous_id cookie as distinctId', async () => {
    cookieGetMock.mockReturnValue({ value: 'anon-uuid-1' });
    await captureServerLandingView('es');
    expect(trackServerEventMock).toHaveBeenCalledWith('anon-uuid-1', 'landing_view', {
      locale: 'es',
      source: 'server',
    });
  });

  it('falls back to a random distinctId when the cookie is absent', async () => {
    cookieGetMock.mockReturnValue(undefined);
    await captureServerLandingView('en');
    expect(trackServerEventMock).toHaveBeenCalledTimes(1);
    expect(typeof trackServerEventMock.mock.calls[0][0]).toBe('string');
    expect(trackServerEventMock.mock.calls[0][0].length).toBeGreaterThan(10);
  });

  it('never throws when analytics or cookies fail', async () => {
    cookieGetMock.mockImplementation(() => {
      throw new Error('no request scope');
    });
    await expect(captureServerLandingView('en')).resolves.toBeUndefined();
    expect(trackServerEventMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/lib/__tests__/landing-view-server.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the util**

```ts
// src/shared/lib/landing-view-server.ts
import 'server-only';
import { cookies } from 'next/headers';
import { trackServerEvent } from '@/shared/lib/analytics';
import { ANONYMOUS_ID_COOKIE } from '@/shared/lib/anonymous-id';

/**
 * Server-side landing_view — the relaunch reconciler guardrail (audit LAND-4/PH-3).
 * The client LandingViewTracker only fires post-consent (~41% of converting
 * visitors); this captures every landing render, consent-independent.
 * Distinguish in PostHog: server rows have $lib='posthog-node' + source:'server'.
 *
 * Fire-and-forget: analytics must NEVER block or fail the landing render —
 * trackServerEvent already flushes via waitUntil; this wrapper adds a
 * catch-all so cookie/init errors degrade to a warn.
 */
export async function captureServerLandingView(locale: 'en' | 'es'): Promise<void> {
  try {
    const jar = await cookies();
    const distinctId = jar.get(ANONYMOUS_ID_COOKIE)?.value ?? crypto.randomUUID();
    trackServerEvent(distinctId, 'landing_view', { locale, source: 'server' });
  } catch (err) {
    console.warn('[landing-view-server] capture failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}
```

(`ANONYMOUS_ID_COOKIE` is exported from `src/shared/lib/anonymous-id.ts:13`; note its doc comment — this id is NOT the posthog-js distinct id, so server and client events won't identity-merge. That's fine: the guardrail is count-level, not identity-level.)

- [ ] **Step 4: Wire into the landing page**

In `src/app/[locale]/(marketing)/page.tsx`, inside `LandingPage()` right after `const locale = await getLocale();` (line ~36):

```tsx
  // Track 5b: consent-independent server-side landing_view (never throws).
  await captureServerLandingView(locale as 'en' | 'es');
```

Add import: `import { captureServerLandingView } from '@/shared/lib/landing-view-server';`.
The page already calls `await auth()` (line 49) so it renders dynamically per request — the capture runs per visit.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/shared/lib/__tests__/landing-view-server.test.ts && npm run typecheck`
Expected: PASS / no type errors

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/landing-view-server.ts src/shared/lib/__tests__/landing-view-server.test.ts "src/app/[locale]/(marketing)/page.tsx"
git commit -m "feat(cro-phase0/T11): Track 5 — server-side landing_view guardrail"
```

---

### Task 12: Tarot SSR crash — optional 777 fields + row filter (Track 7)

**Files:**
- Modify: `src/app/[locale]/(app)/tarot/[cardId]/page.tsx` (CardData interface lines 29-34; correspondences dl lines 235-242)
- Test: `src/app/[locale]/(app)/tarot/[cardId]/__tests__/page.test.tsx` (new)

**Interfaces:**
- Ground truth (verified): all 56 minor cards in `content/tarot/cards.json` have the four 777 keys **entirely absent** (NOT null) — 56 cards × 2 locales = the 112 crashing URLs. `card.treeOfLifeConnects.join(...)` at line 239 throws on `undefined`. Line 238's `String(card.treeOfLifePath)` renders the literal text "undefined" for minors — the fix must cover the whole row block, with optional-chaining semantics (a `!== null` guard alone would NOT fix it).
- Produces: minors render the correspondences `<dl>` with only their present rows (astrology is always present); majors unchanged. `content/` is NOT touched.

- [ ] **Step 1: Write the failing regression test**

```tsx
// src/app/[locale]/(app)/tarot/[cardId]/__tests__/page.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  getLocale: async () => 'en',
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) =>
    React.createElement('a', props, children),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));

// loadCard reads the REAL content/tarot/cards.json via process.cwd() — no data mock.
import TarotCardPage from '../page';

describe('tarot [cardId] page — 777 correspondences (SEO audit P0)', () => {
  it('renders a minor card without crashing (56 minors lack the 777 keys entirely)', async () => {
    const result = await TarotCardPage({
      params: Promise.resolve({ locale: 'en', cardId: 'ace-of-wands' }),
    });
    render(result);
    expect(screen.getByText(/Root of Fire/)).toBeTruthy(); // astrology row survives
    expect(document.body.textContent).not.toContain('undefined'); // no String(undefined) leak
  });

  it('renders a major card with full correspondences (regression guard)', async () => {
    const result = await TarotCardPage({
      params: Promise.resolve({ locale: 'en', cardId: 'the-fool' }),
    });
    render(result);
    expect(document.body.textContent).toContain('↔'); // treeOfLifeConnects joined
  });
});
```

If the page imports other modules that throw under jsdom (JSON-LD script components, seo helpers), mock them the same way — mirror the page's import block; the `checkout/complete/__tests__/page.test.tsx` file is the house pattern for async-RSC page tests. Verify the page's actual params shape first (open the file — it may be `params: Promise<{ cardId: string }>` without locale since locale comes from the parent segment; match it).

- [ ] **Step 2: Run to verify the minor-card test fails**

Run: `npx vitest run "src/app/[locale]/(app)/tarot/[cardId]/__tests__/page.test.tsx"`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'join')`

- [ ] **Step 3: Implement**

1. CardData interface (lines 29-34) — make the four fields optional:

```ts
  astrology: string;
  hebrewLetter?: string;
  treeOfLifePath?: number;
  treeOfLifeConnects?: number[];
  liber777Column?: string;
```

2. Correspondences block (lines 235-242) — compute values null-safely and filter empty rows before mapping:

```tsx
            <dl className="divide-y divide-white/6">
              {[
                { label: tPage('detail.hebrewLetter'), value: card.hebrewLetter },
                {
                  label: tPage('detail.treeOfLifePath'),
                  value: card.treeOfLifePath != null ? String(card.treeOfLifePath) : undefined,
                },
                { label: tPage('detail.connects'), value: card.treeOfLifeConnects?.join(' ↔ ') },
                { label: tPage('detail.astrological'), value: card.astrology },
                { label: tPage('detail.liber777Column'), value: card.liber777Column },
              ]
                .filter((row) => row.value != null && row.value !== '')
                .map(({ label, value }) => (
                  /* …existing row JSX unchanged… */
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run "src/app/[locale]/(app)/tarot/[cardId]/__tests__/page.test.tsx"`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/(app)/tarot/[cardId]/page.tsx" "src/app/[locale]/(app)/tarot/[cardId]/__tests__/page.test.tsx"
git commit -m "fix(cro-phase0/T12): tarot minors SSR crash — optional 777 fields + row filter (112 URLs)"
```

---

### Task 13: Meta scripts — ES ads → /es/ + ES ad-set targeting cleanup (Track 6 ops)

**Files:**
- Create: `scripts/advertising/_relaunch_es_ads_repoint_2026_07_10.mjs`
- Create: `scripts/advertising/_relaunch_es_adset_cleanup_2026_07_10.mjs`

**Interfaces:**
- Consumes: `.env` → `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`. Constants: ES ad set `120243116822500527`; Estrevia Page `1087394517790815`; IG user `17841424342702333`; wrong-Page ad `120243116868200527` (ad_es_lead_v1 — retire, do NOT clone). Graph v23.0; `fbGet`/`fbPost` copied verbatim from `scripts/advertising/_apply_hygiene_2026_05_23.mjs:35-66`.
- Mechanics (settled): creatives are immutable (`fix-wrong-page-ad.ts:7-12`) — repoint = clone creative with new `link_data.link` (+ `call_to_action.value.link`), create new ad **PAUSED** (founder reviews in Ads Manager), pause old ad. Learning history lives at the AD SET level — near-zero delivery impact. `utm_content` values are kept as-is (attribution continuity; audit M-6's slug re-cut is a relaunch-spec decision, not Phase 0).
- The 6 ES ad IDs are NOT recorded in-repo — the script enumerates them live; the dry-run output doubles as the founder-review inventory.

- [ ] **Step 1: Write the repoint script**

```js
#!/usr/bin/env node
/**
 * Track 6 (CRO Phase 0): repoint ES lead ads from https://estrevia.app/? to
 * https://estrevia.app/es/? (audit M-4: all 6 ES ads land on the EN root).
 *
 * Creatives are immutable → per ad: clone object_story_spec.link_data with the
 * /es/ link (same image_hash/copy/cta/utm_content), POST a new creative on the
 * CORRECT Page, POST a new PAUSED ad, then PAUSE the old ad.
 * ad_es_lead_v1 (120243116868200527, wrong Page 593228517212828, legacy utm
 * namespace) is retired: paused, not cloned (audit M-6).
 *
 * Dry-run by default. `node scripts/advertising/_relaunch_es_ads_repoint_2026_07_10.mjs --apply`
 */
import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACT = process.env.META_AD_ACCOUNT_ID; // act_...
const ES_ADSET_ID = '120243116822500527';
const PAGE_ID = '1087394517790815';
const INSTAGRAM_USER_ID = '17841424342702333';
const WRONG_PAGE_AD_ID = '120243116868200527';
const VER = 'v23.0';
const APPLY = process.argv.includes('--apply');

if (!TOKEN || !ACT) {
  console.error('META_ACCESS_TOKEN / META_AD_ACCOUNT_ID missing — abort');
  process.exit(1);
}

async function fbGet(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${VER}/${path}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const r = await fetch(url);
  const body = await r.text();
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

async function fbPost(path, params = {}) {
  if (!APPLY) {
    console.log(`  [DRY] POST ${path} payload:`);
    for (const [k, v] of Object.entries(params)) {
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      console.log(`        ${k} = ${s.length > 200 ? s.slice(0, 200) + '…' : s}`);
    }
    return { _dry: true, id: 'DRY' };
  }
  const url = new URL(`https://graph.facebook.com/${VER}/${path}`);
  const body = new URLSearchParams();
  body.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) {
    body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const r = await fetch(url, { method: 'POST', body });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status} ${text}`);
  return JSON.parse(text);
}

const ads = await fbGet(`${ES_ADSET_ID}/ads`, {
  fields: 'id,name,status,effective_status,creative{id,name,object_story_spec}',
  limit: 100,
});
console.log(`ES ad set ${ES_ADSET_ID}: ${ads.data.length} ads${APPLY ? '' : ' (DRY-RUN)'}\n`);

for (const ad of ads.data) {
  const spec = ad.creative?.object_story_spec;
  const link = spec?.link_data?.link ?? null;
  console.log(`${ad.name} (${ad.id}) status=${ad.status}\n  link=${link}`);

  if (ad.id === WRONG_PAGE_AD_ID) {
    await fbPost(ad.id, { status: 'PAUSED' });
    console.log('  RETIRED (wrong Page — recreate under the relaunch spec if wanted)');
    continue;
  }
  if (!spec?.link_data || !link) {
    console.log('  SKIP: no link_data');
    continue;
  }
  if (!link.startsWith('https://estrevia.app/?')) {
    console.log('  SKIP: link is not the bare EN root (already repointed?)');
    continue;
  }

  const newLink = link.replace('https://estrevia.app/?', 'https://estrevia.app/es/?');
  const newLinkData = JSON.parse(JSON.stringify(spec.link_data));
  newLinkData.link = newLink;
  if (newLinkData.call_to_action?.value?.link) {
    newLinkData.call_to_action.value.link = newLink; // both URL copies must match (audit note)
  }

  const creative = await fbPost(`${ACT}/adcreatives`, {
    name: `${ad.name}_es-landing_2026-07`,
    object_story_spec: {
      page_id: PAGE_ID,
      instagram_user_id: INSTAGRAM_USER_ID,
      link_data: newLinkData,
    },
  });
  const newAd = await fbPost(`${ACT}/ads`, {
    name: `${ad.name}_v2`,
    adset_id: ES_ADSET_ID,
    creative: { creative_id: creative.id },
    status: 'PAUSED',
  });
  await fbPost(ad.id, { status: 'PAUSED' });
  console.log(`  -> new creative ${creative.id}, new PAUSED ad ${newAd.id}, old ad paused; new link=${newLink}`);
}
console.log('\ndone. Founder: review new PAUSED ads in Ads Manager before activating.');
```

- [ ] **Step 2: Write the targeting-cleanup script**

```js
#!/usr/bin/env node
/**
 * Track 6 (CRO Phase 0): clean ES ad-set targeting (audit M-2, flagged 05-29):
 *   - remove SV from geo_locations.countries AND add it to excluded_geo_locations
 *     (EN precedent from _apply_hygiene_2026_05_23.mjs did both)
 *   - publisher_platforms -> ['facebook','instagram'] (audience_network OFF)
 *   - age 22-38 kept (intentional for LATAM per 05-29 audit)
 *
 * Dry-run by default. `node scripts/advertising/_relaunch_es_adset_cleanup_2026_07_10.mjs --apply`
 */
import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ES_ADSET_ID = '120243116822500527';
const VER = 'v23.0';
const APPLY = process.argv.includes('--apply');

if (!TOKEN) {
  console.error('META_ACCESS_TOKEN missing — abort');
  process.exit(1);
}

/* fbGet/fbPost: copy the two functions verbatim from the repoint script above */

const adset = await fbGet(ES_ADSET_ID, { fields: 'id,name,status,targeting' });
const t = adset.targeting;
console.log('CURRENT targeting:', JSON.stringify(t, null, 2));

const newTargeting = JSON.parse(JSON.stringify(t));

const oldCountries = newTargeting.geo_locations.countries || [];
newTargeting.geo_locations.countries = oldCountries.filter((c) => c !== 'SV');

// excluded_geo_locations is TOP-LEVEL on targeting, not under geo_locations.
const oldExcGeo = newTargeting.excluded_geo_locations || {};
newTargeting.excluded_geo_locations = {
  ...oldExcGeo,
  countries: Array.from(new Set([...(oldExcGeo.countries || []), 'SV'])),
  location_types: oldExcGeo.location_types || ['home', 'recent'],
};

const oldPlat = newTargeting.publisher_platforms;
newTargeting.publisher_platforms =
  Array.isArray(oldPlat) && oldPlat.length
    ? oldPlat.filter((p) => p !== 'audience_network')
    : ['facebook', 'instagram'];
if (newTargeting.audience_network_positions) delete newTargeting.audience_network_positions;

console.log('\nNEW targeting:', JSON.stringify(newTargeting, null, 2));
await fbPost(ES_ADSET_ID, { targeting: newTargeting });

if (APPLY) {
  const check = await fbGet(ES_ADSET_ID, { fields: 'targeting' });
  console.log('\nVERIFY read-back:', JSON.stringify(check.targeting, null, 2));
}
console.log('\ndone.');
```

- [ ] **Step 3: Dry-run both (read-only against live Meta)**

Run: `node scripts/advertising/_relaunch_es_ads_repoint_2026_07_10.mjs && node scripts/advertising/_relaunch_es_adset_cleanup_2026_07_10.mjs`
Expected: repoint lists the ES ads (audit says 6) with their current bare-root links and would-be new /es/ links; cleanup prints current targeting containing `"SV"` and no `publisher_platforms`, then the corrected diff. NO mutations (both scripts print `[DRY]`). `--apply` happens in Task 17 with founder confirmation.

- [ ] **Step 4: Commit**

```bash
git add scripts/advertising/_relaunch_es_ads_repoint_2026_07_10.mjs scripts/advertising/_relaunch_es_adset_cleanup_2026_07_10.mjs
git commit -m "feat(cro-phase0/T13): Track 6 — ES ads /es/ repoint + ES ad-set targeting cleanup scripts"
```

---

### Task 14: Migration 0018 applier + .env.example COMPANY_POSTAL_ADDRESS

**Files:**
- Create: `scripts/qa/_apply_migration_0018_2026_07_10.mjs`
- Modify: `.env.example` (add COMPANY_POSTAL_ADDRESS near the email section)

**Interfaces:**
- Consumes: `drizzle/0018_discount_blast_emails.sql` (fully idempotent — every statement `IF NOT EXISTS`). MUST use Neon `Pool` + `ws`: the HTTP driver's `sql.unsafe()` reported success but silently failed DDL on 05-24 (runbook line 18).
- Produces: `sent_discount_blast_emails` table in prod + verification SELECT. Unblocks the deploy of the 6 HALF50 commits (the blast script refuses `--apply` without this table — and nothing auto-sends: `DiscountLaunchEmail` is imported ONLY by the gated blast script).

- [ ] **Step 1: Write the applier**

```js
#!/usr/bin/env node
/**
 * Apply drizzle migration 0018 (sent_discount_blast_emails) to prod Neon.
 *
 * Why not `npm run db:migrate`: __drizzle_migrations is empty and the journal
 * has drift (idx 13 missing; 0013-0017 snapshots never committed) — bare
 * migrate would try to re-run history. 0018's SQL is IF NOT EXISTS-idempotent.
 * Why Pool+ws: Neon HTTP driver silently fails DDL
 * (docs/runbooks/2026-05-24-discount-launch-executed.md:18).
 *
 * Usage: node scripts/qa/_apply_migration_0018_2026_07_10.mjs
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { readFileSync } from 'node:fs';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL missing — abort');
  process.exit(1);
}
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sqlText = readFileSync('drizzle/0018_discount_blast_emails.sql', 'utf8');
const statements = sqlText
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

for (const st of statements) {
  console.log(`applying: ${st.replace(/\s+/g, ' ').slice(0, 90)}…`);
  await pool.query(st);
}

const check = await pool.query(
  `SELECT to_regclass('public.sent_discount_blast_emails') AS table_exists,
          (SELECT count(*) FROM pg_indexes WHERE tablename = 'sent_discount_blast_emails') AS index_count`,
);
console.log('verify:', check.rows[0]);
if (!check.rows[0].table_exists) {
  console.error('VERIFICATION FAILED — table missing after apply');
  process.exit(1);
}
await pool.end();
console.log('done.');
```

- [ ] **Step 2: Add COMPANY_POSTAL_ADDRESS to .env.example**

Append near the Resend/email section of `.env.example`:

```bash
# CAN-SPAM §5: physical postal address rendered in every commercial email footer.
# EmailLayout THROWS on unsubscribe-bearing emails when unset — set in Vercel
# prod BEFORE deploying email-sending code (see feedback_email_postal_address_gate).
COMPANY_POSTAL_ADDRESS=
```

- [ ] **Step 3: Verify the script parses + commit**

Run: `node --check scripts/qa/_apply_migration_0018_2026_07_10.mjs`
Expected: no output (syntax OK). Do NOT run against prod yet — that is deploy-gate step 2 (Task 17).

```bash
git add scripts/qa/_apply_migration_0018_2026_07_10.mjs .env.example
git commit -m "chore(cro-phase0/T14): migration 0018 applier (Pool+ws) + COMPANY_POSTAL_ADDRESS in .env.example"
```

---

### Task 15: CAPI 422 diagnosis (Track 5c — bounded investigation)

**Files:**
- Create: `outputs/cro-phase0-2026-07/capi-422-diagnosis.md` (findings doc)

**Interfaces:**
- Ground truth from research: NO repo code builds the capig request. The Meta Pixel base snippet (`src/app/[locale]/layout.tsx:59-70`) loads fbevents.js; the gateway URL `https://capig.datah04.com/events/<token>` comes from Meta's REMOTE pixel config (a Conversions API Gateway instance configured in Events Manager for pixel `NEXT_PUBLIC_META_PIXEL_ID`). Server-side CAPI (`src/modules/advertising/meta-capi/client.ts:68`) goes direct to graph.facebook.com and is NOT implicated. Expected outcome: founder Events-Manager action, not a code fix.

- [ ] **Step 1: Capture the failing request**

Open https://estrevia.app in a browser with devtools Network tab (or via the Playwright MCP browser), filter `datah04`, reload. Record into the findings doc: full request URL (gateway token), POST payload shape, the 422 response body verbatim.

- [ ] **Step 2: Determine the gateway state**

In Meta Events Manager → Data sources → pixel (the live one is Pixel 2 `1945750759636135` — cross-check against Vercel's `NEXT_PUBLIC_META_PIXEL_ID`) → Settings → Conversions API Gateway section: is a gateway instance listed, what status, who hosts it (datah04.com is a third-party/managed host — was this configured during the 05-13 attribution work?).

- [ ] **Step 3: Write the findings doc with the decision**

`outputs/cro-phase0-2026-07/capi-422-diagnosis.md` must end with exactly one of:
- **(A) Gateway stale/decommissioned** → founder action: remove/reconfigure the Gateway in Events Manager (browser events then flow via the standard pixel path; server CAPI unaffected). Add to Task 17's founder checklist.
- **(B) Config mismatch fixable in Events Manager** → step-by-step founder instructions.
- **(C) Requires code change** (unlikely — no repo code involved) → file a follow-up task with the exact change.

Also verify in Events Manager (while there): browser PageView/Lead events arriving, EMQ scores — this is the relaunch attribution-readiness check the audit said no sector owned.

- [ ] **Step 4: Commit**

```bash
git add outputs/cro-phase0-2026-07/capi-422-diagnosis.md
git commit -m "docs(cro-phase0/T15): CAPI 422 gateway diagnosis + founder action"
```

---

### Task 16: Full local gate

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: 0 failures (baseline was 2276+ passing; this plan adds ~20).

- [ ] **Step 2: Types + lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck clean; lint — no NEW issues in files this plan touched (`.claude/worktrees/**` noise is pre-existing; compare against `git stash`-baseline if unsure).

- [ ] **Step 3: E2E**

Run: `npm run test:e2e`
Expected: all specs pass incl. the new `paywall-mobile-consent.spec.ts` and existing `paywall-cta.spec.ts` (portal must not break its dialog queries).

- [ ] **Step 4: Commit any stragglers**

Only if Steps 1-3 forced fixes; otherwise nothing to commit.

---

### Task 17: Deploy gate (STRICT ORDER) + founder ops checklist

**Files:** none (ops runbook — each step is a gate; do not reorder)

- [ ] **Step 1: Vercel prod env vars FIRST**

Set in Vercel project settings (dashboard, or REST API — remember: `type: 'encrypted'`, NOT `'sensitive'` which silently drops the value):
- `COMPANY_POSTAL_ADDRESS` = founder's postal address (CAN-SPAM). **Without this, every marketing email throws after deploy.**
- `STRIPE_COUPON_HALF50` = `HALF50` (coupon is expired — harmless: checkout has the expired-coupon fallback from 7241c3b; empty would also work but set it for config completeness).
Verify both appear in `vercel env ls` (or dashboard) for Production before proceeding.

- [ ] **Step 2: Apply migration 0018 to prod**

Run: `node scripts/qa/_apply_migration_0018_2026_07_10.mjs`
Expected: `verify: { table_exists: 'sent_discount_blast_emails', index_count: 2 }` (or ≥2), `done.`

- [ ] **Step 3: Push (founder-confirmed — this ships 6 HALF50 commits + all Phase 0 commits)**

Run: `git log origin/main..HEAD --oneline` and show the founder the full list. On explicit OK: `git push origin main`.
Expected: Vercel auto-deploys; watch the deployment to READY.

- [ ] **Step 4: Post-deploy smoke (production)**

- `curl -s https://estrevia.app/tarot/ace-of-wands | grep -c '<h1'` → ≥1 (was: empty shell). Repeat for `/es/tarot/ace-of-wands`.
- Open https://estrevia.app on a phone-sized viewport (or devtools 390×844), calculate a chart → open the paywall pre-consent → trial CTA visibly above the cookie banner and tappable.
- From the hero calculator result, click "See your full natal chart" → `/chart?chartId=…` renders the chart, NOT the empty form.
- PostHog Live Events: visit `/essays/<any>` → event's `locale` prop = `en`; visit `/` → a `landing_view` with `$lib=posthog-node` + `source:'server'` appears without touching the consent banner.
- Stripe webhook health: Stripe Dashboard → Webhooks → recent deliveries all 2xx.

- [ ] **Step 5: Run backfills with --apply (founder-confirmed, in this order)**

```bash
node scripts/advertising/_backfill_placeholder_emails_2026_07_10.mjs --apply
node scripts/advertising/_backfill_converted_leads_2026_07_10.mjs --apply
```
Expected: A fixes the placeholder rows (audit: 2); B links at least lainiekayg's lead. Save output to `outputs/cro-phase0-2026-07/backfills-applied.txt`.

- [ ] **Step 6: Meta scripts --apply (founder-confirmed, after reviewing dry-run inventory)**

```bash
node scripts/advertising/_relaunch_es_ads_repoint_2026_07_10.mjs --apply
node scripts/advertising/_relaunch_es_adset_cleanup_2026_07_10.mjs --apply
```
Expected: new PAUSED `_v2` ads exist in Ads Manager under the ES ad set; targeting read-back shows no SV, `publisher_platforms=["facebook","instagram"]`. Founder reviews the new ads (correct Page = Estrevia, /es/ links) — activation stays a relaunch-time decision.

- [ ] **Step 7: Founder Stripe/Meta dashboard checklist (manual — no API exists for these)**

Stripe Dashboard:
1. Settings → Payment methods → Link → **disable Instant Bank Payments** (keeps Link card autofill; 17/20 recent failed charges were link bank-funding `partner_insufficient_funds`).
2. Same page, default payment-method configuration: turn OFF cashapp / klarna / amazon_pay (foot-gun guard).
3. Settings → Business → Public business name → **Estrevia** (checkout page currently shows "Kirill Kovalenko").
4. Radar → Rules: exempt recurring/MIT charges from the high-risk block rule (3/43 failures were Radar blocking our own dunning retries).
5. Settings → Subscriptions and emails → enable auto-cancel for past_due subscriptions (kills the 44-day zombie emitting `invoice.payment_failed` forever).

Meta Events Manager:
6. Complete Task 15's outcome action (CAPI gateway fix/removal).
7. Verify EMQ + event flow for pixel `1945750759636135` post-deploy.

- [ ] **Step 8: Declare "ready to re-spend"**

All of Steps 1-7 done → Phase 0 exit criteria met (spec's Success criteria section). The actual re-spend decision (EN $25/day, two proven hooks) is the relaunch runbook's territory — NOT part of this plan.

---

## Self-review notes (kept for the executor)

- Spec coverage: P0-1 → T1-T5; P0-2 → T6-T7; P0-3 → T8; Track 4 → T6; Track 5 → T10-T11 + T15; Track 6 → T9 + T13; Track 7 → T12; deploy gate + P0-4 dashboard actions + backfill applies → T14 + T17. The spec's "drip suppression" sub-task resolved to Backfill B + email-match normalization (T2 step 4): research proved every drip sender ALREADY filters `converted_to_user_id IS NULL` — the linking, not the filtering, was broken.
- Deviation from spec: tarot regression is a unit RSC-render test (real cards.json, no dev server) instead of Playwright — faster, hermetic; prod smoke in T17 covers the live URL. Spec's "Playwright: tarot card page regression" is satisfied in spirit by T17 step 4's curl check.
- Deviation from spec: P0-1's "Stripe webhook overwrites placeholder in the upsert" became a follow-up guarded UPDATE after the untouched upsert — strictly safer (no change to state-upsert semantics; unique-violation isolated) and easier to test. Recover route mirrored per its header contract.
- Known-good hazards deliberately NOT touched (out of Phase 0 scope): `handleSubscriptionUpdate`/`subscription.deleted` can still create placeholder rows on out-of-order webhook delivery (healed by T3 at signup); `user.updated`'s `''`-clobber hazard; EmailGateModal's own z-50 tie with the banner; the 112 tarot orphan-link problem (SEO audit's own project).
