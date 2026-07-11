'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * LandingAnimations — scroll-triggered entrance animations.
 *
 * Render-visible, animate-on-top (CRO audit LAND-2): the base state of every
 * `[data-animate]` element is VISIBLE. The hidden pre-animation state applies
 * only under `[data-anims-armed]`, which this component sets on its wrapper in
 * the same synchronous block that starts observing — so slow or failed JS
 * (Meta in-app browsers) always paints a fully readable page. The failure
 * mode is "no animation", never "no content".
 *
 * The hero section is exempt entirely: its elements carry no `[data-animate]`
 * (removed in page.tsx), so the above-fold is content at first paint, always.
 *
 * All animation CSS lives in the inline <style> below — globals.css has no
 * `[data-animate]` rules. No JS animation library needed; framer-motion is
 * used only inside HeroCalculator where interactivity demands it.
 */
export function LandingAnimations({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    if (typeof IntersectionObserver === 'undefined') {
      // No observer — leave everything in the visible base state.
      return;
    }

    const sections = root.querySelectorAll<HTMLElement>('[data-section]');

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

    // Arm the hidden state and observe in the same synchronous block — no
    // paint happens between these lines, and anything throwing BEFORE the
    // setAttribute leaves the page fully visible.
    root.setAttribute('data-anims-armed', 'true');
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Animation styles injected via a <style> tag so they live near the usage */}
      <style>{`
        /* Transition is always declared; the hidden state is opt-in via JS */
        [data-section] [data-animate] {
          transition-property: opacity, transform;
          transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
          transition-duration: 0.6s;
        }

        /* Hidden pre-animation state — ONLY when armed and not yet revealed.
           Never widen this beyond [data-anims-armed]: base state must stay
           visible so slow-JS browsers get content, not a blank fold. */
        [data-anims-armed] [data-section]:not([data-visible="true"]) [data-animate] {
          opacity: 0;
          transform: translateY(20px);
        }
        [data-anims-armed] [data-section]:not([data-visible="true"]) [data-animate="fade-down"] {
          transform: translateY(-12px);
        }

        /* Staggered delays by animate index */
        [data-section] [data-animate="fade-down"] { transition-delay: 0ms; }
        [data-section] [data-animate="fade-up-0"] { transition-delay: 0ms;   }
        [data-section] [data-animate="fade-up-1"] { transition-delay: 80ms;  }
        [data-section] [data-animate="fade-up-2"] { transition-delay: 160ms; }
        [data-section] [data-animate="fade-up-3"] { transition-delay: 240ms; }
        [data-section] [data-animate="fade-up-4"] { transition-delay: 340ms; }

        /* Respect prefers-reduced-motion — show content instantly, no animation */
        @media (prefers-reduced-motion: reduce) {
          [data-section] [data-animate] {
            transition-duration: 0.01ms !important;
            transform: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* Belt-and-braces: with JS disabled the armed attribute is never set,
          so the base state is already visible — kept as an explicit escape. */}
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
