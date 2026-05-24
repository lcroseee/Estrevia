# Cart-Abandon Email — Implementation Plan (T3)
Date: 2026-05-24
Branch: claude/jolly-bell-da067a

## Task Breakdown

### T3.1 — DB Schema + Migration 0014
**Files:**
- `src/shared/lib/schema.ts` — add `sentCartAbandonEmails` table
- `drizzle/0014_cart_abandon_emails.sql` — raw SQL migration

**Schema additions:**
```typescript
export const sentCartAbandonEmails = pgTable('sent_cart_abandon_emails', {
  id: serial('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => emailLeads.id, { onDelete: 'cascade' }),
  resendMessageId: text('resend_message_id'),
  posthogLastPaywallAt: timestamp('posthog_last_paywall_at', { withTimezone: true }),
  checkoutClicks: integer('checkout_clicks').notNull().default(0),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('sent_cart_abandon_lead_id_idx').on(table.leadId),
]);
```

No UNIQUE index — 90d window is enforced in application code.

### T3.2 — PostHog Cohort Query Module
**File:** `src/modules/advertising/audiences/cart-abandon-cohort.ts`

Exports:
- `getCartAbandonCohort(windowDays: number): Promise<CartAbandonEntry[]>`
  - `CartAbandonEntry = { email: string; lastPaywallAt: Date; checkoutClicks: number }`
- Uses same `runHogQL` pattern as `posthog-emails.ts`
- HogQL query groups by email, returns last paywall_at + checkout_clicks count
- Timeout window: `windowDays` days back (max 7) to `NOW() - 1h` (cutoff)

### T3.3 — DB Helpers: sent_cart_abandon_emails
**File:** `src/shared/lib/sent-cart-abandon-emails.ts`

Exports:
- `hasCartAbandonSentRecently(leadId: string, windowDays?: number): Promise<boolean>`
  - Queries `sent_cart_abandon_emails WHERE lead_id = $1 AND sent_at > NOW() - $2d`
  - Default windowDays = 90
- `recordCartAbandonSent(leadId: string, resendMessageId: string | null, meta: { posthogLastPaywallAt?: Date; checkoutClicks?: number }): Promise<void>`
  - Inserts into `sent_cart_abandon_emails`

### T3.4 — Email Template: CartAbandonEmail.tsx
**File:** `src/emails/CartAbandonEmail.tsx`

Props:
```typescript
interface Props {
  locale: 'en' | 'es';
  saturnSign: string | null;  // from chart, null if no chart
  checkoutClicks: number;     // 0 = paywall only; >0 = saw Stripe page
  ctaUrl: string;             // pricing + coupon + utm
  unsubscribeUrl: string;
}
```

Structure (uses existing `EmailLayout` + `Button` components):
- Preview text (EN/ES)
- Eyebrow: "48-hour offer" / "Oferta de 48 horas"
- Heading: "You were one step away" / "Estabas a un paso"
- Body paragraphs: Saturn timing, Jupiter windows, Synastry, Full synthesis
  - If `checkoutClicks > 0`: add "You even clicked to checkout — something made you
    pause. Here's a reason to finish." line
  - If `saturnSign`: "Your Saturn in {sign} — the reading covers exactly where you
    stand in your Saturn return"
- CTA Button: "Unlock Pro Annual — Save $7 (48h only)" / "Desbloquea Pro Anual — Ahorra $7 (48h)"
- Trust line: "Offer expires in 48 hours. Annual plan remains $34.99 after."
- `unsubscribeUrl` passed to `EmailLayout`

### T3.5 — sendCartAbandonEmail Function
**File:** `src/shared/lib/email.ts` (append)

Pattern mirrors `sendLeadPaywallTeaserEmail`:
1. `hasCartAbandonSentRecently(leadId)` — return `{ sent: false, reason: 'already_sent' }` if true
2. Sign lead unsubscribe token
3. Build CTA URL: `${SITE_URL}/${locale === 'es' ? 'es/' : ''}pricing?coupon=ABANDON20&utm_source=cart-abandon&utm_medium=email&utm_campaign=cart-abandon-20off`
4. Extract Saturn sign from chart (if available)
5. Render template EN/ES
6. Send via Resend with idempotency key: `${leadId}:cart_abandon`
7. `recordCartAbandonSent(leadId, result.data?.id, meta)`
8. Return `{ sent: true }`

Throw on `result.error` (Sentry upstream).

Also add to `SUBJECTS` constant:
```typescript
cart_abandon: {
  en: (name: string | null) => name ? `${name}, you almost unlocked your full chart` : 'You almost unlocked your full chart',
  es: (name: string | null) => name ? `${name}, casi desbloqueas tu carta completa` : 'Casi desbloqueas tu carta completa',
},
```

### T3.6 — Cron Route: /api/cron/cart-abandon-daily
**File:** `src/app/api/cron/cart-abandon-daily/route.ts`

Flow:
1. `assertCronAuth(request)`
2. Check `CART_ABANDON_DRY_RUN` env var (default true)
3. `getCartAbandonCohort(7)` — PostHog HogQL, 7-day window
4. Lookup matching leads in DB:
   - Join on `LOWER(email)` to `email_leads`
   - Filter: `converted_to_user_id IS NULL AND unsubscribed_at IS NULL AND email_undeliverable = false`
5. Filter out already-sent (90d):
   - `hasCartAbandonSentRecently` per lead (or batch query)
6. For each remaining lead:
   - If dry_run: log + skip
   - Else: fetch chart via `fetchTempChart(lead.chartId)`
   - Call `sendCartAbandonEmail({ leadId, email, locale, chart, chartId, checkoutClicks })`
   - Pace: 1.1s between sends if batch > 5
7. Return JSON summary: `{ cohort, eligible, sent, skipped, failed, dryRun, durationMs }`

### T3.7 — vercel.json: Add Cron Entry

```json
{
  "path": "/api/cron/cart-abandon-daily",
  "schedule": "0 7 * * *"
}
```

### T3.8 — Tests (≥5, TDD first)

**File:** `src/emails/__tests__/CartAbandonEmail.test.tsx`
- T3.8a: EN render with saturnSign — contains "Saturn" and sign name
- T3.8b: ES render with stub — contains "Desbloquea" and "Ahorra"
- T3.8c: EN render without saturnSign — renders without Saturn paragraph, CTA present
- T3.8d: checkoutClicks > 0 adds the "you clicked to checkout" line
- T3.8e: plain text render has no HTML tags

**File:** `src/shared/lib/__tests__/sent-cart-abandon-emails.test.ts`
- T3.8f: `hasCartAbandonSentRecently` returns false on empty table
- T3.8g: returns true after `recordCartAbandonSent`
- T3.8h: returns false after 91 days (window expired)

**File:** `src/app/api/cron/cart-abandon-daily/__tests__/route.test.ts`
- T3.8i: DRY_RUN=true → no Resend call, returns dryRun:true
- T3.8j: already-sent lead is skipped (frequency cap respected)
- T3.8k: converted lead is excluded from cohort
- T3.8l: idempotency — double cron run sends exactly once

**File:** `src/modules/advertising/audiences/__tests__/cart-abandon-cohort.test.ts`
- T3.8m: HogQL response correctly parsed into CartAbandonEntry array
- T3.8n: emails with invalid format are filtered out

---

## Implementation Order

1. T3.8 tests first (TDD — write failing tests)
2. T3.1 schema + migration
3. T3.3 DB helpers
4. T3.4 email template
5. T3.2 PostHog cohort query
6. T3.5 sendCartAbandonEmail function
7. T3.6 cron route
8. T3.7 vercel.json
9. Run all tests, fix failures
10. `npm run typecheck && npm run lint`

---

## Commit Plan

```
test(cart-abandon/T3): failing tests for CartAbandonEmail + cohort + cron
feat(cart-abandon/T3): DB schema + migration 0014 (sent_cart_abandon_emails)
feat(cart-abandon/T3): CartAbandonEmail template (EN + ES)
feat(cart-abandon/T3): cart-abandon PostHog cohort query
feat(cart-abandon/T3): sendCartAbandonEmail + sent-cart-abandon-emails helpers
feat(cart-abandon/T3): /api/cron/cart-abandon-daily route + vercel.json
```

---

## Env Vars

| Var | Value | Notes |
|-----|-------|-------|
| `CART_ABANDON_DRY_RUN` | `"true"` initially | Flip to `"false"` after smoke test |

Existing vars already present: `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY`,
`RESEND_API_KEY`, `CRON_SECRET`.

---

## Founder Checklist (before DRY_RUN=false)

- [ ] Create Stripe coupon `ABANDON20` per spec section 5
- [ ] Test `/pricing?coupon=ABANDON20` applies discount at checkout
- [ ] Review cron dry-run logs in Vercel → Functions → `/api/cron/cart-abandon-daily`
- [ ] Verify cohort count is plausible (should see ~1-5 leads/day)
- [ ] Set `CART_ABANDON_DRY_RUN=false` in Vercel Dashboard (production env)
- [ ] Apply migration 0014 (`npm run db:migrate` or Vercel DB panel)
