import type { ReactNode } from 'react';
import { SeoChrome } from '@/shared/components/SeoChrome';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <SeoChrome>{children}</SeoChrome>;
}
