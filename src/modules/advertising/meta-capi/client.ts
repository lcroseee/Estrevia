import type { CapiBatchResponse, CapiEventPayload } from './types';

/**
 * Configuration for {@link CapiClient}.
 */
export interface CapiClientConfig {
  /** Meta Pixel id (target dataset). */
  pixelId: string;
  /** CAPI access token (long-lived system-user token). Treat as secret. */
  capiToken: string;
  /** Graph API version, e.g. 'v22.0'. */
  graphApiVersion: string;
  /** Injectable fetch for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Routes events to Meta's Test Events tab instead of production. */
  testEventCode?: string;
  /** Base for exponential backoff in ms. Default 1000. */
  retryBaseMs?: number;
  /** Max retries on transient errors (429, 5xx). Default 3. */
  maxRetries?: number;
}

/** HTTP statuses that warrant a retry with exponential backoff. */
const RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

/**
 * Wraps Meta Graph API `/{pixel_id}/events` for server-side conversion tracking.
 *
 * Features:
 * - Single + batch send through a unified code path (`sendEvent` → `sendBatch([..])`).
 * - Retry-on-rate-limit (429) and transient 5xx with exponential backoff.
 * - Optional `test_event_code` for dev/staging — events surface in Meta's
 *   Test Events tab and do NOT count against production attribution.
 *
 * Caller responsibility: hash PII (email, external_id, phone) with SHA-256
 * before placing into `user_data`. The client transmits payloads verbatim.
 */
export class CapiClient {
  private readonly pixelId: string;
  private readonly token: string;
  private readonly version: string;
  private readonly fetchImpl: typeof fetch;
  private readonly testEventCode?: string;
  private readonly retryBaseMs: number;
  private readonly maxRetries: number;

  constructor(config: CapiClientConfig) {
    this.pixelId = config.pixelId;
    this.token = config.capiToken;
    this.version = config.graphApiVersion;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.testEventCode = config.testEventCode;
    this.retryBaseMs = config.retryBaseMs ?? 1000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  /** Send a single event. Convenience wrapper over {@link sendBatch}. */
  async sendEvent(payload: CapiEventPayload): Promise<CapiBatchResponse> {
    return this.sendBatch([payload]);
  }

  /**
   * Send up to ~1000 events in a single Graph API call (Meta's documented batch limit).
   * Retries on 429/5xx with exponential backoff up to `maxRetries`.
   * Throws on persistent failure or any non-retryable non-OK response.
   */
  async sendBatch(payloads: CapiEventPayload[]): Promise<CapiBatchResponse> {
    const url = `https://graph.facebook.com/${this.version}/${this.pixelId}/events`;
    const body: Record<string, unknown> = {
      data: payloads,
      access_token: this.token,
    };
    if (this.testEventCode) {
      body.test_event_code = this.testEventCode;
    }

    let attempt = 0;
    // Loop until success, non-retryable failure, or maxRetries exhausted.
    while (true) {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return (await res.json()) as CapiBatchResponse;
      }

      const errorText = await res.text().catch(() => '');
      const isRetryable = RETRYABLE_STATUSES.includes(res.status);
      if (isRetryable && attempt < this.maxRetries) {
        const delayMs = this.retryBaseMs * Math.pow(2, attempt);
        await sleep(delayMs);
        attempt += 1;
        continue;
      }

      throw new Error(`CAPI sendEvent failed: ${res.status} ${errorText.slice(0, 200)}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
