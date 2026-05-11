import type { ClaudeClientForBrandVoice } from '@/modules/advertising/decide/brand-voice-audit';
import { computeWeightedOverall } from '@/modules/advertising/decide/brand-voice-audit';

const SYSTEM_PROMPT = `You are auditing Estrevia advertising copy for Brand Guidelines adherence.

Estrevia is a sidereal astrology PWA (Lahiri ayanamsa) emphasizing precision,
reflection, and education — not horoscopes, fortune-telling, or mysticism.

Score the given ad copy on four dimensions:

1. depth (1-10 integer): Beyond surface clichés.
   1 = fluff phrases ("cosmic dance", "stars whisper", "celestial tapestry").
   10 = concrete, specific, anchored in astronomical or astrological mechanics.

2. scientific (1-10 integer): Rigorous framing.
   1 = mystical/magical claims, predictions, fortune-telling language.
   10 = treats astrology as a reflection tool; precise terms like "sidereal",
        "ayanamsa", "ephemeris" used correctly.

3. respectful (1-10 integer): Treats reader as capable adult.
   1 = patronizing, manipulative, or apologetic ("some believe", "according
       to astrologers", "whether you believe").
   10 = direct, second-person, present-tense, assumes intelligence.

4. no_manipulation (boolean): false if the copy uses urgency, scarcity,
   false personalization, implied predictions, or sun-sign generalizations
   ("Geminis are talkative"). true otherwise.

Hard rules — any violation forces no_manipulation=false:
- NO predictions ("you will...", "this week brings...")
- NO sun-sign claims ("Aries do X", "Geminis are Y")
- NO mocking tropical astrology
- NO apologizing language ("some believe", "whether you believe")
- Title Case sparingly (proper names + start of sentences only)

Respond with JSON only — no preamble, no markdown fences, no trailing text:
{"depth": <int>, "scientific": <int>, "respectful": <int>, "no_manipulation": <bool>}

Do NOT include "overall" — it is computed by the caller.`;

export interface ClaudeBrandVoiceClientDeps {
  anthropicApiKey: string;
  fetch?: typeof fetch;
}

interface BrandVoiceScoreResult {
  depth: number;
  scientific: number;
  respectful: number;
  no_manipulation: boolean;
  overall: number;
}

function failShut(): BrandVoiceScoreResult {
  return { depth: 0, scientific: 0, respectful: 0, no_manipulation: false, overall: 0 };
}

export class ClaudeBrandVoiceClient implements ClaudeClientForBrandVoice {
  private readonly fetch: typeof fetch;

  constructor(private readonly deps: ClaudeBrandVoiceClientDeps) {
    this.fetch = deps.fetch ?? globalThis.fetch;
  }

  async brandVoiceScore(adId: string, copy: string): Promise<BrandVoiceScoreResult> {
    try {
      const response = await this.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.deps.anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 150,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Ad ${adId} copy:\n\n${copy}` }],
        }),
      });

      if (response.status < 200 || response.status >= 300) {
        return failShut();
      }

      const data = (await response.json()) as { content?: Array<{ text?: string }> };
      const text = data.content?.[0]?.text ?? '';
      const match = text.match(/\{[^{}]*"depth"[^{}]*\}/);
      if (!match) return failShut();

      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      if (
        typeof parsed.depth !== 'number' ||
        typeof parsed.scientific !== 'number' ||
        typeof parsed.respectful !== 'number' ||
        typeof parsed.no_manipulation !== 'boolean'
      ) {
        return failShut();
      }

      const depth = Math.max(0, Math.min(10, parsed.depth));
      const scientific = Math.max(0, Math.min(10, parsed.scientific));
      const respectful = Math.max(0, Math.min(10, parsed.respectful));
      const no_manipulation = parsed.no_manipulation;
      const overall = computeWeightedOverall(depth, scientific, respectful, no_manipulation);
      return { depth, scientific, respectful, no_manipulation, overall };
    } catch {
      return failShut();
    }
  }
}
