import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@react-email/render';
import { EmailLayout } from '../EmailLayout';

const ADDR = '123 Test St, Suite 4, Testville, TS 00000, USA';

describe('EmailLayout footer (CAN-SPAM physical postal address)', () => {
  const orig = process.env.COMPANY_POSTAL_ADDRESS;
  afterEach(() => {
    if (orig === undefined) delete process.env.COMPANY_POSTAL_ADDRESS;
    else process.env.COMPANY_POSTAL_ADDRESS = orig;
  });

  it('renders the postal address when COMPANY_POSTAL_ADDRESS is set (EN)', async () => {
    process.env.COMPANY_POSTAL_ADDRESS = ADDR;
    const html = await render(EmailLayout({ locale: 'en', children: 'body', unsubscribeUrl: 'https://estrevia.app/u' }));
    expect(html).toContain(ADDR);
  });

  it('renders the postal address for ES too', async () => {
    process.env.COMPANY_POSTAL_ADDRESS = ADDR;
    const html = await render(EmailLayout({ locale: 'es', children: 'body', unsubscribeUrl: 'https://estrevia.app/u' }));
    expect(html).toContain(ADDR);
  });

  it('omits the address line for TRANSACTIONAL email (no unsubscribeUrl) when env unset', async () => {
    delete process.env.COMPANY_POSTAL_ADDRESS;
    const html = await render(EmailLayout({ locale: 'en', children: 'body' }));
    expect(html).toContain('Sidereal astrology');
    expect(html).not.toContain(ADDR);
  });

  it('THROWS for a COMMERCIAL email (has unsubscribeUrl) when COMPANY_POSTAL_ADDRESS is unset', () => {
    delete process.env.COMPANY_POSTAL_ADDRESS;
    expect(() =>
      EmailLayout({ locale: 'en', children: 'body', unsubscribeUrl: 'https://estrevia.app/u' }),
    ).toThrow(/COMPANY_POSTAL_ADDRESS/);
  });
});
