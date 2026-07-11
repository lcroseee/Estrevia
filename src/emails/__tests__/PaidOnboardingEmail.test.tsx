import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import PaidOnboardingEmail from '../PaidOnboardingEmail';

describe('PaidOnboardingEmail', () => {
  it('renders EN with the AI-reading CTA pointing at /chart', async () => {
    const html = await render(PaidOnboardingEmail({ locale: 'en' }));
    expect(html).toContain('Your chart has more to say');
    expect(html).toContain('Generate my AI reading');
    expect(html).toContain('https://estrevia.app/chart');
    expect(html).not.toContain('https://estrevia.app/es/chart');
  });

  it('renders ES (neutral LATAM, tú form) with the /es/chart CTA', async () => {
    const html = await render(PaidOnboardingEmail({ locale: 'es' }));
    expect(html).toContain('Tu carta tiene más que decir');
    expect(html).toContain('Generar mi lectura con IA');
    expect(html).toContain('https://estrevia.app/es/chart');
  });

  it('is transactional: renders WITHOUT COMPANY_POSTAL_ADDRESS set and has no unsubscribe link', async () => {
    const prev = process.env.COMPANY_POSTAL_ADDRESS;
    delete process.env.COMPANY_POSTAL_ADDRESS;
    try {
      const html = await render(PaidOnboardingEmail({ locale: 'en' }));
      expect(html.toLowerCase()).not.toContain('unsubscribe');
    } finally {
      if (prev !== undefined) process.env.COMPANY_POSTAL_ADDRESS = prev;
    }
  });

  it('produces non-empty plaintext fallback', async () => {
    const text = await render(PaidOnboardingEmail({ locale: 'en' }), { plainText: true });
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain('AI reading');
  });
});
