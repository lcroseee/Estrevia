import { describe, it, expect } from 'vitest';
import en from '../../../../messages/en.json';
import es from '../../../../messages/es.json';
import { AnalyticsEvent } from '@/shared/lib/analytics';
import type { PaywallTrigger } from '../paywall';

describe('portrait i18n', () => {
  const enPortrait = (en as Record<string, any>).avatar?.portrait;
  const esPortrait = (es as Record<string, any>).avatar?.portrait;

  it('exists in both locales', () => {
    expect(enPortrait).toBeTruthy();
    expect(esPortrait).toBeTruthy();
  });

  it('has identical key sets across locales', () => {
    expect(Object.keys(enPortrait).sort()).toEqual(Object.keys(esPortrait).sort());
  });

  it('covers every rejection reason the route can return', () => {
    for (const reason of ['no_face', 'multiple_faces', 'likely_minor', 'nsfw', 'not_a_photo', 'low_quality']) {
      expect(enPortrait.reasons[reason]).toBeTruthy();
      expect(esPortrait.reasons[reason]).toBeTruthy();
    }
  });

  it('covers every presentation option', () => {
    for (const p of ['auto', 'feminine', 'masculine', 'androgynous']) {
      expect(enPortrait.presentations[p]).toBeTruthy();
      expect(esPortrait.presentations[p]).toBeTruthy();
    }
  });

  it('uses the tú register in Spanish, not usted', () => {
    const blob = JSON.stringify(esPortrait);
    expect(blob).not.toMatch(/\busted\b/i);
  });

  it('states plainly in both locales that the photo is not stored', () => {
    expect(enPortrait.privacyNote).toMatch(/not stored|never stored/i);
    expect(esPortrait.privacyNote).toMatch(/no se guarda|no se almacena/i);
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
    expect((en as Record<string, any>).paywall.contextualTitles.avatarPortrait).toBeTruthy();
    expect((es as Record<string, any>).paywall.contextualTitles.avatarPortrait).toBeTruthy();
  });
});
