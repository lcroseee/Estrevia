/**
 * InternalLinks — "Related readings" section for essay pages.
 *
 * Server Component. Calls getRelatedPages() which is pure/synchronous.
 * Renders 3-5 contextual links with descriptive anchor text.
 */

import Link from 'next/link';
import { getRelatedPages } from '@/shared/seo';

// ---------------------------------------------------------------------------
// Static JSX — arrow icon hoisted outside component
// ---------------------------------------------------------------------------

const ArrowRight = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
    className="text-white/30 group-hover:text-white/60 transition-colors shrink-0 mt-0.5"
  >
    <path d="M2.5 7h9M8 4l3.5 3-3.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface InternalLinksProps {
  slug: string;
}

export function InternalLinks({ slug }: InternalLinksProps) {
  const pages = getRelatedPages(slug);

  if (pages.length === 0) return null;

  return (
    <section aria-labelledby="related-heading">
      <h2
        id="related-heading"
        className="text-xs font-semibold text-white/90 mb-4 font-[var(--font-geist-sans)] tracking-wide uppercase"
      >
        Related Readings
      </h2>

      <ul
        className="space-y-1"
        role="list"
      >
        {pages.map(({ href, title, anchorText }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex items-start gap-3 rounded-lg border border-transparent hover:border-white/8 px-4 py-3 hover:bg-white/3 transition-all duration-150"
              aria-label={title}
            >
              {ArrowRight}
              <span className="text-sm text-white/55 group-hover:text-white/80 transition-colors font-[var(--font-geist-sans)] leading-snug">
                {anchorText}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
