# Content Review: aries..virgo by content-prog-b

Reviewer: content-prog-b  
Target: T10 output (content-prog-a) — `messages/en.json` + `messages/es.json`, signs aries..virgo  
Date: 2026-05-02  
Branch: seo-phase2

## Checklist reference (plan §anti-AI-slop)

| # | Criterion |
|---|-----------|
| 1 | No "in conclusion / it is important to note / let's explore" |
| 2 | No empty parallel structures |
| 3 | Specific dates/numbers/names |
| 4 | No excessive hedging |
| 5 | Active voice |
| 6 | Sentence length variety |
| 7 | No transitional throat-clearing |
| 8 | No restating the question |
| 9 | Real domain knowledge (Lahiri specifics, not generic astrology) |
| 10 | ES: LATAM neutral + tú form |
| 11 | Internal links serve readers |
| 12 | Direct first sentence answers |

## Scoring table

| Page | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | Verdict |
|------|---|---|---|---|---|---|---|---|---|----|----|-----|---------|
| aries EN   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | PASS |
| aries ES   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | PASS |
| taurus EN  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | PASS |
| taurus ES  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~  | ✓ | ✓ | PASS |
| gemini EN  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | PASS |
| gemini ES  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | PASS |
| cancer EN  | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | **FAIL** |
| cancer ES  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | PASS |
| leo EN     | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | PASS |
| leo ES     | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | PASS |
| virgo EN   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | PASS |
| virgo ES   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | PASS |

Legend: ✓ pass · ✗ fail · ~ minor note · n/a not applicable (EN pages skip #10)

## Word counts (verified)

| Sign | EN sign-keys | EN total (+ common 119w + accordion ~72w) | ES sign-keys | ES total |
|------|-------------|-------------------------------------------|-------------|----------|
| aries | 339w | 530w ✓ | 343w | 553w ✓ |
| taurus | 335w | 526w ✓ | 334w | 544w ✓ |
| gemini | 326w | 517w ✓ | 352w | 562w ✓ |
| cancer | 329w | 520w ✓ | 366w | 576w ✓ |
| leo | 317w | 508w ✓ | 363w | 573w ✓ |
| virgo | 330w | 521w ✓ | 403w | 613w ✓ |

All 12 pages ≥400w. ✓

## Issues found

### CRITICAL — requires fix

**cancer EN · `annualVariation` · criterion #3 (factual accuracy)**

> Current: "The Sun exits sidereal Cancer around August 17, **entering Virgo** for the next 30-day arc."

This skips an entire sign. The zodiac order is Cancer → **Leo** → Virgo. The Sun exits Cancer into Leo, not Virgo.

**Suggested rewrite:**
> "The Sun exits sidereal Cancer around August 17, entering Leo for the next 31-day arc."

Fixtures confirm: Leo ingress 2026-08-17T02:25:00Z (Cancer exits = Leo enters). The "31-day" figure is also more accurate than "30-day" — sidereal Leo window is Aug 17 to Sep 17, which is 31 days.

### MINOR — advisory only (no fix required)

**taurus EN + gemini EN · `whyDifferent` · criterion #3 (rounding consistency)**

Both signs use "50 arcseconds per year" while all other signs (aries, cancer, leo, virgo and all libra..pisces) use "50.3 arcseconds". Technically "50" is not wrong (it rounds correctly from 50.3), but inconsistency across pages may confuse readers who cross-reference. Recommend aligning to "50.3" to match the site-wide standard and the plan's stated value.

**taurus ES · `annualVariation` · criterion #10 (tú preference)**

"Esta precisión es relevante sobre todo para quienes nacieron un día antes o después del límite Tauro–Aries, para confirmar en qué signo cae realmente **su** Sol."

"Su Sol" follows the third-person antecedent "quienes" — grammatically correct, but inconsistent with the direct-address tú form used in aries ES ("si naciste dentro de las 24 horas"). Advisory: consider "para confirmar en qué signo cae realmente **tu** Sol" to unify address register across all 12 signs. Not a blocking issue.

## Dates verification (2026, Swiss Ephemeris fixtures)

| Sign | Content claims | Fixtures | Match |
|------|----------------|----------|-------|
| aries | Apr 14 – May 14 | Apr 14 entry / May 15 entry (exit ≈ May 15) | ✓ (within "approximately" ±1d) |
| taurus | May 14 – Jun 15 | May 15 entry / Jun 15 entry (exit ≈ Jun 15) | ✓ (within "approximately" ±1d) |
| gemini | Jun 15 – Jul 16 | Jun 15 / Jul 16 | ✓ exact |
| cancer | Jul 16 – Aug 17 | Jul 16 / Aug 17 | ✓ exact |
| leo | Aug 17 – Sep 17 | Aug 17 / Sep 17 | ✓ exact |
| virgo | Sep 17 – Oct 17 | Sep 17 / Oct 17 | ✓ exact |

All dates within stated ±1d tolerance. ✓

## Editorial verdict

**FIXES_REQUESTED**

One blocking fix required before T20 final QA:

1. **cancer EN `annualVariation`**: change "entering Virgo" → "entering Leo"

Two non-blocking advisories (fix encouraged but not required for APPROVED status):

2. **taurus EN + gemini EN `whyDifferent`**: align "50 arcseconds" → "50.3 arcseconds"
3. **taurus ES `annualVariation`**: consider "tu Sol" → "su Sol" (tú address consistency)

Once #1 is corrected and committed, T17 verdict upgrades to **APPROVED**.
