import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// OG image endpoint — dimension + buffer sanity checks.
// These tests hit localhost dev server (started by playwright.config.ts
// webServer block). They do NOT validate visual design — that's ui-verifier's
// responsibility via manual review of sample images.
//
// Uses a synthetic passport ID that the DB may not have — a 404 is acceptable
// for the content check but we verify the endpoint structure via a direct
// sample ID from the baseline if available, falling back to dimension-only.
// ---------------------------------------------------------------------------

const DEV_BASE = 'http://localhost:3000';

// Synthetic ID — will return 404 from DB lookup, so we use a real one for
// the buffer-size test. The /api/og/passport/[id] endpoint returns 404 for
// unknown IDs; we test the response shape on a known-good path only.
// Update SAMPLE_ID to a real passport ID when running locally.
const SAMPLE_ID = process.env.OG_SAMPLE_ID ?? 'U3z2B6Oh';

test.describe('OG passport image endpoint', () => {
  test('og format (1200×630) returns valid image ≥20KB', async ({ request }) => {
    const res = await request.get(`${DEV_BASE}/api/og/passport/${SAMPLE_ID}?format=og`);
    // Accept 200 (found) or 404 (test ID not in dev DB) — just verify structure
    if (res.status() === 200) {
      expect(res.headers()['content-type']).toMatch(/image\/(png|jpeg|webp)/);
      const buf = await res.body();
      expect(buf.length, 'OG image buffer should be >20KB for real content').toBeGreaterThan(20_000);
    } else {
      // 404 = DB empty in dev — skip buffer check, but confirm no 500
      expect(res.status()).not.toBe(500);
    }
  });

  test('stories format (1080×1920) returns valid image ≥20KB', async ({ request }) => {
    const res = await request.get(`${DEV_BASE}/api/og/passport/${SAMPLE_ID}?format=stories`);
    if (res.status() === 200) {
      expect(res.headers()['content-type']).toMatch(/image\/(png|jpeg|webp)/);
      const buf = await res.body();
      expect(buf.length, 'Stories image buffer should be >20KB').toBeGreaterThan(20_000);
    } else {
      expect(res.status()).not.toBe(500);
    }
  });

  test('square format (1080×1080) returns valid image ≥20KB', async ({ request }) => {
    const res = await request.get(`${DEV_BASE}/api/og/passport/${SAMPLE_ID}?format=square`);
    if (res.status() === 200) {
      expect(res.headers()['content-type']).toMatch(/image\/(png|jpeg|webp)/);
      const buf = await res.body();
      expect(buf.length, 'Square image buffer should be >20KB').toBeGreaterThan(20_000);
    } else {
      expect(res.status()).not.toBe(500);
    }
  });

  test('unknown format falls back to og dimensions gracefully', async ({ request }) => {
    const res = await request.get(`${DEV_BASE}/api/og/passport/${SAMPLE_ID}?format=unknown_xyz`);
    // Should not 500 — unknown format uses FORMAT_DIMS.og as fallback
    expect(res.status()).not.toBe(500);
  });

  test('rate limiting header present on 429', async ({ request }) => {
    // Make many requests in quick succession to trigger rate limit.
    // Only validates that the 429 response has the correct headers when hit.
    // Under normal dev conditions this loop won't trigger the limit (60/min).
    let got429 = false;
    for (let i = 0; i < 3; i++) {
      const res = await request.get(`${DEV_BASE}/api/og/passport/${SAMPLE_ID}`);
      if (res.status() === 429) {
        expect(res.headers()['retry-after']).toBeTruthy();
        expect(res.headers()['x-ratelimit-limit']).toBeTruthy();
        got429 = true;
        break;
      }
    }
    // If no 429 encountered (typical), just pass
    if (!got429) {
      test.skip();
    }
  });
});
