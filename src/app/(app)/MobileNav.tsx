'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Compass,
  Moon,
  Layers,
  Heart,
  MoreHorizontal,
  Clock,
  GitBranch,
  BookOpen,
  Settings,
} from 'lucide-react';

interface NavDef {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

const PRIMARY_NAV: NavDef[] = [
  { href: '/chart', labelKey: 'chart', icon: Compass },
  { href: '/moon', labelKey: 'moon', icon: Moon },
  { href: '/tarot', labelKey: 'tarot', icon: Layers },
  { href: '/synastry', labelKey: 'synastry', icon: Heart },
];

const MORE_NAV: NavDef[] = [
  { href: '/hours', labelKey: 'hours', icon: Clock },
  { href: '/tree-of-life', labelKey: 'treeOfLife', icon: GitBranch },
  { href: '/essays', labelKey: 'essays', icon: BookOpen },
  { href: '/settings', labelKey: 'settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close "More" menu on outside click
  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen]);

  // Close on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const moreIsActive = MORE_NAV.some((item) => isActive(item.href));

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 flex md:hidden border-t border-white/6"
      style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(16px)' }}
      aria-label="Primary navigation"
    >
      {PRIMARY_NAV.map(({ href, labelKey, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={t(labelKey)}
            aria-current={active ? 'page' : undefined}
            className={[
              'relative flex-1 flex flex-col items-center justify-center gap-0.5 pt-3 pb-2.5 text-[10px] font-medium',
              'transition-all duration-200 select-none',
              'font-[var(--font-geist-sans)] tracking-wide',
              active ? 'text-white' : 'text-white/32 hover:text-white/58',
            ].join(' ')}
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] rounded-b-full transition-all duration-300"
              style={{
                width: active ? '28px' : '0px',
                background: active ? '#FFD700' : 'transparent',
                boxShadow: active ? '0 0 8px rgba(255,215,0,0.5)' : 'none',
              }}
              aria-hidden="true"
            />
            <span className={`transition-transform duration-200 ${active ? 'scale-[1.12]' : 'scale-100'}`}>
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span
              className="transition-all duration-200"
              style={{ letterSpacing: active ? '0.03em' : '0.06em' }}
            >
              {t(labelKey)}
            </span>
          </Link>
        );
      })}

      {/* More button + dropdown */}
      <div ref={menuRef} className="relative flex-1 flex flex-col items-center justify-center">
        <button
          type="button"
          onClick={() => setMoreOpen((prev) => !prev)}
          aria-expanded={moreOpen}
          aria-haspopup="true"
          className={[
            'relative flex flex-col items-center justify-center gap-0.5 pt-3 pb-2.5 text-[10px] font-medium w-full',
            'transition-all duration-200 select-none',
            'font-[var(--font-geist-sans)] tracking-wide',
            moreIsActive || moreOpen ? 'text-white' : 'text-white/32 hover:text-white/58',
          ].join(' ')}
        >
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] rounded-b-full transition-all duration-300"
            style={{
              width: moreIsActive ? '28px' : '0px',
              background: moreIsActive ? '#FFD700' : 'transparent',
              boxShadow: moreIsActive ? '0 0 8px rgba(255,215,0,0.5)' : 'none',
            }}
            aria-hidden="true"
          />
          <span className={`transition-transform duration-200 ${moreOpen ? 'scale-[1.12]' : 'scale-100'}`}>
            <MoreHorizontal size={20} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span
            className="transition-all duration-200"
            style={{ letterSpacing: moreIsActive ? '0.03em' : '0.06em' }}
          >
            {t('more')}
          </span>
        </button>

        {/* Dropdown menu */}
        {moreOpen && (
          <div
            className="absolute bottom-full right-0 mb-2 w-52 rounded-xl border border-white/8 py-2 shadow-xl"
            style={{ background: 'rgba(10,10,15,0.97)', backdropFilter: 'blur(20px)' }}
            role="menu"
          >
            {MORE_NAV.map(({ href, labelKey, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  className={[
                    'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                    active
                      ? 'text-white bg-white/5'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/3',
                  ].join(' ')}
                >
                  <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                  <span>{t(labelKey)}</span>
                  {active && (
                    <span
                      className="ml-auto w-1.5 h-1.5 rounded-full"
                      style={{ background: '#FFD700' }}
                      aria-hidden="true"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
