# T8a — Independent Math QA: getSunInSignRange + Capricorn Cross-Year

**Date:** 2026-05-02  
**Author:** astro-verifier (qa agent)  
**Verdict:** ✅ **APPROVED**

---

## Summary

`getSunInSignRange()` and `getSunSignForDate()` implementations are mathematically correct.
All 53 tests pass. Independent sweph spot-checks and second-source (Drik Panchang) comparisons
confirm accuracy within ±1 minute for all verified cases — well inside the ±30 minute tolerance.

One factual correction noted for team-lead instructions (see §5).

---

## §1. Test suite results

| Suite | Tests | Pass | Fail | Notes |
|-------|-------|------|------|-------|
| 36-fixture suite (T8) | 40 | 40 | 0 | 36 ingress fixtures + 4 getSunSignForDate |
| Boundary cases (T8a, this task) | 13 | 13 | 0 | Cross-year, midnight, Capricorn |
| **Total** | **53** | **53** | **0** | — |

**Command:** `npx vitest run src/modules/astro-engine/__tests__/`

```
 Test Files  2 passed (2)
       Tests  53 passed (53)
    Duration  273ms
```

---

## §2. Independent spot-check (3 random fixtures via separate sweph algorithm)

**Methodology:** Independent Node.js script (`tmp/verify-sun-ingress.mjs`) using a
6-hour coarse scan + binary search — different algorithm from T8 implementation
(T8 uses 24-hour day steps). Both use the same sweph 2.10.3 + Moshier + Lahiri.

| Sign | Year | T3 fixture (UTC) | Independent calc (UTC) | Δ (min) | Result |
|------|------|-----------------|----------------------|---------|--------|
| gemini | 2024 | 2024-06-14T18:59:00Z | 2024-06-14T18:59:00Z | 0.0 | ✓ |
| leo | 2025 | 2025-08-16T20:21:00Z | 2025-08-16T20:21:00Z | 0.0 | ✓ |
| aquarius | 2026 | 2026-02-12T22:36:00Z | 2026-02-12T22:36:00Z | 0.0 | ✓ |

**All 3 spot-checks pass at 0 min difference** (sub-minute precision algorithms converge identically).

---

## §3. Second-source comparison — Drik Panchang (Lahiri Sankranti calendar)

**Source:** drikpanchang.com Surya Sankranti calendar, Lahiri ayanamsa.  
Times in IST (UTC+5:30) on the site; converted to UTC for comparison.  
Verified signs: Capricorn/Makar, Aries/Mesh, Cancer/Karka, Scorpio/Vrischika.

| Sign | Year | T3 fixture (UTC) | Drik Panchang (UTC) | Δ (min) | Result |
|------|------|-----------------|---------------------|---------|--------|
| capricorn | 2026 | 2026-01-14T09:35:00Z | 2026-01-14T09:35:00Z (15:05 IST) | 0.0 | ✓ |
| aries | 2026 | 2026-04-14T04:00:00Z | 2026-04-14T04:00:00Z (09:30 IST) | 0.0 | ✓ |
| cancer | 2026 | 2026-07-16T18:06:00Z | 2026-07-16T18:06:00Z (23:36 IST) | 0.0 | ✓ |
| capricorn | 2025 | 2025-01-14T03:25:00Z | 2025-01-14T03:25:00Z (08:55 IST) | 0.0 | ✓ |
| aries | 2025 | 2025-04-13T21:52:00Z | 2025-04-13T21:52:00Z (03:22 IST Apr 14) | 0.0 | ✓ |
| scorpio | 2025 | 2025-11-16T08:07:00Z | 2025-11-16T08:07:00Z (13:37 IST) | 0.0 | ✓ |

**All 6 second-source checks pass at 0 min difference.**

---

## §4. Boundary case analysis

### 4.1 Cross-year Sagittarius window (Dec→Jan)

**Finding:** `getSunSignForDate` correctly handles the cross-year Sagittarius window.

| Test case | Date | Expected sign | Got sign | Fallback used? | Result |
|-----------|------|--------------|----------|----------------|--------|
| Dec 30, 2025 noon | 2025-12-30T12:00Z | sagittarius | sagittarius | No (primary ok) | ✓ |
| Jan 5, 2026 noon | 2026-01-05T12:00Z | sagittarius | sagittarius | Yes (prior 2025) | ✓ |
| Jan 13, 2026 noon | 2026-01-13T12:00Z | sagittarius | sagittarius | Yes (prior 2025) | ✓ |
| Jan 15, 2026 noon | 2026-01-15T12:00Z | capricorn | capricorn | No | ✓ |

The fallback in `getSunSignForDate` (line 181: `getSunInSignRange(sign, year - 1, ayanamsa)`) 
correctly handles dates in January that are still within the prior December's Sagittarius window.

### 4.2 Capricorn sign range

**Finding:** Capricorn ingress is always in January (never December in Lahiri sidereal).
No cross-year issue for Capricorn itself.

| Year | Ingress UTC | Month | Result |
|------|------------|-------|--------|
| 2024 | 2024-01-14T21:16Z | January | ✓ |
| 2025 | 2025-01-14T03:25Z | January | ✓ |
| 2026 | 2026-01-14T09:35Z | January | ✓ |

### 4.3 Near-midnight UTC boundary crossings

**Finding:** No off-by-one-day bugs. Binary search precision is ±1 minute;
sign transitions near midnight UTC are correctly attributed to the right side.

| Date (UTC) | Expected | Got | Notes |
|-----------|----------|-----|-------|
| 2026-04-13T23:59Z | pisces | pisces | 4h before Aries ingress |
| 2026-04-14T04:30Z | aries | aries | 30 min after Aries ingress |
| 2026-01-14T09:34Z | sagittarius | sagittarius | 1 min before Capricorn ingress |
| 2026-01-14T09:36Z | capricorn | capricorn | 1 min after Capricorn ingress |

---

## §5. ⚠️ Correction to team-lead instructions

**Team-lead instruction stated:**  
> "Capricorn Dec→Jan window via `getSunSignForDate(new Date('2025-12-30T...'))` — should return capricorn with the prior-year-starting range"

**This is factually incorrect.** Independent sweph verification confirms:

```
2025-12-30T12:00:00Z → sidereal longitude ≈ 254.82° → Sagittarius (240–270°)
```

**Sidereal Lahiri Capricorn starts ~January 14**, not December 22.  
The confusion likely stems from tropical Capricorn (starts Dec 22 at winter solstice).

**Actual behavior (verified correct):**
- Dec 30, 2025 → **sagittarius** (fixture-consistent, no fallback needed)
- The real cross-year case is **Jan 5, 2026 → sagittarius** (fallback to Dec 2025 range)

The T8 implementation correctly handles the ACTUAL cross-year case (January dates in Sagittarius).
This is a documentation bug in the task instructions, not a code bug.

---

## §6. Code review notes

**`src/modules/astro-engine/sun-in-sign-range.ts` — 190 lines**

| Item | Assessment |
|------|-----------|
| Flag set: `SEFLG_SPEED \| SEFLG_MOSEPH` | ✓ Consistent with existing ephemeris.ts pattern |
| Lahiri init: module-level `set_sid_mode(SE_SIDM_LAHIRI, 0, 0)` in ephemeris.ts | ✓ Already applied at module load |
| `findIngress` binary search precision | ✓ 1-minute, rounds to nearest minute |
| `SIGN_ORDER` ordering | ✓ Aries(0°)→...→Pisces(330°) matches sweph longitude convention |
| `year` field: "calendar year in which start falls" | ✓ Matches actual start date |
| Scan window: ±35 days beyond [Jan 1, Jan 1+1yr] | ✓ Sufficient to capture Capricorn (Jan) + Sagittarius exit (Jan+1) |
| Error messages | ✓ Include debug info (transition list) for diagnosability |
| TypeScript strict mode | ✓ `npx tsc --noEmit` → 0 errors |
| Non-null assertion `SIGN_ORDER[idx]!` | ✓ Safe: `Math.floor(lon/30)` for lon∈[0,360) is always 0–11 |

---

## §7. Acceptance checklist

| Criterion | Status |
|-----------|--------|
| All 36 fixture tests pass (±30 min tolerance) | ✅ 36/36 pass |
| `getSunSignForDate` handles cross-year windows | ✅ Verified (Jan 5, Jan 13 → sagittarius fallback) |
| Functions re-exported from index.ts | ✅ (confirmed in index.ts) |
| Independent spot-check 3 fixtures | ✅ 3/3 pass (0 min delta) |
| Second-source comparison 6 dates | ✅ 6/6 pass (0 min delta, Drik Panchang) |
| TypeScript strict — 0 errors | ✅ |
| Boundary tests pass | ✅ 13/13 |
| Midnight UTC crossing — no off-by-one | ✅ |
| Capricorn stays in January (no Dec issue) | ✅ |

---

## Verdict

✅ **APPROVED — T8 implementation is mathematically correct and production-ready.**

The `getSunInSignRange` + `getSunSignForDate` functions can be used as the authoritative
source for all 24 `/sidereal-{sign}-dates` pages. Risk of wrong sun-sign dates on user-facing
pages is LOW — the implementation is verified against sweph 2.10.3 + Drik Panchang + independent
recomputation at sub-minute precision.

**One action item for team-lead:** Update task instructions for future sessions — December 30
is sidereal Sagittarius (not Capricorn) in Lahiri ayanamsa. The cross-year edge case is
January (Sagittarius window from prior December), handled correctly by the implementation.
