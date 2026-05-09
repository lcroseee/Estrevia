import { ClerkProvider } from '@clerk/nextjs';
import { enUS, esES } from '@clerk/localizations';
import { Link } from '@/i18n/navigation';
import { PlanetaryHourBar } from '@/modules/astro-engine/components/PlanetaryHourBar';
import { UserMenu } from '@/modules/auth/components/UserMenu';
import { SubscriptionProvider } from '@/shared/context/SubscriptionProvider';
import { AnalyticsIdentifier } from '@/shared/components/AnalyticsIdentifier';
import { MetaPixelLeadEmitter } from '@/shared/components/MetaPixelLeadEmitter';
import { MetaPixelSubscribeEmitter } from '@/shared/components/MetaPixelSubscribeEmitter';
import { PostSignupAttribution } from '@/shared/components/PostSignupAttribution';
import { MobileNav } from './MobileNav';
import { DesktopNav } from './DesktopNav';

// ClerkProvider is scoped here (not in root layout) so marketing pages
// do not load Clerk's ~324 KB bundle. Sign-in/sign-up routes have their
// own layout.tsx files that also wrap with ClerkProvider.
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <ClerkProvider localization={locale === 'es' ? esES : enUS}>
      {/* AnalyticsIdentifier wires PostHog identification to the Clerk session.
          Must live inside ClerkProvider so that useUser() is available. */}
      <AnalyticsIdentifier />
      {/* SubscriptionProvider fetches the user's plan ONCE at this layout
          boundary. Every child component that calls `useSubscription()`
          reads the shared result instead of firing its own request.
          Only mounted for authenticated (app) routes — public `/s/[id]`
          and marketing pages do not see this provider. */}
      <SubscriptionProvider>
        {/* Both Pixel emitters need Clerk's useUser, so they live inside
            ClerkProvider. Lead fires on fresh sign-up post-redirect; Subscribe
            fires on Stripe ?session_id return. Marketing pages do not host
            sign-up or checkout flows, so emitters are scoped to (app)/. */}
        <MetaPixelLeadEmitter />
        <MetaPixelSubscribeEmitter />
        {/* V08-2: reads estrevia_passport_ref cookie post-signup and calls attribution API */}
        <PostSignupAttribution />
        <div className="flex flex-col min-h-screen bg-[#0A0A0F]">
          {/* ── App header ─────────────────────────────────────────────────── */}
          <header
            className="sticky top-0 z-40 flex items-center justify-between px-4 h-12 border-b border-white/6"
            style={{ background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(12px)' }}
          >
            {/* Logo */}
            <Link
              href="/"
              className="text-sm font-semibold tracking-widest uppercase text-white/80 hover:text-white transition-colors font-[var(--font-geist-sans)]"
              aria-label="Estrevia — home"
            >
              Estrevia
            </Link>

            {/* Desktop navigation — visible md+ */}
            <DesktopNav />

            {/* Center: Planetary hour bar — the daily hook (visible on mobile, hidden on desktop where nav takes space) */}
            <div className="md:hidden">
              <PlanetaryHourBar />
            </div>

            {/* Right: user avatar (signed-in) or sign-in button (guest) */}
            <UserMenu />
          </header>

          {/* ── Main content ────────────────────────────────────────────────── */}
          <main id="main-content" className="flex-1 pb-20 md:pb-0">
            {children}
          </main>

          {/* ── Bottom mobile navigation ─────────────────────────────────────
              Visible on mobile/tablet only. Desktop uses the header nav above.
          ── */}
          <MobileNav />
        </div>
      </SubscriptionProvider>
    </ClerkProvider>
  );
}
