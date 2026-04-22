import { SignIn, ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import type { Metadata } from 'next';

// Clerk catch-all route. Handles /sign-in as well as deep paths Clerk uses
// for multi-step flows (SSO callback, factor verification, etc).
// Reads ?redirect_url= from the URL automatically.
export const metadata: Metadata = {
  title: 'Sign In — Estrevia',
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4 py-10">
      <ClerkLoading>
        <AuthLoadingState />
      </ClerkLoading>
      <ClerkLoaded>
        <SignIn
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
        aria-label="Loading sign in"
      />
      <p className="text-sm text-white/50 mt-4">Loading sign in…</p>
    </div>
  );
}
