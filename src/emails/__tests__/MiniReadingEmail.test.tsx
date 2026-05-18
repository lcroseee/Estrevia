import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import MiniReadingEmail from '../MiniReadingEmail';

describe('MiniReadingEmail', () => {
  const baseProps = {
    locale: 'en' as const,
    chartUrl: 'https://estrevia.app/chart?chartId=test',
    unsubscribeUrl: 'https://estrevia.app/unsubscribe?token=test',
  };

  it('renders 3-line template when all signs are provided', async () => {
    const html = await render(
      MiniReadingEmail({
        ...baseProps,
        sunSign: 'aries',
        moonSign: 'cancer',
        ascSign: 'libra',
      }),
    );
    expect(html).toContain('Aries');
    expect(html).toContain('Cancer');
    expect(html).toContain('Libra');
    expect(html).toContain('Your Sun in');
    expect(html).toContain('Your Moon in');
    expect(html).toContain('Your Ascendant in');
  });

  it('renders 2-line fallback when ascSign is null', async () => {
    const html = await render(
      MiniReadingEmail({
        ...baseProps,
        sunSign: 'aries',
        moonSign: 'cancer',
        ascSign: null,
      }),
    );
    expect(html).toContain('Your Sun in');
    expect(html).toContain('Your Moon in');
    expect(html).not.toContain('Your Ascendant in');
  });

  it('renders 1-line fallback when only sunSign is provided', async () => {
    const html = await render(
      MiniReadingEmail({
        ...baseProps,
        sunSign: 'aries',
        moonSign: null,
        ascSign: null,
      }),
    );
    expect(html).toContain('Your Sun in');
    expect(html).not.toContain('Your Moon in');
    expect(html).not.toContain('Your Ascendant in');
  });

  it('renders ES locale', async () => {
    const html = await render(
      MiniReadingEmail({
        ...baseProps,
        locale: 'es',
        sunSign: 'aries',
        moonSign: 'cancer',
        ascSign: 'libra',
      }),
    );
    expect(html).toContain('Tu Sol en');
    expect(html).toContain('Tu Luna en');
    expect(html).toContain('Tu Ascendente en');
  });
});
