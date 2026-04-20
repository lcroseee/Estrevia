import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createMetadata } from '@/shared/seo/metadata';
import { SupportForm } from './SupportForm';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: 'Support',
    description: 'Get help with Estrevia. Pro members receive priority replies.',
    path: '/support',
    keywords: ['estrevia support', 'contact', 'help'],
  });
}

export default async function SupportPage() {
  const t = await getTranslations('support');

  return (
    <main className="min-h-screen px-4 py-16 max-w-xl mx-auto">
      <header className="mb-8 space-y-2">
        <p className="text-[10px] tracking-[0.22em] uppercase text-white/40">
          {t('eyebrow')}
        </p>
        <h1
          className="text-3xl font-light text-white/90"
          style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
        >
          {t('h1')}
        </h1>
        <p className="text-sm text-white/50 leading-relaxed">{t('description')}</p>
      </header>

      <SupportForm />
    </main>
  );
}
