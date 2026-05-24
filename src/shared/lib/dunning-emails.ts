import 'server-only';
import { and, eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import * as Sentry from '@sentry/nextjs';
import { getDb } from './db';
import { sentDunningEmails } from './schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DunningStep = 'd0' | 'd3' | 'd7' | 'd10';

export interface SendDunningEmailParams {
  userId: string;
  email: string;
  locale: 'en' | 'es';
  subscriptionId: string;
  stripeInvoiceId: string;
  dunningStep: DunningStep;
  /** invoice.period_start converted to Date */
  billingPeriodStart: Date;
  isHardDecline: boolean;
  /** One-time Stripe Billing Portal URL, valid ~5 min. Used for D0/D3 only. */
  billingPortalUrl?: string;
}

export interface DunningEmailResult {
  sent: boolean;
  reason?: 'dry_run' | 'already_sent' | 'user_not_found' | 'resend_error';
  messageId?: string;
}

/**
 * Idempotency claim result — mirrors tryInsertOneShotLead pattern.
 */
type DunningEmailClaim = 'new' | 'retry' | 'delivered';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FROM_ADDRESS = 'Estrevia <hello@estrevia.app>';
const SITE_URL = 'https://estrevia.app';

const SUBJECTS: Record<DunningStep, Record<'en' | 'es', string>> = {
  d0: {
    en: "Your payment didn't go through — action needed",
    es: 'Tu pago no se procesó — acción necesaria',
  },
  d3: {
    en: 'Reminder: update your payment method',
    es: 'Recordatorio: actualiza tu método de pago',
  },
  d7: {
    en: 'Your Estrevia Pro access will pause in 3 days',
    es: 'Tu acceso a Estrevia Pro se pausará en 3 días',
  },
  d10: {
    en: 'Last chance — keep Estrevia Pro at 20% off',
    es: 'Última oportunidad — mantén Estrevia Pro con 20% de descuento',
  },
};

// ---------------------------------------------------------------------------
// Lazy Resend initialization
// ---------------------------------------------------------------------------

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not configured');
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// ---------------------------------------------------------------------------
// Idempotency helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Date to YYYY-MM-DD string for the billing_period_start DATE column.
 * Uses UTC to avoid timezone shifts changing the date.
 */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Claims a one-shot dunning send slot.
 *
 * Returns:
 *  'new'       — row inserted; proceed with send
 *  'retry'     — row exists but resend_message_id IS NULL (prior attempt claimed
 *               the slot but Resend call never completed); safe to retry
 *  'delivered' — row exists with resend_message_id set; skip send
 */
export async function tryInsertOneShotDunning(
  subscriptionId: string,
  dunningStep: DunningStep,
  billingPeriodStart: Date,
  userId: string,
  stripeInvoiceId: string,
  isHardDecline: boolean,
): Promise<DunningEmailClaim> {
  const db = getDb();
  const periodDate = toIsoDate(billingPeriodStart);

  const inserted = await db
    .insert(sentDunningEmails)
    .values({
      userId,
      subscriptionId,
      stripeInvoiceId,
      dunningStep,
      billingPeriodStart: periodDate,
      isHardDecline,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    console.info('[dunning-emails] claim', {
      subscriptionId,
      dunningStep,
      billingPeriodStart: periodDate,
      result: 'new',
    });
    return 'new';
  }

  // Conflict — distinguish delivered vs retry
  const existing = await db
    .select({ resendMessageId: sentDunningEmails.resendMessageId })
    .from(sentDunningEmails)
    .where(
      and(
        eq(sentDunningEmails.subscriptionId, subscriptionId),
        eq(sentDunningEmails.dunningStep, dunningStep),
        eq(sentDunningEmails.billingPeriodStart, periodDate),
      ),
    )
    .limit(1);

  const result: DunningEmailClaim = existing[0]?.resendMessageId ? 'delivered' : 'retry';
  console.info('[dunning-emails] claim', {
    subscriptionId,
    dunningStep,
    billingPeriodStart: periodDate,
    result,
    existingMsgid: existing[0]?.resendMessageId ?? null,
  });
  return result;
}

/**
 * Records Resend message ID after successful send. Best-effort — failures swallowed.
 */
export async function recordDunningMessageId(
  subscriptionId: string,
  dunningStep: DunningStep,
  billingPeriodStart: Date,
  messageId: string,
): Promise<void> {
  if (!messageId) return;
  const db = getDb();
  const periodDate = toIsoDate(billingPeriodStart);
  try {
    await db
      .update(sentDunningEmails)
      .set({ resendMessageId: messageId })
      .where(
        and(
          eq(sentDunningEmails.subscriptionId, subscriptionId),
          eq(sentDunningEmails.dunningStep, dunningStep),
          eq(sentDunningEmails.billingPeriodStart, periodDate),
        ),
      );
  } catch (err) {
    console.warn('[dunning-emails] recordDunningMessageId failed (non-fatal)', {
      subscriptionId,
      dunningStep,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/**
 * Records an error after a failed Resend call. Best-effort.
 */
export async function recordDunningError(
  subscriptionId: string,
  dunningStep: DunningStep,
  billingPeriodStart: Date,
  errorMessage: string,
): Promise<void> {
  const db = getDb();
  const periodDate = toIsoDate(billingPeriodStart);
  try {
    await db
      .update(sentDunningEmails)
      .set({ error: errorMessage.slice(0, 500) }) // truncate to avoid large error strings
      .where(
        and(
          eq(sentDunningEmails.subscriptionId, subscriptionId),
          eq(sentDunningEmails.dunningStep, dunningStep),
          eq(sentDunningEmails.billingPeriodStart, periodDate),
        ),
      );
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Main send function
// ---------------------------------------------------------------------------

/**
 * Sends a dunning email for the given step.
 *
 * Orchestration:
 * 1. DRY_RUN check
 * 2. Idempotency claim via tryInsertOneShotDunning
 * 3. Dynamic import of the appropriate email template
 * 4. Render + Resend send
 * 5. Record message ID (or error)
 *
 * Never throws — returns a result object. Errors are logged + Sentry-captured.
 * Does NOT log email addresses (PII policy).
 */
export async function sendDunningEmail(
  params: SendDunningEmailParams,
): Promise<DunningEmailResult> {
  const {
    userId,
    email,
    locale,
    subscriptionId,
    stripeInvoiceId,
    dunningStep,
    billingPeriodStart,
    isHardDecline,
    billingPortalUrl,
  } = params;

  // 1. DRY_RUN gate
  if (process.env.DUNNING_DRY_RUN === 'true') {
    console.info('[dunning-emails] DRY_RUN: would send', {
      userId,
      dunningStep,
      subscriptionId,
    });
    return { sent: false, reason: 'dry_run' };
  }

  // 2. Idempotency
  const claim = await tryInsertOneShotDunning(
    subscriptionId,
    dunningStep,
    billingPeriodStart,
    userId,
    stripeInvoiceId,
    isHardDecline,
  );

  if (claim === 'delivered') {
    console.info('[dunning-emails] already sent — skipping', {
      userId,
      dunningStep,
      subscriptionId,
    });
    return { sent: false, reason: 'already_sent' };
  }

  // 3. Build settingsUrl
  const settingsUrl = `${SITE_URL}/${locale === 'es' ? 'es/' : ''}settings`;

  // 4. Render template
  let html: string;
  let text: string;

  try {
    if (dunningStep === 'd0') {
      const { default: DunningAlertEmail } = await import('@/emails/DunningAlertEmail');
      const component = DunningAlertEmail({
        locale,
        isHardDecline,
        billingPortalUrl,
        settingsUrl,
      });
      html = await render(component);
      text = await render(component, { plainText: true });
    } else if (dunningStep === 'd3') {
      const { default: DunningReminderEmail } = await import('@/emails/DunningReminderEmail');
      const component = DunningReminderEmail({ locale, billingPortalUrl, settingsUrl });
      html = await render(component);
      text = await render(component, { plainText: true });
    } else if (dunningStep === 'd7') {
      const { default: DunningUrgencyEmail } = await import('@/emails/DunningUrgencyEmail');
      const component = DunningUrgencyEmail({ locale, settingsUrl });
      html = await render(component);
      text = await render(component, { plainText: true });
    } else {
      // d10
      const { default: DunningFinalEmail } = await import('@/emails/DunningFinalEmail');
      const component = DunningFinalEmail({ locale, settingsUrl });
      html = await render(component);
      text = await render(component, { plainText: true });
    }
  } catch (renderErr) {
    console.error('[dunning-emails] render failed', {
      userId,
      dunningStep,
      error: renderErr instanceof Error ? renderErr.message : 'unknown',
    });
    Sentry.captureException(renderErr, {
      tags: { service: 'dunning-emails', dunningStep },
    });
    await recordDunningError(
      subscriptionId,
      dunningStep,
      billingPeriodStart,
      renderErr instanceof Error ? renderErr.message : 'render_failed',
    );
    return { sent: false, reason: 'resend_error' };
  }

  // 5. Send via Resend
  // Idempotency key: subscription + step + period start (safe to retry on network errors)
  const idempotencyKey = `dunning:${subscriptionId}:${dunningStep}:${toIsoDate(billingPeriodStart)}`;

  try {
    const result = await getResend().emails.send(
      {
        from: FROM_ADDRESS,
        to: email,
        subject: SUBJECTS[dunningStep][locale],
        html,
        text,
        headers: {
          'List-Unsubscribe': `<${settingsUrl}>`,
        },
      },
      { idempotencyKey },
    );

    if (result.error) {
      throw new Error(`Resend API error: ${result.error.message ?? JSON.stringify(result.error)}`);
    }

    const messageId = result.data?.id ?? null;
    if (messageId) {
      await recordDunningMessageId(subscriptionId, dunningStep, billingPeriodStart, messageId);
    }

    console.info('[dunning-emails] sent', {
      userId,
      dunningStep,
      subscriptionId,
      messageId,
    });

    return { sent: true, messageId: messageId ?? undefined };
  } catch (sendErr) {
    const errMsg = sendErr instanceof Error ? sendErr.message : 'unknown';
    console.error('[dunning-emails] send failed', {
      userId,
      dunningStep,
      subscriptionId,
      error: errMsg,
    });
    Sentry.captureException(sendErr, {
      tags: { service: 'dunning-emails', dunningStep },
    });
    await recordDunningError(subscriptionId, dunningStep, billingPeriodStart, errMsg);
    return { sent: false, reason: 'resend_error' };
  }
}
