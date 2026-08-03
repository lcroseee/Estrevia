import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Result of a single Gemini Vision analysis call.
 *
 * `json` is the parsed JSON the model is instructed to return; the caller
 * narrows the shape with its own type assertion. `cost_usd` is a flat per-call
 * estimate suitable for cost-tracking aggregation in the retro-weekly digest.
 */
export interface VisionAnalysisResult {
  json: Record<string, unknown>;
  cost_usd: number;
}

/**
 * Minimal interface every safety check that needs vision analysis depends on.
 * Allows test injection of a fake client without hitting the real Gemini API.
 */
export interface VisionClient {
  analyzeImage(imageUrl: string, prompt: string): Promise<VisionAnalysisResult>;
}

export interface GeminiVisionClientOptions {
  apiKey: string;
  /** Defaults to 'gemini-2.5-flash' — cheapest multimodal Gemini tier. */
  model?: string;
}

// Per-call cost estimate for gemini-2.5-flash multimodal input
// (based on published Gemini Flash pricing, conservative round-up).
// Pinned constant rather than per-token because Vision call inputs/outputs
// here are short (one image + ~250 char prompt + small JSON response).
const PER_CALL_COST_USD = 0.0002;

/**
 * Concrete VisionClient that calls Gemini multimodal API to analyse an image
 * URL plus a structured prompt. The prompt is expected to instruct the model
 * to respond with JSON only; the response is parsed and returned alongside
 * the per-call cost estimate.
 *
 * Construction is via `createGeminiVisionClient()` (reads `GEMINI_API_KEY`
 * from env) for production callers, or directly with explicit `apiKey` for
 * tests / non-env contexts.
 */
export class GeminiVisionClient implements VisionClient {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(opts: GeminiVisionClientOptions) {
    this.genAI = new GoogleGenerativeAI(opts.apiKey);
    this.model = opts.model ?? 'gemini-2.5-flash';
  }

  async analyzeImage(imageUrl: string, prompt: string): Promise<VisionAnalysisResult> {
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Image fetch failed: ${imageRes.status} ${imageRes.statusText}`);
    }
    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = imageRes.headers.get('content-type') ?? 'image/jpeg';

    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      `${prompt}\nRespond ONLY with valid JSON, no other text, no markdown fences.`,
    ]);
    const text = result.response.text();
    // Strip markdown code fences if Gemini ignores the JSON-only instruction.
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const json = JSON.parse(cleaned) as Record<string, unknown>;
    return { json, cost_usd: PER_CALL_COST_USD };
  }
}

/**
 * Production factory — reads `GEMINI_API_KEY` from env. Throws if absent so
 * orchestrator code can `try`/`catch` and degrade to "no vision client"
 * (checks then skip with severity='info').
 */
export function createGeminiVisionClient(): VisionClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set — required for advertising vision checks');
  }
  return new GeminiVisionClient({ apiKey });
}
