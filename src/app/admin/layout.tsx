/**
 * Root admin layout — gated by Clerk auth + email allowlist.
 *
 * If the user is not authenticated or not in ADMIN_ALLOWED_EMAILS, they are
 * redirected to the home page. No admin UI is rendered, no advertising data
 * is exposed.
 */

import { redirect } from 'next/navigation';
import { getAdminUser } from './lib/admin-auth';

export const metadata = {
  title: 'Estrevia Admin',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect('/');

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white font-[var(--font-geist-sans)]">
      {/* Admin top bar */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-6 h-12 border-b border-white/10"
        style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(12px)' }}
      >
        <span className="text-sm font-semibold tracking-widest uppercase text-white/70">
          Estrevia Admin
        </span>
        <span className="text-xs text-white/40">{admin.email}</span>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
