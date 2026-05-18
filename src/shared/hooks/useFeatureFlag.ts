import { useEffect, useState } from 'react';
import { usePostHog } from '@/shared/components/PostHogProvider';

interface Loadable<T> {
  value: T;
  isLoading: boolean;
}

interface PostHogClient {
  getFeatureFlag: (key: string) => string | boolean | null | undefined;
  onFeatureFlags: (callback: () => void) => void;
}

function getPostHogClient(): PostHogClient | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { posthog?: PostHogClient }).posthog;
  return candidate ?? null;
}

/**
 * useFeatureFlag — read a PostHog feature flag in a React component.
 *
 * Integrates with the existing PostHogProvider (cookie-consent-gated lazy load).
 * Returns `defaultValue` until PostHog is initialized AND the flag is resolved.
 * Re-renders when PostHog re-evaluates flags (e.g. user identification flips
 * a flag's value via cohort-based targeting).
 *
 * @example
 *   const { value: variant, isLoading } = useFeatureFlag('paywall-copy-test', 'control');
 *   if (isLoading) return <ControlVariant />;
 *   return variant === 'b' ? <VariantB /> : <ControlVariant />;
 */
export function useFeatureFlag<T = boolean>(
  key: string,
  defaultValue: T
): Loadable<T> {
  const { isInitialized } = usePostHog();
  const [state, setState] = useState<Loadable<T>>({
    value: defaultValue,
    isLoading: true,
  });

  useEffect(() => {
    if (!isInitialized) return;
    const posthog = getPostHogClient();
    if (!posthog) return;

    const evaluate = () => {
      const flagValue = posthog.getFeatureFlag(key);
      const resolved = (flagValue ?? defaultValue) as T;
      setState({ value: resolved, isLoading: false });
    };
    evaluate();
    posthog.onFeatureFlags(evaluate);
  }, [isInitialized, key, defaultValue]);

  return state;
}
