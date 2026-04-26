/**
 * Admin allowlist helpers.
 *
 * Reads ADMIN_ALLOWED_EMAILS (comma-separated) from env and checks whether the
 * current Clerk user's primary email is in the list. Never performs a DB
 * round-trip — just env var + Clerk JWT (stateless, per CLAUDE.md auth rules).
 *
 * Usage in server components / route handlers:
 *   const admin = await getAdminUser();
 *   if (!admin) redirect('/') or return 403
 */

import { getCurrentUser } from '@/modules/auth/lib/helpers';

export interface AdminUser {
  userId: string;
  email: string;
}

/**
 * Returns the list of allowlisted emails from ADMIN_ALLOWED_EMAILS env var.
 * Returns empty array if env var is not set (all-deny).
 */
function getAllowedEmails(): string[] {
  const raw = process.env.ADMIN_ALLOWED_EMAILS ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Returns the current admin user if authenticated and allowlisted, else null.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const allowed = getAllowedEmails();
  if (!allowed.includes(user.email.toLowerCase())) return null;

  return { userId: user.userId, email: user.email };
}

/**
 * Asserts admin access. Throws a 401/403 Response that can be returned from
 * a route handler.
 *
 * Usage:
 *   const admin = await requireAdmin();
 */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw Response.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 },
    );
  }

  const allowed = getAllowedEmails();
  if (!allowed.includes(user.email.toLowerCase())) {
    throw Response.json(
      { error: 'FORBIDDEN', message: 'Admin access required' },
      { status: 403 },
    );
  }

  return { userId: user.userId, email: user.email };
}
