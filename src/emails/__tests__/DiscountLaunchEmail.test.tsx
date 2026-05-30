import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import DiscountLaunchEmail from '../DiscountLaunchEmail';

const TRIAL_URL = 'https://estrevia.app/checkout/start?plan=pro_monthly&coupon=HALF50';
const UNSUB = 'https://estrevia.app/unsubscribe?token=abc';

describe('DiscountLaunchEmail', () => {
  it('renders EN with the HALF50 coupon link and 50% offer', async () => {
    const html = await render(DiscountLaunchEmail({ locale: 'en', trialUrl: TRIAL_URL, unsubscribeUrl: UNSUB }));
    expect(html).toContain('coupon=HALF50');
    expect(html).toContain('50%');
    expect(html).toContain('free 3-day trial');
  });

  it('renders ES (español neutro) with the offer and disclaimer', async () => {
    const html = await render(DiscountLaunchEmail({ locale: 'es', trialUrl: TRIAL_URL, unsubscribeUrl: UNSUB }));
    expect(html).toContain('coupon=HALF50');
    expect(html).toContain('50%');
    expect(html).toContain('prueba gratis de 3 días');
  });

  it('includes the one-click unsubscribe link (marketing footer)', async () => {
    const html = await render(DiscountLaunchEmail({ locale: 'en', trialUrl: TRIAL_URL, unsubscribeUrl: UNSUB }));
    expect(html).toContain(UNSUB);
  });

  it('states the discount applies AFTER the free trial (not a cheaper trial)', async () => {
    const html = await render(DiscountLaunchEmail({ locale: 'en', trialUrl: TRIAL_URL, unsubscribeUrl: UNSUB }));
    expect(html).toContain('first charge after the free 3-day trial');
  });
});
