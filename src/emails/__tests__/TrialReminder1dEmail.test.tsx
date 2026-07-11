import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import TrialReminder1dEmail from '../TrialReminder1dEmail';

const TRIAL_DATE = new Date('2026-07-15T14:00:00Z');
const PRO_URL =
  'https://estrevia.app/checkout/start?plan=pro_monthly&utm_source=trial-expiration&utm_campaign=reminder_1d';
const PORTAL_URL = 'https://estrevia.app/settings';

describe('TrialReminder1dEmail', () => {
  it('renders EN without a save-offer block when couponCode is absent', async () => {
    const html = await render(
      TrialReminder1dEmail({
        locale: 'en',
        trialEndDate: TRIAL_DATE,
        proUrl: PRO_URL,
        billingPortalUrl: PORTAL_URL,
      }),
    );
    expect(html).toContain('Last day of your trial');
    expect(html).not.toContain('SAVE50');
    expect(html).not.toContain('50% off');
  });

  it('renders the EN save-offer block (auto-apply framing) when couponCode is set', async () => {
    const html = await render(
      TrialReminder1dEmail({
        locale: 'en',
        trialEndDate: TRIAL_DATE,
        proUrl: `${PRO_URL}&coupon=SAVE50`,
        billingPortalUrl: PORTAL_URL,
        couponCode: 'SAVE50',
      }),
    );
    expect(html).toContain('SAVE50');
    expect(html).toContain('50% off your first charge');
  });

  it('renders the ES save-offer block (español neutro, tú form)', async () => {
    const html = await render(
      TrialReminder1dEmail({
        locale: 'es',
        trialEndDate: TRIAL_DATE,
        proUrl: `${PRO_URL}&coupon=SAVE50`,
        billingPortalUrl: PORTAL_URL,
        couponCode: 'SAVE50',
      }),
    );
    expect(html).toContain('SAVE50');
    expect(html).toContain('50% de descuento en tu primer cobro');
  });
});
