'use client';

import { SignInButton as ClerkSignInButton } from '@clerk/nextjs';

interface SignInButtonProps {
  /** Button label. Defaults to "Sign In". */
  label?: string;
  /** Additional Tailwind classes for the inner <button> element. */
  className?: string;
}

/**
 * Thin wrapper around Clerk's <SignInButton> that uses Clerk's hosted sign-in
 * modal (mode="modal") so no dedicated /sign-in page is required at MVP.
 * Styled to match the Estrevia gold accent system.
 */
export function SignInButton({ label = 'Sign In', className }: SignInButtonProps) {
  return (
    <ClerkSignInButton mode="modal">
      <button
        type="button"
        className={
          className ??
          'text-xs px-3 py-1.5 rounded-full border border-[#FFD700]/30 text-[#FFD700]/70 hover:text-[#FFD700] hover:border-[#FFD700]/60 transition-colors tracking-wide'
        }
      >
        {label}
      </button>
    </ClerkSignInButton>
  );
}
