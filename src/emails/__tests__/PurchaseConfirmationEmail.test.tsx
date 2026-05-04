import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import PurchaseConfirmationEmail from '../PurchaseConfirmationEmail';

describe('PurchaseConfirmationEmail', () => {
  it('renders EN with pro_monthly plan', async () => {
    const html = await render(PurchaseConfirmationEmail({ locale: 'en', plan: 'pro_monthly', nextChargeDate: 'June 1, 2026' }));
    expect(html).toContain('Welcome to Estrevia Pro');
    expect(html).toContain('Pro Monthly');
    expect(html).toContain('June 1, 2026');
    expect(html).toContain('Open your dashboard');
  });
  it('renders EN with pro_annual plan', async () => {
    const html = await render(PurchaseConfirmationEmail({ locale: 'en', plan: 'pro_annual', nextChargeDate: 'May 3, 2027' }));
    expect(html).toContain('Pro Annual');
  });
  it('renders ES with neutral LATAM', async () => {
    const html = await render(PurchaseConfirmationEmail({ locale: 'es', plan: 'pro_monthly', nextChargeDate: '1 de junio de 2026' }));
    expect(html).toContain('Bienvenido a Estrevia Pro');
    expect(html).toContain('Pro Mensual');
    expect(html).toContain('Abre tu panel');
  });
  it('produces non-empty plaintext fallback', async () => {
    const text = await render(PurchaseConfirmationEmail({ locale: 'en', plan: 'pro_monthly', nextChargeDate: 'June 1, 2026' }), { plainText: true });
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain('240+');
  });
});
