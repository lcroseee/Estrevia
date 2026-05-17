import type { Metadata } from "next";
import { Geist, Geist_Mono, Crimson_Pro } from "next/font/google";
import { getLocale, getTranslations } from "next-intl/server";
import { PostHogProvider } from "@/shared/components/PostHogProvider";
import { CookieConsent } from "@/shared/components/CookieConsent";
import { SITE_URL } from "@/shared/seo/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Crimson Pro — esoteric headings, body text in essays
const crimsonPro = Crimson_Pro({
  variable: "--font-crimson-pro",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Estrevia — Sidereal Astrology",
  description:
    "Calculate your natal chart in sidereal astrology. Discover your true zodiac sign.",
  openGraph: {
    siteName: "Estrevia",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  other: {
    // PWA manifest link is handled via Next.js metadata.manifest below,
    // but we keep a manual link for legacy browser support.
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Estrevia",
    "theme-color": "#0A0A0F",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const tAppShell = await getTranslations('appShell');

  return (
    // ClerkProvider is intentionally NOT here — it is scoped to (app)/ layout
    // and sign-in/sign-up route layouts to avoid loading Clerk's ~324 KB bundle
    // on marketing pages. See src/app/[locale]/(app)/layout.tsx.
    <html lang={locale} className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        {/* Preconnect to third-party origins to reduce LCP */}
        <link rel="preconnect" href="https://cdn.clerk.com" />
        {/* PostHog host is us.i.posthog.com — must match PostHogProvider and CSP connect-src */}
        <link rel="preconnect" href="https://us.i.posthog.com" />
        <link rel="dns-prefetch" href="https://cdn.clerk.com" />
        <link rel="dns-prefetch" href="https://us.i.posthog.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${crimsonPro.variable} antialiased bg-[#0A0A0F] text-white min-h-screen`}
      >
        {/* WCAG 2.4.1 — skip navigation link, visible on focus */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-[#0A0A0F] focus:font-medium focus:text-sm"
        >
          {tAppShell('skipToContent')}
        </a>
        <PostHogProvider>
          {children}
          <CookieConsent />
        </PostHogProvider>
      </body>
    </html>
  );
}
