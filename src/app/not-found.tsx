import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createMetadata } from '@/shared/seo';

export const metadata: Metadata = createMetadata({
  title: 'Page Not Found (404)',
  description:
    "The page you're looking for doesn't exist. Return to the sidereal chart calculator or browse our zodiac essays.",
  path: '/404',
  noIndex: true,
});

/** Minimal constellation SVG — Orion belt as three stars on a faint arc */
function ConstellationWatermark() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="320"
      height="320"
      viewBox="0 0 320 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0 m-auto opacity-[0.04] pointer-events-none select-none"
    >
      {/* Outer circle — chart wheel rim */}
      <circle cx="160" cy="160" r="150" stroke="#C8A84B" strokeWidth="0.75" />
      {/* Inner circle */}
      <circle cx="160" cy="160" r="110" stroke="#C8A84B" strokeWidth="0.4" />
      {/* Cross-hair lines */}
      <line x1="160" y1="10" x2="160" y2="310" stroke="#C8A84B" strokeWidth="0.4" />
      <line x1="10" y1="160" x2="310" y2="160" stroke="#C8A84B" strokeWidth="0.4" />
      {/* Orion belt — three stars */}
      <circle cx="130" cy="155" r="3" fill="#C8A84B" />
      <circle cx="160" cy="148" r="3" fill="#C8A84B" />
      <circle cx="190" cy="155" r="3" fill="#C8A84B" />
      {/* Connecting lines between stars */}
      <line x1="133" y1="155" x2="157" y2="148" stroke="#C8A84B" strokeWidth="0.6" />
      <line x1="163" y1="148" x2="187" y2="155" stroke="#C8A84B" strokeWidth="0.6" />
      {/* Shoulder stars */}
      <circle cx="100" cy="120" r="2" fill="#C8A84B" />
      <circle cx="220" cy="120" r="2" fill="#C8A84B" />
      <line x1="102" y1="121" x2="128" y2="154" stroke="#C8A84B" strokeWidth="0.4" />
      <line x1="218" y1="121" x2="192" y2="154" stroke="#C8A84B" strokeWidth="0.4" />
      {/* Foot stars */}
      <circle cx="115" cy="210" r="2" fill="#C8A84B" />
      <circle cx="205" cy="210" r="2" fill="#C8A84B" />
      <line x1="115" y1="208" x2="129" y2="157" stroke="#C8A84B" strokeWidth="0.4" />
      <line x1="205" y1="208" x2="191" y2="157" stroke="#C8A84B" strokeWidth="0.4" />
    </svg>
  );
}

export default async function NotFound() {
  const t = await getTranslations('appShell');
  return (
    <main
      role="main"
      className="relative min-h-screen flex items-center justify-center bg-[#0A0A0F] px-4 overflow-hidden"
    >
      {/* Textured radial glow — not a flat color */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(200,168,75,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-md w-full text-center space-y-8">
        {/* Chart-wheel glyph with constellation watermark */}
        <div className="relative mx-auto w-40 h-40">
          <ConstellationWatermark />
          {/* Foreground ring */}
          <div className="absolute inset-0 rounded-full border border-[#C8A84B]/20" />
          <div className="absolute inset-4 rounded-full border border-white/5" />
          {/* 404 numeral */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="font-[family-name:var(--font-geist-mono)] text-4xl font-light"
              style={{ color: 'rgba(200,168,75,0.35)' }}
            >
              404
            </span>
          </div>
        </div>

        {/* Heading — Crimson Pro italic, gold accent */}
        <div className="space-y-3">
          <h1
            className="font-[family-name:var(--font-crimson-pro)] italic text-3xl leading-tight"
            style={{ color: '#C8A84B' }}
          >
            {t('notFoundH1')}
          </h1>
          <p className="font-[family-name:var(--font-geist-sans)] text-sm text-white/55 leading-relaxed max-w-xs mx-auto">
            {t('notFoundBody')}
          </p>
        </div>

        {/* CTAs — weighted hierarchy: primary gold, secondary ghost */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {/* Primary */}
          <Link
            href="/chart"
            className="inline-flex items-center justify-center px-7 py-3 rounded-lg text-sm font-medium text-[#0A0A0F] transition-all duration-200 shadow-[0_0_20px_rgba(200,168,75,0.25)] hover:shadow-[0_0_28px_rgba(200,168,75,0.40)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A84B]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
            style={{
              background: 'linear-gradient(135deg, #D4B85C 0%, #C8A84B 50%, #B8943A 100%)',
            }}
          >
            {t('notFoundCalcChart')}
          </Link>

          {/* Secondary ghost */}
          <Link
            href="/"
            className="inline-flex items-center justify-center px-7 py-3 rounded-lg text-sm font-medium text-white/65 border border-white/10 transition-all duration-200 hover:border-white/25 hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
          >
            {t('notFoundReturnHome')}
          </Link>
        </div>
      </div>
    </main>
  );
}
