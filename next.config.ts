import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sweph"],
};

export default withSentryConfig(nextConfig, {
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
