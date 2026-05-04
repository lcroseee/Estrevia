import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import WelcomeEmail from '../WelcomeEmail';

describe('WelcomeEmail', () => {
  it('renders EN with saved chart', async () => {
    const html = await render(WelcomeEmail({ locale: 'en', hasSavedChart: true }));
    expect(html).toContain('Welcome to Estrevia');
    expect(html).toContain('Open your chart');
    expect(html).not.toContain('Create your first chart');
  });
  it('renders EN without saved chart', async () => {
    const html = await render(WelcomeEmail({ locale: 'en', hasSavedChart: false }));
    expect(html).toContain('Create your first chart');
  });
  it('renders ES with neutral LATAM', async () => {
    const html = await render(WelcomeEmail({ locale: 'es', hasSavedChart: false }));
    expect(html).toContain('Bienvenido a Estrevia');
    expect(html).toContain('Crea tu primera carta');
    expect(html).toContain('Lahiri');
  });
  it('produces non-empty plaintext fallback', async () => {
    const text = await render(WelcomeEmail({ locale: 'en', hasSavedChart: true }), { plainText: true });
    expect(text.length).toBeGreaterThan(50);
    // Plaintext renderer uppercases headings — check lowercase body content instead
    expect(text).toContain('sidereal');
  });
});
