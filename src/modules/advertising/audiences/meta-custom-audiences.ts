/**
 * Meta Custom Audiences API client used by the audience-refresh cron.
 *
 * Boundary contract: upsertCustomAudience accepts AudienceMember whose
 * email_hash field is ALREADY a SHA-256 hex of the lowercased+trimmed
 * email. Hashing happens at the source (stripe-client.ts and exclusions /
 * retargeting). This module re-validates each hash and rejects anything
 * that isn't 64 hex chars — defense in depth so plain-text PII can never
 * reach Meta even if a caller regresses.
 *
 * Env:
 *   META_ACCESS_TOKEN     long-lived system-user token (Marketing API)
 *   META_AD_ACCOUNT_ID    ad account id (format: act_NNN)
 *
 * Behaviour: looks up an existing audience with the same name on the ad
 * account; if found, replaces members on it (POST audience_id/users); if
 * not, creates a new audience first (POST act/customaudiences) then uploads.
 * Lookup-then-reuse keeps Meta's audience list from being littered with
 * duplicates on every daily refresh.
 */

import type { AudienceMember } from '@/shared/types/advertising';

const GRAPH_API_VERSION = 'v22.0';
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

interface ExistingAudience {
  id: string;
  name: string;
}

interface ListCustomAudiencesResponse {
  data?: ExistingAudience[];
}

interface CreateCustomAudienceResponse {
  id: string;
}

export interface UpsertCustomAudienceOpts {
  /** Stable name used to look up the existing audience on the ad account. */
  audience_name: string;
  /** Already-hashed members. email_hash MUST be a 64-char hex SHA-256. */
  members: AudienceMember[];
  /** Optional injection point for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export async function upsertCustomAudience(
  opts: UpsertCustomAudienceOpts,
): Promise<{ audience_id: string }> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken) throw new Error('META_ACCESS_TOKEN is not set');
  if (!adAccountId) throw new Error('META_AD_ACCOUNT_ID is not set');

  const fetchFn = opts.fetchImpl ?? fetch;

  // PII safety guard: every member must already be a SHA-256 hex of the
  // normalised email. Reject if any member has a plain-text or invalid hash.
  const hashedEmails: string[] = [];
  for (const m of opts.members) {
    const h = (m as { email_hash?: unknown }).email_hash;
    if (typeof h !== 'string' || !SHA256_HEX_RE.test(h)) {
      throw new Error(
        '[meta-custom-audiences] invalid member.email_hash — expected 64-char SHA-256 hex; refusing to upload to Meta',
      );
    }
    hashedEmails.push(h);
  }

  // 1. Lookup existing audience by name (single page; ad accounts hold few audiences).
  const lookupUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/customaudiences?fields=id,name&access_token=${encodeURIComponent(accessToken)}`;
  const lookupRes = await fetchFn(lookupUrl);
  if (!lookupRes.ok) {
    throw new Error(
      `Meta listCustomAudiences failed: ${lookupRes.status} ${await lookupRes.text().catch(() => '')}`,
    );
  }
  const lookupJson = (await lookupRes.json()) as ListCustomAudiencesResponse;
  const existing = (lookupJson.data ?? []).find((a) => a.name === opts.audience_name);

  let audienceId: string;
  if (existing) {
    audienceId = existing.id;
  } else {
    // 2. Create new audience.
    const createRes = await fetchFn(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/customaudiences`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: opts.audience_name,
          subtype: 'CUSTOM',
          customer_file_source: 'USER_PROVIDED_ONLY',
          access_token: accessToken,
        }),
      },
    );
    if (!createRes.ok) {
      throw new Error(
        `Meta createCustomAudience failed: ${createRes.status} ${await createRes.text().catch(() => '')}`,
      );
    }
    const createJson = (await createRes.json()) as CreateCustomAudienceResponse;
    audienceId = createJson.id;
  }

  // 3. Upload (replace) the user list.
  const uploadRes = await fetchFn(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${audienceId}/users`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          schema: ['EMAIL'],
          data: hashedEmails.map((h) => [h]),
        },
        session: {
          session_id: Date.now(),
          batch_seq: 1,
          last_batch_flag: true,
        },
        access_token: accessToken,
      }),
    },
  );
  if (!uploadRes.ok) {
    throw new Error(
      `Meta upsertAudience users failed: ${uploadRes.status} ${await uploadRes.text().catch(() => '')}`,
    );
  }
  // Drain the response body to free the socket; we don't use the count.
  await uploadRes.json().catch(() => ({}));

  return { audience_id: audienceId };
}
