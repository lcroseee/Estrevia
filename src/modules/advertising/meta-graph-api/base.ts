// src/modules/advertising/meta-graph-api/base.ts
import type { MetaErrorEnvelope, MetaGraphConfig } from './types';
import {
  classifyMetaError,
  MetaApiError,
  MetaRateLimitError,
  MetaServerError,
  MetaNetworkError,
} from './errors';

const DEFAULT_BASE_URL = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v22.0';
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
const RATE_WARN_THRESHOLD = 75;
const RATE_BLOCK_THRESHOLD = 90;
const RATE_COOLDOWN_MS = 60_000;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class MetaGraphApiBase {
  protected readonly accessToken: string;
  protected readonly adAccountId: string;
  protected readonly apiVersion: string;
  protected readonly baseUrl: string;
  protected readonly fetchImpl: typeof fetch;
  protected readonly sleepMs: (ms: number) => Promise<void>;

  /** Last observed call_count (0-100) from X-Business-Use-Case-Usage. */
  private lastUsageCallCount = 0;

  constructor(config: MetaGraphConfig) {
    this.accessToken = config.accessToken;
    this.adAccountId = config.adAccountId;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.sleepMs = config.sleepMs ?? defaultSleep;
  }

  protected async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    // Pre-flight rate-limit check based on previous response usage
    if (this.lastUsageCallCount >= RATE_BLOCK_THRESHOLD) {
      throw new MetaRateLimitError(
        `Local rate-limit guard: usage ${this.lastUsageCallCount}% > ${RATE_BLOCK_THRESHOLD}%`,
        { code: 17, httpStatus: 429 },
      );
    }
    if (this.lastUsageCallCount >= RATE_WARN_THRESHOLD) {
      await this.sleepMs(RATE_COOLDOWN_MS);
      this.lastUsageCallCount = 0;
    }

    const url = this.buildUrl(path);
    const init: RequestInit = {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    };

    return this.requestWithRetry<T>(url, init);
  }

  private buildUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}/${this.apiVersion}${cleanPath}`);
    url.searchParams.set('access_token', this.accessToken);
    return url.toString();
  }

  private async requestWithRetry<T>(url: string, init: RequestInit, attempt = 0): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (e) {
      if (attempt < RETRY_DELAYS_MS.length) {
        await this.sleepMs(RETRY_DELAYS_MS[attempt]!);
        return this.requestWithRetry<T>(url, init, attempt + 1);
      }
      throw new MetaNetworkError(
        e instanceof Error ? e.message : 'Network failure',
        { code: 0, httpStatus: 0 },
      );
    }

    this.captureUsage(response);

    if (response.ok) {
      return (await response.json()) as T;
    }

    const errBody = (await response.json().catch(() => ({
      error: { message: 'Unparseable error', code: 0 },
    }))) as MetaErrorEnvelope;

    const isRetryable = response.status >= 500 || errBody.error.code === 1 || errBody.error.code === 2;
    if (isRetryable && attempt < RETRY_DELAYS_MS.length) {
      await this.sleepMs(RETRY_DELAYS_MS[attempt]!);
      return this.requestWithRetry<T>(url, init, attempt + 1);
    }

    throw classifyMetaError(response.status, errBody);
  }

  private captureUsage(response: Response): void {
    const header = response.headers.get('X-Business-Use-Case-Usage');
    if (!header) return;
    try {
      const parsed = JSON.parse(header) as Record<
        string,
        { call_count: number }[] | undefined
      >;
      const entries = Object.values(parsed).flat();
      const max = Math.max(0, ...entries.filter(Boolean).map((e) => e!.call_count));
      this.lastUsageCallCount = max;
    } catch {
      /* ignore malformed usage header */
    }
  }
}
