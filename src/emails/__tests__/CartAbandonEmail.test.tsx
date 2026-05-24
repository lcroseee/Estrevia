import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import CartAbandonEmail from '../CartAbandonEmail';

const BASE_PROPS = {
  ctaUrl: 'https://estrevia.app/checkout/start?plan=pro_annual&coupon=TEASER20&utm_source=cart-abandon',
  unsubscribeUrl: 'https://estrevia.app/unsubscribe?token=abc',
};

describe('CartAbandonEmail', () => {
  it('EN render with saturnSign — contains Saturn and sign name', async () => {
    const html = await render(
      <CartAbandonEmail
        locale="en"
        saturnSign="Capricorn"
        checkoutClicks={0}
        {...BASE_PROPS}
      />,
    );
    expect(html).toContain('Saturn');
    expect(html).toContain('Capricorn');
    expect(html).toContain('TEASER20');
    expect(html).toContain('Save $7');
  });

  it('ES render stub — contains Desbloquea and Ahorra', async () => {
    const html = await render(
      <CartAbandonEmail
        locale="es"
        saturnSign="Capricorn"
        checkoutClicks={0}
        {...BASE_PROPS}
      />,
    );
    expect(html).toContain('Desbloquea');
    expect(html).toContain('Ahorra');
    expect(html).toContain('TEASER20');
  });

  it('EN render without saturnSign — CTA present, no Saturn personalization line', async () => {
    const html = await render(
      <CartAbandonEmail
        locale="en"
        saturnSign={null}
        checkoutClicks={0}
        {...BASE_PROPS}
      />,
    );
    expect(html).toContain('Save $7');
    // should still mention Saturn in the body copy but not the personalized sign-level line
    expect(html).not.toContain('Your Saturn in');
  });

  it('checkoutClicks > 0 adds the "clicked to checkout" motivational line', async () => {
    const html = await render(
      <CartAbandonEmail
        locale="en"
        saturnSign={null}
        checkoutClicks={2}
        {...BASE_PROPS}
      />,
    );
    expect(html).toContain('clicked');
    expect(html).toContain('checkout');
  });

  it('plain text version has no HTML tags', async () => {
    const text = await render(
      <CartAbandonEmail
        locale="en"
        saturnSign="Aquarius"
        checkoutClicks={1}
        {...BASE_PROPS}
      />,
      { plainText: true },
    );
    expect(text).not.toContain('<');
    expect(text).toContain('TEASER20');
    expect(text).toContain(BASE_PROPS.unsubscribeUrl);
  });
});
