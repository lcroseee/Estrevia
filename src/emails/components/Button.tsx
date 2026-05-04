import { Button as REButton } from '@react-email/components';
import type { ReactNode } from 'react';

export function Button({ href, children }: { href: string; children: ReactNode }) {
  return (
    <REButton
      href={href}
      style={{
        background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
        color: '#0a0a0f',
        padding: '14px 28px',
        borderRadius: 12,
        fontWeight: 600,
        fontSize: 15,
        textDecoration: 'none',
      }}
    >
      {children}
    </REButton>
  );
}
