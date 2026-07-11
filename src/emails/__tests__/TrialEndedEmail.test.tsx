import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import TrialEndedEmail from '../TrialEndedEmail';

const BASE_URL =
  'https://estrevia.app/checkout/start?plan=pro_monthly&utm_source=trial-expiration&utm_campaign=trial_ended';
const PRO_URL = `${BASE_URL}&coupon=SAVE50`;
const CHART_URL = 'https://estrevia.app/chart?utm_source=trial-expiration&utm_campaign=trial_ended';

describe('TrialEndedEmail', () => {
  it('renders EN without a coupon block when couponCode is absent', async () => {
    const html = await render(
      TrialEndedEmail({ locale: 'en', proUrl: BASE_URL, chartUrl: CHART_URL }),
    );
    expect(html).toContain('Your trial has ended');
    expect(html).not.toContain('SAVE50');
  });

  it('renders the EN coupon block with 50% auto-apply framing (no stale 10% copy)', async () => {
    const html = await render(
      TrialEndedEmail({ locale: 'en', proUrl: PRO_URL, chartUrl: CHART_URL, couponCode: 'SAVE50' }),
    );
    expect(html).toContain('SAVE50');
    expect(html).toContain('50% off your first charge');
    expect(html).not.toContain('10% off');
  });

  it('renders the ES coupon block (español neutro, tú form)', async () => {
    const html = await render(
      TrialEndedEmail({ locale: 'es', proUrl: PRO_URL, chartUrl: CHART_URL, couponCode: 'SAVE50' }),
    );
    expect(html).toContain('SAVE50');
    expect(html).toContain('50% de descuento en tu primer cobro');
  });
});
