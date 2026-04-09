'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Compass,
  Moon,
  Layers,
  Heart,
  Clock,
  GitBranch,
  BookOpen,
  Settings,
} from 'lucide-react';

const ALL_NAV = [
  { href: '/chart', labelKey: 'chart', icon: Compass },
  { href: '/moon', labelKey: 'moon', icon: Moon },
  { href: '/tarot', labelKey: 'tarot', icon: Layers },
  { href: '/synastry', labelKey: 'synastry', icon: Heart },
  { href: '/hours', labelKey: 'hours', icon: Clock },
  { href: '/tree-of-life', labelKey: 'treeOfLife', icon: GitBranch },
  { href: '/essays', labelKey: 'essays', icon: BookOpen },
  { href: '/settings', labelKey: 'settings', icon: Settings },
] as const;

export function DesktopNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      className="hidden md:flex items-center gap-1"
      aria-label="Primary navigation"
    >
      {ALL_NAV.map(({ href, labelKey, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
              'font-[var(--font-geist-sans)] tracking-wide',
              active
                ? 'text-white bg-white/8'
                : 'text-white/40 hover:text-white/70 hover:bg-white/4',
            ].join(' ')}
          >
            <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
