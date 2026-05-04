import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import SubscriptionCanceledEmail from '../SubscriptionCanceledEmail';

describe('SubscriptionCanceledEmail', () => {
  it('renders EN with access end date', async () => {
    const html = await render(SubscriptionCanceledEmail({ locale: 'en', accessEndDate: 'June 1, 2026' }));
    expect(html).toContain('Subscription Canceled');
    expect(html).toContain('June 1, 2026');
    expect(html).toContain('Manage subscription');
  });
  it('renders EN with free plan downgrade message', async () => {
    const html = await render(SubscriptionCanceledEmail({ locale: 'en', accessEndDate: 'June 1, 2026' }));
    expect(html).toContain('free plan');
  });
  it('renders ES with neutral LATAM', async () => {
    const html = await render(SubscriptionCanceledEmail({ locale: 'es', accessEndDate: '1 de junio de 2026' }));
    expect(html).toContain('Suscripción cancelada');
    expect(html).toContain('1 de junio de 2026');
    expect(html).toContain('Gestionar suscripción');
  });
  it('produces non-empty plaintext fallback', async () => {
    const text = await render(SubscriptionCanceledEmail({ locale: 'en', accessEndDate: 'June 1, 2026' }), { plainText: true });
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain('June 1, 2026');
  });
});
