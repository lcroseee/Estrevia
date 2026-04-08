'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItemClientProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  ariaLabel: string;
}

export function NavItemClient({ href, label, icon, ariaLabel }: NavItemClientProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={isActive ? 'page' : undefined}
      className={[
        'relative flex-1 flex flex-col items-center justify-center gap-0.5 pt-3 pb-2.5 text-[10px] font-medium',
        'transition-all duration-200 select-none',
        'font-[var(--font-geist-sans)] tracking-wide',
        isActive ? 'text-white' : 'text-white/32 hover:text-white/58',
      ].join(' ')}
    >
      {/* Active indicator bar — top of tab */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] rounded-b-full transition-all duration-300"
        style={{
          width: isActive ? '28px' : '0px',
          background: isActive ? '#FFD700' : 'transparent',
          boxShadow: isActive ? '0 0 8px rgba(255,215,0,0.5)' : 'none',
        }}
        aria-hidden="true"
      />
      <span
        className={[
          'transition-transform duration-200',
          isActive ? 'scale-[1.12]' : 'scale-100',
        ].join(' ')}
      >
        {icon}
      </span>
      <span
        className="transition-all duration-200"
        style={{ letterSpacing: isActive ? '0.03em' : '0.06em' }}
      >
        {label}
      </span>
    </Link>
  );
}
