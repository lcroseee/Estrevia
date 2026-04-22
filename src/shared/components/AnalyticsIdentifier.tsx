'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect } from 'react';
import { identifyUser } from '@/shared/lib/analytics';

/**
 * Wires PostHog user identification to Clerk's authenticated user.
 * Call `identifyUser` once the Clerk session resolves so that:
 * - Anonymous pre-signup events are merged with the identified person.
 * - Funnel attribution (passport creation → conversion) works correctly.
 *
 * Renders nothing — place once in the root layout, inside <ClerkProvider>.
 */
export function AnalyticsIdentifier() {
  const { user } = useUser();

  useEffect(() => {
    if (!user) return;

    identifyUser(user.id, {
      email: user.primaryEmailAddress?.emailAddress,
      createdAt: user.createdAt,
    });
  }, [user]);

  return null;
}
