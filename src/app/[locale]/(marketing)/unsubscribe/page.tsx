/**
 * /unsubscribe — one-click email unsubscribe page
 *
 * Reads `?token=` from searchParams, verifies the HMAC-signed token,
 * and sets marketing_email_opt_in = false for the user.
 *
 * Valid token  → update DB → render success
 * Invalid/expired → render error (no DB write)
 * Missing token   → render missing-token message
 *
 * Server Component; force-dynamic to ensure fresh searchParams every request.
 */

import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { Link } from '@/i18n/navigation';
import { verifyUnsubscribeToken } from '@/shared/lib/unsubscribe-token';
import { getDb } from '@/shared/lib/db';
import { emailLeads, users } from '@/shared/lib/schema';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ token?: string }>;
}

type Status = 'success' | 'invalid' | 'missing' | 'error';

interface PageState {
  status: Status;
}

async function processToken(token: string | undefined): Promise<PageState> {
  if (!token) {
    return { status: 'missing' };
  }

  let kind: 'user' | 'lead';
  let id: string;
  try {
    const result = await verifyUnsubscribeToken(token);
    if (!result.ok) {
      return { status: 'invalid' };
    }
    kind = result.kind;
    id = result.id;
  } catch {
    return { status: 'invalid' };
  }

  try {
    const db = getDb();
    if (kind === 'user') {
      await db
        .update(users)
        .set({ marketingEmailOptIn: false })
        .where(eq(users.id, id));
    } else {
      // kind === 'lead': flip unsubscribed_at on the email_leads row.
      // UI confirmation copy is identical to the user branch — no kind
      // leakage to the recipient (signed tokens already prevent enumeration).
      await db
        .update(emailLeads)
        .set({ unsubscribedAt: new Date() })
        .where(eq(emailLeads.id, id));
    }
    return { status: 'success' };
  } catch {
    return { status: 'error' };
  }
}

export default async function UnsubscribePage({ searchParams }: Props) {
  const t = await getTranslations('unsubscribe');
  const { token } = await searchParams;
  const { status } = await processToken(token);

  const content: Record<Status, { heading: string; body: string; variant: 'success' | 'warning' | 'error' }> = {
    success: {
      heading: t('success'),
      body: t('successBody'),
      variant: 'success',
    },
    invalid: {
      heading: t('invalidToken'),
      body: t('invalidTokenBody'),
      variant: 'warning',
    },
    missing: {
      heading: t('missingToken'),
      body: t('missingTokenBody'),
      variant: 'warning',
    },
    error: {
      heading: t('error'),
      body: t('errorBody'),
      variant: 'error',
    },
  };

  const { heading, body, variant } = content[status];

  const variantStyles: Record<'success' | 'warning' | 'error', { border: string; bg: string; headingColor: string; iconColor: string }> = {
    success: {
      border: 'rgba(255,215,0,0.2)',
      bg: 'rgba(255,215,0,0.04)',
      headingColor: '#FFD700',
      iconColor: '#FFD700',
    },
    warning: {
      border: 'rgba(255,165,0,0.2)',
      bg: 'rgba(255,165,0,0.04)',
      headingColor: 'rgba(255,165,0,0.9)',
      iconColor: 'rgba(255,165,0,0.8)',
    },
    error: {
      border: 'rgba(231,76,60,0.25)',
      bg: 'rgba(231,76,60,0.05)',
      headingColor: '#E74C3C',
      iconColor: '#E74C3C',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Wordmark */}
        <div className="text-center mb-10">
          <Link
            href="/"
            className="text-xl tracking-[0.15em] uppercase"
            style={{
              fontFamily: 'var(--font-crimson-pro, Georgia, serif)',
              background: 'linear-gradient(135deg, #FFD700, #FFA500)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Estrevia
          </Link>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ borderColor: styles.border, background: styles.bg }}
          role="status"
          aria-live="polite"
        >
          {/* Icon */}
          <div
            className="mx-auto mb-5 w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: `${styles.border.replace('0.2', '0.1')}`, borderColor: styles.border, border: `1px solid ${styles.border}` }}
            aria-hidden="true"
          >
            {variant === 'success' ? (
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={styles.iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : variant === 'error' ? (
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={styles.iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : (
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={styles.iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
          </div>

          <h1
            className="text-xl font-medium mb-3"
            style={{
              fontFamily: 'var(--font-crimson-pro, Georgia, serif)',
              color: styles.headingColor,
            }}
          >
            {heading}
          </h1>

          <p className="text-sm leading-relaxed mb-7" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {body}
          </p>

          <Link
            href="/settings"
            className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            Manage preferences
          </Link>
        </div>

        {/* Footer */}
        <p className="text-center mt-6 text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Estrevia · sidereal astrology
        </p>
      </div>
    </div>
  );
}
