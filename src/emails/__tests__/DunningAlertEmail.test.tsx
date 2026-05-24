import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import DunningAlertEmail from '../DunningAlertEmail';

const SETTINGS_URL = 'https://estrevia.app/settings';
const PORTAL_URL = 'https://billing.stripe.com/p/test-session-url';

describe('DunningAlertEmail', () => {
  it('renders EN soft decline with portal CTA', async () => {
    const html = await render(
      DunningAlertEmail({
        locale: 'en',
        isHardDecline: false,
        billingPortalUrl: PORTAL_URL,
        settingsUrl: SETTINGS_URL,
      }),
    );
    // HTML encodes apostrophes as &#x27;
    expect(html).toContain('Your payment didn');
    expect(html).toContain('go through');
    expect(html).toContain('Update payment method');
    expect(html).toContain(PORTAL_URL);
    // Soft decline: no hard decline sentence
    expect(html).not.toContain('Your card was declined');
    // Soft decline: retries mentioned
    expect(html).toContain('retry');
  });

  it('renders EN hard decline with card declined sentence', async () => {
    const html = await render(
      DunningAlertEmail({
        locale: 'en',
        isHardDecline: true,
        billingPortalUrl: PORTAL_URL,
        settingsUrl: SETTINGS_URL,
      }),
    );
    // HTML encodes apostrophes as &#x27;
    expect(html).toContain('Your payment didn');
    expect(html).toContain('go through');
    expect(html).toContain('Your card was declined');
    // Hard decline: no retry mention
    expect(html).not.toContain('retry');
  });

  it('falls back to settingsUrl when no billingPortalUrl', async () => {
    const html = await render(
      DunningAlertEmail({
        locale: 'en',
        isHardDecline: false,
        settingsUrl: SETTINGS_URL,
      }),
    );
    expect(html).toContain(SETTINGS_URL);
    expect(html).toContain('billing settings');
  });

  it('renders ES copy', async () => {
    const html = await render(
      DunningAlertEmail({
        locale: 'es',
        isHardDecline: false,
        billingPortalUrl: PORTAL_URL,
        settingsUrl: `${SETTINGS_URL.replace('/settings', '/es/settings')}`,
      }),
    );
    expect(html).toContain('Tu pago no se procesó');
    expect(html).toContain('Actualizar método de pago');
  });

  it('produces non-empty plaintext fallback', async () => {
    const text = await render(
      DunningAlertEmail({
        locale: 'en',
        isHardDecline: false,
        settingsUrl: SETTINGS_URL,
      }),
      { plainText: true },
    );
    expect(text.length).toBeGreaterThan(50);
    // Plaintext uppercases headings
    expect(text.toUpperCase()).toContain("PAYMENT DIDN");
    expect(text.toUpperCase()).toContain("GO THROUGH");
  });
});
