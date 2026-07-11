// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl/server', () => ({
  getTranslations: async (ns: string) => (k: string) => `${ns}.${k}`,
}));
// i18n Link → plain anchor so we can assert hrefs in jsdom.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));
vi.mock('@/shared/seo', () => ({
  JsonLdScript: () => null,
  organizationSchema: () => ({ '@type': 'Organization' }),
  // T13 dormant: /about footer link is gated off, so the core links assert cleanly.
  isFounderIdentityPublished: () => false,
}));
vi.mock('@/shared/components/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

import { SeoChrome } from '@/shared/components/SeoChrome';

describe('SeoChrome (extracted marketing chrome)', () => {
  it('renders the 4 header nav links + footer legal links + child main', async () => {
    const ui = await SeoChrome({ children: <p data-testid="child">hi</p> });
    const { container, getByTestId } = render(ui);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/chart', '/moon', '/essays', '/pricing', '/terms', '/privacy']));
    expect(getByTestId('child')).toBeTruthy();
    expect(container.querySelector('#main-content')).not.toBeNull();
  });
});
