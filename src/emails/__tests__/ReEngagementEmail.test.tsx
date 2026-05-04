import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import ReEngagementEmail from '../ReEngagementEmail';

const UNSUB_URL = 'https://estrevia.app/unsubscribe?token=test-token';

describe('ReEngagementEmail', () => {
  it('renders EN with unsubscribe link', async () => {
    const html = await render(ReEngagementEmail({ locale: 'en', unsubscribeUrl: UNSUB_URL }));
    expect(html).toContain('Estrevia misses you');
    expect(html).toContain('Open your chart');
    expect(html).toContain(UNSUB_URL);
  });
  it('renders EN with re-engagement copy', async () => {
    const html = await render(ReEngagementEmail({ locale: 'en', unsubscribeUrl: UNSUB_URL }));
    expect(html).toContain("few weeks");
    expect(html).toContain('planetary hour');
  });
  it('renders ES with neutral LATAM', async () => {
    const html = await render(ReEngagementEmail({ locale: 'es', unsubscribeUrl: UNSUB_URL }));
    expect(html).toContain('Estrevia te extraña');
    expect(html).toContain('Abre tu carta');
    expect(html).toContain('horas planetarias');
  });
  it('produces non-empty plaintext fallback with unsubscribe URL', async () => {
    const text = await render(ReEngagementEmail({ locale: 'en', unsubscribeUrl: UNSUB_URL }), { plainText: true });
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain(UNSUB_URL);
  });
});
