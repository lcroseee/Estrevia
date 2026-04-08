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
