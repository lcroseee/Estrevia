'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * LandingAnimations — scroll-triggered entrance animations.
 *
 * Uses IntersectionObserver to add a `data-visible` attribute to each
 * `[data-section]` container. Children with `[data-animate]` are targeted
 * via CSS transitions defined in globals.css.
 *
 * No JS animation library needed for this simple sequential reveal.
 * framer-motion is used only inside HeroCalculator where interactivity demands it.
 */
export function LandingAnimations({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const sections = root.querySelectorAll<HTMLElement>('[data-section]');

    if (typeof IntersectionObserver === 'undefined') {
      // SSR/no-JS fallback — show everything
      sections.forEach((el) => el.setAttribute('data-visible', 'true'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-visible', 'true');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -48px 0px' }
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Animation styles injected via a <style> tag so they live near the usage */}
      <style>{`
        /* Base state — hidden before intersection */
        [data-section] [data-animate] {
          opacity: 0;
          transform: translateY(20px);
          transition-property: opacity, transform;
          transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
          transition-duration: 0.6s;
        }

        /* Staggered delays by animate index */
        [data-section] [data-animate="fade-down"] {
          transform: translateY(-12px);
          transition-delay: 0ms;
        }
        [data-section] [data-animate="fade-up-0"] { transition-delay: 0ms;   }
        [data-section] [data-animate="fade-up-1"] { transition-delay: 80ms;  }
        [data-section] [data-animate="fade-up-2"] { transition-delay: 160ms; }
        [data-section] [data-animate="fade-up-3"] { transition-delay: 240ms; }
        [data-section] [data-animate="fade-up-4"] { transition-delay: 340ms; }

        /* Visible state — triggered by JS adding data-visible="true" */
        [data-section][data-visible="true"] [data-animate] {
          opacity: 1;
          transform: translateY(0);
        }

        /* Hero is visible on load (no scroll needed) */
        [data-section="hero"] [data-animate] {
          opacity: 0;
          transform: translateY(20px);
        }
        [data-section="hero"][data-visible="true"] [data-animate="fade-down"] {
          transition-delay: 50ms;
        }
        [data-section="hero"][data-visible="true"] [data-animate="fade-up-1"] {
          transition-delay: 120ms;
        }
        [data-section="hero"][data-visible="true"] [data-animate="fade-up-2"] {
          transition-delay: 220ms;
        }
        [data-section="hero"][data-visible="true"] [data-animate="fade-up-3"] {
          transition-delay: 340ms;
        }
        [data-section="hero"][data-visible="true"] [data-animate="fade-up-4"] {
          transition-delay: 460ms;
        }

        /* Respect prefers-reduced-motion — show content instantly, no animation */
        @media (prefers-reduced-motion: reduce) {
          [data-section] [data-animate] {
            transition-duration: 0.01ms !important;
            transform: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* Fallback: if JS is disabled, IntersectionObserver never runs — show all content */}
      <noscript>
        <style>{`
          [data-section] [data-animate] {
            opacity: 1 !important;
            transform: none !important;
          }
        `}</style>
      </noscript>

      <div ref={ref}>{children}</div>
    </>
  );
}
