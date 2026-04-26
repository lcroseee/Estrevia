import { createHash } from 'crypto';
import type { AudienceMember } from '@/shared/types/advertising';
import type { advertisingAudiences } from '@/shared/lib/schema';
import type { InferSelectModel } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Interfaces for injected dependencies
// ---------------------------------------------------------------------------

export interface RetargetingPosthogClient {
  /**
   * Returns emails of users who fired `chart_calculated` in the last
   * `windowDays` days but did NOT fire `user_registered`.
   */
  getCalcNoRegisterEmails(windowDays: number): Promise<string[]>;
  /**
   * Returns emails of users who fired `user_registered` in the last
   * `windowDays` days but did NOT fire `subscription_started`.
   */
  getRegisterNoPaidEmails(windowDays: number): Promise<string[]>;
}

export interface RetargetingMetaApiClient {
  upsertCustomAudience(opts: {
    audience_name: string;
    members: AudienceMember[];
  }): Promise<{ audience_id: string }>;
}

type AudienceRow = InferSelectModel<typeof advertisingAudiences>;

export interface RetargetingDbClient {
  upsertAudienceRow(row: Omit<AudienceRow, 'id'> & { id?: string }): Promise<AudienceRow>;
  /**
   * Reads the current feature-gate mode for a given featureId.
   * Returns null if the gate does not exist.
   */
  getFeatureGateMode(featureId: string): Promise<string | null>;
  /**
   * Activates the audience in Meta by setting mode to 'active_auto'.
   */
  activateFeatureGate(featureId: string): Promise<void>;
}

export interface RetargetingDeps {
  posthog: RetargetingPosthogClient;
  metaApi: RetargetingMetaApiClient;
  db: RetargetingDbClient;
  /** Override "now" for deterministic tests. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const META_MINIMUM_ACTIVATION_SIZE = 200;

const AUDIENCE_CONFIG = {
  calc_no_register: {
    windowDays: 14,
    audienceName: 'estrevia_retarget_calc_no_register',
    kind: 'retargeting_calc_no_register' as const,
    featureGateId: 'retargeting_calc_no_register',
  },
  register_no_paid: {
    windowDays: 30,
    audienceName: 'estrevia_retarget_register_no_paid',
    kind: 'retargeting_register_no_paid' as const,
    featureGateId: 'retargeting_register_no_paid',
  },
} as const;

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
// Result types
// ---------------------------------------------------------------------------

export interface RetargetingAudienceResult {
  audience_id: string;
  size: number;
  activated_in_meta: boolean;
}

export interface RetargetingResult {
  calc_no_register: RetargetingAudienceResult;
  register_no_paid: RetargetingAudienceResult;
}

// ---------------------------------------------------------------------------
// Internal helper for a single audience
// ---------------------------------------------------------------------------

async function refreshSingleRetargetingAudience(opts: {
  emails: string[];
  config: (typeof AUDIENCE_CONFIG)[keyof typeof AUDIENCE_CONFIG];
  metaApi: RetargetingMetaApiClient;
  db: RetargetingDbClient;
  now: Date;
}): Promise<RetargetingAudienceResult> {
  const { emails, config, metaApi, db, now } = opts;

  const members: AudienceMember[] = emails.map((email) => ({
    email_hash: hashEmail(email),
  }));

  const size = members.length;

  const { audience_id } = await metaApi.upsertCustomAudience({
    audience_name: config.audienceName,
    members,
  });

  await db.upsertAudienceRow({
    kind: config.kind,
    metaAudienceId: audience_id,
    size,
    lastRefreshedAt: now,
    sourceQuery: `posthog_${config.kind}_${config.windowDays}d`,
    activeInCampaigns: [],
  });

  // Activate in Meta via feature gate when audience exceeds threshold
  let activated_in_meta = false;
  if (size > META_MINIMUM_ACTIVATION_SIZE) {
    const currentMode = await db.getFeatureGateMode(config.featureGateId);
    if (currentMode !== 'active_auto') {
      await db.activateFeatureGate(config.featureGateId);
      activated_in_meta = true;
    }
  }

  return { audience_id, size, activated_in_meta };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Refreshes both retargeting Custom Audiences in Meta:
 * - `calc_no_register`: users who calculated chart in last 14d but did not register
 * - `register_no_paid`: users who registered in last 30d but did not start subscription
 *
 * Each audience is activated in Meta (feature gate → active_auto) once size > 200.
 */
export async function refreshRetargeting(deps: RetargetingDeps): Promise<RetargetingResult> {
  const { posthog, metaApi, db, now = new Date() } = deps;

  const [calcNoRegisterEmails, registerNoPaidEmails] = await Promise.all([
    posthog.getCalcNoRegisterEmails(AUDIENCE_CONFIG.calc_no_register.windowDays),
    posthog.getRegisterNoPaidEmails(AUDIENCE_CONFIG.register_no_paid.windowDays),
  ]);

  const [calcNoRegisterResult, registerNoPaidResult] = await Promise.all([
    refreshSingleRetargetingAudience({
      emails: calcNoRegisterEmails,
      config: AUDIENCE_CONFIG.calc_no_register,
      metaApi,
      db,
      now,
    }),
    refreshSingleRetargetingAudience({
      emails: registerNoPaidEmails,
      config: AUDIENCE_CONFIG.register_no_paid,
      metaApi,
      db,
      now,
    }),
  ]);

  return {
    calc_no_register: calcNoRegisterResult,
    register_no_paid: registerNoPaidResult,
  };
}
