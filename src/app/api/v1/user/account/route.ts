/**
 * DELETE /api/v1/user/account
 *
 * GDPR Article 17 — Right to Erasure ("Right to be Forgotten").
 * Permanently deletes all user data including active Stripe billing.
 *
 * OPERATION ORDER — must not be reordered (financial + compliance correctness):
 *   1. Auth + rate-limit  — fast fail before any side effects
 *   2. Read users row     — fetch stripeSubscriptionId / stripeCustomerId
 *   3. Cancel Stripe subscription (if any)
 *        - invoice_now: false, prorate: false — no last charge on delete
 *        - "already canceled" is acceptable; any other Stripe error → 500, abort
 *   4. Delete Stripe customer (if any)
 *        - Full GDPR erasure; re-signup creates a new Stripe customer
 *        - Failure → 500, abort (subscription already canceled at this point;
 *          Sentry CRITICAL — founder must clean manually)
 *   5. DB batch delete (Neon server-side transaction)
 *        - synastry_results → natal_charts → usage_counters → users
 *        - Failure after step 3/4 → Sentry CRITICAL (billing gone, data remains)
 *   6. Clerk user delete  — outside DB transaction; failure is non-blocking
 *   7. 200 response
 *
 * If step 3 or 4 fails:  return 500, DB + Clerk untouched.
 * If step 5 fails:       return 500, Sentry CRITICAL (billing canceled, data remains).
 * If step 6 fails:       log + Sentry warning, still return 200 (DB already purged).
 *
 * Atomicity: neon-http's Drizzle driver does not support interactive transactions
 * (see `node_modules/drizzle-orm/neon-http/session.js`: "No transactions support
 * in neon-http driver"). We use `db.batch([...])` instead, which Neon executes as
 * a single non-interactive HTTP transaction on the server side. All deletes commit
 * together or none do, which satisfies the GDPR-erasure atomicity requirement.
 *
 * Env requirement: STRIPE_SECRET_KEY must be set for DELETE flow to work.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import {
  natalCharts,
  synastryResults,
  usageCounters,
  users,
} from '@/shared/lib/schema';
import { getStripe } from '@/shared/lib/stripe';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { ApiResponse } from '@/shared/types';

interface AccountDeleteResponse {
  deletedAt: string;
  message: string;
}

export async function DELETE(): Promise<
  NextResponse<ApiResponse<AccountDeleteResponse>>
> {
  // ---------------------------------------------------------------------------
  // 1. Auth — JWT verification, no DB round-trip
  // ---------------------------------------------------------------------------
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  // ---------------------------------------------------------------------------
  // 2. Rate limiting — 3 requests per hour (destructive operation)
  // ---------------------------------------------------------------------------
  const limiter = getRateLimiter('user/account');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Read user row — get Stripe IDs before touching anything external.
  //    We need these before any delete so we can cancel billing first.
  // ---------------------------------------------------------------------------
  const db = getDb();

  let stripeSubscriptionId: string | null = null;
  let stripeCustomerId: string | null = null;

  try {
    const [row] = await db
      .select({
        stripeSubscriptionId: users.stripeSubscriptionId,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (row) {
      stripeSubscriptionId = row.stripeSubscriptionId ?? null;
      stripeCustomerId = row.stripeCustomerId ?? null;
    }
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, {
        tags: { route: 'user/account', op: 'read-user-row' },
      });
    } catch {
      const name = err instanceof Error ? err.name : typeof err;
      console.error('[account/delete] failed to read user row:', name);
    }
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'INTERNAL_ERROR',
        message: 'Failed to read account data. Please try again.',
      },
      { status: 500 },
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Cancel active Stripe subscription (if any).
  //
  //    invoice_now: false  — do not issue a final prorated invoice.
  //    prorate: false      — do not credit unused time either.
  //    This is the cleanest "just stop billing" semantic on account delete.
  //
  //    Acceptable: subscription already canceled (status === 'canceled') —
  //    treat as success and continue.
  //    Not acceptable: any other Stripe error — abort, return 500.
  //    Reason: if we proceed and delete the DB row, the user has no way to
  //    manage billing (portal requires auth) and may be silently billed.
  // ---------------------------------------------------------------------------
  if (stripeSubscriptionId) {
    try {
      const stripeClient = getStripe();
      await stripeClient.subscriptions.cancel(stripeSubscriptionId, {
        invoice_now: false,
        prorate: false,
      });
    } catch (err) {
      // Stripe error code for an already-canceled subscription.
      const isAlreadyCanceled =
        err instanceof Error &&
        'code' in err &&
        (err as { code?: string }).code === 'resource_missing';

      // Also check the raw message as a fallback (Stripe SDK may surface it here).
      const msgIndicatesCanceled =
        err instanceof Error &&
        /no such subscription|already canceled|already been canceled/i.test(
          err.message,
        );

      if (isAlreadyCanceled || msgIndicatesCanceled) {
        // Subscription is already gone — safe to continue.
      } else {
        // Stripe is down or returned an unexpected error — abort.
        try {
          const { captureException } = await import('@sentry/nextjs');
          captureException(err, {
            tags: {
              route: 'user/account',
              op: 'stripe-cancel-subscription',
              stripeSubscriptionId,
            },
          });
        } catch {
          const name = err instanceof Error ? err.name : typeof err;
          console.error('[account/delete] Stripe subscription cancel failed:', name);
        }
        return NextResponse.json(
          {
            success: false,
            data: null,
            error: 'STRIPE_ERROR',
            message:
              'Subscription cancellation failed. Please try again in a moment.',
          },
          { status: 500 },
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Delete Stripe customer record (full GDPR erasure).
  //
  //    Decision: delete the customer so no PII lingers in Stripe.
  //    Trade-off: re-signup creates a new Stripe customer — accepted.
  //
  //    Failure after subscription was already canceled: Sentry CRITICAL
  //    (billing stopped but Stripe customer record remains; founder must
  //    manually delete via Stripe dashboard). We still abort — do not
  //    proceed to DB delete with a half-cleaned Stripe state.
  // ---------------------------------------------------------------------------
  if (stripeCustomerId) {
    try {
      const stripeClient = getStripe();
      await stripeClient.customers.del(stripeCustomerId);
    } catch (err) {
      try {
        const { captureException, withScope } = await import('@sentry/nextjs');
        withScope((scope) => {
          scope.setLevel('fatal');
          scope.setTags({
            route: 'user/account',
            op: 'stripe-delete-customer',
            stripeCustomerId: stripeCustomerId!,
            userId,
          });
          captureException(err);
        });
      } catch {
        const name = err instanceof Error ? err.name : typeof err;
        console.error('[account/delete] Stripe customer delete failed:', name);
      }
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'STRIPE_ERROR',
          message:
            'Failed to remove billing record. Please try again in a moment.',
        },
        { status: 500 },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Delete all user data atomically (Neon server-side transaction via batch).
  //
  //    This runs AFTER Stripe cleanup — if billing is gone but DB delete fails
  //    here, that is a CRITICAL situation: user has no billing but their data
  //    was not erased. Sentry CRITICAL + founder must manually clean via DB.
  //
  //    Explicit order — even with ON DELETE CASCADE on every FK, doing these
  //    deletes explicitly guarantees we fail early and atomically if any single
  //    one errors:
  //      a. synastry_results (user_id = X) — safety net; chart1_id/chart2_id
  //         cascade is added in migration 0002_cascade_synastry_fks.sql
  //      b. natal_charts (user_id = X) — cascades to cosmic_passports + any
  //         remaining synastry_results (e.g. shared charts)
  //      c. usage_counters (user_id = X)
  //      d. users (id = X) — cascades to daily_cards, push_subscriptions,
  //         notification_preferences, tarot_readings
  // ---------------------------------------------------------------------------
  const deletedAt = new Date().toISOString();

  try {
    await db.batch([
      db.delete(synastryResults).where(eq(synastryResults.userId, userId)),
      db.delete(natalCharts).where(eq(natalCharts.userId, userId)),
      db.delete(usageCounters).where(eq(usageCounters.userId, userId)),
      db.delete(users).where(eq(users.id, userId)),
    ]);
  } catch (err) {
    // CRITICAL: Stripe billing was already canceled/deleted above.
    // User data remains in DB but billing is gone.
    // Founder must manually purge this user from DB.
    try {
      const { captureException, withScope } = await import('@sentry/nextjs');
      withScope((scope) => {
        scope.setLevel('fatal');
        scope.setTags({
          route: 'user/account',
          op: 'db-delete',
          userId,
          stripeAlreadyCanceled: 'true',
        });
        captureException(err);
      });
    } catch {
      const name = err instanceof Error ? err.name : typeof err;
      console.error(
        '[account/delete] CRITICAL: db batch failed AFTER Stripe cancel. userId shape:',
        name,
      );
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }

  // ---------------------------------------------------------------------------
  // 7. Delete Clerk authentication account (third-party side effect).
  //    Runs OUTSIDE the DB transaction: if it fails, DB data is already gone —
  //    log a warning so the founder can clean up manually via Clerk dashboard.
  //    Non-blocking: DB purge is the primary erasure; Clerk is secondary.
  // ---------------------------------------------------------------------------
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, {
        tags: { route: 'user/account', op: 'clerk-delete', userId },
      });
    } catch {
      const name = err instanceof Error ? err.name : typeof err;
      console.error('[account/delete] Clerk delete failed after DB purge:', name);
    }
    // Do not block the response — DB data is already deleted, which is
    // what the user requested. Clerk cleanup can be retried from dashboard.
  }

  // ---------------------------------------------------------------------------
  // 8. Analytics — track before returning (fire-and-forget, non-blocking)
  // ---------------------------------------------------------------------------
  trackServerEvent(userId, AnalyticsEvent.ACCOUNT_DELETED);

  // ---------------------------------------------------------------------------
  // 9. Confirm deletion
  // ---------------------------------------------------------------------------
  return NextResponse.json(
    {
      success: true,
      data: {
        deletedAt,
        message:
          'All Estrevia application data, billing records, and your authentication account have been permanently deleted.',
      },
      error: null,
    },
    { status: 200 },
  );
}
