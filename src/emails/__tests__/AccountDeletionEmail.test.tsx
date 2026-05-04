import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import AccountDeletionEmail from '../AccountDeletionEmail';

describe('AccountDeletionEmail', () => {
  it('renders EN with deletion confirmation', async () => {
    const html = await render(AccountDeletionEmail({ locale: 'en' }));
    expect(html).toContain('Account Deleted');
    expect(html).toContain('deleted from our systems');
    expect(html).toContain('Thank you for trying Estrevia');
  });
  it('renders EN with no CTA button (only footer link)', async () => {
    const html = await render(AccountDeletionEmail({ locale: 'en' }));
    // No CTA button — goodbye email has no primary action
    expect(html).not.toContain('estrevia.app/chart');
    // Footer always includes /settings for preferences — that is expected
    // Verify there is no primary Button href pointing to / or /chart
    expect(html).not.toContain('href="https://estrevia.app/chart"');
  });
  it('renders ES with neutral LATAM', async () => {
    const html = await render(AccountDeletionEmail({ locale: 'es' }));
    expect(html).toContain('Cuenta eliminada');
    expect(html).toContain('eliminados de nuestros sistemas');
    expect(html).toContain('Gracias por probar Estrevia');
  });
  it('produces non-empty plaintext fallback', async () => {
    const text = await render(AccountDeletionEmail({ locale: 'en' }), { plainText: true });
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain('personal data');
  });
});
