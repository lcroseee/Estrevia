/**
 * Defensive fetch wrapper for internal API calls.
 *
 * Handles the known failure modes that plain `fetch()` + `res.json()` surfaces
 * poorly:
 *  - Clerk middleware rewrite to /_not-found for unauthenticated calls
 *    (HTTP 200 + HTML for POST, 404 + HTML for GET)
 *  - Server 5xx error pages (HTML, not JSON)
 *  - Malformed JSON responses
 *  - True network failures (no response)
 *
 * The caller gets a discriminated union so every case is handled explicitly.
 *
 * Usage example:
 *
 *   const result = await postJson<{ url: string }>('/api/v1/stripe/checkout', { plan });
 *   switch (result.kind) {
 *     case 'ok':
 *       window.location.href = result.data.url;
 *       break;
 *     case 'auth-required':
 *       window.location.href = `/sign-in?redirect_url=${encodeURIComponent(location.pathname)}`;
 *       break;
 *     case 'error':
 *       setError(result.message);
 *       break;
 *     case 'network-error':
 *       setError('Network error. Please check your connection.');
 *       break;
 *   }
 */

/**
 * Discriminated union returned by apiFetch. Every branch must be handled
 * explicitly by the caller — no hidden thrown exceptions after the call.
 */
export type ApiFetchResult<T> =
  | { kind: 'ok'; data: T }
  /** Clerk redirected the request to /_not-found, or any non-JSON response
   *  was received. Caller should redirect the user to /sign-in. */
  | { kind: 'auth-required' }
  /** The server responded with a 4xx/5xx JSON error body. */
  | { kind: 'error'; status: number; message: string; payload?: unknown }
  /** fetch() itself threw — no response was received (offline, DNS failure, etc). */
  | { kind: 'network-error'; error: unknown };

/**
 * Returns true when the response carries a JSON content-type header.
 * Matches "application/json" as well as "application/json; charset=utf-8".
 */
function isJsonContentType(res: Response): boolean {
  return (res.headers.get('content-type') ?? '').indexOf('application/json') !== -1;
}

/**
 * Extract the most useful message string from an arbitrary parsed JSON body.
 * Falls back to a generic string when the body has no recognisable shape.
 */
function extractMessage(parsed: unknown): string {
  if (parsed !== null && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj['message'] === 'string') return obj['message'];
    if (typeof obj['error'] === 'string') return obj['error'];
  }
  return 'An unexpected error occurred.';
}

/**
 * Core defensive fetch helper. Wraps fetch() and converts every outcome into
 * an ApiFetchResult — no exceptions are thrown to the caller.
 *
 * Detection logic for auth-required:
 *  1. HTTP 401
 *  2. x-clerk-auth-status: signed-out header
 *  3. Any non-JSON response body (Clerk rewrites POST → HTML 200, GET → HTML 404;
 *     Vercel error pages are also HTML. A non-JSON reply to an internal API call
 *     is never a legitimate success in this project.)
 */
export async function apiFetch<T = unknown>(
  input: string,
  init?: RequestInit,
): Promise<ApiFetchResult<T>> {
  let res: Response;

  try {
    res = await fetch(input, init);
  } catch (error) {
    return { kind: 'network-error', error };
  }

  // Detect auth failure through any of three signals.
  if (
    res.status === 401 ||
    res.headers.get('x-clerk-auth-status') === 'signed-out' ||
    !isJsonContentType(res)
  ) {
    return { kind: 'auth-required' };
  }

  if (!res.ok) {
    // 4xx / 5xx with a JSON body — extract a human-readable message.
    try {
      const parsed: unknown = await res.json();
      return {
        kind: 'error',
        status: res.status,
        message: extractMessage(parsed),
        payload: parsed,
      };
    } catch {
      return {
        kind: 'error',
        status: res.status,
        message: 'Unexpected response from server.',
      };
    }
  }

  // 2xx with JSON content-type — parse and return the data.
  try {
    const data = (await res.json()) as T;
    return { kind: 'ok', data };
  } catch {
    return {
      kind: 'error',
      status: res.status,
      message: 'Malformed response from server.',
    };
  }
}

/**
 * Convenience wrapper for the common pattern: POST a JSON body, expect a JSON
 * response. Sets Content-Type and serialises the body automatically.
 *
 * Matches the project's standard ApiResponse shape used by internal API routes:
 *   { success: boolean; data?: T; url?: string; message?: string }
 */
export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  init?: Omit<RequestInit, 'method' | 'body' | 'headers'>,
): Promise<ApiFetchResult<T>> {
  return apiFetch<T>(url, {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
