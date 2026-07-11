import type { ReactNode } from 'react';
import { SubscriptionProvider } from '@/shared/context/SubscriptionProvider';
import { SeoChrome } from '@/shared/components/SeoChrome';

/**
 * (content) route group — essays + tarot. Anonymous-first SEO landing pages.
 *
 * ClerkProvider is intentionally ABSENT: these pages drop the clerk-js load
 * that (app)/layout.tsx mounts (root app/layout.tsx:59-61 documents the scoping
 * intent). Route-group parentheses do NOT affect URLs, so /essays/* and
 * /tarot/* are byte-identical after the move — no redirects/canonicals/hreflang.
 *
 * Pro-unlock still works: SubscriptionProvider fetches /api/v1/user/subscription,
 * authorized by the httpOnly Clerk session cookie the browser sends
 * automatically — it needs NO client ClerkProvider. No component in this
 * subtree calls a Clerk client hook — only the Clerk-free useSubscription; enforced by
 * (content)/__tests__/no-clerk-hooks.test.ts and the EssayPageClient render guard.
 */
export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <SubscriptionProvider>
      <SeoChrome>{children}</SeoChrome>
    </SubscriptionProvider>
  );
}
