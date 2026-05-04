import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import TrialEndingEmail from '../TrialEndingEmail';

const TRIAL_DATE = new Date('2026-06-01T00:00:00Z');

describe('TrialEndingEmail', () => {
  it('renders EN with trial end date', async () => {
    const html = await render(TrialEndingEmail({ locale: 'en', trialEnd: TRIAL_DATE }));
    expect(html).toContain('trial ends tomorrow');
    expect(html).toContain('Manage subscription');
    expect(html).toContain('Estrevia Pro');
  });
  it('renders EN with Pro features list', async () => {
    const html = await render(TrialEndingEmail({ locale: 'en', trialEnd: TRIAL_DATE }));
    expect(html).toContain('240+');
    expect(html).toContain('Void-of-Course');
    expect(html).toContain('synastry');
  });
  it('renders ES with neutral LATAM', async () => {
    const html = await render(TrialEndingEmail({ locale: 'es', trialEnd: TRIAL_DATE }));
    expect(html).toContain('prueba termina mañana');
    expect(html).toContain('Gestionar suscripción');
    expect(html).toContain('equipo de Estrevia');
  });
  it('produces non-empty plaintext fallback', async () => {
    const text = await render(TrialEndingEmail({ locale: 'en', trialEnd: TRIAL_DATE }), { plainText: true });
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain('240+');
  });
});
