import { createHash } from 'crypto';
import type { AudienceMember } from '@/shared/types/advertising';
import type { advertisingAudiences } from '@/shared/lib/schema';
import type { InferSelectModel } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Interfaces for injected dependencies (production implementations live
// outside this module; tests supply mocks).
// ---------------------------------------------------------------------------

export interface ExclusionsStripeClient {
  listActiveCustomers(): Promise<Array<{ email_hash: string; user_id: string }>>;
}

export interface ExclusionsPosthogClient {
  getRecentlyRegisteredEmails(sinceDate: Date): Promise<string[]>;
}

export interface ExclusionsMetaApiClient {
  upsertCustomAudience(opts: {
    audience_name: string;
    members: AudienceMember[];
  }): Promise<{ audience_id: string }>;
}

type AudienceRow = InferSelectModel<typeof advertisingAudiences>;

export interface ExclusionsDbClient {
  upsertAudienceRow(row: Omit<AudienceRow, 'id'> & { id?: string }): Promise<AudienceRow>;
}

export interface ExclusionsDeps {
  stripe: ExclusionsStripeClient;
  posthog: ExclusionsPosthogClient;
  metaApi: ExclusionsMetaApiClient;
  db: ExclusionsDbClient;
  /** Override "now" for deterministic tests. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const META_MINIMUM_AUDIENCE_SIZE = 100;
const RECENTLY_REGISTERED_DAYS = 30;
const EXCLUSION_AUDIENCE_NAME = 'estrevia_exclusions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalises and SHA-256 hashes a plain-text email address.
 * Meta requires lowercase hex output.
 */
export function hashEmail(email: string): string {
  const normalised = email.trim().toLowerCase();
  return createHash('sha256').update(normalised).digest('hex');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export type ExclusionsResult =
  | { skipped: true; reason: string }
  | { skipped: false; audience_id: string; size: number };

/**
 * Refreshes the exclusion Custom Audience in Meta.
 *
 * Pulls active Stripe subscribers + PostHog users registered in the last 30 days,
 * hashes their emails, and upserts to Meta. Updates the DB row.
 * Skips if total deduplicated size < 100 (Meta minimum).
 */
export async function refreshExclusions(deps: ExclusionsDeps): Promise<ExclusionsResult> {
  const { stripe, posthog, metaApi, db, now = new Date() } = deps;

  const sinceDate = new Date(now);
  sinceDate.setDate(sinceDate.getDate() - RECENTLY_REGISTERED_DAYS);

  // Pull sources in parallel
  const [activeCustomers, recentEmails] = await Promise.all([
    stripe.listActiveCustomers(),
    posthog.getRecentlyRegisteredEmails(sinceDate),
  ]);

  // Collect all hashes (activeCustomers already deliver pre-hashed values from
  // the Stripe mock — in production these are stored hashed; newly registered
  // users come as plain-text emails from PostHog and are hashed here).
  const hashSet = new Set<string>();

  for (const customer of activeCustomers) {
    hashSet.add(customer.email_hash);
  }

  for (const email of recentEmails) {
    hashSet.add(hashEmail(email));
  }

  const size = hashSet.size;

  if (size < META_MINIMUM_AUDIENCE_SIZE) {
    return {
      skipped: true,
      reason: `Audience size ${size} is below Meta minimum (${META_MINIMUM_AUDIENCE_SIZE})`,
    };
  }

  const members: AudienceMember[] = Array.from(hashSet).map((email_hash) => ({
    email_hash,
  }));

  const { audience_id } = await metaApi.upsertCustomAudience({
    audience_name: EXCLUSION_AUDIENCE_NAME,
    members,
  });

  await db.upsertAudienceRow({
    kind: 'exclusion',
    metaAudienceId: audience_id,
    size,
    lastRefreshedAt: now,
    sourceQuery: `stripe_active + posthog_registered_last_${RECENTLY_REGISTERED_DAYS}d`,
    activeInCampaigns: [],
  });

  return { skipped: false, audience_id, size };
}
