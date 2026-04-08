'use client';

import { UserButton, useAuth } from '@clerk/nextjs';
import { SignInButton } from './SignInButton';

/**
 * Header user control: shows Clerk's <UserButton> (avatar + dropdown) for
 * signed-in users, and a <SignInButton> for guests.
 *
 * useAuth().isLoaded guards the flash of wrong state during hydration.
 * useAuth().isSignedIn switches between the two controls.
 */
export function UserMenu() {
  const { isLoaded, isSignedIn } = useAuth();

  // Avoid flash of incorrect state during SSR hydration
  if (!isLoaded) {
    return <div className="w-7 h-7" aria-hidden="true" />;
  }

  if (isSignedIn) {
    return (
      <UserButton
        appearance={{
          elements: {
            avatarBox: 'w-7 h-7',
          },
        }}
      />
    );
  }

  return <SignInButton />;
}
