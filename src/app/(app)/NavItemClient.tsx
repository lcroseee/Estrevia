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
        'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium',
        'transition-colors duration-150 select-none',
        'font-[var(--font-geist-sans)] tracking-wide',
        isActive ? 'text-white' : 'text-white/35 hover:text-white/60',
      ].join(' ')}
    >
      <span
        className={[
          'transition-transform duration-150',
          isActive ? 'scale-110' : 'scale-100',
        ].join(' ')}
      >
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}
