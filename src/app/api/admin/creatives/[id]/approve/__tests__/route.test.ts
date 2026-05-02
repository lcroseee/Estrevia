/**
 * Tests for POST /api/admin/creatives/[id]/approve
 *
 * Covers:
 * - 409 INVALID_STATUS when creative is not pending_review (idempotency guard)
 * - 200 + DB updated to status='uploaded' + meta_ad_id on success
 * - 502 + DB stays at status='approved' + null meta_ad_id when Meta upload fails
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { MetaUploadClient } from '@/modules/advertising/meta-graph-api/upload-client';

// ---------------------------------------------------------------------------
// Hoisted mocks — available to vi.mock factories (which are hoisted by Vitest)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  uploadCreative: vi.fn(),
  dbUpdate: vi.fn(),
}));

vi.mock('@/app/admin/lib/admin-auth', () => ({
  requireAdmin: async () => ({ email: 'admin@example.com' }),
}));

vi.mock('@/shared/lib/db', () => ({
  // Non-spy getDb: returns stable { update } reference — reconfigured per test
  getDb: () => ({ update: mocks.dbUpdate }),
}));

vi.mock('@/modules/advertising/meta-graph-api/upload-client', () => ({
  // Regular function (not arrow) so new MetaUploadClient() works as a constructor
  MetaUploadClient: vi.fn(function MockMetaUploadClient() {
    return { uploadCreative: mocks.uploadCreative };
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** DB row returned by the atomic approve UPDATE … RETURNING */
const CREATIVE_ROW = {
  id: 'creative-abc',
  assetUrl: 'https://cdn.blob/img.png',
  assetKind: 'image',
  copy: 'Discover your sidereal chart',
  cta: 'Calculate now',
  locale: 'en',
  hookTemplateId: 'identity_reveal-en-01',
};

/** Calls the POST handler, mirroring Next.js App Router signature. */
function callPost(id: string) {
  const request = new Request(
    `http://localhost/api/admin/creatives/${id}/approve`,
    { method: 'POST' },
  );
  return POST(request, { params: Promise.resolve({ id }) });
}

/** Builds a Drizzle mock chain for `.update().set().where().returning()`. */
function makeUpdateChain(returningRows: unknown[]) {
  const returningFn = vi.fn().mockResolvedValue(returningRows);
  const whereFn = vi.fn(() => ({ returning: returningFn }));
  const setFn = vi.fn(() => ({ where: whereFn }));
  return { set: setFn };
}

/** Builds a Drizzle mock chain for `.update().set().where()` (no returning). */
function makeUpdateChainNoReturn() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  const setFn = vi.fn(() => ({ where: whereFn }));
  return { set: setFn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/admin/creatives/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Env vars required by MetaUploadClient construction in the route
    process.env.META_ACCESS_TOKEN = 'test-meta-token';
    process.env.META_AD_ACCOUNT_ID = 'act_12345';
  });

  // -------------------------------------------------------------------------
  it('returns 409 INVALID_STATUS when creative is not pending_review (idempotency guard)', async () => {
    // Atomic UPDATE WHERE status='pending_review' matches 0 rows
    mocks.dbUpdate.mockReturnValue(makeUpdateChain([]));

    const response = await callPost('creative-abc');
    const body = await response.json() as { success: boolean; error: string };

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toBe('INVALID_STATUS');

    // Meta upload must NOT have been attempted
    expect(mocks.uploadCreative).not.toHaveBeenCalled();
    // Only 1 DB call (the atomic approve attempt)
    expect(mocks.dbUpdate).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  it('returns 200, sets status=uploaded and meta_ad_id on successful Meta upload', async () => {
    mocks.uploadCreative.mockResolvedValue({ creative_id: 'cr_meta1', ad_id: 'ad_meta1' });

    // First UPDATE call → approve, returns the row
    // Second UPDATE call → mark uploaded (no returning)
    mocks.dbUpdate
      .mockReturnValueOnce(makeUpdateChain([CREATIVE_ROW]))
      .mockReturnValueOnce(makeUpdateChainNoReturn());

    const response = await callPost('creative-abc');
    const body = await response.json() as {
      success: boolean;
      data: { id: string; status: string; meta_ad_id: string };
      error: null;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('uploaded');
    expect(body.data.meta_ad_id).toBe('ad_meta1');
    expect(body.data.id).toBe('creative-abc');

    // MetaUploadClient was constructed with env-var credentials
    expect(vi.mocked(MetaUploadClient)).toHaveBeenCalledWith({
      accessToken: 'test-meta-token',
      adAccountId: 'act_12345',
    });

    // uploadCreative received the correct asset_url and copy
    expect(mocks.uploadCreative).toHaveBeenCalledWith(
      expect.objectContaining({
        asset_url: CREATIVE_ROW.assetUrl,
        copy: CREATIVE_ROW.copy,
        cta: CREATIVE_ROW.cta,
        locale: CREATIVE_ROW.locale,
      }),
    );

    // Two DB calls: approve + mark uploaded
    expect(mocks.dbUpdate).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  it('returns 502 and leaves DB at approved/null meta_ad_id when Meta upload throws', async () => {
    mocks.uploadCreative.mockRejectedValue(new Error('Meta API timeout'));

    // Only one UPDATE call (the atomic approve) — second update must NOT run
    mocks.dbUpdate.mockReturnValueOnce(makeUpdateChain([CREATIVE_ROW]));

    const response = await callPost('creative-abc');
    const body = await response.json() as {
      success: boolean;
      error: string;
      message: string;
    };

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error).toBe('META_UPLOAD_FAILED');
    expect(body.message).toBe('Meta API timeout');

    // DB was NOT called a second time — row stays at status='approved', meta_ad_id=NULL
    // The bulk-publish CLI can pick it up for retry later
    expect(mocks.dbUpdate).toHaveBeenCalledTimes(1);
  });
});
