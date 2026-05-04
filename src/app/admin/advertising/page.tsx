/**
 * /admin/advertising — hub page with cards linking to each sub-section.
 *
 * Originally a redirect to /creatives/review; converted to a hub as the
 * advertising admin grew sub-sections (gates, thresholds, …). Each card is
 * a plain link — Server Component, no client JS.
 */

import { Link } from '@/i18n/navigation';

interface AdminCard {
  href: string;
  label: string;
  description: string;
}

const CARDS: AdminCard[] = [
  {
    href: '/admin/advertising/creatives/review',
    label: 'Creatives',
    description: 'Review queue for AI-generated creatives awaiting approval.',
  },
  {
    href: '/admin/advertising/decisions',
    label: 'Decisions',
    description: 'Audit log of every senior-buyer decision (proposal + auto).',
  },
  {
    href: '/admin/advertising/gates',
    label: 'Feature Gates',
    description: 'Runtime mode for each agent component (off/stub/shadow/active).',
  },
  {
    href: '/admin/advertising/thresholds',
    label: 'Thresholds',
    description: 'Effective thresholds + source (default / auto / founder).',
  },
  {
    href: '/admin/advertising/spend',
    label: 'Spend',
    description: 'Daily spend rollups + cap status.',
  },
  {
    href: '/admin/advertising/recon-state',
    label: 'Reconciler',
    description: 'Drift between intended state and Meta Ads Manager.',
  },
];

export default function AdvertisingAdminPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Advertising</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Operational console for the autonomous advertising agent.
        </p>
      </div>

      <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" aria-label="Advertising admin sections">
        {CARDS.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="block bg-white/4 border border-white/10 hover:border-white/20 hover:bg-white/6 rounded-xl p-4 transition-colors"
            >
              <h2 className="text-sm font-semibold text-white">{card.label}</h2>
              <p className="text-xs text-white/40 mt-1">{card.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
