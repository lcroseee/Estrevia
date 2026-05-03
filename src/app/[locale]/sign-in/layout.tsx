import { ClerkProvider } from '@clerk/nextjs';
import { enUS, esES } from '@clerk/localizations';

/**
 * Minimal layout for /sign-in — provides ClerkProvider so <SignIn />,
 * <ClerkLoaded>, and <ClerkLoading> work correctly. This is outside the
 * (app) route group so it needs its own ClerkProvider instance.
 */
export default async function SignInLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <ClerkProvider localization={locale === 'es' ? esES : enUS}>
      {children}
    </ClerkProvider>
  );
}
