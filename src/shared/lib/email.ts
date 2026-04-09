import { Resend } from 'resend';

// Lazy initialization — Resend throws if API key is missing.
// We defer until first send so build succeeds without RESEND_API_KEY.
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

const FROM_ADDRESS = 'Estrevia <hello@estrevia.app>';

/**
 * Sends a plain-text welcome email to a new waitlist subscriber.
 * Safe to call without RESEND_API_KEY configured — throws with a
 * clear message instead of a cryptic SDK error.
 */
export async function sendWelcomeEmail(email: string): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: 'You are on the Estrevia waitlist',
    text: [
      'Welcome to Estrevia.',
      '',
      'You are now on our waitlist. We will notify you when sidereal chart',
      'calculation, planetary hours, and 777 correspondences go live.',
      '',
      'In the meantime, you can learn about sidereal astrology:',
      'https://estrevia.app',
      '',
      '— The Estrevia team',
    ].join('\n'),
  });
}

/**
 * Sends a trial-ending reminder email ~24h before the trial expires.
 * Triggered by Stripe's customer.subscription.trial_will_end webhook.
 */
export async function sendTrialEndingEmail(email: string, trialEnd: Date): Promise<void> {
  const resend = getResend();
  const formattedDate = trialEnd.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: 'Your Estrevia Pro trial ends tomorrow',
    text: [
      'Hi there,',
      '',
      `Your Estrevia Pro free trial ends on ${formattedDate}.`,
      '',
      'After that, your subscription will be charged automatically.',
      'If you want to cancel, you can do so anytime from your settings:',
      'https://estrevia.app/settings',
      '',
      'What you get with Pro:',
      '- All 120+ sidereal astrology essays',
      '- Full moon calendar with Void-of-Course',
      '- Complete planetary hours table',
      '- Unlimited synastry (compatibility)',
      '- AI tarot interpretation',
      '- Personalized Tree of Life',
      '',
      'Thank you for trying Estrevia Pro.',
      '',
      '— The Estrevia team',
    ].join('\n'),
  });
}
