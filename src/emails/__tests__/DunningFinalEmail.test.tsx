import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import DunningFinalEmail from '../DunningFinalEmail';

const SETTINGS_URL = 'https://estrevia.app/settings';

describe('DunningFinalEmail', () => {
  it('renders EN final warning', async () => {
    const html = await render(
      DunningFinalEmail({ locale: 'en', settingsUrl: SETTINGS_URL }),
    );
    expect(html).toContain('Last chance');
    expect(html).toContain('final attempt');
    expect(html).toContain('billing settings');
  });

  it('renders EN save offer with 20% off', async () => {
    const html = await render(
      DunningFinalEmail({ locale: 'en', settingsUrl: SETTINGS_URL }),
    );
    expect(html).toContain('20%');
    expect(html).toContain('2 months');
    expect(html).toContain('hello@estrevia.app');
  });

  it('renders ES copy with save offer', async () => {
    const html = await render(
      DunningFinalEmail({ locale: 'es', settingsUrl: 'https://estrevia.app/es/settings' }),
    );
    expect(html).toContain('Última oportunidad');
    expect(html).toContain('20%');
    // ES offer copy
    expect(html).toContain('descuento');
  });

  it('produces non-empty plaintext fallback', async () => {
    const text = await render(
      DunningFinalEmail({ locale: 'en', settingsUrl: SETTINGS_URL }),
      { plainText: true },
    );
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain('20%');
  });
});
