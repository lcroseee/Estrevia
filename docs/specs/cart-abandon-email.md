# Cart-Abandon Email — Specification (T3)
Date: 2026-05-24
Status: Ready for implementation

## Overview

A single targeted email sent to leads (email_leads) who viewed the paywall but did not
convert. Triggered by behavior (paywall_opened event), not by time-since-signup.
Runs once/day via Vercel Cron.

---

## 1. Cohort Query (HogQL)

Query PostHog for distinct_ids + emails that fired `paywall_opened` (or
`checkout_stripe_redirected`) in the last 7 days but have NOT fired `subscription_started`
in the same window.

```sql
SELECT
  properties.email     AS email,
  properties.$current_url AS last_url,
  MAX(timestamp)       AS last_paywall_at,
  countIf(event = 'checkout_stripe_redirected') AS checkout_clicks
FROM events
WHERE event IN ('paywall_opened', 'checkout_stripe_redirected')
  AND timestamp >= toDateTime('{since_iso}')
  AND timestamp <= toDateTime('{cutoff_iso}')
  AND properties.email IS NOT NULL
  AND distinct_id NOT IN (
    SELECT DISTINCT distinct_id
    FROM events
    WHERE event = 'subscription_started'
      AND timestamp >= toDateTime('{since_iso}')
  )
GROUP BY properties.email, properties.$current_url
ORDER BY checkout_clicks DESC, last_paywall_at DESC
```

Parameters:
- `since_iso`: NOW() - 7 days
- `cutoff_iso`: NOW() - 1 hour (prevents sending to users still on the page)

Returns: list of `{ email, last_paywall_at, checkout_clicks }`.

---

## 2. DB Join

After HogQL query, join to email_leads to get leadId + locale:

```sql
SELECT id, email, locale
FROM email_leads
WHERE LOWER(email) = ANY($1::text[])
  AND converted_to_user_id IS NULL
  AND unsubscribed_at IS NULL
  AND email_undeliverable = false
```

Then filter against `sent_cart_abandon_emails`:

```sql
SELECT lead_id FROM sent_cart_abandon_emails
WHERE lead_id = ANY($1::text[])
  AND sent_at > NOW() - INTERVAL '90 days'
```

Only leads NOT in the sent table proceed to send.

---

## 3. DB Schema — sent_cart_abandon_emails (migration 0014)

```sql
CREATE TABLE sent_cart_abandon_emails (
  id               SERIAL PRIMARY KEY,
  lead_id          TEXT NOT NULL REFERENCES email_leads(id) ON DELETE CASCADE,
  resend_message_id TEXT,
  posthog_last_paywall_at TIMESTAMPTZ,
  checkout_clicks  INTEGER NOT NULL DEFAULT 0,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sent_cart_abandon_emails_lead_id_idx
  ON sent_cart_abandon_emails (lead_id);
```

Note: No UNIQUE INDEX on lead_id — allows re-send after 90d. The 90d check is
enforced in application code (WHERE sent_at > NOW() - 90d).

---

## 4. Email Content

### Subject (EN/ES)
```
en: "[Name], you almost unlocked your full chart"
    → if name unavailable: "You almost unlocked your full chart"
es: "[Nombre], casi desbloqueas tu carta completa"
    → fallback: "Casi desbloqueas tu carta completa"
```

Note: `email_leads` does NOT have a `name` field — leads are anonymous email captures.
Subject uses email prefix as name fallback (e.g. "alex" from alex@example.com),
trimmed at first dot/underscore/number.

### Preview Text
```
en: "Your Saturn return timing, Jupiter windows, and synastry — plus a 48h offer."
es: "Tu retorno de Saturno, ventanas de Júpiter y sinastría — más una oferta de 48h."
```

### Body (EN) — 250 words target

```
You saw what's inside Estrevia Pro. Here's what you didn't unlock yet:

**Saturn-return timing.** Your sidereal Saturn is in [sign]. Depending on your
exact degree, you're either entering, deep in, or past your Saturn return —
one of the most defining 2-3 year windows in a life. The full reading shows
you exactly where you stand.

**Jupiter expansion windows.** Jupiter cycles through signs in ~12 years. Your
next major opportunity window opens when it hits your natal Sun or Moon. The
chart reading shows when that is.

**Synastry.** Drop any birth data alongside yours — the AI reads the inter-chart
aspects and tells you what actually drives the friction or flow between two charts.

**The full synthesis.** Sun + Moon + Ascendant + 8 outer planets + houses + aspects,
woven into one narrative written for your exact chart — not a generic horoscope.

You were one step away.

[BUTTON: Unlock Pro Annual — Save $7 (48h only)]
→ https://estrevia.app/{locale}/pricing?coupon=ABANDON20&utm_source=cart-abandon&utm_medium=email&utm_campaign=cart-abandon-20off

This offer expires in 48 hours.
After that, annual Pro remains $34.99/year — still far less than monthly.

Cancel anytime. No hidden fees.
```

### Body (ES) — stub, same structure

```
Viste lo que hay dentro de Estrevia Pro. Esto es lo que aún no desbloqueaste:

**Timing del retorno de Saturno.** Tu Saturno sideral está en [signo]...

**Ventanas de expansión de Júpiter.** Júpiter recorre los signos en ~12 años...

**Sinastría.** Ingresa cualquier dato de nacimiento junto al tuyo...

**La síntesis completa.** Sol + Luna + Ascendente + 8 planetas exteriores...

Estabas a un paso.

[BOTÓN: Desbloquea Pro Anual — Ahorra $7 (48h)]
→ https://estrevia.app/es/pricing?coupon=ABANDON20&utm_source=cart-abandon&utm_medium=email&utm_campaign=cart-abandon-20off

Esta oferta vence en 48 horas.
```

Note: Saturn sign comes from lead's `chart_id` (via `fetchTempChart`). If chart
unavailable (chartId null), omit the Saturn sentence; fallback body still works.

### Single CTA Button
```
en: "Unlock Pro Annual — Save $7 (48h only)"
es: "Desbloquea Pro Anual — Ahorra $7 (48h)"
```
URL: `${SITE_URL}/{locale}/pricing?coupon=ABANDON20&utm_source=cart-abandon&utm_medium=email&utm_campaign=cart-abandon-20off`

### Footer
Standard `EmailLayout` with `unsubscribeUrl` (lead unsubscribe token, same as drip).

---

## 5. Stripe Coupon — FOUNDER ACTION REQUIRED

**DO NOT create this programmatically.** Founder creates in Stripe Dashboard.

### Step-by-step

1. Go to Stripe Dashboard → Products → Coupons → Create coupon
2. Settings:
   - **Name**: `ABANDON20` (also use as ID/Code — enable "Create a promotion code")
   - **Type**: Percentage discount
   - **Percent off**: 20
   - **Duration**: Forever? No — **Once** (applies only to the first invoice)
   - **Applies to**: [Leave blank — applies to all products, filtered at checkout]
   - **Redemption limits**: Check "Limit the number of times this coupon can be redeemed"
     → Set to **1 per customer** (not a global cap)
   - **Expiry**: Leave blank (email copy provides scarcity; coupon stays valid for recovery)
3. Under "Promotion codes" section, enable the promotion code `ABANDON20`
4. Copy the promotion code (not coupon ID) — Stripe Checkout URL uses the code string

### Applying at checkout

The `/pricing` page's checkout button already passes `coupon` URL param to the
Stripe Checkout session creation. Verify `checkout/start` or `checkout/session`
route reads `searchParams.coupon` and passes to Stripe as `discounts: [{ coupon }]`.

**Verify before enabling DRY_RUN=false:**
```
GET https://estrevia.app/en/pricing?coupon=ABANDON20
```
Should pre-fill the coupon on the Stripe Checkout page.

---

## 6. Cron Schedule

```json
{
  "path": "/api/cron/cart-abandon-daily",
  "schedule": "0 7 * * *"
}
```

Runs at 07:00 UTC daily. Catches paywall views from the previous day (1h–25h old).

---

## 7. DRY_RUN Gate

Env var: `CART_ABANDON_DRY_RUN` (default: `"true"`).

When `"true"`: cron logs would-be sends to console, does NOT call Resend, does NOT
write to `sent_cart_abandon_emails`. Returns summary with `dryRun: true`.

**Founder flips to `"false"` after:**
1. Verifying PostHog cohort count is plausible (≥1 lead)
2. Stripe coupon `ABANDON20` is created and tested
3. `/pricing?coupon=ABANDON20` correctly pre-fills at Stripe Checkout

---

## 8. Send Function Signature

```typescript
// src/shared/lib/email.ts (new function appended)
export async function sendCartAbandonEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;  // for Saturn sign personalization
  chartId: string | null;
  checkoutClicks: number;     // 0 = viewed paywall only; >0 = clicked to Stripe
}): Promise<{ sent: boolean; reason?: string }>
```

Returns `{ sent: false, reason: 'already_sent' }` if `sent_cart_abandon_emails` has
a row for this lead within 90 days.

---

## 9. Security / Anti-Spam

- `List-Unsubscribe` header present (lead unsubscribe token)
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- Frequency cap: 1 per 90 days
- Trigger window: 1h–168h (7 days) after `paywall_opened`
- No PII in logs (leadId only, not email)

---

## 10. Observability

Console logs follow existing pattern:
- `[cron/cart-abandon] start { cohortSize, alreadySent, dryRun }`
- `[email/cart_abandon] sent { leadId, resendMessageId, dryRun }`
- `[email/cart_abandon] skip { leadId, reason: 'already_sent' | 'dry_run' }`
- Sentry exception on per-lead failures (non-fatal, loop continues)
