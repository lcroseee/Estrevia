# Email-Gate Modal — Design

**Date:** 2026-05-07
**Author:** Kirill (founder) + Claude
**Status:** Approved (sections 1-3)

## Context

Estrevia's current funnel from cold-ad to paid subscription has measured 0% conversion despite ~829 LPV across two campaigns over 7 days (per 2026-05-07 diagnostic). Anonymous visitors land on `/`, calculate a free chart via `HeroCalculator`, see the result inline, and leave. No email is captured. No "Lead" intent signal reaches Meta beyond raw page views. Without an email-capture moment, three downstream consequences:

1. **Meta optimizer is blind to mid-funnel intent.** `Pixel.PageView` and `chart_calculated.ViewContent` fire, but no `Lead` event marks the high-intent moment of "person submitted real personal data and viewed result". This caps Match Quality Score and prevents conversion-bidding in the OFFSITE_CONVERSIONS / OUTCOME_LEADS campaigns.
2. **No remarketing pool.** Visitors who calculate a chart but don't sign up are lost — no email means no Resend nurture campaign, no Custom Audience seed.
3. **No measurable funnel intermediate.** The leap from "viewed landing" to "completed Stripe checkout" is too wide; without an intermediate intent event, A/B testing pricing/copy/audience changes is statistically blind.

This spec adds an email-capture gate immediately after `HeroCalculator` chart calculation: anonymous users must enter email to see their chart result. The captured email creates a row in a new `email_leads` table, fires Meta `Lead` event (browser + server CAPI dedup) at the high-intent moment, and lays the foundation for Resend nurture and Custom Audience remarketing in follow-up specs.

This is the first of four planned funnel-simplification subprojects (others: trial-without-CC, passwordless Clerk, pricing-CTA placement). It is the highest-leverage of the four because none of the downstream optimizations are measurable without a Lead event in place.

## Goal

Capture email at the moment of maximum intent (post-chart-calc) such that:
1. Every anonymous chart-calc result is gated behind email submit (or explicit dismiss).
2. Every email submit creates an idempotent `email_leads` row keyed on email.
3. The first submit of a unique email fires both server-side CAPI `Lead` and browser-side `fbq('track','Lead')` with matching `event_id` for Meta dedup.
4. Returning visitors and signed-in users bypass the gate transparently.
5. Failures (network, rate limit, validation) degrade gracefully and never block the user from seeing their chart.

## Non-goals

- Resend audience push or welcome email on capture (separate spec).
- Reconcile of `email_leads.converted_to_user_id` when the same email later signs up via Clerk (separate spec).
- `/unsubscribe` integration to also clear `email_leads` (separate spec; existing flow handles `users` only).
- Right-to-deletion API for GDPR DELETE-by-email (separate spec).
- Migrating `user_registered` from CAPI `Lead` to `CompleteRegistration` (separate, optional taxonomy refactor).
- Trial-without-credit-card, passwordless Clerk, or pricing-CTA placement (separate funnel-simplification subprojects).

## Architecture

### Components

#### `src/shared/components/EmailGateModal.tsx` (new)

Client-only modal. UI/UX patterns mirror existing `src/shared/components/PaywallModal.tsx`: focus trap, Escape key dismiss, ARIA dialog role, keyboard navigation. Props:

```tsx
interface EmailGateModalProps {
  open: boolean;
  onSubmitted: () => void;     // success path — caller reveals chart result
  onDismiss: () => void;       // X button or Escape — caller reveals result without lead capture
  chartId: string;             // attached to lead for attribution
  locale: 'en' | 'es';
}
```

Internal state: `email`, `loading`, `error`. Reads UTM cookie via existing `readUtmCookie()` helper. Reads PostHog distinct_id via `window.posthog?.get_distinct_id()`.

On submit:
1. Client-side regex validation (minimal format check `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) — server-side performs the authoritative `z.string().email()` Zod check; on fail → inline `errInvalidEmail`.
2. `POST /api/v1/leads` with body `{email, chartId, locale, ...utm, anonymous_id}`.
3. On 200 + `wasNew === true`: fire `fbq('track', 'Lead', {}, { eventID: response.eventId })` (guarded on `window.fbq`); set localStorage `email_gate_passed='1'`; call `onSubmitted()`.
4. On 200 + `wasNew === false`: do NOT fire fbq (server already fired CAPI on first submit; Meta already deduped). Still set localStorage flag and call `onSubmitted()`. Track PostHog `email_lead_resubmitted` for analytics.
5. On 429: show `errRateLimited`; allow retry.
6. On 4xx/5xx/network: show generic error; allow retry.

Dismiss path (X button or Escape):
- Set localStorage flag.
- Track PostHog `email_gate_dismissed` (no eventId, no fbq).
- Call `onDismiss()`.

#### `src/app/api/v1/leads/route.ts` (new)

Server endpoint. POST only. Rate-limited at 10 req/hour/IP via existing Upstash limiter (`getRateLimiter('leads')`).

Logic:
1. Parse body via Zod.
2. Rate-limit check.
3. SHA-256 hash IP from `x-forwarded-for`.
4. `INSERT INTO email_leads (email, chart_id, locale, source, utm_*, anonymous_id, ip_address_hash, user_agent) VALUES (...) ON CONFLICT (email) DO NOTHING RETURNING id`.
5. If RETURNING returned a row → `wasNew = true`; if empty → `SELECT id WHERE email = ?` → `wasNew = false`.
6. If `wasNew === true`:
   - `trackServerEvent(anonymous_id ?? \`lead_${leadId}\`, AnalyticsEvent.EMAIL_LEAD_SUBMITTED, { email, $insert_id: \`${leadId}:email_lead_submitted\`, utm_source, utm_content, utm_campaign, source: 'hero_calculator' })`. The existing analytics wrapper (`src/shared/lib/analytics.ts:165-179`) automatically dispatches CAPI `Lead` because `email_lead_submitted` will be in `ESTREVIA_EVENT_NAMES` and mapped to CAPI `Lead`.
7. Return `{ success: true, data: { leadId, eventId: \`${leadId}:email_lead_submitted\`, wasNew } }`.

Error path: 400 on invalid body, 429 on rate-limit, 500 on DB failure. CAPI failure does not propagate (analytics wrapper already swallows).

#### `src/modules/astro-engine/components/HeroCalculator.tsx` (modified)

Add gate state machine. Pseudocode:

```tsx
const { isSignedIn } = useUser();
const [showResult, setShowResult] = useState(false);
const [pendingResult, setPendingResult] = useState<HeroResult | null>(null);
const [gateOpen, setGateOpen] = useState(false);
const searchParams = useSearchParams();
const noGate = searchParams.get('no_gate') === '1';

function shouldShowGate(): boolean {
  if (isSignedIn) return false;
  if (noGate) return false;
  try {
    if (window.localStorage.getItem('email_gate_passed')) return false;
  } catch { /* private mode — allow gate to show */ }
  return true;
}

// In handleSubmit success branch (after chart calc API returns):
setPendingResult(heroResult);
if (shouldShowGate()) {
  setGateOpen(true);
} else {
  setShowResult(true);
}

// Render:
{gateOpen && pendingResult && (
  <EmailGateModal
    open={gateOpen}
    chartId={pendingResult.chartId}
    locale={locale}
    onSubmitted={() => { setGateOpen(false); setShowResult(true); }}
    onDismiss={() => { setGateOpen(false); setShowResult(true); }}
  />
)}
{showResult && pendingResult && /* existing result-card JSX, fed from pendingResult */ }
```

The existing form / loading / result-card structure stays. Only the result-reveal moment is gated.

#### `src/shared/lib/schema.ts` (modified — add table)

```ts
export const emailLeads = pgTable('email_leads', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
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
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),  // preparatory — not used in this spec; populated by follow-up /unsubscribe extension
}, (t) => ({
  createdAtIdx: index('email_leads_created_at_idx').on(t.createdAt),
  convertedToUserIdIdx: index('email_leads_converted_to_user_id_idx').on(t.convertedToUserId),
}));
```

The `email` column is unique — INSERT-ON-CONFLICT-DO-NOTHING enforces idempotency at the DB layer. `email` itself is NOT encrypted: per `CLAUDE.md`, PII = birth date/time/location; email is treated as standard auth-tier data (already stored unhashed in `users.email`). GDPR compliance is maintained via the consent text in the modal + the existing `/unsubscribe` flow (extended in a follow-up spec to also flip `unsubscribed_at`).

#### Migration

Generate via `npm run db:generate` after editing `schema.ts`. Drizzle will emit the next-available migration file (likely `0008_email_leads.sql` if `0007` is already committed; the `?? drizzle/meta/0007_snapshot.json` from earlier git status implies `0007` may not yet be tracked). Implementation plan must verify migration numbering at run time.

#### `src/shared/lib/analytics.ts` (modified)

Add to `AnalyticsEvent` const:

```ts
EMAIL_LEAD_SUBMITTED: 'email_lead_submitted',
EMAIL_LEAD_RESUBMITTED: 'email_lead_resubmitted',  // PostHog only — not in ESTREVIA_EVENT_NAMES, no CAPI fire
EMAIL_GATE_DISMISSED: 'email_gate_dismissed',       // PostHog only
```

Add `'email_lead_submitted'` to the `ESTREVIA_EVENT_NAMES` Set (the gating Set for CAPI dispatch).

#### `src/modules/advertising/meta-capi/event-mapper.ts` (modified)

```diff
 export const MAPPING_TABLE: Record<EstreviaEvent, MappedEvent> = {
   landing_view: { pixel: 'PageView', capi: null },
   chart_calculated: { pixel: 'ViewContent', capi: 'ViewContent' },
   passport_reshared: { pixel: 'Share', capi: 'Share' },
   user_registered: { pixel: 'Lead', capi: 'Lead' },
+  email_lead_submitted: { pixel: 'Lead', capi: 'Lead' },
   paywall_opened: { pixel: 'InitiateCheckout', capi: 'InitiateCheckout' },
   subscription_started: { pixel: null, capi: 'Subscribe' },
 };
```

#### `src/modules/advertising/meta-capi/types.ts` (modified)

Add `'email_lead_submitted'` to the `EstreviaEvent` type union.

#### i18n (`messages/en.json` + `messages/es.json`)

Add an `emailGate` section under the top-level translations object. Keys:

| Key | EN | ES (español neutro LATAM, `tú`) |
|---|---|---|
| `title` | "See your sidereal chart" | "Mira tu carta sideral" |
| `subtitle` | "Enter your email to reveal the chart we just calculated for you." | "Ingresa tu email para ver la carta que calculamos." |
| `emailLabel` | "Email" | "Email" |
| `emailPlaceholder` | "you@example.com" | "tu@ejemplo.com" |
| `submitCta` | "See My Chart" | "Ver mi carta" |
| `submittingCta` | "Loading…" | "Cargando…" |
| `dismissCta` | "Skip for now" | "Saltar por ahora" |
| `privacyText` | "By submitting, you agree to receive your chart and occasional astrology insights. Unsubscribe anytime." | "Al enviar, aceptas recibir tu carta y consejos ocasionales de astrología. Puedes cancelar la suscripción en cualquier momento." |
| `errInvalidEmail` | "Please enter a valid email" | "Por favor ingresa un email válido" |
| `errRateLimited` | "Too many attempts. Try again in a minute." | "Demasiados intentos. Intenta de nuevo en un minuto." |
| `errNetwork` | "Connection issue. Try again." | "Problema de conexión. Intenta de nuevo." |
| `errGeneric` | "Something went wrong. Try again." | "Algo salió mal. Intenta de nuevo." |

## Data flow

```
Anonymous user lands on /  →  HeroCalculator form  →  POST /api/v1/chart/calculate  →  chartId returned
                                                                                       ↓
                                                                                shouldShowGate() check
                                                                  ┌────────────────────┴─────────────────────┐
                                                                  ↓ true                                     ↓ false
                                                            EmailGateModal opens                   result rendered immediately
                                                                  ↓ user submits email
                                                            POST /api/v1/leads
                                                                  ↓
                                                            INSERT ON CONFLICT → wasNew?
                                                                  ↓ yes
                                                  trackServerEvent(EMAIL_LEAD_SUBMITTED, $insert_id=...)
                                                                  ↓ analytics wrapper
                                                                  ↓
                                                  ┌───────────────┴─────────────────┐
                                                  ↓                                 ↓
                                          PostHog capture                   Meta CAPI Lead
                                                                            event_id: ${leadId}:email_lead_submitted
                                                                                  
                                                            Server returns leadId + eventId + wasNew=true
                                                                  ↓
                                                            Browser fires fbq('track','Lead', {}, {eventID: same})
                                                                  ↓
                                                            Meta dedupes by event_id, merges browser+server
                                                                  ↓
                                                            Match Quality Score lifts (browser provides fbp/fbc)
                                                                  ↓
                                                            localStorage flag set, modal closes, result rendered
```

## Idempotency contract

- DB level: `email_leads.email` UNIQUE → ON CONFLICT DO NOTHING ensures one row per email.
- Server CAPI: Lead fires only when `wasNew === true`. Subsequent submits of same email do not fire CAPI.
- Browser fbq: fires only when server response has `wasNew === true`. localStorage `email_gate_passed` flag prevents re-showing the gate within the same browser, regardless of email.
- Cross-device: a user submitting the same email from a second device gets `wasNew === false` from the server; no duplicate fbq, no duplicate CAPI. Meta event_id (`${leadId}:email_lead_submitted`) is the same.
- Dismiss: localStorage flag set on dismiss too. No CAPI, no fbq. PostHog `email_gate_dismissed` for analytics.

## Edge cases

| Case | Behavior |
|---|---|
| `useUser().isSignedIn === true` | `shouldShowGate()` returns false. Result renders immediately. |
| `localStorage.email_gate_passed === '1'` | `shouldShowGate()` returns false. |
| `?no_gate=1` query param | `shouldShowGate()` returns false. For founder testing. |
| `localStorage` throws (private mode, ITP) | try/catch returns `true` (gate shown). On dismiss/submit, flag write also throws and is silently swallowed; gate may show again on reload. Acceptable trade-off. |
| Email format invalid | Client-side regex validation in modal; submit disabled with inline error. No server call. |
| Network failure | Caught in modal; `errNetwork` shown; user can retry. |
| Server returns 429 | `errRateLimited` shown; user retries after timeout. |
| Server returns 500 | `errGeneric` shown; user retries. |
| Server returns 200 + `wasNew=false` | Modal closes silently; no fbq fire; PostHog `email_lead_resubmitted` recorded; result rendered. |
| User submits email, then closes browser before result renders | `email_leads` row persists; CAPI Lead already fired server-side. They lose visual confirmation but data captured. |
| User dismisses (X) | localStorage flag set, PostHog `email_gate_dismissed`, no CAPI, no fbq. Result rendered. |
| User submits email of an existing Clerk user | Allowed. `email_leads` row exists separately. Future reconcile spec ties them via `converted_to_user_id`. |
| `chartId` references a deleted chart | `chart_id` FK is soft (no DB-level CASCADE). Lead row persists with stale chartId. Acceptable. |

## Tests

### `src/shared/components/__tests__/EmailGateModal.test.tsx` (~10 cases)

- Renders when `open=true`; nothing when `open=false`
- Submit disabled when email is empty
- Submit disabled while `loading`
- Valid email + submit → fetch `/api/v1/leads` with correct body shape (email, chartId, utm, anonymous_id, locale)
- Response `wasNew=true` → fbq Lead fires with returned `eventId`; localStorage flag set; `onSubmitted()` called
- Response `wasNew=false` → fbq does NOT fire; PostHog `email_lead_resubmitted` recorded; flag set; `onSubmitted()` called
- Response 429 → `errRateLimited` shown; no fbq
- Invalid-format email → client-side error; no fetch
- Dismiss button → `onDismiss()` called; PostHog `email_gate_dismissed`; flag set; no fbq
- Escape key → `onDismiss()`
- localStorage throw tolerated (silent fail)

### `src/app/api/v1/leads/__tests__/route.test.ts` (~7 cases)

- POST valid body → 200, returns `{leadId, eventId, wasNew: true}`; `email_leads` row created
- POST same email twice → second response has `wasNew: false`; only one row in DB
- POST invalid email format → 400
- POST missing required field → 400
- POST 11 times in same hour from same IP → 11th returns 429
- Server fires `trackServerEvent(EMAIL_LEAD_SUBMITTED, ...)` with `$insert_id = ${leadId}:email_lead_submitted` on `wasNew=true`
- Server does NOT fire `trackServerEvent` on `wasNew=false`
- IP is hashed via SHA-256 before storing — assert `ipAddressHash` is 64-char hex, no plaintext

### `HeroCalculator` integration tests

Either modify existing tests or add new file `src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx` (verify whether one exists during plan execution):

- Anonymous + no `email_gate_passed` flag + chart calc success → modal mounts with `open=true`
- Signed-in user → modal does NOT mount; result rendered immediately
- localStorage flag set → modal does NOT mount
- `?no_gate=1` → modal does NOT mount
- Modal `onSubmitted` → modal closes; result renders
- Modal `onDismiss` → modal closes; result renders

## Release checklist

1. Run `npm run db:migrate` against prod `DATABASE_URL` to apply both pending migrations: `0007_*` (`users.locale`, discovered earlier and still pending) and the new `email_leads` migration.
2. Push to `main`; Vercel auto-deploys.
3. Anonymous-browser smoke test on prod: navigate to `/`, submit chart calc → confirm modal appears; submit email → confirm chart renders; check `email_leads` table for new row.
4. Meta Events Manager → Test Events tab: complete a smoke flow with `?fbclid=test_<random>` → confirm `Lead` event shows Browser+Server merged on one row with correct `event_id`.
5. PostHog: create dashboard tile for `email_lead_submitted` / `email_gate_dismissed` / `email_lead_resubmitted` rates. Track ratio `email_lead_submitted / chart_calculated` to measure gate conversion.
6. Monitor 7-14 days. Expected gate→email conversion: 30-60% of chart-calc completers (industry benchmark for cold-traffic lead magnets).

## Files affected

```
+ src/shared/components/EmailGateModal.tsx                        ~150 LOC
+ src/shared/components/__tests__/EmailGateModal.test.tsx         ~200 LOC
+ src/app/api/v1/leads/route.ts                                   ~120 LOC
+ src/app/api/v1/leads/__tests__/route.test.ts                    ~150 LOC
+ drizzle/<NN>_email_leads.sql                                    ~30 LOC (Drizzle-generated)
M src/modules/astro-engine/components/HeroCalculator.tsx          ~25 LOC added (gate state machine)
M src/shared/lib/schema.ts                                        ~25 LOC (new emailLeads table)
M src/shared/lib/analytics.ts                                     +3 enum values, +1 in ESTREVIA_EVENT_NAMES set
M src/modules/advertising/meta-capi/event-mapper.ts               +1 mapping (email_lead_submitted)
M src/modules/advertising/meta-capi/types.ts                      +1 EstreviaEvent value
M messages/en.json                                                +12 keys under emailGate.*
M messages/es.json                                                +12 keys under emailGate.*
```

11 files affected. Estimated effort: 2-3 hours implementation + review iterations.
