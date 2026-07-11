import { describe, it, expect, vi } from 'vitest';

// Both pages transitively import next-intl's Link (@/i18n/navigation →
// next/navigation), unresolvable in the vitest node env. We only read the
// dynamicParams export, never render, so stub the navigation module.
vi.mock('@/i18n/navigation', () => ({
  Link: () => null,
  redirect: () => undefined,
  usePathname: () => '',
  useRouter: () => ({}),
  getPathname: () => '',
}));

import { dynamicParams as essayDynamicParams } from '../../../app/[locale]/(app)/essays/[slug]/page';
import { dynamicParams as tarotDynamicParams } from '../../../app/[locale]/(app)/tarot/[cardId]/page';

describe('soft-404 guard (T12)', () => {
  it('essay route rejects unknown slugs (dynamicParams=false)', () => {
    expect(essayDynamicParams).toBe(false);
  });
  it('tarot card route rejects unknown slugs (dynamicParams=false)', () => {
    expect(tarotDynamicParams).toBe(false);
  });
});
