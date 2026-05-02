/**
 * Tests for POST /api/admin/creatives/publish-batch
 *
 * Covers:
 * - 401 when not authenticated
 * - 200 with correct summary shape on success
 * - dry_run=1 returns previewed count, no uploads
 * - limit param respected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  publishApprovedService: vi.fn(),
  getDb: vi.fn(),
  createMetaUploadClient: vi.fn(),
}));

vi.mock('@/app/admin/lib/admin-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock('@/modules/advertising/meta-graph-api/publish-approved-service', () => ({
  publishApprovedService: mocks.publishApprovedService,
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/modules/advertising/meta-graph-api', () => ({
  createMetaUploadClient: mocks.createMetaUploadClient,
}));

// TrackingParams type-only import — no mock needed (buildTrackingParams not used in route)

vi.mock('@/shared/lib/schema', () => ({
  advertisingCreatives: {
    id: 'id', copy: 'copy', cta: 'cta', locale: 'locale',
    assetUrl: 'assetUrl', assetKind: 'assetKind', hookTemplateId: 'hookTemplateId',
    metaAdId: 'metaAdId', status: 'status',
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(searchParams = '') {
  return new Request(
    `http://localhost/api/admin/creatives/publish-batch${searchParams ? `?${searchParams}` : ''}`,
    { method: 'POST' },
  );
}

const DEFAULT_RESULT = {
  uploaded: 2, failed: 0, skipped: 0, previewed: 0,
  errors: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/admin/creatives/publish-batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ userId: 'u1', email: 'admin@example.com' });
    mocks.publishApprovedService.mockResolvedValue(DEFAULT_RESULT);
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    });
    mocks.createMetaUploadClient.mockReturnValue({
      uploadCreative: vi.fn().mockResolvedValue({ creative_id: 'c1', ad_id: 'ad_1' }),
    });
  });

  it('returns 401 when requireAdmin throws a 401 Response', async () => {
    mocks.requireAdmin.mockRejectedValue(
      Response.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
  });

  it('returns 200 with summary shape on success', async () => {
    const response = await POST(makeRequest());
    const body = await response.json() as typeof DEFAULT_RESULT;

    expect(response.status).toBe(200);
    expect(body.uploaded).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.errors).toEqual([]);
  });

  it('passes dryRun=true when dry_run=1 query param is set', async () => {
    mocks.publishApprovedService.mockResolvedValue({
      uploaded: 0, failed: 0, skipped: 0, previewed: 3, errors: [],
    });

    const response = await POST(makeRequest('dry_run=1'));
    const body = await response.json() as { previewed: number };

    expect(response.status).toBe(200);
    expect(body.previewed).toBe(3);

    // publishApprovedService must have been called with dryRun: true
    expect(mocks.publishApprovedService).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
    // createMetaUploadClient must NOT be called in dry-run (uploadClient = null)
    expect(mocks.createMetaUploadClient).not.toHaveBeenCalled();
  });

  it('passes limit when limit query param is set', async () => {
    await POST(makeRequest('limit=5'));

    expect(mocks.publishApprovedService).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 }),
    );
  });

  it('returns errors array when some uploads fail', async () => {
    mocks.publishApprovedService.mockResolvedValue({
      uploaded: 1, failed: 1, skipped: 0, previewed: 0,
      errors: [{ id: 'c2', message: 'Meta timeout' }],
    });

    const response = await POST(makeRequest());
    const body = await response.json() as { errors: { id: string; message: string }[] };

    expect(response.status).toBe(200);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toEqual({ id: 'c2', message: 'Meta timeout' });
  });
});
