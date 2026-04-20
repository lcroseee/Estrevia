import type { ReactNode } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { JsonLdScript, organizationSchema } from '@/shared/seo';
import { LanguageSwitcher } from '@/shared/components/LanguageSwitcher';

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const tNav = await getTranslations('nav');
  const tCommon = await getTranslations('common');
  const tMarketing = await getTranslations('marketing');

  const navLinks = [
    { href: '/chart', label: tNav('chart') },
    { href: '/moon', label: tNav('moon') },
    { href: '/essays', label: tNav('essays') },
    { href: '/pricing', label: tNav('pricing') },
  ];

  return (
    <>
      <JsonLdScript schema={organizationSchema()} />

      <div className="flex flex-col min-h-screen bg-[#0A0A0F]">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header
          className="sticky top-0 z-40 border-b border-white/6"
          style={{ background: 'rgba(10,10,15,0.90)', backdropFilter: 'blur(16px)' }}
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
            {/* Logo */}
            <Link
              href="/"
              className="text-sm font-semibold tracking-[0.18em] uppercase text-white/85 hover:text-white transition-all duration-200 hover:tracking-[0.22em]"
              style={{ fontFamily: 'var(--font-geist-sans)' }}
              aria-label={tMarketing('logoAriaHome')}
            >
              Estrevia
            </Link>

            {/* Desktop nav */}
            <nav
              className="hidden md:flex items-center gap-6"
              aria-label={tMarketing('navAriaMarketing')}
            >
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-sm text-white/70 hover:text-white transition-colors tracking-wide"
                >
                  {label}
                </Link>
              ))}
              <LanguageSwitcher />
              <Link
                href="/chart"
                className="text-sm px-4 py-1.5 rounded-full border border-[#FFD700]/40 text-[#FFD700] hover:border-[#FFD700]/80 transition-colors tracking-wide"
              >
                {tCommon('openApp')}
              </Link>
            </nav>

            {/* Mobile: compact switcher + open app */}
            <div className="md:hidden flex items-center gap-2">
              <LanguageSwitcher />
              <Link
                href="/chart"
                className="text-xs px-3 py-1.5 rounded-full border border-[#FFD700]/40 text-[#FFD700] hover:border-[#FFD700]/80 transition-colors"
              >
                {tCommon('openApp')}
              </Link>
            </div>
          </div>
        </header>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <main className="flex-1">{children}</main>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="border-t border-white/6 mt-24 relative">
          {/* Footer top highlight */}
          <div
            className="absolute top-0 inset-x-0 h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.08), transparent)' }}
            aria-hidden="true"
          />
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-col items-center sm:items-start gap-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-semibold tracking-[0.2em] uppercase"
                  style={{ color: 'rgba(255,215,0,0.5)', fontFamily: 'var(--font-geist-sans)' }}
                >
                  ☉
                </span>
                <span
                  className="text-xs font-semibold tracking-[0.18em] uppercase text-white/80"
                  style={{ fontFamily: 'var(--font-geist-sans)' }}
                >
                  Estrevia
                </span>
              </div>
              <span className="text-xs text-white/55">{tMarketing('footerTagline')}</span>
            </div>

            <nav
              className="flex flex-wrap items-center justify-center gap-4 sm:gap-6"
              aria-label={tMarketing('navAriaFooter')}
            >
              <Link href="/essays" className="text-xs text-white/65 hover:text-white/90 transition-colors">
                {tNav('essays')}
              </Link>
              <Link href="/pricing" className="text-xs text-white/65 hover:text-white/90 transition-colors">
                {tNav('pricing')}
              </Link>
              <Link href="/terms" className="text-xs text-white/65 hover:text-white/90 transition-colors">
                {tMarketing('footerTerms')}
              </Link>
              <Link href="/privacy" className="text-xs text-white/65 hover:text-white/90 transition-colors">
                {tMarketing('footerPrivacy')}
              </Link>
              <a
                href="https://twitter.com/estrevia_app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/65 hover:text-white/90 transition-colors"
                aria-label={tMarketing('twitterAria')}
              >
                {tMarketing('footerTwitter')}
              </a>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}
