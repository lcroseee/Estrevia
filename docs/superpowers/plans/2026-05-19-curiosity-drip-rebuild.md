# Curiosity-Driven Lead Drip Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add T+1h curiosity-hook email and rewrite T+0 / T+24h drip stages to surface paywall earlier, closing the "lead → paywall = 14%" gap from 2026-05-19 audit.

**Architecture:** Single new email template + helper function for "dominant planet" picker. Cron route refactored from `if/else` chain to table-driven step dispatch. Step state machine renumbered from 0..6 to 0..7 with a one-time data migration. All driving to `/chart?chartId=X` so users land on the existing `ChartReadingSection` paywall surface.

**Tech Stack:** TypeScript / Next.js 16 / Drizzle ORM / Resend / @react-email/components / Vitest.

**Spec:** [`docs/superpowers/specs/2026-05-19-curiosity-drip-rebuild-design.md`](../specs/2026-05-19-curiosity-drip-rebuild-design.md)

---

## Pre-flight reading (for whoever picks this up)

Before starting Task 1, read:

1. The spec (link above) — design decisions and rationale
2. `src/shared/lib/email.ts:310-326` — `pickKeySigns` helper (existing pattern to mirror)
3. `src/shared/lib/email.ts:328-385` — `sendLeadChartEmail` (existing T+0 send function)
4. `src/shared/types/astrology.ts:1-129` — `Planet` enum, `Sign` enum, `PlanetPosition`, `ChartResult`
5. `src/emails/LeadChartEmail.tsx` — existing email component, inline STRINGS pattern (NOT next-intl)
6. `src/app/api/cron/lead-nurture/route.ts:80-256` — current cron with `if/else` step dispatch
7. `src/shared/lib/__tests__/email-lead.test.ts:1-100` — existing test pattern, mocked Resend, mocked tryInsertMock
8. `drizzle/0011_groovy_wilson_fisk.sql` — created `sent_lead_emails` table and partial index

**Key conventions in this codebase:**

- Email components use inline `STRINGS = { en: {...}, es: {...} }` objects in the TSX file (NOT messages/*.json). Why: emails render server-side via React Email, outside next-intl context.
- All Resend errors must `throw` so the cron never falsely advances `nurture_step` (regression fixed in commit `c94316f` per memory `project_lead_nurture_drip_fully_live`).
- Test fixtures: `sampleChart` cast as `never` to satisfy TypeScript without full `ChartResult` mock — pattern visible in existing `email-lead.test.ts`.
- Sentry tags: every new email send function should tag `component:<email-type>` so prod errors are filterable.

---

## File Structure

### Files to create

| Path | Purpose |
|---|---|
| `drizzle/0013_curiosity_hook_renumber.sql` | DDL: enum addition + data renumber + partial index update |
| `src/emails/LeadCuriosityHookEmail.tsx` | New React Email component for T+1h |
| `src/emails/__tests__/LeadCuriosityHookEmail.test.tsx` | Snapshot tests per locale × per planet |
| `src/shared/lib/__tests__/pickDominantPlanet.test.ts` | Unit tests for the planet-picker rule |
| `src/shared/lib/__tests__/email-curiosity-hook.test.ts` | Send-function tests (mocked Resend) |
| `src/app/api/cron/lead-nurture/__tests__/dispatch.test.ts` | Step dispatch table integration tests |

### Files to modify

| Path | Change |
|---|---|
| `src/shared/lib/schema.ts` | Add `'lead_curiosity_hook'` to `sentLeadEmails.emailType` enum |
| `src/shared/lib/email.ts` | Add `pickDominantPlanet()` helper + `sendLeadCuriosityHookEmail()`; rewrite `sendLeadChartEmail`; rewrite `sendLeadMoonAscEmail` CTA |
| `src/emails/LeadChartEmail.tsx` | Rewrite to cliffhanger structure (withhold moon/asc, name dominant planet) |
| `src/emails/LeadMoonAscEmail.tsx` | Rewrite copy to AI-reading teaser; change CTA destination to `/chart?chartId=X` |
| `src/app/api/cron/lead-nurture/route.ts` | Refactor `if/else` dispatch to table-driven; renumber step bounds (`< 6` → `< 7`) |
| `src/shared/lib/__tests__/email-lead.test.ts` | Update T+0 and T+24h assertions for new copy |

### Files NOT touched (per spec)

- `src/emails/LeadPaywallTeaserEmail.tsx` — T+72h, unchanged
- `src/emails/SaturnWeeklyEmail.tsx` — T+7d, unchanged
- `src/emails/MiniReadingEmail.tsx` — T+14d, unchanged
- `src/emails/SynastryTeaserEmail.tsx` — T+21d, unchanged
- `src/app/api/v1/stripe/checkout/route.ts` — Stripe locale fix is separate spec
- `messages/*.json` — email copy is in TSX components per repo convention

---

## Task 1: Migration SQL file (commit only, NOT applied)

**Files:**
- Create: `drizzle/0013_curiosity_hook_renumber.sql`

**Context for engineer:** This task ONLY adds the migration file to git. Founder applies it manually in production via `npm run db:migrate` immediately before pushing the code commits from later tasks. Do NOT run the migration locally without coordinating with founder.

- [ ] **Step 1: Create migration SQL file with exact content**

Create `drizzle/0013_curiosity_hook_renumber.sql`:

```sql
-- Curiosity-hook rebuild: renumber nurture_step + update partial index.
-- Applied via `npm run db:migrate` after coordination with founder.

-- 1. Renumber existing leads: shift steps 1..6 by +1.
--    Step=0 stays 0 (initial state unchanged).
--    Step=1 (T+0 sent, waiting T+24h) → step=2 (T+1h sent, waiting T+24h).
--      Existing pre-deploy leads skip T+1h intentionally — no back-fill.
--    All other steps shift +1 to preserve semantic state in the new schema.
--    nurture_next_at is NOT modified — existing timestamps remain valid.
UPDATE email_leads
SET nurture_step = nurture_step + 1
WHERE nurture_step BETWEEN 1 AND 6;

-- 2. Drop old partial index and recreate with new step bound.
--    OLD covered steps 0,1,2 (early high-frequency drip pre-rebuild).
--    NEW covers steps 0,1,2,3 (T+0, T+1h, T+24h, T+72h — early window).
DROP INDEX IF EXISTS "email_leads_nurture_due_idx";

CREATE INDEX "email_leads_nurture_due_idx"
  ON "email_leads" USING btree ("nurture_next_at")
  WHERE nurture_step < 4 AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL AND email_undeliverable = false;

-- Note: sent_lead_emails.email_type column has no SQL CHECK constraint —
-- the enum lives at TypeScript level in schema.ts. No ALTER TABLE needed
-- to accept the new 'lead_curiosity_hook' value (text column accepts any).
```

- [ ] **Step 2: Verify file is well-formed SQL**

Run: `cat drizzle/0013_curiosity_hook_renumber.sql | grep -c ';'`
Expected: at least 3 (UPDATE, DROP INDEX, CREATE INDEX)

- [ ] **Step 3: Commit the migration file alone**

```bash
git add drizzle/0013_curiosity_hook_renumber.sql
git commit -m "$(cat <<'EOF'
feat(curiosity-drip/T1): migration 0013 — renumber nurture_step + update partial index

Renumbers existing 167+ leads by +1 to make room for new step=1 (T+1h
curiosity hook). Updates partial index from `nurture_step < 3` to `< 4`
to cover the new early-drip window. Apply via `npm run db:migrate`
BEFORE deploying the code commits that follow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `pickDominantPlanet` helper (TDD)

**Files:**
- Create: `src/shared/lib/__tests__/pickDominantPlanet.test.ts`
- Modify: `src/shared/lib/email.ts` (add export at top alongside `pickKeySigns`)

**Context:** Deterministic picker that returns one of Saturn / Mars / Venus / Mercury based on essential dignity rules in the chart. Used by both `sendLeadCuriosityHookEmail` (full reveal) and the rewritten `sendLeadChartEmail` (one-word tease). Mirror existing `pickKeySigns` signature pattern: take `ChartResult | null`, return graceful fallback.

- [ ] **Step 1: Write failing test file**

Create `src/shared/lib/__tests__/pickDominantPlanet.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickDominantPlanet } from '../email';
import { Planet, Sign } from '@/shared/types';
import type { ChartResult } from '@/shared/types';

function makeChart(planets: Array<{ planet: Planet; sign: Sign }>): ChartResult {
  return {
    planets: planets.map((p) => ({
      planet: p.planet,
      absoluteDegree: 0,
      tropicalDegree: 0,
      sign: p.sign,
      signDegree: 0,
      minutes: 0,
      seconds: 0,
      isRetrograde: false,
      speed: 0,
      house: null,
    })),
    houses: null,
    aspects: [],
    ascendant: null,
    midheaven: null,
    ayanamsa: 0,
    system: 'sidereal',
    houseSystem: 'Placidus' as never,
    nodeType: 'mean',
    calculatedAt: '2026-05-19T00:00:00Z',
  };
}

describe('pickDominantPlanet', () => {
  it('returns Mercury/Gemini fallback for null chart', () => {
    expect(pickDominantPlanet(null)).toEqual({ planet: 'Mercury', signName: 'Gemini' });
  });

  it('picks Saturn when Saturn is in Capricorn (essential dignity)', () => {
    const chart = makeChart([{ planet: Planet.Saturn, sign: Sign.Capricorn }]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Saturn', signName: 'Capricorn' });
  });

  it('picks Saturn when Saturn is in Aquarius', () => {
    const chart = makeChart([{ planet: Planet.Saturn, sign: Sign.Aquarius }]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Saturn', signName: 'Aquarius' });
  });

  it('picks Mars when Mars is in Aries and Saturn rule does not apply', () => {
    const chart = makeChart([
      { planet: Planet.Saturn, sign: Sign.Cancer },
      { planet: Planet.Mars, sign: Sign.Aries },
    ]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Mars', signName: 'Aries' });
  });

  it('picks Mars when Mars is in Scorpio', () => {
    const chart = makeChart([{ planet: Planet.Mars, sign: Sign.Scorpio }]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Mars', signName: 'Scorpio' });
  });

  it('picks Venus when Venus is in Taurus and Saturn/Mars rules do not apply', () => {
    const chart = makeChart([
      { planet: Planet.Saturn, sign: Sign.Cancer },
      { planet: Planet.Mars, sign: Sign.Cancer },
      { planet: Planet.Venus, sign: Sign.Taurus },
    ]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Venus', signName: 'Taurus' });
  });

  it('picks Venus when Venus is in Libra', () => {
    const chart = makeChart([{ planet: Planet.Venus, sign: Sign.Libra }]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Venus', signName: 'Libra' });
  });

  it('falls back to Mercury with actual Mercury sign when no dignity rule matches', () => {
    const chart = makeChart([
      { planet: Planet.Saturn, sign: Sign.Cancer },
      { planet: Planet.Mars, sign: Sign.Cancer },
      { planet: Planet.Venus, sign: Sign.Cancer },
      { planet: Planet.Mercury, sign: Sign.Sagittarius },
    ]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Mercury', signName: 'Sagittarius' });
  });

  it('falls back to Mercury/Gemini when chart has no Mercury position', () => {
    const chart = makeChart([{ planet: Planet.Sun, sign: Sign.Leo }]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Mercury', signName: 'Gemini' });
  });

  it('handles empty planets array', () => {
    const chart = makeChart([]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Mercury', signName: 'Gemini' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail with "pickDominantPlanet is not exported"**

Run: `npx vitest run src/shared/lib/__tests__/pickDominantPlanet.test.ts`
Expected: 10 failures with import error / undefined.

- [ ] **Step 3: Add `pickDominantPlanet` helper to `src/shared/lib/email.ts`**

Locate the existing `pickKeySigns` function around line 311. Add this **immediately after it** (before line 328's `sendLeadChartEmail`):

```ts
// ---------------------------------------------------------------------------
// pickDominantPlanet — selects one of Saturn/Mars/Venus/Mercury based on
// essential-dignity rules. Used in T+1h curiosity-hook email and as a tease
// hint in the T+0 chart email. Deterministic, no LLM, <1ms.
// ---------------------------------------------------------------------------
export function pickDominantPlanet(chart: ChartResult | null): {
  planet: 'Saturn' | 'Mars' | 'Venus' | 'Mercury';
  signName: string;
} {
  if (!chart) return { planet: 'Mercury', signName: 'Gemini' };

  const find = (p: Planet) => chart.planets.find((row) => row.planet === p);
  const saturn = find(Planet.Saturn);
  const mars = find(Planet.Mars);
  const venus = find(Planet.Venus);
  const mercury = find(Planet.Mercury);

  // Rule 1: Saturn in Capricorn or Aquarius (sidereal essential dignity)
  if (saturn && (saturn.sign === 'Capricorn' || saturn.sign === 'Aquarius')) {
    return { planet: 'Saturn', signName: saturn.sign };
  }
  // Rule 2: Mars in Aries or Scorpio (domicile)
  if (mars && (mars.sign === 'Aries' || mars.sign === 'Scorpio')) {
    return { planet: 'Mars', signName: mars.sign };
  }
  // Rule 3: Venus in Taurus or Libra (domicile)
  if (venus && (venus.sign === 'Taurus' || venus.sign === 'Libra')) {
    return { planet: 'Venus', signName: venus.sign };
  }
  // Rule 4: fallback to Mercury (messenger angle works generically)
  return {
    planet: 'Mercury',
    signName: mercury?.sign ?? 'Gemini',
  };
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/shared/lib/__tests__/pickDominantPlanet.test.ts`
Expected: 10 passing.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/email.ts src/shared/lib/__tests__/pickDominantPlanet.test.ts
git commit -m "$(cat <<'EOF'
feat(curiosity-drip/T2): pickDominantPlanet helper

Deterministic planet picker for curiosity-hook copy. Saturn (Cap/Aqua) >
Mars (Aries/Scorpio) > Venus (Taurus/Libra) > Mercury fallback. 10 unit
tests covering all rules + null/empty chart fallbacks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `LeadCuriosityHookEmail` React Email component

**Files:**
- Create: `src/emails/LeadCuriosityHookEmail.tsx`
- Create: `src/emails/__tests__/LeadCuriosityHookEmail.test.tsx`

**Context:** Mirror existing pattern from `src/emails/LeadChartEmail.tsx`: default-export function component, inline `STRINGS = { en, es }` objects, use `EmailLayout` + `Button` from `./components/`. Reading is sign-level: each `(planet, sign)` combo has its own one-line interpretation. Per spec, copy is **founder-quality short-form astrology prose** — refer to `content/` essays for tone if needed.

- [ ] **Step 1: Write failing component test**

Create `src/emails/__tests__/LeadCuriosityHookEmail.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import LeadCuriosityHookEmail from '../LeadCuriosityHookEmail';

describe('LeadCuriosityHookEmail', () => {
  const baseProps = {
    chartUrl: 'https://estrevia.app/chart?chartId=abc&utm_source=lead-nurture&utm_campaign=t1h',
  };

  it('renders Saturn-Capricorn reveal in EN', async () => {
    const html = await render(
      <LeadCuriosityHookEmail
        locale="en"
        planet="Saturn"
        signName="Capricorn"
        {...baseProps}
      />,
    );
    expect(html).toContain('Saturn');
    expect(html).toContain('Capricorn');
    expect(html).toContain(baseProps.chartUrl);
    expect(html).toContain('Unlock');
  });

  it('renders Mars-Aries reveal in ES', async () => {
    const html = await render(
      <LeadCuriosityHookEmail
        locale="es"
        planet="Mars"
        signName="Aries"
        {...baseProps}
      />,
    );
    expect(html).toContain('Marte');
    expect(html).toContain('Aries');
    expect(html).toContain(baseProps.chartUrl);
    expect(html).toContain('Desbloquea');
  });

  it('renders Mercury fallback when planet/sign combo is unmapped', async () => {
    const html = await render(
      <LeadCuriosityHookEmail
        locale="en"
        planet="Mercury"
        signName="Gemini"
        {...baseProps}
      />,
    );
    expect(html).toContain('Mercury');
    expect(html).toContain('Gemini');
  });

  it('includes 3-day free trial soft mention in footer (EN)', async () => {
    const html = await render(
      <LeadCuriosityHookEmail
        locale="en"
        planet="Venus"
        signName="Libra"
        {...baseProps}
      />,
    );
    expect(html.toLowerCase()).toContain('3-day');
    expect(html.toLowerCase()).toContain('trial');
  });

  it('includes 3-day trial soft mention in ES', async () => {
    const html = await render(
      <LeadCuriosityHookEmail
        locale="es"
        planet="Venus"
        signName="Libra"
        {...baseProps}
      />,
    );
    expect(html.toLowerCase()).toContain('3');
    expect(html.toLowerCase()).toContain('prueba');
  });

  it('renders plain text version cleanly', async () => {
    const text = await render(
      <LeadCuriosityHookEmail
        locale="en"
        planet="Saturn"
        signName="Aquarius"
        {...baseProps}
      />,
      { plainText: true },
    );
    expect(text).toContain('Saturn');
    expect(text).toContain('Aquarius');
    expect(text).toContain(baseProps.chartUrl);
    expect(text).not.toContain('<');  // no HTML tags
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/emails/__tests__/LeadCuriosityHookEmail.test.tsx`
Expected: 6 failures with "Cannot find module".

- [ ] **Step 3: Create the email component**

Create `src/emails/LeadCuriosityHookEmail.tsx`:

```tsx
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  planet: 'Saturn' | 'Mars' | 'Venus' | 'Mercury';
  signName: string;
  chartUrl: string;
}

// Sign-level interpretations per planet (12 signs × 4 planets × 2 locales = 96 keys).
// Copy intentionally short (1 line) — full depth lives behind the paywall.
// Fallback: if sign not in map, generic copy is used.
const REVEAL_EN: Record<string, Record<string, string>> = {
  Saturn: {
    Capricorn: 'Saturn in Capricorn — discipline as your spine.',
    Aquarius: 'Saturn in Aquarius — your future arrives ahead of you.',
    Aries: 'Saturn in Aries — patience forged through impatience.',
    Taurus: 'Saturn in Taurus — slow weight that becomes foundation.',
    Gemini: 'Saturn in Gemini — your mind sharpened by limit.',
    Cancer: 'Saturn in Cancer — walls around water.',
    Leo: 'Saturn in Leo — authority you have to earn twice.',
    Virgo: 'Saturn in Virgo — perfectionism as protection.',
    Libra: 'Saturn in Libra — fairness as a discipline, not a feeling.',
    Scorpio: 'Saturn in Scorpio — depth that survives what burns.',
    Sagittarius: 'Saturn in Sagittarius — belief tested into wisdom.',
    Pisces: 'Saturn in Pisces — structure built on dreams.',
  },
  Mars: {
    Aries: 'Mars in Aries — pure ignition, no hesitation.',
    Scorpio: 'Mars in Scorpio — fury that holds its shape.',
    Taurus: 'Mars in Taurus — force you can lean on.',
    Gemini: 'Mars in Gemini — argument as armor.',
    Cancer: 'Mars in Cancer — protectiveness as warfare.',
    Leo: 'Mars in Leo — pride that wields you.',
    Virgo: 'Mars in Virgo — precision under heat.',
    Libra: 'Mars in Libra — diplomacy as a weapon.',
    Sagittarius: 'Mars in Sagittarius — conviction as motor.',
    Capricorn: 'Mars in Capricorn — patience that wins.',
    Aquarius: 'Mars in Aquarius — rebellion with a blueprint.',
    Pisces: 'Mars in Pisces — current you have to swim with.',
  },
  Venus: {
    Taurus: 'Venus in Taurus — beauty made tangible.',
    Libra: 'Venus in Libra — harmony as your magnetic north.',
    Aries: 'Venus in Aries — desire that does not wait.',
    Gemini: 'Venus in Gemini — affection through conversation.',
    Cancer: 'Venus in Cancer — love that remembers.',
    Leo: 'Venus in Leo — heart on full display.',
    Virgo: 'Venus in Virgo — care through small attentions.',
    Scorpio: 'Venus in Scorpio — intimacy or nothing.',
    Sagittarius: 'Venus in Sagittarius — love as a horizon.',
    Capricorn: 'Venus in Capricorn — affection earned.',
    Aquarius: 'Venus in Aquarius — friendship as romance.',
    Pisces: 'Venus in Pisces — devotion without edges.',
  },
  Mercury: {
    Gemini: 'Mercury in Gemini — your mind moves at the speed of curiosity.',
    Virgo: 'Mercury in Virgo — thought as instrument.',
    Aries: 'Mercury in Aries — quick conclusions, quicker tongue.',
    Taurus: 'Mercury in Taurus — slow ideas with deep roots.',
    Cancer: 'Mercury in Cancer — memory shapes your reasoning.',
    Leo: 'Mercury in Leo — speech as performance.',
    Libra: 'Mercury in Libra — balance in every sentence.',
    Scorpio: 'Mercury in Scorpio — investigation as instinct.',
    Sagittarius: 'Mercury in Sagittarius — your mind reaches past the visible.',
    Capricorn: 'Mercury in Capricorn — language built to last.',
    Aquarius: 'Mercury in Aquarius — pattern-seeing as your default mode.',
    Pisces: 'Mercury in Pisces — knowing without explaining.',
  },
};

const REVEAL_ES: Record<string, Record<string, string>> = {
  Saturn: {
    Capricorn: 'Saturno en Capricornio — la disciplina como columna vertebral.',
    Aquarius: 'Saturno en Acuario — tu futuro llega antes que tú.',
    Aries: 'Saturno en Aries — paciencia forjada en la impaciencia.',
    Taurus: 'Saturno en Tauro — peso lento que se vuelve cimiento.',
    Gemini: 'Saturno en Géminis — tu mente afilada por el límite.',
    Cancer: 'Saturno en Cáncer — muros alrededor del agua.',
    Leo: 'Saturno en Leo — autoridad que tienes que ganar dos veces.',
    Virgo: 'Saturno en Virgo — el perfeccionismo como protección.',
    Libra: 'Saturno en Libra — la justicia como disciplina, no como sentimiento.',
    Scorpio: 'Saturno en Escorpio — profundidad que sobrevive lo que arde.',
    Sagittarius: 'Saturno en Sagitario — la creencia probada hasta volverse sabiduría.',
    Pisces: 'Saturno en Piscis — estructura construida sobre sueños.',
  },
  Mars: {
    Aries: 'Marte en Aries — ignición pura, sin titubeos.',
    Scorpio: 'Marte en Escorpio — furia que mantiene su forma.',
    Taurus: 'Marte en Tauro — fuerza en la que puedes apoyarte.',
    Gemini: 'Marte en Géminis — el argumento como armadura.',
    Cancer: 'Marte en Cáncer — la protección como guerra.',
    Leo: 'Marte en Leo — el orgullo que te empuña.',
    Virgo: 'Marte en Virgo — precisión bajo presión.',
    Libra: 'Marte en Libra — la diplomacia como arma.',
    Sagittarius: 'Marte en Sagitario — la convicción como motor.',
    Capricorn: 'Marte en Capricornio — la paciencia que gana.',
    Aquarius: 'Marte en Acuario — rebelión con planos.',
    Pisces: 'Marte en Piscis — corriente con la que tienes que nadar.',
  },
  Venus: {
    Taurus: 'Venus en Tauro — belleza hecha tangible.',
    Libra: 'Venus en Libra — la armonía como tu norte magnético.',
    Aries: 'Venus en Aries — el deseo que no espera.',
    Gemini: 'Venus en Géminis — afecto a través de la conversación.',
    Cancer: 'Venus en Cáncer — amor que recuerda.',
    Leo: 'Venus en Leo — el corazón completamente expuesto.',
    Virgo: 'Venus en Virgo — cuidado a través de pequeñas atenciones.',
    Scorpio: 'Venus en Escorpio — intimidad o nada.',
    Sagittarius: 'Venus en Sagitario — el amor como horizonte.',
    Capricorn: 'Venus en Capricornio — afecto que se gana.',
    Aquarius: 'Venus en Acuario — la amistad como romance.',
    Pisces: 'Venus en Piscis — devoción sin bordes.',
  },
  Mercury: {
    Gemini: 'Mercurio en Géminis — tu mente se mueve a la velocidad de la curiosidad.',
    Virgo: 'Mercurio en Virgo — pensamiento como instrumento.',
    Aries: 'Mercurio en Aries — conclusiones rápidas, lengua aún más rápida.',
    Taurus: 'Mercurio en Tauro — ideas lentas con raíces profundas.',
    Cancer: 'Mercurio en Cáncer — la memoria moldea tu razón.',
    Leo: 'Mercurio en Leo — el habla como puesta en escena.',
    Libra: 'Mercurio en Libra — equilibrio en cada frase.',
    Scorpio: 'Mercurio en Escorpio — la investigación como instinto.',
    Sagittarius: 'Mercurio en Sagitario — tu mente alcanza más allá de lo visible.',
    Capricorn: 'Mercurio en Capricornio — lenguaje construido para durar.',
    Aquarius: 'Mercurio en Acuario — ver patrones como modo por defecto.',
    Pisces: 'Mercurio en Piscis — saber sin explicar.',
  },
};

const PLANET_ES: Record<string, string> = {
  Saturn: 'Saturno', Mars: 'Marte', Venus: 'Venus', Mercury: 'Mercurio',
};

const STRINGS = {
  en: {
    preview: (planet: string) => `Your ${planet} is doing something most charts don't.`,
    heading: (planet: string) => `Your ${planet} is rare`,
    intro: 'Most astrology stops at Sun-Moon-Rising. Estrevia reads the layer beneath — Lahiri sidereal placements, dignity, and house tone.',
    revealFallback: (planet: string, sign: string) => `Your ${planet} is in ${sign} — a placement that shapes how you operate beneath the visible.`,
    depthPitch: 'The full reading uses Thelemic correspondences and the 777 lattice — the system your chart actually responds to, not the diluted version most apps use.',
    cta: 'Unlock your full reading',
    trialNote: '3-day free trial. Cancel anytime.',
  },
  es: {
    preview: (planet: string) => `Tu ${PLANET_ES[planet] ?? planet} está haciendo algo que la mayoría de las cartas no hace.`,
    heading: (planet: string) => `Tu ${PLANET_ES[planet] ?? planet} es poco común`,
    intro: 'La mayoría de la astrología se queda en Sol-Luna-Ascendente. Estrevia lee la capa de abajo — posiciones siderales Lahiri, dignidad, y tono de las casas.',
    revealFallback: (planet: string, sign: string) => `Tu ${PLANET_ES[planet] ?? planet} está en ${sign} — una posición que moldea cómo operas bajo lo visible.`,
    depthPitch: 'La lectura completa usa correspondencias de Thelema y la red 777 — el sistema al que tu carta realmente responde, no la versión diluida que la mayoría de apps usa.',
    cta: 'Desbloquea tu lectura completa',
    trialNote: '3 días de prueba gratis. Cancela cuando quieras.',
  },
};

export default function LeadCuriosityHookEmail({ locale, planet, signName, chartUrl }: Props) {
  const t = STRINGS[locale];
  const revealMap = locale === 'es' ? REVEAL_ES : REVEAL_EN;
  const revealLine = revealMap[planet]?.[signName] ?? t.revealFallback(planet, signName);

  return (
    <EmailLayout preview={t.preview(planet)} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading(planet)}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 20 }}>{t.intro}</Text>
      <Text style={{ fontSize: 17, lineHeight: 1.6, marginBottom: 24, fontWeight: 500 }}>
        {revealLine}
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 28, color: '#9CA3AF' }}>
        {t.depthPitch}
      </Text>
      <Button href={chartUrl}>{t.cta}</Button>
      <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 16, textAlign: 'center' }}>
        {t.trialNote}
      </Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/emails/__tests__/LeadCuriosityHookEmail.test.tsx`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/emails/LeadCuriosityHookEmail.tsx src/emails/__tests__/LeadCuriosityHookEmail.test.tsx
git commit -m "$(cat <<'EOF'
feat(curiosity-drip/T3): LeadCuriosityHookEmail component

Sign-level reveals for Saturn/Mars/Venus/Mercury × 12 signs × EN+ES
(96 mapped phrases + fallback). Curiosity hook intro + Thelemic depth
pitch + paywall CTA + soft 3-day trial note in footer. Mirrors existing
inline-STRINGS pattern from LeadChartEmail.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `sendLeadCuriosityHookEmail` function + schema enum

**Files:**
- Create: `src/shared/lib/__tests__/email-curiosity-hook.test.ts`
- Modify: `src/shared/lib/email.ts` (add new send function + import)
- Modify: `src/shared/lib/schema.ts` (add to emailType enum)

**Context:** Mirror `sendLeadChartEmail` (lines 331-385) structure exactly — same idempotency claim, same Resend throw-on-error, same `recordSentLead` finalize. Plug `pickDominantPlanet` for content + use `LeadCuriosityHookEmail` template.

- [ ] **Step 1: Add `lead_curiosity_hook` to schema enum**

In `src/shared/lib/schema.ts` around line 543-552, modify the `enum:` array to add the new value:

```ts
emailType: text('email_type', {
  enum: [
    'lead_chart',
    'lead_curiosity_hook',   // ← ADD THIS LINE
    'lead_moon_asc',
    'lead_paywall_teaser',
    'lead_saturn_weekly',
    'lead_mini_reading',
    'lead_synastry_teaser',
  ],
}).notNull(),
```

(Order: insert after `lead_chart` to reflect drip sequence. Drizzle does not enforce this at SQL level — column is plain text.)

- [ ] **Step 2: Write failing send-function test**

Create `src/shared/lib/__tests__/email-curiosity-hook.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

type ResendResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { name: string; message: string } };
const resendSendMock = vi.fn<
  (
    _payload: Record<string, unknown>,
    _opts?: Record<string, unknown>,
  ) => Promise<ResendResult>
>(async () => ({
  data: { id: 'resend_msg_curiosity' },
  error: null,
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

const tryInsertMock = vi.fn(async () => 'new' as 'new' | 'retry' | 'delivered');
const recordSentMock = vi.fn(async () => undefined);
vi.mock('@/shared/lib/sent-lead-emails', () => ({
  tryInsertOneShotLead: tryInsertMock,
  recordSentLead: recordSentMock,
}));

vi.mock('@/shared/lib/unsubscribe-token', () => ({
  signLeadUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
}));

beforeEach(() => {
  vi.clearAllMocks();
  tryInsertMock.mockResolvedValue('new');
  resendSendMock.mockResolvedValue({ data: { id: 'resend_msg_curiosity' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 're_test_key_aaaaaaaaaaaaaaaaaa');
});

const saturnChart = {
  planets: [
    { planet: 'Saturn', sign: 'Capricorn', signDegree: 5 },
    { planet: 'Sun', sign: 'Leo', signDegree: 15 },
  ],
  houses: null,
} as const;

describe('sendLeadCuriosityHookEmail', () => {
  it('sends curiosity-hook email with Saturn-Capricorn reveal (EN)', async () => {
    const { sendLeadCuriosityHookEmail } = await import('../email');
    const res = await sendLeadCuriosityHookEmail({
      leadId: 'lead_c1',
      email: 'test@example.com',
      locale: 'en',
      chart: saturnChart as never,
      chartId: 'chart_c1',
    });
    expect(res.sent).toBe(true);
    expect(tryInsertMock).toHaveBeenCalledWith('lead_c1', 'lead_curiosity_hook');
    expect(recordSentMock).toHaveBeenCalledWith('lead_c1', 'lead_curiosity_hook', 'resend_msg_curiosity');
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.to).toBe('test@example.com');
    expect(callArgs.subject as string).toContain('Saturn');
    expect(callArgs.html).toContain('Capricorn');
    expect(callArgs.html).toContain('chartId=chart_c1');
    expect(callArgs.html).toContain('utm_campaign=t1h');
    expect(callArgs.headers).toMatchObject({ 'List-Unsubscribe': expect.stringContaining('tok_lead_c1') });
  });

  it('uses ES locale strings when locale=es', async () => {
    const { sendLeadCuriosityHookEmail } = await import('../email');
    await sendLeadCuriosityHookEmail({
      leadId: 'lead_c2',
      email: 'es@example.com',
      locale: 'es',
      chart: saturnChart as never,
      chartId: 'chart_c2',
    });
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.subject as string).toContain('Saturno');
    expect(callArgs.html).toContain('Capricornio');
    expect(callArgs.html).toContain('utm_campaign=t1h');
  });

  it("returns reason already_sent when claim is 'delivered'", async () => {
    tryInsertMock.mockResolvedValueOnce('delivered');
    const { sendLeadCuriosityHookEmail } = await import('../email');
    const res = await sendLeadCuriosityHookEmail({
      leadId: 'lead_dup',
      email: 'dup@example.com',
      locale: 'en',
      chart: saturnChart as never,
      chartId: 'chart_x',
    });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('already_sent');
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('throws when Resend returns result.error (does not falsely report success)', async () => {
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'suppressed recipient' },
    });
    const { sendLeadCuriosityHookEmail } = await import('../email');
    await expect(
      sendLeadCuriosityHookEmail({
        leadId: 'lead_err',
        email: 'bad@example.com',
        locale: 'en',
        chart: saturnChart as never,
        chartId: 'chart_e',
      }),
    ).rejects.toThrow(/Resend rejected/);
    expect(recordSentMock).not.toHaveBeenCalled();
  });

  it('uses Mercury/Gemini fallback when chart is null', async () => {
    const { sendLeadCuriosityHookEmail } = await import('../email');
    await sendLeadCuriosityHookEmail({
      leadId: 'lead_null',
      email: 'null@example.com',
      locale: 'en',
      chart: null,
      chartId: null,
    });
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.subject as string).toContain('Mercury');
    expect(callArgs.html).toContain('Mercury');
    expect(callArgs.html).toContain('Gemini');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail with "sendLeadCuriosityHookEmail is not exported"**

Run: `npx vitest run src/shared/lib/__tests__/email-curiosity-hook.test.ts`
Expected: 5 failures.

- [ ] **Step 4: Add import + send function in `src/shared/lib/email.ts`**

In `src/shared/lib/email.ts`, add this import alongside the others around line 10-15:

```ts
import LeadCuriosityHookEmail from '@/emails/LeadCuriosityHookEmail';
```

Then add this function **immediately after `sendLeadChartEmail`** (after line 385, before `sendLeadMoonAscEmail`):

```ts
// ---------------------------------------------------------------------------
// sendLeadCuriosityHookEmail — T+1h nurture drip, one-shot per lead.
// Reveals one "dominant" planet's sign-level interpretation with a paywall
// CTA pointing to /chart (where ChartReadingSection paywall surface lives).
// ---------------------------------------------------------------------------
export async function sendLeadCuriosityHookEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const claim = await tryInsertOneShotLead(params.leadId, 'lead_curiosity_hook');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const dominant = pickDominantPlanet(params.chart);
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t1h`
    : `/${params.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture&utm_campaign=t1h`;
  const chartUrl = `${SITE_URL}${chartPath}`;

  const html = await render(
    LeadCuriosityHookEmail({
      locale: params.locale,
      planet: dominant.planet,
      signName: dominant.signName,
      chartUrl,
    }),
  );
  const text = await render(
    LeadCuriosityHookEmail({
      locale: params.locale,
      planet: dominant.planet,
      signName: dominant.signName,
      chartUrl,
    }),
    { plainText: true },
  );

  const subject =
    params.locale === 'es'
      ? `Tu ${ { Saturn: 'Saturno', Mars: 'Marte', Venus: 'Venus', Mercury: 'Mercurio' }[dominant.planet] } está haciendo algo poco común`
      : `Your ${dominant.planet} is doing something rare`;

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_curiosity_hook` },
  );
  if (result.error) {
    throw new Error(
      `Resend rejected lead_curiosity_hook for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
  }

  await recordSentLead(params.leadId, 'lead_curiosity_hook', result.data?.id ?? null);
  return { sent: true };
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npx vitest run src/shared/lib/__tests__/email-curiosity-hook.test.ts`
Expected: 5 passing.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/lib/email.ts src/shared/lib/schema.ts src/shared/lib/__tests__/email-curiosity-hook.test.ts
git commit -m "$(cat <<'EOF'
feat(curiosity-drip/T4): sendLeadCuriosityHookEmail + schema enum

T+1h curiosity-hook send function mirrors sendLeadChartEmail pattern
(idempotency claim, throw on Resend error, recordSentLead finalize).
Adds 'lead_curiosity_hook' to sentLeadEmails.emailType TS enum.
5 tests cover EN/ES locales, dedup, Resend-error path, null-chart fallback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Rewrite `LeadChartEmail` to cliffhanger structure

**Files:**
- Modify: `src/emails/LeadChartEmail.tsx` (rewrite STRINGS + JSX body)
- Modify: `src/shared/lib/email.ts` (`sendLeadChartEmail` — pass dominant planet info to component)
- Modify: `src/shared/lib/__tests__/email-lead.test.ts` (update existing T+0 assertions)

**Context:** The component currently reveals all three signs (sun/moon/asc) explicitly. After rewrite: reveal only Sun with one-liner, mention moon/asc by category (not by sign name), tease dominant planet by name only (no interpretation — the T+1h email reveals it). The cliffhanger structure is the entire UX shift.

- [ ] **Step 1: Update existing test assertion that checks for "Capricorn"**

Find test around `email-lead.test.ts:64` — the assertion `expect(callArgs.html).toContain('Capricorn')` will still pass (Sun in Capricorn is still revealed). But add a new assertion that **moon sign is NOT revealed in T+0**:

In `src/shared/lib/__tests__/email-lead.test.ts`, after the existing `expect(callArgs.headers)...` assertion in the `sendLeadChartEmail happy path EN` test (around line 65-66), add:

```ts
    // Cliffhanger: T+0 reveals Sun but withholds Moon sign and Ascendant.
    expect(callArgs.html).toContain('Capricorn');     // Sun sign — revealed
    expect(callArgs.html).not.toContain('Pisces');    // Moon sign — withheld
    expect(callArgs.html).not.toContain('Leo');       // Ascendant sign — withheld
    // Hidden-planet tease: name only, no sign reveal.
    // sampleChart has no Saturn/Mars/Venus in essential dignity, so picker
    // falls back to Mercury — verify Mercury mentioned but not its sign.
    expect(callArgs.html.toLowerCase()).toContain('mercury');
```

(Note: re-running the full test asserts both old and new behaviors.)

- [ ] **Step 2: Run tests to verify the new assertion fails**

Run: `npx vitest run src/shared/lib/__tests__/email-lead.test.ts -t 'happy path EN'`
Expected: FAIL — html currently contains "Pisces" and "Leo" from old reveal.

- [ ] **Step 3: Rewrite `LeadChartEmail.tsx` to cliffhanger structure**

Replace the entire contents of `src/emails/LeadChartEmail.tsx` with:

```tsx
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  sunSign: string | null;
  // Moon/asc deliberately NOT exposed — T+0 withholds them per cliffhanger.
  hasMoonSign: boolean;
  hasAscSign: boolean;
  dominantPlanet: 'Saturn' | 'Mars' | 'Venus' | 'Mercury';
  chartUrl: string;
}

const SIGN_ONE_LINERS_EN: Record<string, string> = {
  Aries: 'kindled by direct action', Taurus: 'rooted in tangible value',
  Gemini: 'wired for variety', Cancer: 'tuned to emotional memory',
  Leo: 'lit by self-expression', Virgo: 'sharpened by craft',
  Libra: 'balanced through relation', Scorpio: 'drawn to depth',
  Sagittarius: 'reaching past the horizon', Capricorn: 'built for the long arc',
  Aquarius: 'patterned by signal', Pisces: 'tuned to undercurrents',
};
const SIGN_ONE_LINERS_ES: Record<string, string> = {
  Aries: 'encendido por la acción directa', Taurus: 'enraizado en valor tangible',
  Gemini: 'cableado para la variedad', Cancer: 'sintonizado con la memoria emocional',
  Leo: 'iluminado por la expresión', Virgo: 'afilado por el oficio',
  Libra: 'equilibrado por la relación', Scorpio: 'atraído a lo profundo',
  Sagittarius: 'alcanzando más allá del horizonte', Capricorn: 'construido para el largo arco',
  Aquarius: 'tejido por la señal', Pisces: 'sintonizado con las corrientes',
};

const PLANET_ES: Record<string, string> = {
  Saturn: 'Saturno', Mars: 'Marte', Venus: 'Venus', Mercury: 'Mercurio',
};

const STRINGS = {
  en: {
    preview: (sign: string | null) =>
      sign
        ? `Your Sidereal Sun lands in ${sign} — and that's just the surface.`
        : 'Your sidereal chart is ready — and there is more beneath it.',
    heading: 'Your sidereal chart is ready',
    intro: 'Estrevia calculates from where the planets actually appear in the sky — Lahiri sidereal, ±0.01° precision.',
    teaserSun: (sign: string) => `Your Sun in ${sign}`,
    moonAscTease: 'Your Moon and Ascendant tell a deeper story — visible on your full chart.',
    planetTease: (planet: string) => `And your ${planet} is doing something most charts don't.`,
    cta: 'See your full chart',
    fallback: 'Your sidereal chart is waiting — Estrevia uses Lahiri precision.',
    fallbackCta: 'Calculate your chart',
    oneLiner: (sign: string) => SIGN_ONE_LINERS_EN[sign] ?? '',
  },
  es: {
    preview: (sign: string | null) =>
      sign
        ? `Tu Sol Sideral cae en ${sign} — y eso es solo la superficie.`
        : 'Tu carta sideral está lista — y hay más debajo.',
    heading: 'Tu carta sideral está lista',
    intro: 'Estrevia calcula desde donde los planetas aparecen realmente en el cielo — sideral Lahiri, precisión ±0,01°.',
    teaserSun: (sign: string) => `Tu Sol en ${sign}`,
    moonAscTease: 'Tu Luna y tu Ascendente cuentan una historia más profunda — visible en tu carta completa.',
    planetTease: (planet: string) => `Y tu ${PLANET_ES[planet] ?? planet} está haciendo algo que la mayoría de las cartas no hace.`,
    cta: 'Ver tu carta completa',
    fallback: 'Tu carta sideral te espera — Estrevia usa precisión Lahiri.',
    fallbackCta: 'Calcula tu carta',
    oneLiner: (sign: string) => SIGN_ONE_LINERS_ES[sign] ?? '',
  },
};

export default function LeadChartEmail({
  locale,
  sunSign,
  hasMoonSign,
  hasAscSign,
  dominantPlanet,
  chartUrl,
}: Props) {
  const t = STRINGS[locale];
  const showCliffhanger = sunSign && (hasMoonSign || hasAscSign);

  return (
    <EmailLayout preview={t.preview(sunSign)} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>

      {showCliffhanger ? (
        <>
          <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 20 }}>{t.intro}</Text>
          {sunSign && (
            <Text style={{ fontSize: 16, marginBottom: 12 }}>
              <strong>{t.teaserSun(sunSign)}</strong>
              {t.oneLiner(sunSign) && <> — {t.oneLiner(sunSign)}</>}
            </Text>
          )}
          <Text style={{ fontSize: 15, color: '#9CA3AF', marginBottom: 18, fontStyle: 'italic' }}>
            {t.moonAscTease}
          </Text>
          <Text style={{ fontSize: 15, color: '#9CA3AF', marginBottom: 24, fontStyle: 'italic' }}>
            {t.planetTease(dominantPlanet)}
          </Text>
          <Button href={chartUrl}>{t.cta}</Button>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>{t.fallback}</Text>
          <Button href={chartUrl}>{t.fallbackCta}</Button>
        </>
      )}
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Update `sendLeadChartEmail` in `src/shared/lib/email.ts` to pass new props**

Around `src/shared/lib/email.ts:331-385`, modify the rendering section (currently passes `sunSign`, `moonSign`, `ascSign` to `LeadChartEmail`) to pass `dominantPlanet` and boolean flags instead:

Find this block (around line 348-357):

```ts
  // 3. Derive personalization
  const signs = pickKeySigns(params.chart);
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t0`
    : `/${params.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture&utm_campaign=t0`;
  const chartUrl = `${SITE_URL}${chartPath}`;

  // 4. Render
  const html = await render(LeadChartEmail({ locale: params.locale, ...signs, chartUrl }));
  const text = await render(LeadChartEmail({ locale: params.locale, ...signs, chartUrl }), { plainText: true });
```

Replace with:

```ts
  // 3. Derive personalization — T+0 cliffhanger reveals Sun only, hints
  // moon/asc presence (boolean), names the dominant planet without interp.
  const signs = pickKeySigns(params.chart);
  const dominant = pickDominantPlanet(params.chart);
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t0`
    : `/${params.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture&utm_campaign=t0`;
  const chartUrl = `${SITE_URL}${chartPath}`;

  // 4. Render with cliffhanger props (moon/asc presence-only, dominant planet name-only)
  const emailProps = {
    locale: params.locale,
    sunSign: signs.sunSign,
    hasMoonSign: Boolean(signs.moonSign),
    hasAscSign: Boolean(signs.ascSign),
    dominantPlanet: dominant.planet,
    chartUrl,
  };
  const html = await render(LeadChartEmail(emailProps));
  const text = await render(LeadChartEmail(emailProps), { plainText: true });
```

- [ ] **Step 5: Run T+0 tests to verify they pass**

Run: `npx vitest run src/shared/lib/__tests__/email-lead.test.ts -t 'sendLeadChartEmail'`
Expected: All `sendLeadChartEmail` tests passing (incl. new assertions that moon/asc signs are not revealed).

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/emails/LeadChartEmail.tsx src/shared/lib/email.ts src/shared/lib/__tests__/email-lead.test.ts
git commit -m "$(cat <<'EOF'
feat(curiosity-drip/T5): rewrite LeadChartEmail to cliffhanger structure

T+0 now reveals only Sun + one-liner, withholds Moon and Ascendant sign
names ("your Moon tells a deeper story"), and names the dominant planet
without interpretation ("your Saturn is doing something rare"). Sets up
T+1h reveal payoff. Existing test extended to assert moon/asc are NOT
in the email body.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Rewrite `LeadMoonAscEmail` with /chart CTA + AI-reading teaser

**Files:**
- Modify: `src/emails/LeadMoonAscEmail.tsx` (rewrite STRINGS body — CTA + tease copy)
- Modify: `src/shared/lib/email.ts` (`sendLeadMoonAscEmail` — change CTA URL from /sign-up to /chart)
- Modify: `src/shared/lib/__tests__/email-lead.test.ts` (update existing T+24h assertions)

**Context:** Current T+24h has CTA pointing to `/sign-up?redirect_url=/chart`. Per spec, change to direct `/chart?chartId=X` (matching T+0 and T+1h). Copy gains an explicit AI-reading teaser before CTA so paywall framing carries through.

- [ ] **Step 1: Find existing T+24h test assertions**

Open `src/shared/lib/__tests__/email-lead.test.ts` and locate `describe('sendLeadMoonAscEmail')` block.

- [ ] **Step 2: Update test assertions for new CTA URL**

Inside the `sendLeadMoonAscEmail` happy-path test, update or add assertions for the new CTA destination. Find the test that checks `signupUrl` and replace the URL-related assertions with:

```ts
    // CTA now points to /chart (paywall surface), NOT /sign-up.
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.html).toContain('/chart?chartId=');
    expect(callArgs.html).toContain('utm_campaign=t24h');
    expect(callArgs.html).not.toContain('/sign-up');
    // AI-reading teaser copy mentions "full reading" or "AI"
    expect(callArgs.html.toLowerCase()).toMatch(/full reading|ai analysis|ai reading/);
```

(If the existing test doesn't have a happy-path assertion for `sendLeadMoonAscEmail`, add a new `it()` block following the pattern from `sendLeadChartEmail`.)

- [ ] **Step 3: Run tests to verify failure**

Run: `npx vitest run src/shared/lib/__tests__/email-lead.test.ts -t 'sendLeadMoonAscEmail'`
Expected: FAIL on new assertions.

- [ ] **Step 4: Rewrite `LeadMoonAscEmail.tsx`**

Read the current `src/emails/LeadMoonAscEmail.tsx` to identify the component's prop signature. The component takes `signupUrl` prop. Rename to `chartUrl` and update the STRINGS to include AI-reading teaser.

Replace `src/emails/LeadMoonAscEmail.tsx` contents with:

```tsx
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  moonSign: string | null;
  ascSign: string | null;
  chartUrl: string;  // renamed from signupUrl — points to /chart paywall surface
}

const STRINGS = {
  en: {
    preview: (moon: string | null) =>
      moon ? `Your Moon in ${moon} reveals your emotional core.` : 'Your sidereal Moon and Ascendant — what they reveal.',
    headingWithMoon: (moon: string) => `Your Moon in ${moon}`,
    headingFallback: 'Your sidereal Moon and Ascendant',
    moonBody: (moon: string) => `Your Moon in ${moon} shows the emotional layer beneath what you signal to the world — the inner weather of how you actually feel and need.`,
    ascBody: (asc: string) => `Your Ascendant in ${asc} is the threshold others meet first — the way you arrive in a room, the shape of your edge.`,
    triangleTease: 'Your Sun, Moon, and Ascendant form a unique triangle — but the deeper pattern lives in your house placements and the aspects between planets. Estrevia\'s AI analysis reads the full layered map.',
    cta: 'Read your AI-generated chart analysis',
    fallback: 'Your sidereal Moon and Ascendant are part of a deeper pattern — readable on your full chart.',
    fallbackCta: 'See your full chart',
  },
  es: {
    preview: (moon: string | null) =>
      moon ? `Tu Luna en ${moon} revela tu núcleo emocional.` : 'Tu Luna sideral y tu Ascendente — qué revelan.',
    headingWithMoon: (moon: string) => `Tu Luna en ${moon}`,
    headingFallback: 'Tu Luna sideral y tu Ascendente',
    moonBody: (moon: string) => `Tu Luna en ${moon} muestra la capa emocional debajo de lo que señalas al mundo — el clima interno de cómo realmente sientes y necesitas.`,
    ascBody: (asc: string) => `Tu Ascendente en ${asc} es el umbral que otros encuentran primero — la forma en que llegas a una habitación, la forma de tu borde.`,
    triangleTease: 'Tu Sol, Luna y Ascendente forman un triángulo único — pero el patrón más profundo vive en tus casas y los aspectos entre planetas. El análisis con IA de Estrevia lee el mapa completo en capas.',
    cta: 'Lee tu análisis de carta generado con IA',
    fallback: 'Tu Luna sideral y tu Ascendente son parte de un patrón más profundo — legible en tu carta completa.',
    fallbackCta: 'Ver tu carta completa',
  },
};

export default function LeadMoonAscEmail({ locale, moonSign, ascSign, chartUrl }: Props) {
  const t = STRINGS[locale];
  const hasData = Boolean(moonSign || ascSign);

  return (
    <EmailLayout preview={t.preview(moonSign)} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>
        {moonSign ? t.headingWithMoon(moonSign) : t.headingFallback}
      </Heading>

      {hasData ? (
        <>
          {moonSign && (
            <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 18 }}>
              {t.moonBody(moonSign)}
            </Text>
          )}
          {ascSign && (
            <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>
              {t.ascBody(ascSign)}
            </Text>
          )}
          <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24, color: '#9CA3AF' }}>
            {t.triangleTease}
          </Text>
          <Button href={chartUrl}>{t.cta}</Button>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>{t.fallback}</Text>
          <Button href={chartUrl}>{t.fallbackCta}</Button>
        </>
      )}
    </EmailLayout>
  );
}
```

- [ ] **Step 5: Update `sendLeadMoonAscEmail` in `src/shared/lib/email.ts`**

Locate `sendLeadMoonAscEmail` (around line 390-449). Replace the URL-building section and component render:

Find this block (around line 404-407):

```ts
  const signs = pickKeySigns(params.chart);
  const signupPath = `/${params.locale === 'es' ? 'es/' : ''}sign-up?redirect_url=${encodeURIComponent(
    `/${params.locale === 'es' ? 'es/' : ''}chart${params.chartId ? `?chartId=${params.chartId}` : ''}`,
  )}&utm_source=lead-nurture&utm_campaign=t24`;
  const signupUrl = `${SITE_URL}${signupPath}`;
```

Replace with:

```ts
  const signs = pickKeySigns(params.chart);
  // T+24h CTA now points to /chart (paywall surface), not /sign-up.
  // utm_campaign updated from t24 → t24h for consistency with t0/t1h naming.
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t24h`
    : `/${params.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture&utm_campaign=t24h`;
  const chartUrl = `${SITE_URL}${chartPath}`;
```

Then update both `render()` calls in the same function. Find:

```ts
  const html = await render(
    LeadMoonAscEmail({
      locale: params.locale,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      signupUrl,
    }),
  );
  const text = await render(
    LeadMoonAscEmail({
      locale: params.locale,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      signupUrl,
    }),
    { plainText: true },
  );
```

Replace with:

```ts
  const html = await render(
    LeadMoonAscEmail({
      locale: params.locale,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      chartUrl,
    }),
  );
  const text = await render(
    LeadMoonAscEmail({
      locale: params.locale,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      chartUrl,
    }),
    { plainText: true },
  );
```

- [ ] **Step 6: Run tests to verify all pass**

Run: `npx vitest run src/shared/lib/__tests__/email-lead.test.ts`
Expected: All passing including new T+24h assertions.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/emails/LeadMoonAscEmail.tsx src/shared/lib/email.ts src/shared/lib/__tests__/email-lead.test.ts
git commit -m "$(cat <<'EOF'
feat(curiosity-drip/T6): rewrite LeadMoonAscEmail with /chart CTA + AI-reading teaser

T+24h now drives to /chart?chartId=X (paywall surface) instead of /sign-up,
with explicit AI-reading teaser copy: 'Read your AI-generated chart
analysis'. Removes need for signup redirect dance — anon checkout flow
handles auth at Stripe time. utm_campaign renamed t24 → t24h for naming
consistency with t0/t1h.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Refactor cron route to table-driven dispatch + step renumber

**Files:**
- Modify: `src/app/api/cron/lead-nurture/route.ts` (full refactor of step dispatch)

**Context:** Replace the `if/else` chain (lines 128-200) with a table-driven dispatcher. Bump `lt(emailLeads.nurtureStep, 6)` → `lt(..., 7)` because terminal step is now 7. Add new step=1 dispatch for `sendLeadCuriosityHookEmail`. Constants for delays adjusted.

- [ ] **Step 1: Verify current cron tests exist**

Run: `ls src/app/api/cron/lead-nurture/__tests__/`
If empty: this task includes creating one (Step 2). If tests exist: read them to understand the mocking pattern.

- [ ] **Step 2: Write/extend integration test for table-driven dispatch**

Create or extend `src/app/api/cron/lead-nurture/__tests__/dispatch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendLeadChartEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadCuriosityHookEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadMoonAscEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadPaywallTeaserEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadSaturnWeeklyEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadMiniReadingEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadSynastryTeaserEmailMock = vi.fn(async () => ({ sent: true }));

vi.mock('@/shared/lib/email', () => ({
  sendLeadChartEmail: sendLeadChartEmailMock,
  sendLeadCuriosityHookEmail: sendLeadCuriosityHookEmailMock,
  sendLeadMoonAscEmail: sendLeadMoonAscEmailMock,
  sendLeadPaywallTeaserEmail: sendLeadPaywallTeaserEmailMock,
  sendLeadSaturnWeeklyEmail: sendLeadSaturnWeeklyEmailMock,
  sendLeadMiniReadingEmail: sendLeadMiniReadingEmailMock,
  sendLeadSynastryTeaserEmail: sendLeadSynastryTeaserEmailMock,
}));

vi.mock('@/shared/lib/cron-auth', () => ({
  assertCronAuth: vi.fn(() => null),
}));

vi.mock('@/shared/lib/temp-chart', () => ({
  fetchTempChart: vi.fn(async () => null),
}));

const updateMock = vi.fn(async () => undefined);
const selectMock = vi.fn();
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => selectMock() }) }) }),
    update: () => ({ set: () => ({ where: () => updateMock() }) }),
  }),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeLead(step: number, idSuffix: string) {
  return {
    id: `lead_${idSuffix}`,
    email: `lead-${idSuffix}@example.com`,
    locale: 'en' as 'en' | 'es',
    chartId: 'chart_x',
    nurtureStep: step,
    nurtureNextAt: new Date('2026-05-19T00:00:00Z'),
    createdAt: new Date('2026-05-18T00:00:00Z'),
  };
}

describe('cron lead-nurture dispatch (new step schema)', () => {
  it('step=0 invokes sendLeadChartEmail', async () => {
    selectMock.mockResolvedValueOnce([makeLead(0, 'a')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadChartEmailMock).toHaveBeenCalledTimes(1);
    expect(sendLeadCuriosityHookEmailMock).not.toHaveBeenCalled();
  });

  it('step=1 invokes sendLeadCuriosityHookEmail (NEW T+1h step)', async () => {
    selectMock.mockResolvedValueOnce([makeLead(1, 'b')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadCuriosityHookEmailMock).toHaveBeenCalledTimes(1);
    expect(sendLeadMoonAscEmailMock).not.toHaveBeenCalled();
  });

  it('step=2 invokes sendLeadMoonAscEmail (was step=1 in old schema)', async () => {
    selectMock.mockResolvedValueOnce([makeLead(2, 'c')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadMoonAscEmailMock).toHaveBeenCalledTimes(1);
  });

  it('step=3 invokes sendLeadPaywallTeaserEmail (was step=2)', async () => {
    selectMock.mockResolvedValueOnce([makeLead(3, 'd')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadPaywallTeaserEmailMock).toHaveBeenCalledTimes(1);
  });

  it('step=4 invokes sendLeadSaturnWeeklyEmail', async () => {
    selectMock.mockResolvedValueOnce([makeLead(4, 'e')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadSaturnWeeklyEmailMock).toHaveBeenCalledTimes(1);
  });

  it('step=5 invokes sendLeadMiniReadingEmail', async () => {
    selectMock.mockResolvedValueOnce([makeLead(5, 'f')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadMiniReadingEmailMock).toHaveBeenCalledTimes(1);
  });

  it('step=6 invokes sendLeadSynastryTeaserEmail (was step=5)', async () => {
    selectMock.mockResolvedValueOnce([makeLead(6, 'g')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadSynastryTeaserEmailMock).toHaveBeenCalledTimes(1);
  });

  it('step=7 is terminal — no send invoked, lead skipped', async () => {
    selectMock.mockResolvedValueOnce([makeLead(7, 'h')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.skipped + body.failed).toBeGreaterThanOrEqual(0);
    expect(sendLeadChartEmailMock).not.toHaveBeenCalled();
    expect(sendLeadCuriosityHookEmailMock).not.toHaveBeenCalled();
    // All other sends should not have fired either.
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/api/cron/lead-nurture/__tests__/dispatch.test.ts`
Expected: at least 1 failure (step=1 should not match current `sendLeadMoonAscEmail` dispatch).

- [ ] **Step 4: Refactor cron route to table-driven dispatch**

Replace the existing constants block + per-lead dispatch logic in `src/app/api/cron/lead-nurture/route.ts`.

Find lines 58-65 (constants) and replace with:

```ts
const STUCK_T0_GRACE_MS = 15 * 60 * 1000;
const BATCH_LIMIT = 100;
const RESEND_PACING_MS = 1100; // 1.1s between sends — well under Resend free-tier 10 req/s.

// Step dispatch table. Each row: which step number triggers which send
// function, what email_type it represents, and the delay until the NEXT
// step's nurture_next_at. nextDelayMs=null marks the terminal step.
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface StepHandler {
  fromStep: number;
  toStep: number;
  send: (params: {
    leadId: string;
    email: string;
    locale: 'en' | 'es';
    chart: Awaited<ReturnType<typeof fetchTempChart>>;
    chartId: string | null;
  }) => Promise<{ sent: boolean; reason?: string }>;
  nextDelayMs: number | null;
}

const STEP_HANDLERS: StepHandler[] = [
  { fromStep: 0, toStep: 1, send: sendLeadChartEmail,           nextDelayMs: 1 * HOUR },
  { fromStep: 1, toStep: 2, send: sendLeadCuriosityHookEmail,   nextDelayMs: 23 * HOUR },
  { fromStep: 2, toStep: 3, send: sendLeadMoonAscEmail,         nextDelayMs: 2 * DAY },   // T+24h → T+72h (48h later)
  { fromStep: 3, toStep: 4, send: sendLeadPaywallTeaserEmail,   nextDelayMs: 4 * DAY },   // T+72h → T+7d (96h later)
  { fromStep: 4, toStep: 5, send: sendLeadSaturnWeeklyEmail,    nextDelayMs: 7 * DAY },
  { fromStep: 5, toStep: 6, send: sendLeadMiniReadingEmail,     nextDelayMs: 7 * DAY },
  { fromStep: 6, toStep: 7, send: sendLeadSynastryTeaserEmail,  nextDelayMs: null },      // terminal
];
```

Also add the missing import. Find around line 45-52:

```ts
import {
  sendLeadChartEmail,
  sendLeadMoonAscEmail,
  sendLeadPaywallTeaserEmail,
  sendLeadSaturnWeeklyEmail,
  sendLeadMiniReadingEmail,
  sendLeadSynastryTeaserEmail,
} from '@/shared/lib/email';
```

Replace with:

```ts
import {
  sendLeadChartEmail,
  sendLeadCuriosityHookEmail,
  sendLeadMoonAscEmail,
  sendLeadPaywallTeaserEmail,
  sendLeadSaturnWeeklyEmail,
  sendLeadMiniReadingEmail,
  sendLeadSynastryTeaserEmail,
} from '@/shared/lib/email';
```

- [ ] **Step 5: Update step bound in query**

Find around line 105:

```ts
lt(emailLeads.nurtureStep, 6),
```

Replace with:

```ts
lt(emailLeads.nurtureStep, 7),
```

- [ ] **Step 6: Replace the if/else dispatch with table lookup**

Find the per-lead loop (lines 128-200, starting with `for (const lead of candidates) {` and ending before the closing `}`). Replace the body inside the `try` block with:

```ts
      try {
        const chart = await fetchTempChart(lead.chartId);
        const handler = STEP_HANDLERS.find((h) => h.fromStep === lead.nurtureStep);

        if (!handler) {
          skipped++;
          continue;
        }

        const sendResult = await handler.send({
          leadId: lead.id,
          email: lead.email,
          locale: lead.locale,
          chart,
          chartId: lead.chartId,
        });

        const nextAt = handler.nextDelayMs == null ? null : new Date(Date.now() + handler.nextDelayMs);

        if (sendResult.sent) {
          await db
            .update(emailLeads)
            .set({ nurtureStep: handler.toStep, nurtureNextAt: nextAt })
            .where(eq(emailLeads.id, lead.id));
          sent++;
        } else if (sendResult.reason === 'already_sent') {
          // Idempotency hit — advance step anyway so we don't re-select this
          // lead next hour and re-pay the no-op cost.
          await db
            .update(emailLeads)
            .set({ nurtureStep: handler.toStep, nurtureNextAt: nextAt })
            .where(eq(emailLeads.id, lead.id));
          skipped++;
        }

        if (candidates.length > 5) {
          await new Promise((r) => setTimeout(r, RESEND_PACING_MS));
        }
      } catch (err) {
        failed++;
        console.error('[cron/lead-nurture] send failed', {
          leadId: lead.id,
          step: lead.nurtureStep,
          err: err instanceof Error ? err.message : 'unknown',
        });
        Sentry.captureException(err, {
          tags: {
            cron: 'lead-nurture',
            leadId: lead.id,
            step: String(lead.nurtureStep),
          },
        });
      }
```

- [ ] **Step 7: Update the JSDoc comment block at the top of the file**

Find lines 1-36 (the file-level docblock describing the cron). Replace with:

```ts
/**
 * GET /api/cron/lead-nurture
 *
 * Vercel Cron — runs hourly at minute 0.
 *
 * Sweeps `email_leads` for due nurture-drip sends via a table-driven
 * step dispatcher. After 2026-05-19 curiosity-drip rebuild, the steps are:
 *
 *   step 0 → T+0 chart email           (cliffhanger: Sun + planet tease)
 *   step 1 → T+1h curiosity hook       (NEW: dominant-planet reveal + paywall)
 *   step 2 → T+24h moon-asc            (deeper reveals + AI-reading teaser)
 *   step 3 → T+72h paywall teaser      (third paywall push)
 *   step 4 → T+7d saturn weekly        (brand-building)
 *   step 5 → T+14d mini reading        (brand-building)
 *   step 6 → T+21d synastry teaser     (brand-building)
 *   step 7 → terminal                  (no further sends)
 *
 * Also handles T+0 recovery: leads with `nurture_step=0 AND nurture_next_at
 * IS NULL AND created_at < NOW() - 15min` had the initial waitUntil send
 * fail; the hourly cron retries.
 *
 * Filters out leads that have converted, unsubscribed, or marked as
 * undeliverable. Idempotency is enforced inside the send functions via
 * a UNIQUE INDEX on (lead_id, email_type) in sent_lead_emails — so
 * double-runs of this cron cannot send the same email twice.
 *
 * Per-lead failures are caught and logged (Sentry) — the loop continues
 * so a single Resend 5xx does not block other leads. Catastrophic failures
 * (DB unreachable) return 200 with summary rather than 500 — we do not
 * want Vercel to page on transient infra; the next hour retries naturally.
 *
 * Pacing: when the batch is >5 leads we sleep 1.1s between sends to stay
 * comfortably under Resend rate limits.
 *
 * Protected by CRON_SECRET (Vercel sends Bearer token in Authorization header).
 */
```

- [ ] **Step 8: Run dispatch tests to verify all pass**

Run: `npx vitest run src/app/api/cron/lead-nurture/__tests__/dispatch.test.ts`
Expected: 8 passing.

- [ ] **Step 9: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/cron/lead-nurture/route.ts src/app/api/cron/lead-nurture/__tests__/dispatch.test.ts
git commit -m "$(cat <<'EOF'
feat(curiosity-drip/T7): refactor cron to table-driven dispatch + step renumber

Replaces if/else chain with STEP_HANDLERS table covering steps 0..6.
New step=1 dispatches T+1h curiosity hook; all subsequent steps
renumbered +1 (terminal is now step=7). Test coverage for all 7
non-terminal steps + terminal skip. Step-bound predicate updated
from <6 to <7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full verification pass

**Files:** None modified — verification only.

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All passing. If failures, fix them before proceeding.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run lint, filtering out `.claude/worktrees/` noise (per memory `feedback_lint_worktrees_pollution`)**

Run: `npm run lint 2>&1 | grep -v '\.claude/worktrees' | head -80`
Expected: no errors in `src/` or `drizzle/` paths from this work.

- [ ] **Step 4: Build to verify production bundles cleanly**

Run: `npm run build`
Expected: build succeeds without errors.

- [ ] **Step 5: Sanity-check migration applies cleanly on a local DB clone (optional but recommended)**

If founder has a staging Postgres or branch DB:
```bash
DATABASE_URL=$STAGING_DATABASE_URL npm run db:migrate
```
Then verify renumber:
```bash
DATABASE_URL=$STAGING_DATABASE_URL node -r dotenv/config -e "
import('@neondatabase/serverless').then(async ({ Pool }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rows = (await pool.query('SELECT nurture_step, COUNT(*)::int FROM email_leads GROUP BY 1 ORDER BY 1')).rows;
  console.table(rows);
  await pool.end();
});
"
```
Expected: steps 0..7 distribution shifted +1 from baseline.

If no staging DB available: skip this step. Production apply happens at deploy.

---

## Task 9: Production deploy sequence (operational — founder runs)

**Files:** None.

**Context:** Migration MUST run before code is deployed, otherwise the new cron sees old step numbers and skips leads (1-hour data delay until migration runs).

- [ ] **Step 1: Push commits to GitHub**

```bash
git push origin main
```

This triggers Vercel deploy of the code commits. **DO NOT confirm Vercel deploy as healthy yet** — the cron is now expecting new step numbers but DB still has old ones.

- [ ] **Step 2: Apply migration in production**

```bash
DATABASE_URL=$PROD_DATABASE_URL npm run db:migrate
```

If `db:migrate` errors: investigate before proceeding. The migration file content is in `drizzle/0013_curiosity_hook_renumber.sql`.

- [ ] **Step 3: Verify renumber applied correctly**

Run this query against prod DB:

```bash
DATABASE_URL=$PROD_DATABASE_URL node -r dotenv/config -e "
import('@neondatabase/serverless').then(async ({ Pool }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rows = (await pool.query('SELECT nurture_step, COUNT(*)::int AS n FROM email_leads GROUP BY 1 ORDER BY 1')).rows;
  console.table(rows);
  // Expect: step=0 (recent + future), step=2 (was step=1), step=3+ (renumbered), no step=1 in pre-existing leads
  await pool.end();
});
"
```

Expected: any pre-existing leads on `nurture_step=1` are now `nurture_step=2`. Brand new leads (created after deploy) start at `step=0`.

- [ ] **Step 4: Wait one cron tick (top of next hour) + check Vercel logs**

In Vercel dashboard → Logs → filter for `cron/lead-nurture`:
- Look for `[cron/lead-nurture] candidates` log line
- Expected: handler dispatch succeeds for both renumbered (e.g., step=2 → moon-asc) and new (e.g., step=0 → chart) leads.

- [ ] **Step 5: Smoke test — create a test lead, observe drip**

```bash
# Trigger a test lead via the public API with a synthetic email.
curl -X POST https://estrevia.app/api/v1/leads \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoketest+'$(date +%s)'@estrevia.app","chartId":"$EXISTING_TEMP_CHART_ID","locale":"en"}'
```

(Founder picks a `chartId` from an existing `temp_charts` row.)

Then over the next 2-3 hours, verify:
- T+0 email arrives in inbox within 15min (immediate `waitUntil` path)
- T+1h email arrives after next cron pass past 1h mark
- Both emails contain `utm_campaign=t0` and `utm_campaign=t1h` in CTA links
- T+0 hides Moon/Asc sign names; T+1h reveals dominant planet's sign

- [ ] **Step 6: Update memory with deploy result**

Once smoke test passes, request a memory update reflecting that curiosity-drip is live and the renumber migration was applied without incident.

---

## Self-review checklist

1. **Spec coverage:**
   - ✅ T+0 cliffhanger → Task 5
   - ✅ T+1h curiosity hook (new) → Tasks 2, 3, 4
   - ✅ T+24h rewrite with /chart CTA → Task 6
   - ✅ Sign-level personalization → Task 3 (REVEAL maps)
   - ✅ `pickDominantPlanet` rules → Task 2
   - ✅ Step state-machine renumber → Tasks 1, 7
   - ✅ Partial index update → Task 1
   - ✅ Schema enum addition → Task 4 Step 1
   - ✅ Cron table-driven dispatch → Task 7
   - ✅ Spam mitigations (List-Unsubscribe, audited subjects) → existing pattern preserved in Tasks 4, 5, 6
   - ✅ Migration deploy sequence (operational) → Task 9
   - ✅ TDD test coverage → every code task has test-first step
   - ⚠️ Rollback `SKIP_CURIOSITY_HOOK` env flag — NOT implemented in plan (spec mentions as escape hatch; deferred unless prod issue arises; add as a future task if needed)
   - ⚠️ E2E `lead-nurture-curiosity-flow.test.ts` — NOT a separate task; Task 7's dispatch test covers per-step routing; full E2E would require Resend stub + DB stub; skipped per YAGNI

2. **Type consistency:**
   - `pickDominantPlanet` return type `{ planet: 'Saturn' | 'Mars' | 'Venus' | 'Mercury'; signName: string }` — used consistently in Tasks 2, 4, 5
   - `LeadCuriosityHookEmail` props match `sendLeadCuriosityHookEmail` invocation in Task 4
   - `LeadMoonAscEmail` prop rename `signupUrl` → `chartUrl` — both definition (Task 6 Step 4) and caller (Task 6 Step 5) updated

3. **Placeholder scan:** None found. All code blocks are complete.

4. **Order of operations:** Task 1 (migration file) commits FIRST per git history but applies LAST in production (Task 9). This is intentional — drizzle-kit applies migrations on `npm run db:migrate`, not on push. Migration file in repo is inert until applied.

---

## Execution choice

After all 9 tasks complete and verified, the implementation is ready for production deploy via Task 9's operational sequence.
