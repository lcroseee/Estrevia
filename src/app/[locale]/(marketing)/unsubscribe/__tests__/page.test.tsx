/**
 * Tests for the /unsubscribe page.
 *
 * Strategy: the component is an async Server Component running in Node
 * environment (no DOM). We test the DB / token-verification logic by
 * inspecting mock call counts and the returned JSX string snapshot
 * (via React's renderToStaticMarkup which needs no browser DOM).
 *
 * Covers:
 *   1. Valid token → DB update called + output contains success heading
 *   2. Expired/invalid token → DB update NOT called + output contains error heading
 *   3. Missing token → verify NOT called, DB NOT called + output contains missing heading
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks (must run before module imports)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  verifyUnsubscribeToken: vi.fn(),
  updateWhere: vi.fn().mockResolvedValue(undefined),
  updateSet: vi.fn(),
  update: vi.fn(),
  getDb: vi.fn(),
}));

// Wire DB mock: update() → { set } → { where }
mocks.updateWhere.mockResolvedValue(undefined);
mocks.updateSet.mockImplementation(() => ({ where: mocks.updateWhere }));
mocks.update.mockImplementation(() => ({ set: mocks.updateSet }));
mocks.getDb.mockReturnValue({ update: mocks.update });

vi.mock('@/shared/lib/unsubscribe-token', () => ({
  verifyUnsubscribeToken: mocks.verifyUnsubscribeToken,
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/shared/lib/schema', () => ({
  users: { id: 'id', marketingEmailOptIn: 'marketing_email_opt_in' },
}));

vi.mock('@/i18n/navigation', () => ({
  // Render Link as a plain <a> element — sufficient for static markup tests
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
}));

// Mock next-intl server — returns a synchronous translator function
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (ns: string) => {
    const translations: Record<string, Record<string, string>> = {
      unsubscribe: {
        success: "You've been unsubscribed",
        successBody: 'You will no longer receive marketing emails.',
        invalidToken: 'Link expired or invalid',
        invalidTokenBody: 'This unsubscribe link has expired or is invalid.',
        missingToken: 'No unsubscribe link found',
        missingTokenBody: 'This link appears to be incomplete.',
        error: 'Something went wrong',
        errorBody: 'We could not process your request.',
      },
    };
    return (key: string) => translations[ns]?.[key] ?? key;
  }),
}));

// ---------------------------------------------------------------------------
// Import the component after mocks are set up
// ---------------------------------------------------------------------------

import UnsubscribePage from '../page';

async function renderPageToString(token?: string): Promise<string> {
  const searchParams = Promise.resolve(token !== undefined ? { token } : {});
  const element = await UnsubscribePage({ searchParams });
  return renderToStaticMarkup(element as React.ReactElement);
}

describe('/unsubscribe page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-wire after clearAllMocks
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.updateSet.mockImplementation(() => ({ where: mocks.updateWhere }));
    mocks.update.mockImplementation(() => ({ set: mocks.updateSet }));
    mocks.getDb.mockReturnValue({ update: mocks.update });
  });

  it('valid token — updates DB and renders success heading', async () => {
    mocks.verifyUnsubscribeToken.mockResolvedValue({ ok: true, userId: 'user_123' });

    const html = await renderPageToString('validtoken123');

    expect(mocks.verifyUnsubscribeToken).toHaveBeenCalledWith('validtoken123');
    expect(mocks.update).toHaveBeenCalled();
    expect(html).toContain("You&#x27;ve been unsubscribed");
    expect(html).toContain('You will no longer receive marketing emails.');
  });

  it('expired/invalid token — does not update DB and renders invalid heading', async () => {
    mocks.verifyUnsubscribeToken.mockResolvedValue({ ok: false, reason: 'expired' });

    const html = await renderPageToString('expiredtoken');

    expect(mocks.verifyUnsubscribeToken).toHaveBeenCalledWith('expiredtoken');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(html).toContain('Link expired or invalid');
    expect(html).toContain('This unsubscribe link has expired or is invalid.');
  });

  it('missing token — does not call verify or DB and renders missing heading', async () => {
    const html = await renderPageToString(undefined);

    expect(mocks.verifyUnsubscribeToken).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(html).toContain('No unsubscribe link found');
    expect(html).toContain('This link appears to be incomplete.');
  });
});
