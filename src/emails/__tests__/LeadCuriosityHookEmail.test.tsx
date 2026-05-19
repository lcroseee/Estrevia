import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import LeadCuriosityHookEmail from '../LeadCuriosityHookEmail';

describe('LeadCuriosityHookEmail', () => {
  const baseProps = {
    chartUrl: 'https://estrevia.app/chart?chartId=abc&utm_source=lead-nurture&utm_campaign=t1h',
  };

  it('renders Saturn-Capricorn reveal in EN', async () => {
    const html = await render(
      <LeadCuriosityHookEmail
        locale="en"
        planet="Saturn"
        signName="Capricorn"
        {...baseProps}
      />,
    );
    expect(html).toContain('Saturn');
    expect(html).toContain('Capricorn');
    expect(html).toContain(baseProps.chartUrl);
    expect(html).toContain('Unlock');
  });

  it('renders Mars-Aries reveal in ES', async () => {
    const html = await render(
      <LeadCuriosityHookEmail
        locale="es"
        planet="Mars"
        signName="Aries"
        {...baseProps}
      />,
    );
    expect(html).toContain('Marte');
    expect(html).toContain('Aries');
    expect(html).toContain(baseProps.chartUrl);
    expect(html).toContain('Desbloquea');
  });

  it('renders Mercury fallback when planet/sign combo is unmapped', async () => {
    const html = await render(
      <LeadCuriosityHookEmail
        locale="en"
        planet="Mercury"
        signName="Gemini"
        {...baseProps}
      />,
    );
    expect(html).toContain('Mercury');
    expect(html).toContain('Gemini');
  });

  it('includes 3-day free trial soft mention in footer (EN)', async () => {
    const html = await render(
      <LeadCuriosityHookEmail
        locale="en"
        planet="Venus"
        signName="Libra"
        {...baseProps}
      />,
    );
    expect(html.toLowerCase()).toContain('3-day');
    expect(html.toLowerCase()).toContain('trial');
  });

  it('includes 3-day trial soft mention in ES', async () => {
    const html = await render(
      <LeadCuriosityHookEmail
        locale="es"
        planet="Venus"
        signName="Libra"
        {...baseProps}
      />,
    );
    expect(html.toLowerCase()).toContain('3');
    expect(html.toLowerCase()).toContain('prueba');
  });

  it('renders plain text version cleanly', async () => {
    const text = await render(
      <LeadCuriosityHookEmail
        locale="en"
        planet="Saturn"
        signName="Aquarius"
        {...baseProps}
      />,
      { plainText: true },
    );
    expect(text).toContain('Saturn');
    expect(text).toContain('Aquarius');
    expect(text).toContain(baseProps.chartUrl);
    expect(text).not.toContain('<');  // no HTML tags
  });
});
