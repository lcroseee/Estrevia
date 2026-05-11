import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const buildDigestDataMock = vi.fn();
const formatMarkdownMock = vi.fn();

vi.mock('@/modules/advertising/alerts/digest-builder', () => ({
  buildDigestData: buildDigestDataMock,
}));

vi.mock('@/modules/advertising/alerts/digest-renderers', () => ({
  formatMarkdown: formatMarkdownMock,
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.ADVERTISING_STATUS_BEARER = 'test-bearer';
  buildDigestDataMock.mockResolvedValue({
    date: '2026-05-10',
    decisions: [],
    spend_total_usd: 0,
    impressions_total: 0,
  });
  formatMarkdownMock.mockReturnValue('# Estrevia advertising — daily digest 2026-05-10\n\n## Spend\n- Today: $0.00');
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe('GET /api/admin/advertising/digest', () => {
  it('returns 401 when Bearer header missing', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/digest');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 + text/markdown for default type=daily when authed', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/digest', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    const body = await res.text();
    expect(body).toContain('# Estrevia advertising — daily digest');
    expect(buildDigestDataMock).toHaveBeenCalledTimes(1);
    expect(formatMarkdownMock).toHaveBeenCalledTimes(1);
  });

  it('returns 501 NOT_IMPLEMENTED when type=weekly', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/digest?type=weekly', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe('NOT_IMPLEMENTED');
    expect(buildDigestDataMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_TYPE when type is unknown', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/digest?type=monthly', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_TYPE');
  });
});
