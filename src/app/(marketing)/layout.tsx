import type { ReactNode } from 'react';
import Link from 'next/link';
import { JsonLdScript, organizationSchema } from '@/shared/seo';

const NAV_LINKS = [
  { href: '/chart', label: 'Chart' },
  { href: '/moon', label: 'Moon' },
  { href: '/essays', label: 'Essays' },
  { href: '/pricing', label: 'Pricing' },
] as const;

export default function MarketingLayout({ children }: { children: ReactNode }) {
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
              aria-label="Estrevia — home"
            >
              Estrevia
            </Link>

            {/* Desktop nav */}
            <nav
              className="hidden md:flex items-center gap-6"
              aria-label="Marketing navigation"
            >
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-sm text-white/50 hover:text-white/90 transition-colors tracking-wide"
                >
                  {label}
                </Link>
              ))}
              <Link
                href="/chart"
                className="text-sm px-4 py-1.5 rounded-full border border-[#FFD700]/30 text-[#FFD700]/80 hover:text-[#FFD700] hover:border-[#FFD700]/60 transition-colors tracking-wide"
              >
                Open App
              </Link>
            </nav>

            {/* Mobile: open app link only */}
            <Link
              href="/chart"
              className="md:hidden text-xs px-3 py-1.5 rounded-full border border-[#FFD700]/30 text-[#FFD700]/70 hover:text-[#FFD700] transition-colors"
            >
              Open App
            </Link>
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
                  className="text-xs font-semibold tracking-[0.18em] uppercase text-white/40"
                  style={{ fontFamily: 'var(--font-geist-sans)' }}
                >
                  Estrevia
                </span>
              </div>
              <span className="text-xs text-white/22">
                Sidereal astrology — Swiss Ephemeris precision
              </span>
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-6" aria-label="Footer navigation">
              <Link href="/essays" className="text-xs text-white/35 hover:text-white/60 transition-colors">
                Essays
              </Link>
              <Link href="/pricing" className="text-xs text-white/35 hover:text-white/60 transition-colors">
                Pricing
              </Link>
              <Link href="/terms" className="text-xs text-white/35 hover:text-white/60 transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="text-xs text-white/35 hover:text-white/60 transition-colors">
                Privacy
              </Link>
              <a
                href="https://twitter.com/estrevia_app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/35 hover:text-white/60 transition-colors"
                aria-label="Estrevia on Twitter"
              >
                Twitter
              </a>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}
