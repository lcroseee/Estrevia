'use client';

import { SignUp, ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { useLocale } from 'next-intl';

// Clerk catch-all route for sign-up. Symmetrical to /sign-in.
// Client component so useLocale() can pass the current locale to Clerk's
// unsafeMetadata, which the user.created webhook reads to persist locale
// and send the welcome email in the correct language.
export default function SignUpPage() {
  const locale = useLocale();

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4 py-10">
      <ClerkLoading>
        <AuthLoadingState />
      </ClerkLoading>
      <ClerkLoaded>
        <SignUp
          unsafeMetadata={{ locale }}
          appearance={{
            variables: {
              colorPrimary: '#FFD700',
              colorBackground: '#0F0F17',
              colorText: '#FFFFFF',
              colorTextSecondary: 'rgba(255,255,255,0.6)',
              colorInputBackground: 'rgba(255,255,255,0.04)',
              colorInputText: '#FFFFFF',
              borderRadius: '0.75rem',
            },
            elements: {
              card: 'shadow-2xl shadow-black/60 border border-white/8',
            },
          }}
        />
      </ClerkLoaded>
    </div>
  );
}

function AuthLoadingState() {
  return (
    <div className="text-center">
      <div
        className="inline-block w-8 h-8 border-2 border-[#FFD700]/30 border-t-[#FFD700] rounded-full animate-spin"
        role="status"
        aria-label="Loading sign up"
      />
      <p className="text-sm text-white/50 mt-4">Loading sign up…</p>
    </div>
  );
}
