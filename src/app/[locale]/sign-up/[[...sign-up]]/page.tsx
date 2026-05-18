import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { createMetadata } from '@/shared/seo';
import { SignUpClient } from './SignUpClient';

// Server component shell. Mirrors the /sign-in pattern so we can attach
// generateMetadata with noIndex while keeping the locale-aware Clerk render
// in a client child (SignUpClient).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tMeta = await getTranslations('pageMeta.signUp');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/sign-up',
    locale: locale as 'en' | 'es',
    noIndex: true,
  });
}

export default function SignUpPage() {
  return <SignUpClient />;
}
