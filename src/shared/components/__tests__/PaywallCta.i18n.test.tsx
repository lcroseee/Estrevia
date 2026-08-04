// @vitest-environment jsdom
// This file deliberately does NOT mock next-intl. The rest of the feature's
// component tests use a key-echo mock (`useTranslations` returns a function
// that echoes `${namespace}.${key}`), which is structurally blind to a raw
// i18n key leaking into production copy — the echo and the bug look the
// same. Rendering through the real `NextIntlClientProvider` with the real
// messages/en.json surfaces that class of bug: next-intl's default
// `getMessageFallback` for a missing message is the dot-joined
// namespace+key path (e.g. "paywall.cta.subline.avatarPortrait"), so a
// missing key would show up in the DOM containing the literal substring
// "cta.subline". See DEFECT 1, review round 1 of Task 13.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../../../../messages/en.json';
import { PaywallCta } from '../PaywallCta';

// PaywallCta observes its root node with IntersectionObserver on mount to
// fire an impression event — not under test here, just needs to exist.
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

describe('PaywallCta — real next-intl provider (no key-echo mock)', () => {
  it('renders real subline copy for the avatar-portrait trigger, not a raw i18n key', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <PaywallCta trigger="avatar-portrait" onClick={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(container.textContent).not.toContain('cta.subline');
  });
});
