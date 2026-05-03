import type { CreativeBundle, SafetyCheckResult } from '@/shared/types/advertising';
import type { VisionClient } from './vision-checker';

// ---------------------------------------------------------------------------
// Dependency interfaces — injected by callers, mocked in tests
// ---------------------------------------------------------------------------

export interface ClaudeClient {
  moderationCheck(input: string): Promise<{ passed: boolean; reason?: string }>;
}

export interface OcrClient {
  /** Returns the text found in the image at the given URL. */
  recognize(url: string): Promise<string>;
}

export interface SafetyDeps {
  claudeClient: ClaudeClient;
  /** Optional — if absent, OCR check is skipped (MVP deferred). */
  ocrClient?: OcrClient;
  /**
   * Optional — if absent, brand + symbol vision checks are skipped with
   * severity='info'. Built via `createGeminiVisionClient()` in production.
   */
  visionClient?: VisionClient;
}

// ---------------------------------------------------------------------------
// 4.1a — Personal claim check (regex fast path)
// ---------------------------------------------------------------------------

const PERSONAL_CLAIM_PATTERNS: RegExp[] = [
  /\byou are not\b/i,
  /\byou'?re not\b/i,
  /\byou will\b/i,
  /\byour future\b/i,
  /\byou deserve\b/i,
  /\byou know that\b/i,
];

/**
 * Detects personal-claim copy patterns that Meta's ad policy flags:
 * predictive / absolute statements about the viewer ("you will", "your future").
 * Pure regex — no external API call required.
 */
export async function personalClaimCheck(copy: string): Promise<SafetyCheckResult> {
  for (const pattern of PERSONAL_CLAIM_PATTERNS) {
    if (pattern.test(copy)) {
      return {
        check_name: 'personal_claim',
        passed: false,
        severity: 'block',
        reason: `Matches Meta-flagged pattern: ${pattern.source}`,
      };
    }
  }
  return { check_name: 'personal_claim', passed: true, severity: 'info' };
}

// ---------------------------------------------------------------------------
// 4.1b — Meta Ad Policy check (Claude moderation)
// ---------------------------------------------------------------------------

const META_POLICY_PROMPT = (copy: string) =>
  `Does this ad copy violate Meta's ad policy? Copy: "${copy}". ` +
  `Check for: personal attribute claims, predictive language, fortune-telling, ` +
  `sensational health/wealth promises, exposed body parts, sensitive content. ` +
  `Reply JSON: { "passed": boolean, "reason": string }.`;

/**
 * Calls a Claude moderation endpoint to evaluate the ad copy against
 * Meta's ad policies. Severity is 'block' when the check fails.
 */
export async function metaAdPolicyCheck(
  creative: CreativeBundle,
  deps: SafetyDeps,
): Promise<SafetyCheckResult> {
  const result = await deps.claudeClient.moderationCheck(
    META_POLICY_PROMPT(creative.copy),
  );
  return {
    check_name: 'meta_ad_policy',
    passed: result.passed,
    severity: result.passed ? 'info' : 'block',
    reason: result.reason,
  };
}

// ---------------------------------------------------------------------------
// 4.1c — OCR text accuracy check (MVP: deferred / mock interface)
// ---------------------------------------------------------------------------

/**
 * Compares OCR-extracted text from the image against expectedText.
 * In MVP this is deferred — if no ocrClient is injected the check is skipped
 * and returns passed=true with severity='info'.
 */
export async function ocrTextAccuracyCheck(
  imageUrl: string,
  expectedText: string,
  deps: SafetyDeps,
): Promise<SafetyCheckResult> {
  if (!deps.ocrClient) {
    // OCR deferred until real implementation — skip with a note
    return {
      check_name: 'ocr_text_accuracy',
      passed: true,
      severity: 'info',
      reason: 'OCR check skipped — no ocrClient injected (deferred)',
    };
  }

  const extracted = await deps.ocrClient.recognize(imageUrl);
  const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const passed = normalise(extracted).includes(normalise(expectedText));

  return {
    check_name: 'ocr_text_accuracy',
    passed,
    severity: passed ? 'info' : 'warning',
    reason: passed
      ? undefined
      : `OCR found "${extracted.slice(0, 120)}" — expected to contain "${expectedText.slice(0, 60)}"`,
  };
}

// ---------------------------------------------------------------------------
// 4.1d — Brand consistency check (Gemini Vision)
// ---------------------------------------------------------------------------

/** Approved Estrevia brand palette: gold, silver, deep purple, dark navy. */
export const BRAND_PALETTE = ['#FFD700', '#C0C0C0', '#9B8EC4', '#0A0A0F'] as const;

const BRAND_PROMPT = `Does this image use the Estrevia astrology app brand palette? \
Approved colors: gold (${BRAND_PALETTE[0]}), silver (${BRAND_PALETTE[1]}), \
deep purple (${BRAND_PALETTE[2]}), dark navy (${BRAND_PALETTE[3]}). \
The dominant 3-4 colors of the image should match within reasonable tolerance \
(CIE76 ΔE ≤ 25 — generous for AI-generated variations). \
Respond JSON: {"passed": boolean, "dominantColors": ["#hex", ...], "reason": "..."}.`;

/**
 * Verifies the creative's visual assets match Estrevia brand colour palette
 * via a Gemini Vision call. Asymmetric error handling: when no vision client
 * is configured the check is **skipped** (severity='info'); when the vision
 * call **throws** the check **soft-passes with severity='warning'** — being
 * off-brand is undesirable but not a Meta policy violation, so the ad
 * shouldn't be blocked just because Gemini was rate-limited.
 */
export async function brandConsistencyCheck(
  creative: CreativeBundle,
  deps?: { visionClient?: VisionClient },
): Promise<SafetyCheckResult> {
  if (!deps?.visionClient) {
    return {
      check_name: 'brand_consistency',
      passed: true,
      severity: 'info',
      reason: 'Vision client not configured — check skipped',
    };
  }
  try {
    const result = await deps.visionClient.analyzeImage(creative.asset.url, BRAND_PROMPT);
    const json = result.json as {
      passed: boolean;
      dominantColors?: string[];
      reason?: string;
    };
    return {
      check_name: 'brand_consistency',
      passed: json.passed,
      severity: json.passed ? 'info' : 'warning',
      reason: json.reason ?? `dominant colors: ${json.dominantColors?.join(', ') ?? 'unknown'}`,
    };
  } catch (err) {
    // Soft-pass — off-brand is bad but not blocking; surface as warning.
    return {
      check_name: 'brand_consistency',
      passed: true,
      severity: 'warning',
      reason: `Vision check failed (degraded): ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 4.1e — Controversial symbol check (Gemini Vision)
// ---------------------------------------------------------------------------

const SYMBOL_PROMPT = `Identify any of the following in this image: \
pentagrams (5-pointed star inscribed in circle), inverted crosses, swastikas, \
religious crosses or crescents or stars-of-david, occult/satanic symbols. \
Innocuous astrological symbols (planet glyphs ☉☽♀♂♃, zodiac signs ♈♉♊, \
traditional astrology imagery) are ALLOWED — do not flag those. \
Respond JSON: {"found": boolean, "items": ["item1", ...], "reason": "..."}.`;

/**
 * Detects occult-coded imagery (pentagrams, inverted crosses, etc.) that
 * could trigger Meta's sensitive-content policy. Asymmetric error handling
 * (mirror of brand check): when no vision client is configured the check is
 * **skipped** (severity='info'); when the vision call **throws** the check
 * **fails closed** (`passed=false`, severity='warning') because controversial
 * symbols are a real Meta-policy risk and unverified imagery should be
 * routed to manual founder review rather than auto-uploaded.
 */
export async function controversialSymbolCheck(
  imageUrl: string,
  deps?: { visionClient?: VisionClient },
): Promise<SafetyCheckResult> {
  if (!deps?.visionClient) {
    return {
      check_name: 'controversial_symbol',
      passed: true,
      severity: 'info',
      reason: 'Vision client not configured — check skipped',
    };
  }
  try {
    const result = await deps.visionClient.analyzeImage(imageUrl, SYMBOL_PROMPT);
    const json = result.json as {
      found: boolean;
      items?: string[];
      reason?: string;
    };
    return {
      check_name: 'controversial_symbol',
      passed: !json.found,
      severity: json.found ? 'block' : 'info',
      reason: json.found
        ? `Detected: ${json.items?.join(', ') ?? 'unspecified'} — ${json.reason ?? ''}`
        : undefined,
    };
  } catch (err) {
    // Symbol check failure → fail-closed (warning, NOT block — manual review).
    return {
      check_name: 'controversial_symbol',
      passed: false,
      severity: 'warning',
      reason: `Vision check failed — manual review recommended: ${
        err instanceof Error ? err.message : 'unknown'
      }`,
    };
  }
}

// ---------------------------------------------------------------------------
// 4.1f — Run all checks in parallel
// ---------------------------------------------------------------------------

/**
 * Runs all five safety checks in parallel.
 * Returns the full array of results.
 * The creative should be blocked from upload if any result has severity='block'.
 */
export async function runAllChecks(
  creative: CreativeBundle,
  deps: SafetyDeps,
): Promise<SafetyCheckResult[]> {
  const results = await Promise.all([
    personalClaimCheck(creative.copy),
    metaAdPolicyCheck(creative, deps),
    ocrTextAccuracyCheck(creative.asset.url, creative.copy, deps),
    brandConsistencyCheck(creative, { visionClient: deps.visionClient }),
    controversialSymbolCheck(creative.asset.url, { visionClient: deps.visionClient }),
  ]);
  return results;
}

/**
 * Returns true if the creative should be blocked from upload
 * (i.e., at least one check has severity='block').
 */
export function isBlocked(results: SafetyCheckResult[]): boolean {
  return results.some((r) => r.severity === 'block');
}

// ---------------------------------------------------------------------------
// Vision cost accumulator — read by retro-weekly digest (Track 9)
// ---------------------------------------------------------------------------

export interface VisionCostAccumulator {
  total_usd: number;
  call_count: number;
}

export function newVisionCostAccumulator(): VisionCostAccumulator {
  return { total_usd: 0, call_count: 0 };
}

export function recordVisionCall(
  acc: VisionCostAccumulator,
  result: { cost_usd: number } | undefined,
): void {
  if (!result) return;
  acc.total_usd += result.cost_usd;
  acc.call_count += 1;
}
