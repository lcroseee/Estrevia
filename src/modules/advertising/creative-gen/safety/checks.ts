import type { CreativeBundle, SafetyCheckResult } from '@/shared/types/advertising';

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
// 4.1d — Brand consistency check (MVP: stub, TODO real Delta-E impl)
// ---------------------------------------------------------------------------

/**
 * Verifies the creative's visual assets match Estrevia brand colour palette.
 * MVP stub — always passes. Real implementation should compare dominant colours
 * using CIE Delta-E ≤ 10 threshold against approved palette.
 *
 * TODO: integrate sharp/canvas pixel sampling + CIE76 distance check.
 */
export async function brandConsistencyCheck(
  _creative: CreativeBundle,
): Promise<SafetyCheckResult> {
  // Stub — real colour-palette comparison deferred to Phase 2
  return {
    check_name: 'brand_consistency',
    passed: true,
    severity: 'info',
    reason: 'Brand consistency check stubbed — colour-palette validation pending (TODO)',
  };
}

// ---------------------------------------------------------------------------
// 4.1e — Controversial symbol check (MVP: stub, TODO vision model)
// ---------------------------------------------------------------------------

/**
 * Detects occult-coded imagery (pentagrams, inverted crosses, etc.) that could
 * trigger Meta's sensitive-content policy.
 * MVP stub — always passes. Real implementation needs a vision model call.
 *
 * TODO: integrate Gemini Vision or Claude vision to scan the image.
 */
export async function controversialSymbolCheck(
  _imageUrl: string,
): Promise<SafetyCheckResult> {
  // Stub — real vision-based check deferred to Phase 2
  return {
    check_name: 'controversial_symbol',
    passed: true,
    severity: 'info',
    reason: 'Controversial symbol check stubbed — vision model scan pending (TODO)',
  };
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
    brandConsistencyCheck(creative),
    controversialSymbolCheck(creative.asset.url),
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
