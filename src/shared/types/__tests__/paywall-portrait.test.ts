import { describe, it, expect } from 'vitest';
import en from '../../../../messages/en.json';
import es from '../../../../messages/es.json';
import { AnalyticsEvent } from '@/shared/lib/analytics';
import type { PaywallTrigger } from '../paywall';

// Minimal structural type covering only what this file reads from the
// messages JSON — narrower than the real message schema on purpose.
interface MessagesShape {
  avatar?: {
    portrait?: {
      privacyNote: string;
      reasons: Record<string, string>;
      presentations: Record<string, string>;
      [key: string]: unknown;
    };
  };
  paywall: {
    contextualTitles: {
      avatarPortrait: string;
      [key: string]: unknown;
    };
  };
}

describe('portrait i18n', () => {
  const enPortrait = (en as unknown as MessagesShape).avatar?.portrait;
  const esPortrait = (es as unknown as MessagesShape).avatar?.portrait;

  it('exists in both locales', () => {
    expect(enPortrait).toBeTruthy();
    expect(esPortrait).toBeTruthy();
  });

  it('has identical key sets across locales', () => {
    expect(Object.keys(enPortrait!).sort()).toEqual(Object.keys(esPortrait!).sort());
  });

  it('covers every rejection reason the route can return', () => {
    for (const reason of ['no_face', 'multiple_faces', 'likely_minor', 'nsfw', 'not_a_photo', 'low_quality']) {
      expect(enPortrait!.reasons[reason]).toBeTruthy();
      expect(esPortrait!.reasons[reason]).toBeTruthy();
    }
  });

  it('covers every presentation option', () => {
    for (const p of ['auto', 'feminine', 'masculine', 'androgynous']) {
      expect(enPortrait!.presentations[p]).toBeTruthy();
      expect(esPortrait!.presentations[p]).toBeTruthy();
    }
  });

  it('uses the tú register in Spanish, not usted', () => {
    const blob = JSON.stringify(esPortrait);
    expect(blob).not.toMatch(/\busted\b/i);
  });

  it('states plainly in both locales that the photo is not stored', () => {
    expect(enPortrait!.privacyNote).toMatch(/not stored|never stored/i);
    expect(esPortrait!.privacyNote).toMatch(/no se guarda|no se almacena/i);
  });
});

describe('portrait analytics + paywall', () => {
  it('registers the four portrait events', () => {
    expect(AnalyticsEvent.AVATAR_PORTRAIT_UPLOADED).toBe('avatar_portrait_uploaded');
    expect(AnalyticsEvent.AVATAR_PORTRAIT_GENERATED).toBe('avatar_portrait_generated');
    expect(AnalyticsEvent.AVATAR_PORTRAIT_REJECTED).toBe('avatar_portrait_rejected');
    expect(AnalyticsEvent.AVATAR_PORTRAIT_SHARED).toBe('avatar_portrait_shared');
  });

  it('accepts avatar-portrait as a paywall trigger', () => {
    const t: PaywallTrigger = 'avatar-portrait';
    expect(t).toBe('avatar-portrait');
  });

  it('has contextual paywall copy for the trigger in both locales', () => {
    expect((en as unknown as MessagesShape).paywall.contextualTitles.avatarPortrait).toBeTruthy();
    expect((es as unknown as MessagesShape).paywall.contextualTitles.avatarPortrait).toBeTruthy();
  });
});

// Every non-generic PaywallTrigger must have BOTH a contextual title and a
// CTA subline in both locales — PaywallCta.tsx renders both unconditionally
// (unlike PaywallModal, which guards its headline with `t.has()`), so a
// missing key renders the raw i18n key as visible copy. See DEFECT 1,
// review round 1 of Task 13: 'avatar-portrait' shipped with a title but no
// subline, and 'essay' turned out to have the same pre-existing gap.
type NonGenericTrigger = Exclude<PaywallTrigger, 'generic'>;

// Exhaustiveness guard: this object literal's type is `Record<NonGenericTrigger, true>`.
// TypeScript requires every key of that Record type to be present in the
// literal — a missing key is a compile error ("Property '...' is missing")
// and an unrecognised key is a compile error too (excess property check).
// So if PaywallTrigger gains a member that isn't added as a key here (and
// isn't 'generic'), `npm run typecheck` fails on THIS line, not silently.
//
// This only works because the object is a literal assigned directly to a
// `Record<...>`-typed const — unlike the previous array-based version,
// which annotated `NON_GENERIC_TRIGGERS: NonGenericTrigger[]` and derived
// the "keys" back via `(typeof NON_GENERIC_TRIGGERS)[number]`. That round
// trip re-widens straight back to `NonGenericTrigger` regardless of what
// the array actually contained, making the old guard a tautology that
// could never fail. See I5 in fix-wave-D-report.md.
const NON_GENERIC_TRIGGERS_MAP: Record<NonGenericTrigger, true> = {
  essay: true,
  'celtic-cross': true,
  'three-card': true,
  'synastry-ai': true,
  'natal-chart': true,
  'avatar-portrait': true,
};

const NON_GENERIC_TRIGGERS = Object.keys(NON_GENERIC_TRIGGERS_MAP) as NonGenericTrigger[];

// Mirrors PaywallCta.tsx's (unexported) triggerToKey verbatim so this test
// exercises the same kebab-to-camel transform the component uses.
function triggerToKey(trigger: PaywallTrigger): string {
  return trigger
    .split('-')
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

interface PaywallMessagesShape {
  contextualTitles: Record<string, string>;
  cta: { subline: Record<string, string> };
}

describe('paywall trigger copy invariant (every trigger has title + subline)', () => {
  const enPaywall = (en as unknown as { paywall: PaywallMessagesShape }).paywall;
  const esPaywall = (es as unknown as { paywall: PaywallMessagesShape }).paywall;

  it.each(NON_GENERIC_TRIGGERS)(
    'has a non-empty contextualTitle and cta.subline for trigger "%s" in both locales',
    (trigger) => {
      const key = triggerToKey(trigger);
      expect(enPaywall.contextualTitles[key]).toBeTruthy();
      expect(esPaywall.contextualTitles[key]).toBeTruthy();
      expect(enPaywall.cta.subline[key]).toBeTruthy();
      expect(esPaywall.cta.subline[key]).toBeTruthy();
    },
  );
});
