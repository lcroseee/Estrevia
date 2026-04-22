import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// ---------------------------------------------------------------------------
// Security Headers — Content Security Policy
// ---------------------------------------------------------------------------
// CSP hardening status (MVP pragmatic posture — Phase 2 will migrate to nonce).
//
// `'unsafe-inline'` is retained on `script-src` because Next.js 16 App Router
// emits inline bootstrap scripts per request. A full nonce-based CSP requires
// middleware to mint a nonce, forward it to `<Script strategy="beforeInteractive">`
// via React context, and pair it with `'strict-dynamic'` so only nonce-tagged
// root scripts can spawn others. Doing that without hydration breakage needs
// end-to-end testing across every integration (Clerk, Stripe, PostHog, Sentry,
// Vercel Live). Tracked as Phase 2 hardening in the security threat model.
//
// IMPORTANT: do NOT add `'strict-dynamic'` alongside `'unsafe-inline'` without
// a nonce. In CSP Level 3 browsers, `'strict-dynamic'` disables host-based
// allowlists AND `'unsafe-inline'`, which would block Stripe/Clerk/PostHog
// external scripts. The only safe migration is the full nonce rollout above.
// ---------------------------------------------------------------------------
const ContentSecurityPolicy = [
  // Default: block everything not explicitly allowed
  "default-src 'self'",

  // Scripts: self + Next.js inline scripts + Clerk + Stripe + PostHog + Sentry + Vercel
  // 'unsafe-eval' is required in dev mode only (React debugging callstacks)
  // Clerk dev instances live at *.accounts.dev (not only *.clerk.accounts.dev)
  // eu-assets.i.posthog.com serves the PostHog toolbar + array.js loader
  `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''} https://js.stripe.com https://*.clerk.accounts.dev https://*.accounts.dev https://*.posthog.com https://eu.posthog.com https://eu-assets.i.posthog.com https://*.sentry.io https://vercel.live https://*.vercel-scripts.com`,

  // Styles: self + unsafe-inline (required by shadcn/ui) + Google Fonts
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

  // Images: self + data URIs + blob URIs (OG image generation) + Stripe + Clerk + PostHog assets + Vercel
  // eu-assets.i.posthog.com serves PostHog tracking pixels and UI assets
  "img-src 'self' data: blob: https://*.stripe.com https://img.clerk.com https://*.clerk.com https://eu-assets.i.posthog.com",

  // Fonts: self + Google Fonts static host
  "font-src 'self' https://fonts.gstatic.com",

  // Connect (XHR/fetch/WebSocket): self + API services
  // *.accounts.dev covers Clerk development instances
  // PostHog EU uses a dedicated ingest subdomain `eu.i.posthog.com` and asset
  // subdomain `eu-assets.i.posthog.com` — wildcard `*.posthog.com` does NOT
  // cover the `i.posthog.com` third-level hosts, they must be listed explicitly
  "connect-src 'self' https://api.clerk.com https://*.clerk.accounts.dev https://*.accounts.dev https://*.posthog.com https://eu.posthog.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.ingest.sentry.io https://*.sentry.io https://api.stripe.com https://vitals.vercel-insights.com https://vercel.live wss://vercel.live",

  // Frames: only Stripe and Clerk (for 3D Secure / auth modals)
  "frame-src https://js.stripe.com https://*.stripe.com https://*.clerk.accounts.dev https://*.accounts.dev https://vercel.live",

  // Workers: self + blob (Next.js service worker / PWA)
  "worker-src 'self' blob:",

  // Object/embed: none
  "object-src 'none'",

  // Base URI: self only
  "base-uri 'self'",

  // Form actions: self + Stripe Checkout redirect target
  // Stripe Checkout posts back to our domain via the redirect URL we supply,
  // but the hosted form itself submits to checkout.stripe.com — allow it so
  // the Stripe SDK's internal <form action="..."> pattern is not blocked.
  "form-action 'self' https://checkout.stripe.com",

  // Frame ancestors: none (equivalent to X-Frame-Options DENY)
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  // Prevent clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // XSS filter (legacy browsers)
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // Control referrer information
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Restrict browser features
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  // Content Security Policy
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
  // Force HTTPS (2 years, include subdomains, preload-eligible)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["sweph"],
  outputFileTracingIncludes: {
    '/api/**': ['./data/ephe/**'],
  },

  // Tree-shake heavy barrel-import packages on a per-subpath basis.
  // Reduces initial JS by ~30-80 KB gzipped on routes using lucide icons,
  // framer-motion animations, or date-fns-tz helpers.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'date-fns-tz',
    ],
  },

  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

// Upload source maps to Sentry only when an auth token is provided.
// In open-source CI forks and local builds without the token we skip
// upload (prevents silent auth failures and speeds up local builds).
const shouldUploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default withSentryConfig(withNextIntl(nextConfig), {
  // ── Project identity ──────────────────────────────────────────────
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Silence CLI output unless running in CI
  silent: !process.env.CI,

  // ── Release tagging ───────────────────────────────────────────────
  // Tie every build to a specific commit so Sentry "Resolved in version"
  // and regression detection work. Vercel injects VERCEL_GIT_COMMIT_SHA
  // automatically in every deployment.
  release: {
    name: process.env.VERCEL_GIT_COMMIT_SHA,
  },

  // ── Source maps ───────────────────────────────────────────────────
  sourcemaps: {
    // Skip upload entirely when no auth token is configured. Without
    // this, withSentryConfig still attempts the upload and emits noisy
    // auth failures in local/preview builds that don't have the token.
    disable: !shouldUploadSourceMaps,

    // Default is `true` — source maps are removed from the public
    // bundle after upload, so attackers can't fetch `/_next/*.map` and
    // reconstruct our source. Kept explicit here for documentation.
    deleteSourcemapsAfterUpload: true,
  },

  // Include Next.js-internal code and dependencies when uploading
  // source maps so stack traces through vendor modules are readable.
  widenClientFileUpload: true,

  // Tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Tunnel Sentry requests through our own domain to bypass ad-blockers
  tunnelRoute: "/monitoring",
});
