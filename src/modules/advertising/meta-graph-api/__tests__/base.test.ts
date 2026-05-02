// src/modules/advertising/meta-graph-api/__tests__/base.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MetaGraphApiBase } from '../base';
import {
  MetaAuthError,
  MetaServerError,
  MetaRateLimitError,
  MetaValidationError,
} from '../errors';

class TestableBase extends MetaGraphApiBase {
  // Expose protected method
  public req<T>(...args: Parameters<MetaGraphApiBase['request']>) {
    return this.request<T>(...args);
  }
}

function makeOkFetch(body: unknown, init: ResponseInit = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200, ...init }));
}

function makeErrFetch(status: number, errorBody: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(errorBody), { status }));
}

describe('MetaGraphApiBase.request', () => {
  it('GETs with access_token query param and parses JSON', async () => {
    const fetchImpl = makeOkFetch({ id: '123', name: 'test' });
    const base = new TestableBase({
      accessToken: 'TOKEN',
      adAccountId: 'act_99',
      apiVersion: 'v22.0',
      fetchImpl,
    });
    const res = await base.req<{ id: string }>('GET', '/me');
    expect(res.id).toBe('123');
    const call0 = fetchImpl.mock.calls[0] as unknown as [URL | string, RequestInit?];
    const url = call0[0].toString();
    expect(url).toContain('access_token=TOKEN');
    expect(url).toContain('https://graph.facebook.com/v22.0/me');
  });

  it('POSTs JSON body with correct content-type', async () => {
    const fetchImpl = makeOkFetch({ id: 'x' });
    const base = new TestableBase({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await base.req('POST', '/test', { foo: 'bar' });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"foo":"bar"}');
  });

  it('throws MetaAuthError on 401 with code 190', async () => {
    const fetchImpl = makeErrFetch(401, {
      error: { message: 'Expired', code: 190, fbtrace_id: 'a' },
    });
    const base = new TestableBase({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await expect(base.req('GET', '/me')).rejects.toThrow(MetaAuthError);
  });

  it('throws MetaValidationError on 400 with code 100 and does NOT retry', async () => {
    const fetchImpl = makeErrFetch(400, {
      error: { message: 'Bad', code: 100 },
    });
    const sleepMs = vi.fn(async () => {});
    const base = new TestableBase({
      accessToken: 'T', adAccountId: 'act_1', fetchImpl, sleepMs,
    });
    await expect(base.req('GET', '/me')).rejects.toThrow(MetaValidationError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepMs).not.toHaveBeenCalled();
  });

  it('retries 3 times on 5xx and eventually throws MetaServerError', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'fail', code: 2 } }), { status: 503 }),
    );
    const sleepMs = vi.fn(async () => {});
    const base = new TestableBase({
      accessToken: 'T', adAccountId: 'act_1', fetchImpl, sleepMs,
    });
    await expect(base.req('GET', '/me')).rejects.toThrow(MetaServerError);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // initial + 3 retries
    expect(sleepMs.mock.calls.map((c) => (c as unknown as [number])[0])).toEqual([1000, 2000, 4000]);
  });

  it('succeeds on retry after one 5xx', async () => {
    const responses = [
      new Response(JSON.stringify({ error: { message: 'x', code: 2 } }), { status: 502 }),
      new Response(JSON.stringify({ id: 'OK' }), { status: 200 }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const sleepMs = vi.fn(async () => {});
    const base = new TestableBase({
      accessToken: 'T', adAccountId: 'act_1', fetchImpl, sleepMs,
    });
    const res = await base.req<{ id: string }>('GET', '/me');
    expect(res.id).toBe('OK');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('respects rate-limit header (>75% triggers 60s sleep before next call)', async () => {
    const headers = new Headers({
      'X-Business-Use-Case-Usage': JSON.stringify({
        '<account-id>': [{ call_count: 80, total_cputime: 0, total_time: 0 }],
      }),
    });
    const responses = [
      new Response(JSON.stringify({ id: 'a' }), { status: 200, headers }),
      new Response(JSON.stringify({ id: 'b' }), { status: 200 }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const sleepMs = vi.fn(async () => {});
    const base = new TestableBase({
      accessToken: 'T', adAccountId: 'act_1', fetchImpl, sleepMs,
    });
    await base.req('GET', '/me');
    await base.req('GET', '/me');
    expect(sleepMs).toHaveBeenCalledWith(60_000);
  });

  it('throws MetaRateLimitError immediately when usage >90%', async () => {
    const headers = new Headers({
      'X-Business-Use-Case-Usage': JSON.stringify({
        '<account-id>': [{ call_count: 95, total_cputime: 0, total_time: 0 }],
      }),
    });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200, headers }));
    const base = new TestableBase({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await base.req('GET', '/me'); // first call captures the warning
    await expect(base.req('GET', '/me')).rejects.toThrow(MetaRateLimitError);
  });
});
