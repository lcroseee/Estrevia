'use client';

/**
 * SubscriptionProvider — single source of truth for the current user's
 * subscription state. Replaces per-component `fetch('/api/v1/user/subscription')`
 * calls that previously fired from every paywalled component on mount.
 *
 * Wrap this at the highest authenticated layout level — `(app)/layout.tsx`.
 * DO NOT wrap public layouts (marketing, `/s/[id]`) because the API route
 * requires an authenticated Clerk session and would 401 for anonymous users.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface SubscriptionState {
  plan: 'free' | 'pro_monthly' | 'pro_annual';
  status: 'trialing' | 'active' | 'canceled' | 'past_due' | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  isPro: boolean;
  isTrialing: boolean;
  isLoading: boolean;
}

const DEFAULT_STATE: SubscriptionState = {
  plan: 'free',
  status: null,
  trialEnd: null,
  currentPeriodEnd: null,
  isPro: false,
  isTrialing: false,
  isLoading: true,
};

// Minimum milliseconds between focus-triggered revalidations.
// Prevents thundering-herd re-fetches when the user tabs back
// to the browser repeatedly. Matches SWR's default dedupingInterval.
const REVALIDATE_DEDUPE_MS = 60_000;

const SubscriptionContext = createContext<SubscriptionState | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubscriptionState>(DEFAULT_STATE);
  const lastFetchRef = useRef<number>(0);
  const inflightRef = useRef<boolean>(false);

  const fetchSubscription = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const res = await fetch('/api/v1/user/subscription', {
        // Prefer fresh data; the response is already cheap (indexed lookup
        // on a single row) and the browser's memory cache will dedupe
        // parallel fetches within the same frame.
        cache: 'no-store',
      });
      if (!res.ok) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
      }
      const data = await res.json();
      setState({
        plan: data.plan,
        status: data.status,
        trialEnd: data.trialEnd,
        currentPeriodEnd: data.currentPeriodEnd,
        isPro: data.isPro,
        isTrialing: data.isTrialing,
        isLoading: false,
      });
      lastFetchRef.current = Date.now();
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    } finally {
      inflightRef.current = false;
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Revalidate on focus (SWR-style). A user upgrading in a Stripe
  // checkout tab will have the new plan reflected when they tab back.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onFocus = () => {
      if (Date.now() - lastFetchRef.current < REVALIDATE_DEDUPE_MS) return;
      fetchSubscription();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchSubscription]);

  // Memoize the context value so identity-stable consumers (React.memo children)
  // don't re-render on unrelated parent updates.
  const value = useMemo(() => state, [state]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

/**
 * Internal hook — reads the provider's state. Returns DEFAULT_STATE (which
 * includes `isLoading: true`) when called outside a provider, so public
 * pages (e.g. `/s/[id]`) that accidentally mount a gated component don't
 * crash — they just render in the loading / free state.
 */
export function useSubscriptionContext(): SubscriptionState {
  const ctx = useContext(SubscriptionContext);
  return ctx ?? DEFAULT_STATE;
}
