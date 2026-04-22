import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';

// Clerk catch-all route for sign-up. Symmetrical to /sign-in.
export const metadata: Metadata = {
  title: 'Sign Up — Estrevia',
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4 py-10">
      <SignUp
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
    </div>
  );
}
