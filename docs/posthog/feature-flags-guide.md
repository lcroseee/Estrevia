# PostHog Feature Flags — Estrevia Guide

**Hook:** `src/shared/hooks/useFeatureFlag.ts`
**PostHog project:** `407908` (US region, `us.posthog.com`)
**Integration:** Lazy-loaded via `src/shared/components/PostHogProvider.tsx` after cookie consent.

## When to use

Wrap any client-side UI element you want to A/B test:

- Paywall copy variants
- CTA button label tests
- Pricing page section reorders
- Email subject line A/B (server-side; see "Server-side" section)

## When NOT to use

- **Server-side rendered routes** (e.g. `/pricing/page.tsx`) — hook is client-only. Wave 2 ships static pricing changes; server-side feature flag evaluation is deferred to a future wave.
- **Anonymous-only experiments before cookie consent** — flag is only evaluated after `isInitialized: true`, which requires user consent.
- **Performance-critical render path on first paint** — hook returns `defaultValue` with `isLoading: true` until PostHog resolves; design your variants so the default is the control.

## Step-by-step setup

### 1. Create the flag in PostHog UI

1. Log in to https://us.posthog.com/project/407908/feature_flags
2. Click "New feature flag".
3. Set `Key` (e.g. `paywall-copy-test`). This is the string you pass to `useFeatureFlag(key, ...)`.
4. Choose `Boolean` or `Multivariate`:
   - **Boolean** — flag is true/false. Use for simple on/off toggles.
   - **Multivariate** — flag returns one of N variant strings (e.g. `control`, `variant-b`). Use for A/B/N tests.
5. For a 50/50 boolean rollout: set "Release condition" → "Roll out to 50% of all users".
6. For multivariate: define each variant with weight (sum to 100).
7. Save. Flag is now live.

### 2. Use the hook in a React client component

```tsx
'use client';

import { useFeatureFlag } from '@/shared/hooks/useFeatureFlag';

export function PaywallCta() {
  const { value: variant, isLoading } = useFeatureFlag<string>(
    'paywall-copy-test',
    'control',
  );

  if (isLoading) return <ControlCta />;
  return variant === 'urgency' ? <UrgencyCta /> : <ControlCta />;
}
```

### 3. QA override

PostHog supports URL-based flag override for QA. Append `?__ph_flag_override=KEY:VALUE` to any page URL while logged in to PostHog (toolbar) to force a specific variant. Exact param name may vary; check the active PostHog version's docs: https://posthog.com/docs/feature-flags/testing

## Sticky assignment

- `posthog-js` stores a distinct `device_id` (anonymous) cookie pre-login.
- On `posthog.identify(userId)` (currently fired in `src/shared/lib/analytics.ts`), the device_id is associated with the user.
- Flag evaluations are sticky per user/device — repeat visits return the same variant unless the flag's release condition changes.

## Reference demo flag

A flag named `wave2-demo-flag` should be created in PostHog for documentation purposes. It is not wired to any production component. Use it to verify the toolbar override works:

```tsx
const { value } = useFeatureFlag<boolean>('wave2-demo-flag', false);
console.log('demo flag:', value);
```

## Future: server-side feature flags

For SSR routes (pricing page, marketing landing), you need server-side flag evaluation via `posthog-node`. This is deferred to a future Wave once a real experiment requires it. The current pricing page A/B (Wave 3) will use the client-side hook on `PricingToggle.tsx` (a client component), not the SSR `page.tsx`.
