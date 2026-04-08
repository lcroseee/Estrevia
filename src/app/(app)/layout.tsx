import Link from 'next/link';
import { Compass, Moon, Clock } from 'lucide-react';
import { PlanetaryHourBar } from '@/modules/astro-engine/components/PlanetaryHourBar';
import { UserMenu } from '@/modules/auth/components/UserMenu';

// Bottom navigation items
const NAV_ITEMS = [
  {
    href: '/chart',
    label: 'Chart',
    icon: Compass,
    ariaLabel: 'Natal chart',
  },
  {
    href: '/moon',
    label: 'Moon',
    icon: Moon,
    ariaLabel: 'Moon phase',
  },
  {
    href: '/hours',
    label: 'Hours',
    icon: Clock,
    ariaLabel: 'Planetary hours',
  },
] as const;

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

        {/* Center: Planetary hour bar — the daily hook */}
        <PlanetaryHourBar />

        {/* Right: user avatar (signed-in) or sign-in button (guest) */}
        <UserMenu />
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 pb-20 md:pb-0">
        {children}
      </main>

      {/* ── Bottom mobile navigation ─────────────────────────────────────
          Visible on mobile/tablet only. Desktop uses a sidebar or top nav
          (deferred to Phase 2 — MVP is mobile-first).
      ── */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 flex md:hidden border-t border-white/6"
        style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(16px)' }}
        aria-label="Primary navigation"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon, ariaLabel }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={<Icon size={20} strokeWidth={1.5} aria-hidden="true" />}
            ariaLabel={ariaLabel}
          />
        ))}
      </nav>
    </div>
  );
}

// ── NavItem — active state via URL matching ──────────────────────────────────
// This is a Server Component — active state is applied via CSS :has() or
// a client wrapper. Using a client wrapper here for accurate pathname matching.
import { NavItemClient } from './NavItemClient';

function NavItem({
  href,
  label,
  icon,
  ariaLabel,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <NavItemClient href={href} label={label} icon={icon} ariaLabel={ariaLabel} />
  );
}
