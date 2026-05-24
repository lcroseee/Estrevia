import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import TrialReminder3dEmail from '@/emails/TrialReminder3dEmail';
import TrialReminder1dEmail from '@/emails/TrialReminder1dEmail';
import TrialEndedEmail from '@/emails/TrialEndedEmail';
import { claimTrialEmailSlot, recordSentTrial } from './sent-trial-emails';
import type { TrialEmailStep } from './sent-trial-emails';

const FROM_ADDRESS = 'Estrevia <hello@estrevia.app>';
const SITE_URL = 'https://estrevia.app';

// Lazy init — same pattern as email.ts
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

const SUBJECTS: Record<TrialEmailStep, Record<'en' | 'es', string>> = {
  reminder_3d: {
    en: 'Your Estrevia Pro trial ends in 3 days',
    es: 'Tu prueba de Estrevia Pro termina en 3 días',
  },
  reminder_1d: {
    en: 'Last day: your Estrevia Pro trial ends tomorrow',
    es: 'Último día: tu prueba de Estrevia Pro termina mañana',
  },
  trial_ended: {
    en: 'Your Estrevia trial ended — your chart is still here',
    es: 'Tu prueba de Estrevia terminó — tu carta sigue aquí',
  },
};

export interface TrialExpirationEmailParams {
  subscriptionId: string;
  userId: string;
  email: string;
  locale: 'en' | 'es';
  step: TrialEmailStep;
  trialEndDate: Date;
  plan: 'pro_monthly' | 'pro_annual' | 'free';
}

/**
 * Sends one step of the trial expiration email sequence.
 *
 * Guards:
 *   1. DRY_RUN=true → returns { sent: false, reason: 'dry_run' }, no Resend call.
 *   2. 'delivered' claim → returns { sent: false, reason: 'already_sent' }, no Resend call.
 *   3. 'retry' claim → proceeds with send (prior attempt failed before recording msgid).
 *
 * Throws on Resend error so the caller (webhook handler / cron) can capture via Sentry.
 * The dedup row from claimTrialEmailSlot remains; next run returns 'retry' and retries.
 *
 * Never logs email addresses or birth data (PII rule).
 */
export async function sendTrialExpirationEmail(params: TrialExpirationEmailParams): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const { subscriptionId, userId, locale, step, trialEndDate, plan } = params;

  // 1. DRY_RUN gate — founder-controlled, defaults true until smoke test
  if (process.env.DRY_RUN === 'true') {
    console.info('[trial-expiration-email] DRY_RUN — skipping send', {
      subscriptionId,
      userId,
      step,
      locale,
    });
    return { sent: false, reason: 'dry_run' };
  }

  // 2. Idempotency: claim the send slot
  const claim = await claimTrialEmailSlot(subscriptionId, userId, step);
  if (claim === 'delivered') {
    console.info('[trial-expiration-email] already delivered — skip', {
      subscriptionId,
      step,
    });
    return { sent: false, reason: 'already_sent' };
  }

  console.info('[trial-expiration-email] start', { subscriptionId, step, locale, claim });

  // 3. Build URLs
  const localePath = locale === 'es' ? 'es/' : '';
  const proUrl =
    `${SITE_URL}/${localePath}checkout/start?plan=${plan === 'pro_annual' ? 'pro_annual' : 'pro_monthly'}` +
    `&utm_source=trial-expiration&utm_campaign=${step}`;
  const billingPortalUrl = `${SITE_URL}/${localePath}settings`;
  const chartUrl = `${SITE_URL}/${localePath}chart?utm_source=trial-expiration&utm_campaign=${step}`;
  const couponCode = process.env.TRIAL_WINBACK_COUPON_CODE;

  // 4. Render the correct template
  let html: string;
  let text: string;

  if (step === 'reminder_3d') {
    const props = { locale, trialEndDate, proUrl, billingPortalUrl };
    html = await render(TrialReminder3dEmail(props));
    text = await render(TrialReminder3dEmail(props), { plainText: true });
  } else if (step === 'reminder_1d') {
    const props = { locale, trialEndDate, proUrl, billingPortalUrl };
    html = await render(TrialReminder1dEmail(props));
    text = await render(TrialReminder1dEmail(props), { plainText: true });
  } else {
    // trial_ended — win-back
    const props = { locale, proUrl, chartUrl, couponCode };
    html = await render(TrialEndedEmail(props));
    text = await render(TrialEndedEmail(props), { plainText: true });
  }

  // 5. Send via Resend
  const subject = SUBJECTS[step][locale];
  const idempotencyKey = `${subscriptionId}:trial:${step}`;

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${billingPortalUrl}>`,
      },
    },
    { idempotencyKey },
  );

  console.info('[trial-expiration-email] sent', {
    subscriptionId,
    step,
    resendMessageId: result.data?.id ?? null,
    resendErrorName: result.error?.name ?? null,
  });

  if (result.error) {
    const err = new Error(
      `Resend rejected trial:${step} for ${subscriptionId}: ${result.error.message ?? 'unknown'}`,
    );
    Sentry.captureException(err, {
      tags: {
        component: 'trial-expiration-email',
        email_type: `trial_${step}`,
        subscription_id: subscriptionId,
      },
    });
    throw err;
  }

  // 6. Record delivery
  await recordSentTrial(subscriptionId, step, result.data?.id ?? null);

  return { sent: true };
}
