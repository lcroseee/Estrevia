import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// ---------------------------------------------------------------------------
// Security Headers
// ---------------------------------------------------------------------------
const ContentSecurityPolicy = [
  // Default: block everything not explicitly allowed
  "default-src 'self'",

  // Scripts: self + Next.js inline scripts + Clerk + Stripe + PostHog + Sentry + Vercel
  // 'unsafe-eval' is required in dev mode only (React debugging callstacks)
  `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''} https://js.stripe.com https://*.clerk.accounts.dev https://*.posthog.com https://eu.posthog.com https://*.sentry.io https://vercel.live https://*.vercel-scripts.com`,

  // Styles: self + unsafe-inline (required by shadcn/ui) + Google Fonts
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

  // Images: self + data URIs + blob URIs (OG image generation) + Stripe + Clerk + Vercel
  "img-src 'self' data: blob: https://*.stripe.com https://img.clerk.com https://*.clerk.com",

  // Fonts: self + Google Fonts static host
  "font-src 'self' https://fonts.gstatic.com",

  // Connect (XHR/fetch/WebSocket): self + API services
  "connect-src 'self' https://api.clerk.com https://*.clerk.accounts.dev https://*.posthog.com https://eu.posthog.com https://eu.i.posthog.com https://*.ingest.sentry.io https://*.sentry.io https://api.stripe.com https://vitals.vercel-insights.com https://vercel.live wss://vercel.live",

  // Frames: only Stripe and Clerk (for 3D Secure / auth modals)
  "frame-src https://js.stripe.com https://*.stripe.com https://*.clerk.accounts.dev https://vercel.live",

  // Workers: self + blob (Next.js service worker / PWA)
  "worker-src 'self' blob:",

  // Object/embed: none
  "object-src 'none'",

  // Base URI: self only
  "base-uri 'self'",

  // Form actions: self only
  "form-action 'self'",

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

export default withSentryConfig(withNextIntl(nextConfig), {
  // Sentry webpack plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Upload source maps only in CI / production builds
  silent: !process.env.CI,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Tunnel Sentry requests through our own domain to bypass ad-blockers
  tunnelRoute: "/monitoring",

});
