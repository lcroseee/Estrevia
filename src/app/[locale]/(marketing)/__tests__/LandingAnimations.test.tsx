// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { LandingAnimations } from '../LandingAnimations';

function Fixture() {
  return (
    <section data-section="stats">
      <p data-animate="fade-up-0">stat copy</p>
    </section>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LandingAnimations — render-visible, animate-on-top (LAND-2)', () => {
  it('arms the hidden state only when IntersectionObserver exists, then reveals sections', () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        private cb: IntersectionObserverCallback;
        constructor(cb: IntersectionObserverCallback) {
          this.cb = cb;
        }
        observe(target: Element) {
          observed.push(target);
          this.cb(
            [{ isIntersecting: true, target } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }
        unobserve() {}
        disconnect() {}
      },
    );
    const { container } = render(
      <LandingAnimations>
        <Fixture />
      </LandingAnimations>,
    );
    expect(container.querySelector('[data-anims-armed]')).not.toBeNull();
    const section = container.querySelector('[data-section="stats"]');
    expect(section?.getAttribute('data-visible')).toBe('true');
    expect(observed).toHaveLength(1);
  });

  it('never arms when IntersectionObserver is unavailable — page stays in visible base state', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(
      <LandingAnimations>
        <Fixture />
      </LandingAnimations>,
    );
    expect(container.querySelector('[data-anims-armed]')).toBeNull();
  });

  it('injected CSS hides content ONLY under [data-anims-armed] (base state is visible)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(
      <LandingAnimations>
        <Fixture />
      </LandingAnimations>,
    );
    const css = Array.from(container.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    // The old base-hidden rule must be gone… (match a HIDDEN value only:
    // the new base block declares `transition-property: opacity, transform`
    // and the reduced-motion/noscript blocks set `opacity: 1 !important` —
    // none of those may trip this assertion.)
    expect(css).not.toMatch(/\[data-section\] \[data-animate\]\s*\{[^}]*opacity:\s*0/);
    // …and every rule block that sets opacity: 0 must be armed-scoped.
    const hiddenRules = css
      .split('}')
      .filter((rule) => /opacity:\s*0[;\s]/.test(rule));
    expect(hiddenRules.length).toBeGreaterThan(0);
    for (const rule of hiddenRules) {
      expect(rule).toContain('[data-anims-armed]');
    }
  });
});
