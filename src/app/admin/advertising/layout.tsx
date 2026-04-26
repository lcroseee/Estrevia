/**
 * Advertising admin sub-layout.
 *
 * Provides section navigation (Creatives | Decisions | Gates | Spend) and
 * wraps child pages with a consistent two-column structure on desktop.
 */

import Link from 'next/link';
import { headers } from 'next/headers';

const NAV_ITEMS = [
  { href: '/admin/advertising/creatives/review', label: 'Creatives' },
  { href: '/admin/advertising/decisions', label: 'Decisions' },
  { href: '/admin/advertising/gates', label: 'Gates' },
  { href: '/admin/advertising/spend', label: 'Spend' },
];

export default async function AdvertisingAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Determine active nav item from the request path
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';

  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)]">
      {/* ── Advertising section nav ─────────────────────────────────── */}
      <nav
        className="flex items-center gap-1 px-6 py-2 border-b border-white/8 bg-white/2 overflow-x-auto"
        aria-label="Advertising admin navigation"
      >
        <span className="text-xs text-white/30 uppercase tracking-wider mr-3 shrink-0">
          Advertising
        </span>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors shrink-0',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <div className="flex-1 px-4 sm:px-6 py-6">{children}</div>
    </div>
  );
}
