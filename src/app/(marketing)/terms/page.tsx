import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createMetadata } from '@/shared/seo';

// Dynamic rendering required so the NEXT_LOCALE cookie is honored.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const tMeta = await getTranslations('pageMeta.terms');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/terms',
  });
}

const EFFECTIVE_DATE = 'April 6, 2026';
const CONTACT_EMAIL = 'legal@estrevia.app';
const REPO_URL = 'https://github.com/lcroseee/Estrevia';

export default async function TermsPage() {
  const t = await getTranslations('termsPage');
  const tCommon = await getTranslations('legalCommon');

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

      <div className="prose-legal space-y-10 text-white/70 leading-relaxed">

        {/* 1. Acceptance */}
        <Section title={t('s1Title')}>
          <p>{t('s1P1')}</p>
          <p>{t('s1P2')}</p>
        </Section>

        {/* 2. Description */}
        <Section title={t('s2Title')}>
          <p>{t('s2P1')}</p>
          <p>{t('s2P2')}</p>
        </Section>

        {/* 3. Astrology Disclaimer — legal requirement */}
        <Section title={t('s3Title')}>
          <div className="rounded-lg border border-[#C8A84B]/20 bg-[#C8A84B]/5 px-5 py-4">
            <p className="text-white/90 font-medium mb-2">
              {t('s3Headline')}
            </p>
            <p>{t('s3P1')}</p>
            <p className="mt-3">{t('s3P2')}</p>
          </div>
        </Section>

        {/* 4. Accounts */}
        <Section title={t('s4Title')}>
          <p>{t('s4P1')}</p>
          <p>{t('s4P2')}</p>
        </Section>

        {/* 5. Acceptable Use */}
        <Section title={t('s5Title')}>
          <p>{t('s5Intro')}</p>
          <ul className="list-disc list-outside ml-5 space-y-1.5">
            <li>{t('s5L1')}</li>
            <li>{t('s5L2')}</li>
            <li>{t('s5L3')}</li>
            <li>{t('s5L4')}</li>
            <li>{t('s5L5')}</li>
            <li>{t('s5L6')}</li>
          </ul>
        </Section>

        {/* 6. Open Source License */}
        <Section title={t('s6Title')}>
          <p>
            {t('s6P1Before')}
            <code className="text-[#C8A84B]/80 bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono">
              {t('s6P1Code')}
            </code>
            {t('s6P1Mid')}
            <strong className="text-white/85">{t('s6P1Strong')}</strong>
            {t('s6P1After')}
          </p>
          <p>
            {t('s6P2Before')}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C8A84B] hover:text-[#E0C06A] underline underline-offset-2 transition-colors"
            >
              {t('s6P2Link')}
            </a>
            {t('s6P2After')}
          </p>
          <p>
            <strong className="text-white/85">
              {t('s6P3Strong')}
              <code className="text-[#C8A84B]/80 bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono">
                {t('s6P3Code')}
              </code>
            </strong>
            {t('s6P3Mid')}
            <strong>{t('s6P3StrongNot')}</strong>
            {t('s6P3After')}
          </p>
        </Section>

        {/* 7. Intellectual Property */}
        <Section title={t('s7Title')}>
          <p>{t('s7P1')}</p>
          <p>{t('s7P2')}</p>
          <p>{t('s7P3')}</p>
        </Section>

        {/* 8. Subscriptions */}
        <Section title={t('s8Title')}>
          <p>{t('s8P1')}</p>
          <p>{t('s8P2')}</p>
        </Section>

        {/* 9. Limitation of Liability */}
        <Section title={t('s9Title')}>
          <p>{t('s9P1')}</p>
          <p>{t('s9P2')}</p>
        </Section>

        {/* 10. Governing Law */}
        <Section title={t('s10Title')}>
          <p>{t('s10P1')}</p>
        </Section>

        {/* 11. Contact */}
        <Section title={t('s11Title')}>
          <p>
            {t('s11Prefix')}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[#C8A84B] hover:text-[#E0C06A] underline underline-offset-2 transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helper component
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
