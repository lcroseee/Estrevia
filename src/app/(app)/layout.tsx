import Link from 'next/link';
import { PlanetaryHourBar } from '@/modules/astro-engine/components/PlanetaryHourBar';
import { UserMenu } from '@/modules/auth/components/UserMenu';
import { MobileNav } from './MobileNav';
import { DesktopNav } from './DesktopNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0F]">
      {/* ── App header ─────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 h-12 border-b border-white/6"
        style={{ background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(12px)' }}
      >
        {/* Logo */}
        <Link
          href="/"
          className="text-sm font-semibold tracking-widest uppercase text-white/80 hover:text-white transition-colors font-[var(--font-geist-sans)]"
          aria-label="Estrevia — home"
        >
          Estrevia
        </Link>

        {/* Desktop navigation — visible md+ */}
        <DesktopNav />

        {/* Center: Planetary hour bar — the daily hook (visible on mobile, hidden on desktop where nav takes space) */}
        <div className="md:hidden">
          <PlanetaryHourBar />
        </div>

        {/* Right: user avatar (signed-in) or sign-in button (guest) */}
        <UserMenu />
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 pb-20 md:pb-0">
        {children}
      </main>

      {/* ── Bottom mobile navigation ─────────────────────────────────────
          Visible on mobile/tablet only. Desktop uses the header nav above.
      ── */}
      <MobileNav />
    </div>
  );
}
