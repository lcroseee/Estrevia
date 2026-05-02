/**
 * Root admin layout — Clerk auth + email allowlist + i18n provider.
 *
 * /admin/ lives outside [locale]/ because it's EN-only and never localized
 * for users (only the founder accesses it). But shared client components
 * (CookieConsent, PaywallModal, Disclaimer, LanguageSwitcher) call
 * useTranslations(), which requires NextIntlClientProvider. The [locale]
 * restructure (b04ed9a) moved the provider out of root layout, so without
 * this wrap every admin page hits the global error boundary (HTTP 500)
 * once any of those components mounts in the tree. Same pattern as
 * src/app/s/layout.tsx (commit 9cf77cd, share pages).
 */

import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { getAdminUser } from './lib/admin-auth';

export const metadata = {
  title: 'Estrevia Admin',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect('/');

  setRequestLocale('en');
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <div className="min-h-screen bg-[#0A0A0F] text-white font-[var(--font-geist-sans)]">
        {/* Admin top bar */}
        <header
          className="sticky top-0 z-40 flex items-center justify-between px-6 h-12 border-b border-white/10"
          style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(12px)' }}
        >
          <span className="text-sm font-semibold tracking-widest uppercase text-white/70">
            Estrevia Admin
          </span>
          <span className="text-xs text-white/40">{admin.email}</span>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </NextIntlClientProvider>
  );
}
