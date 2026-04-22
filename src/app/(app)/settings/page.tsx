/**
 * /settings — User settings page
 *
 * Auth required (enforced via src/middleware.ts Clerk middleware).
 * Shows current subscription tier and account management options.
 * Server Component — subscription data fetched at request time.
 */

import type { Metadata } from 'next';
import { createMetadata } from '@/shared/seo';
import { getCurrentUser } from '@/modules/auth/lib/helpers';
import { getSubscriptionDetails } from '@/modules/auth/lib/premium';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SettingsPortalButton } from './SettingsPortalButton';
import { SettingsClientSections } from './SettingsClientSections';

export function generateMetadata(): Metadata {
  return createMetadata({
    title: 'Settings',
    description: 'Manage your Estrevia account, subscription, and data.',
    path: '/settings',
    noIndex: true,
  });
}

export default async function SettingsPage() {
  const user = await getCurrentUser();

  // Redirect unauthenticated users to sign-in
  if (!user) {
    redirect('/sign-in?redirect_url=/settings');
  }

  const sub = await getSubscriptionDetails(user.userId);
  const t = await getTranslations('settings');

  // Determine plan display name — use tier (not isPremium alone) so past_due
  // users see "Pro" while the needsPaymentUpdate banner is also shown.
  let planLabel: string;
  if (sub.tier !== 'premium') {
    planLabel = t('planFree');
  } else if (sub.plan === 'pro_annual') {
    planLabel = t('planProAnnual');
  } else {
    planLabel = t('planProMonthly');
  }

  // Trial badge
  const isTrialing = sub.status === 'trialing' && sub.trialEnd !== null;
  const trialLabel = isTrialing
    ? t('trialBadge', {
        date: sub.trialEnd!.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
      })
    : null;

  // Past due: user still has premium access but payment failed — show banner.
  const isPastDue = sub.needsPaymentUpdate;
  const gracePeriodEndsAt = sub.gracePeriodEndsAt;

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        {/* Page header */}
        <div className="mb-10">
          <h1
            className="text-3xl font-light text-white mb-2"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
          >
            {t('title')}
          </h1>
          <p className="text-sm text-white/40">{user.email}</p>
        </div>

        {/* Subscription section */}
        <section aria-labelledby="subscription-heading" className="mb-8">
          <h2
            id="subscription-heading"
            className="text-xs tracking-[0.2em] uppercase text-white/35 mb-4"
          >
            {t('subscription')}
          </h2>
          <div
            className="rounded-2xl border p-6"
            style={{
              borderColor: sub.isPremium ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.06)',
              background: sub.isPremium ? 'rgba(255,215,0,0.03)' : 'rgba(255,255,255,0.02)',
            }}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-base font-medium"
                    style={{ color: sub.isPremium ? '#FFD700' : 'rgba(255,255,255,0.8)' }}
                  >
                    {planLabel}
                  </span>
                  {isTrialing && trialLabel && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full border tracking-wide"
                      style={{
                        borderColor: 'rgba(255,215,0,0.25)',
                        color: 'rgba(255,215,0,0.7)',
                        background: 'rgba(255,215,0,0.08)',
                      }}
                    >
                      {trialLabel}
                    </span>
                  )}
                  {sub.isPremium && !isTrialing && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full border tracking-wide uppercase"
                      style={{
                        borderColor: 'rgba(255,215,0,0.25)',
                        color: 'rgba(255,215,0,0.6)',
                        background: 'rgba(255,215,0,0.08)',
                      }}
                    >
                      Active
                    </span>
                  )}
                </div>

                {isPastDue && (
                  <div
                    className="mb-3 rounded-xl border px-4 py-3"
                    style={{
                      borderColor: 'rgba(231,76,60,0.3)',
                      background: 'rgba(231,76,60,0.07)',
                    }}
                    role="alert"
                  >
                    <p className="text-xs font-medium flex items-center gap-1.5 mb-1" style={{ color: '#E74C3C' }}>
                      <span aria-hidden="true">!</span>
                      {t('pastDueWarning')}
                    </p>
                    {gracePeriodEndsAt && (
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {t('pastDueGrace', {
                          date: gracePeriodEndsAt.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          }),
                        })}
                      </p>
                    )}
                    <SettingsPortalButton
                      label={t('updatePaymentMethod')}
                      variant="danger"
                    />
                  </div>
                )}

                <p className="text-sm text-white/40">
                  {sub.isPremium
                    ? 'Unlimited saved charts, detailed aspects, priority support.'
                    : 'Up to 3 saved charts. Upgrade for unlimited access.'}
                </p>
              </div>
            </div>

            {sub.isPremium ? (
              <SettingsPortalButton label={t('manageBilling')} />
            ) : (
              <a
                href="/pricing"
                className="inline-flex items-center px-5 py-2.5 rounded-xl bg-[#FFD700] text-[#0A0A0F] text-sm font-semibold tracking-wide hover:bg-[#FFE033] transition-colors"
              >
                {t('upgradeToPro')}
              </a>
            )}
          </div>
        </section>

        {/* Language + Notifications — client components */}
        <SettingsClientSections />

        {/* Account section */}
        <section aria-labelledby="account-heading" className="mb-8">
          <h2
            id="account-heading"
            className="text-xs tracking-[0.2em] uppercase text-white/35 mb-4"
          >
            Account
          </h2>
          <div
            className="rounded-2xl border border-white/6 divide-y divide-white/6"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            {/* Data export */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white/80">{t('exportData')}</p>
                <p className="text-xs text-white/35 mt-0.5">
                  Download a JSON copy of all your charts and account data (GDPR Article 20).
                </p>
              </div>
              <a
                href="/api/v1/user/data-export"
                download="estrevia-data-export.json"
                className="flex-shrink-0 text-sm px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 transition-colors"
              >
                Export
              </a>
            </div>

            {/* Delete account */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white/80">{t('deleteAccount')}</p>
                <p className="text-xs text-white/35 mt-0.5">
                  {t('deleteWarning')}
                </p>
              </div>
              <a
                href="/settings/delete-account"
                className="flex-shrink-0 text-sm px-4 py-2 rounded-lg border border-red-500/20 text-red-400/60 hover:text-red-400 hover:border-red-500/40 transition-colors"
              >
                {t('deleteConfirm')}
              </a>
            </div>
          </div>
        </section>

        {/* Legal links */}
        <div className="flex gap-4">
          <a
            href="/terms"
            className="text-xs text-white/25 hover:text-white/50 transition-colors"
          >
            Terms of Service
          </a>
          <a
            href="/privacy"
            className="text-xs text-white/25 hover:text-white/50 transition-colors"
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  );
}
