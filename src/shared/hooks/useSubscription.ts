'use client';

import { useState, useEffect } from 'react';

interface SubscriptionState {
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

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(DEFAULT_STATE);

  useEffect(() => {
    let cancelled = false;

    async function fetchSubscription() {
      try {
        const res = await fetch('/api/v1/user/subscription');
        if (!res.ok) {
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setState({
            plan: data.plan,
            status: data.status,
            trialEnd: data.trialEnd,
            currentPeriodEnd: data.currentPeriodEnd,
            isPro: data.isPro,
            isTrialing: data.isTrialing,
            isLoading: false,
          });
        }
      } catch {
        if (!cancelled) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    }

    fetchSubscription();
    return () => { cancelled = true; };
  }, []);

  return state;
}
