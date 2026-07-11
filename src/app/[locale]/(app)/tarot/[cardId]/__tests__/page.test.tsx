// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  getLocale: async () => 'en',
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) =>
    React.createElement('a', props, children),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));

// loadCard reads the REAL content/tarot/cards.json via process.cwd() — no data mock.
import TarotCardPage from '../page';

describe('tarot [cardId] page — 777 correspondences (SEO audit P0)', () => {
  it('renders a minor card without crashing (56 minors lack the 777 keys entirely)', async () => {
    const result = await TarotCardPage({
      params: Promise.resolve({ locale: 'en', cardId: 'ace-of-wands' }),
    });
    render(result);
    // card.astrology renders twice (header badge + correspondences row) — assert presence, not uniqueness.
    expect(screen.getAllByText(/Root of Fire/).length).toBeGreaterThan(0); // astrology row survives
    expect(document.body.textContent).not.toContain('undefined'); // no String(undefined) leak
  });

  it('renders a major card with full correspondences (regression guard)', async () => {
    const result = await TarotCardPage({
      params: Promise.resolve({ locale: 'en', cardId: 'the-fool' }),
    });
    render(result);
    expect(document.body.textContent).toContain('↔'); // treeOfLifeConnects joined
  });
});
