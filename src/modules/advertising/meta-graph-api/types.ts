// src/modules/advertising/meta-graph-api/types.ts

/**
 * Meta Graph API error envelope (v22.0).
 * https://developers.facebook.com/docs/graph-api/guides/error-handling/
 */
export interface MetaErrorEnvelope {
  error: {
    message: string;
    type?: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
    error_user_title?: string;
    error_user_msg?: string;
  };
}

/** Common success response: { id: '...' }. */
export interface MetaIdResponse {
  id: string;
}

/** POST /act_<id>/adimages response. */
export interface MetaAdImagesResponse {
  images: Record<string, { hash: string; url: string }>;
}

/** POST /<ad_id>/copies response. */
export interface MetaCopyResponse {
  copied_ad_id: string;
  ad_object_ids: { ad_id: string }[];
}

/** Rate-limit usage from X-Business-Use-Case-Usage header (parsed JSON). */
export interface MetaUsage {
  call_count: number;       // 0-100, % of limit
  total_cputime: number;
  total_time: number;
  estimated_time_to_regain_access?: number;
}

export interface MetaGraphConfig {
  accessToken: string;
  adAccountId: string;       // 'act_<id>'
  apiVersion?: string;       // default 'v22.0'
  baseUrl?: string;          // default 'https://graph.facebook.com'
  fetchImpl?: typeof fetch;  // injectable for tests
  /** Sleep helper, injectable for tests. Default: setTimeout-based. */
  sleepMs?: (ms: number) => Promise<void>;
}
