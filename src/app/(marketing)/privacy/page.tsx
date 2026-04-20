import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createMetadata } from '@/shared/seo';

export function generateMetadata(): Metadata {
  return createMetadata({
    title: 'Privacy Policy',
    description:
      'How Estrevia collects, uses, and protects your data. Birth data encrypted with AES-256-GCM. GDPR rights: access, rectification, deletion, export.',
    path: '/privacy',
  });
}

const EFFECTIVE_DATE = 'April 6, 2026';
const CONTACT_EMAIL = 'privacy@estrevia.app';
const RETENTION_TEMP_CHARTS = '7 days';

export default async function PrivacyPage() {
  const t = await getTranslations('privacyPage');
  const tCommon = await getTranslations('legalCommon');

  // RETENTION_SAVED_CHARTS uses "row4Retention" copy ("until account deletion")
  // — same string, kept consistent across the page for both locales.
  const retentionSavedCharts = t('row4Retention');

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24">
      {/* Header */}
      <header className="mb-12">
        <p className="text-xs tracking-[0.2em] uppercase text-[#C8A84B]/70 mb-3">
          {tCommon('eyebrow')}
        </p>
        <h1
          className="text-3xl sm:text-4xl font-semibold text-white/95 mb-4"
          style={{ fontFamily: 'var(--font-crimson-pro)' }}
        >
          {t('h1')}
        </h1>
        <p className="text-sm text-white/40">
          {tCommon('effectiveDate', { date: EFFECTIVE_DATE })}
        </p>
        <p className="mt-3 text-xs text-white/35 italic border-l-2 border-[#C8A84B]/30 pl-3">
          {tCommon('translationNote')}
        </p>
      </header>

      <div className="space-y-10 text-white/70 leading-relaxed">

        {/* Overview */}
        <Section title={t('overviewTitle')}>
          <p>{t('overviewP1')}</p>
        </Section>

        {/* 1. Data we collect */}
        <Section title={t('s1Title')}>
          <div className="space-y-5">
            <DataCategory
              label={t('categoryBirthLabel')}
              badge={t('categoryBirthBadge')}
              items={[
                t('categoryBirthItem1'),
                t('categoryBirthItem2'),
                t('categoryBirthItem3'),
              ]}
              note={t('categoryBirthNote')}
            />

            <DataCategory
              label={t('categoryAccountLabel')}
              items={[
                t('categoryAccountItem1'),
                t('categoryAccountItem2'),
              ]}
            />

            <DataCategory
              label={t('categoryPassportLabel')}
              badge={t('categoryPassportBadge')}
              items={[
                t('categoryPassportItem1'),
                t('categoryPassportItem2'),
              ]}
              note={t('categoryPassportNote')}
            />

            <DataCategory
              label={t('categoryUsageLabel')}
              badge={t('categoryUsageBadge')}
              items={[
                t('categoryUsageItem1'),
                t('categoryUsageItem2'),
                t('categoryUsageItem3'),
              ]}
              note={t('categoryUsageNote')}
            />

            <DataCategory
              label={t('categoryPaymentLabel')}
              items={[
                t('categoryPaymentItem1'),
                t('categoryPaymentItem2'),
              ]}
              note={t('categoryPaymentNote')}
            />
          </div>
        </Section>

        {/* 2. How we use data */}
        <Section title={t('s2Title')}>
          <ul className="list-disc list-outside ml-5 space-y-1.5 text-sm sm:text-base">
            <li>{t('s2L1')}</li>
            <li>{t('s2L2')}</li>
            <li>{t('s2L3')}</li>
            <li>{t('s2L4')}</li>
            <li>{t('s2L5')}</li>
            <li>{t('s2L6')}</li>
            <li>{t('s2L7')}</li>
          </ul>
          <p className="text-sm sm:text-base mt-3">
            <strong className="text-white/85">{t('s2NotSell')}</strong>
          </p>
        </Section>

        {/* 3. Birth data encryption */}
        <Section title={t('s3Title')}>
          <div className="rounded-lg border border-[#C8A84B]/20 bg-[#C8A84B]/5 px-5 py-4 space-y-3">
            <p>
              {t('s3P1Before')}
              <strong className="text-white/85">{t('s3P1Strong')}</strong>
              {t('s3P1After')}
            </p>
            <ul className="list-disc list-outside ml-5 space-y-1.5 text-sm">
              <li>{t('s3L1')}</li>
              <li>{t('s3L2')}</li>
              <li>{t('s3L3')}</li>
              <li>{t('s3L4')}</li>
            </ul>
          </div>
        </Section>

        {/* 4. Third parties */}
        <Section title={t('s4Title')}>
          <div className="space-y-4">
            <ThirdParty
              name="Clerk"
              purpose={t('tpClerkPurpose')}
              link="https://clerk.com/privacy"
              data={t('tpClerkData')}
              dataPrefix={t('tpDataSharedPrefix')}
            />
            <ThirdParty
              name="Stripe"
              purpose={t('tpStripePurpose')}
              link="https://stripe.com/privacy"
              data={t('tpStripeData')}
              dataPrefix={t('tpDataSharedPrefix')}
            />
            <ThirdParty
              name="PostHog"
              purpose={t('tpPosthogPurpose')}
              link="https://posthog.com/privacy"
              data={t('tpPosthogData')}
              dataPrefix={t('tpDataSharedPrefix')}
            />
            <ThirdParty
              name="Neon"
              purpose={t('tpNeonPurpose')}
              link="https://neon.tech/privacy"
              data={t('tpNeonData')}
              dataPrefix={t('tpDataSharedPrefix')}
            />
            <ThirdParty
              name="Vercel"
              purpose={t('tpVercelPurpose')}
              link="https://vercel.com/legal/privacy-policy"
              data={t('tpVercelData')}
              dataPrefix={t('tpDataSharedPrefix')}
            />
            <ThirdParty
              name="Resend"
              purpose={t('tpResendPurpose')}
              link="https://resend.com/privacy"
              data={t('tpResendData')}
              dataPrefix={t('tpDataSharedPrefix')}
            />
            <ThirdParty
              name="Sentry"
              purpose={t('tpSentryPurpose')}
              link="https://sentry.io/privacy/"
              data={t('tpSentryData')}
              dataPrefix={t('tpDataSharedPrefix')}
            />
          </div>
        </Section>

        {/* 5. Data retention */}
        <Section title={t('s5Title')}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 pr-4 text-white/50 font-medium">{t('tableHeaderData')}</th>
                <th className="text-left py-2 text-white/50 font-medium">{t('tableHeaderRetention')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr>
                <td className="py-2.5 pr-4 text-white/70">{t('row1Data')}</td>
                <td className="py-2.5 text-white/70">{RETENTION_TEMP_CHARTS}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-white/70">{t('row2Data')}</td>
                <td className="py-2.5 text-white/70">{retentionSavedCharts}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-white/70">{t('row3Data')}</td>
                <td className="py-2.5 text-white/70">{t('row3Retention')}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-white/70">{t('row4Data')}</td>
                <td className="py-2.5 text-white/70">{t('row4Retention')}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-white/70">{t('row5Data')}</td>
                <td className="py-2.5 text-white/70">{t('row5Retention')}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* 6. GDPR rights */}
        <Section title={t('s6Title')}>
          <p>{t('s6Intro')}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { right: t('rightAccess'), desc: t('rightAccessDesc') },
              { right: t('rightRectification'), desc: t('rightRectificationDesc') },
              { right: t('rightDeletion'), desc: t('rightDeletionDesc') },
              { right: t('rightExport'), desc: t('rightExportDesc') },
              { right: t('rightRestriction'), desc: t('rightRestrictionDesc') },
              { right: t('rightObjection'), desc: t('rightObjectionDesc') },
            ].map(({ right, desc }) => (
              <div
                key={right}
                className="rounded-md border border-white/8 bg-white/3 px-4 py-3"
              >
                <p className="text-xs font-semibold text-white/80 mb-1">{right}</p>
                <p className="text-xs text-white/50">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2 text-sm sm:text-base">
            <p>
              <strong className="text-white/85">{t('exportLabel')}</strong>{' '}
              <code className="text-[#C8A84B]/80 bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono">
                GET /api/v1/user/data-export
              </code>
              {t('exportSuffix')}
            </p>
            <p>
              <strong className="text-white/85">{t('deleteLabel')}</strong>
              {t('deleteMid')}
              <code className="text-[#C8A84B]/80 bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono">
                DELETE /api/v1/user/account
              </code>
              {t('deleteSuffix')}
            </p>
            <p>
              {t('exerciseEmailPrefix')}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-[#C8A84B] hover:text-[#E0C06A] underline underline-offset-2 transition-colors"
              >
                {CONTACT_EMAIL}
              </a>
              {t('exerciseEmailSuffix')}
            </p>
          </div>
        </Section>

        {/* 7. Cookies */}
        <Section title={t('s7Title')}>
          <p>{t('s7Intro')}</p>
          <ul className="list-disc list-outside ml-5 space-y-1.5 text-sm sm:text-base mt-2">
            <li>
              <strong className="text-white/85">{t('s7L1Strong')}</strong>
              {t('s7L1Suffix')}
            </li>
            <li>
              <strong className="text-white/85">{t('s7L2Strong')}</strong>
              {t('s7L2Suffix')}
            </li>
          </ul>
          <p className="mt-3 text-sm sm:text-base">{t('s7Footer')}</p>
        </Section>

        {/* 8. Data transfers */}
        <Section title={t('s8Title')}>
          <p>{t('s8P1')}</p>
        </Section>

        {/* 9. Children */}
        <Section title={t('s9Title')}>
          <p>{t('s9P1')}</p>
          <p>
            <strong>{t('s9P2Strong')}</strong>
            {t('s9P2Mid')}
            <code className="px-1 py-0.5 rounded bg-white/8 text-[#C8A84B] text-xs">
              /settings
            </code>
            {t('s9P2After')}
          </p>
          <p>
            {t('s9P3Before')}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[#C8A84B] hover:text-[#E0C06A] underline underline-offset-2 transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
            {t('s9P3After')}
          </p>
        </Section>

        {/* 10. Contact */}
        <Section title={t('s10Title')}>
          <p>{t('s10P1')}</p>
          <p>
            {t('s10P2Prefix')}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[#C8A84B] hover:text-[#E0C06A] underline underline-offset-2 transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
          <p>{t('s10P3')}</p>
        </Section>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helper components
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="text-lg font-semibold text-white/85 mb-4"
        style={{ fontFamily: 'var(--font-crimson-pro)' }}
      >
        {title}
      </h2>
      <div className="space-y-3 text-sm sm:text-base">{children}</div>
    </section>
  );
}

function DataCategory({
  label,
  badge,
  items,
  note,
}: {
  label: string;
  badge?: string;
  items: string[];
  note?: string;
}) {
  return (
    <div className="rounded-md border border-white/8 bg-white/2 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white/80">{label}</span>
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#C8A84B]/15 text-[#C8A84B]/80 font-medium tracking-wide">
            {badge}
          </span>
        )}
      </div>
      <ul className="list-disc list-outside ml-4 space-y-0.5">
        {items.map((item) => (
          <li key={item} className="text-sm text-white/55">{item}</li>
        ))}
      </ul>
      {note && (
        <p className="text-xs text-white/40 italic border-t border-white/6 pt-2 mt-1">
          {note}
        </p>
      )}
    </div>
  );
}

function ThirdParty({
  name,
  purpose,
  link,
  data,
  dataPrefix,
}: {
  name: string;
  purpose: string;
  link: string;
  data: string;
  dataPrefix: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm border-b border-white/5 pb-3 last:border-0">
      <div className="sm:w-24 shrink-0">
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#C8A84B]/80 hover:text-[#C8A84B] transition-colors underline underline-offset-2"
        >
          {name}
        </a>
      </div>
      <div className="flex-1 space-y-0.5">
        <p className="text-white/70">{purpose}</p>
        <p className="text-white/40 text-xs">
          {dataPrefix}
          {data}
        </p>
      </div>
    </div>
  );
}
