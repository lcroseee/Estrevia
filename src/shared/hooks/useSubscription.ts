'use client';

/**
 * useSubscription — reads the current user's subscription state from the
 * React context established by `<SubscriptionProvider>` in `(app)/layout.tsx`.
 *
 * Historically this hook did its own `fetch('/api/v1/user/subscription')`
 * on every mount. With 5+ call sites (EssayPageClient, AvatarGenerator,
 * MoonCalendar, PlanetaryHoursGrid, PaywallModal, etc.), that caused
 * 2–5 redundant round-trips per pageview. The fetch is now centralized
 * in the provider so every consumer shares one cached result.
 *
 * Outside a provider (e.g. public share pages) the hook returns the
 * default free-tier state with `isLoading: true` — safe for any gated
 * component that falls back to "locked" UI until it knows otherwise.
 */

import {
  useSubscriptionContext,
  type SubscriptionState,
} from '@/shared/context/SubscriptionProvider';

export type { SubscriptionState };

export function useSubscription(): SubscriptionState {
  return useSubscriptionContext();
}
