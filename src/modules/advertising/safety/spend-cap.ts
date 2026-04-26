import type { AdMetric, SpendCapState } from '@/shared/types/advertising';
import type { advertisingSpendDaily } from '@/shared/lib/schema';

/** Minimal interface the spend cap needs from the Meta client. */
export interface InsightsProvider {
  getInsights(opts: {
    time_range: { since: string; until: string };
    level: string;
    fields: string[];
  }): Promise<AdMetric[]>;
}

/** Minimal interface the spend cap needs from the Telegram bot. */
export interface AlertSender {
  sendMessage(msg: { severity: string; text: string }): Promise<unknown>;
}

// Default hard cap if env var is missing
const DEFAULT_DAILY_CAP_USD = 80;

/**
 * Minimal DB interface for spend-cap — only what we need (DI-friendly).
 */
export interface SpendCapDb {
  select(): {
    from(table: typeof advertisingSpendDaily): {
      where(condition: unknown): Promise<SpendDailyRow[]>;
    };
  };
  insert(table: typeof advertisingSpendDaily): {
    values(row: {
      date: string;
      spentUsd: number;
      capUsd: number;
      triggeredHalt: boolean;
    }): {
      onConflictDoUpdate(opts: {
        target: unknown;
        set: { spentUsd: number; capUsd: number; triggeredHalt: boolean; updatedAt: Date };
      }): Promise<void>;
    };
  };
}

export interface SpendDailyRow {
  date: string;
  spentUsd: number;
  capUsd: number;
  triggeredHalt: boolean;
}

export interface SpendCapDeps {
  metaApi: InsightsProvider;
  telegramBot: AlertSender;
  db: SpendCapDb;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getCapUsd(): number {
  const raw = process.env.ADVERTISING_DAILY_SPEND_CAP_USD;
  if (!raw) return DEFAULT_DAILY_CAP_USD;
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `ADVERTISING_DAILY_SPEND_CAP_USD is invalid: "${raw}". Must be a positive number.`,
    );
  }
  return parsed;
}

/**
 * Checks whether a planned additional spend is within the daily cap.
 *
 * Reads today's spend from BOTH Meta Insights (real-time) and the
 * advertising_spend_daily DB row; takes the greater of the two for safety.
 * Updates the DB row with the latest known spend.
 *
 * If the cap would be breached: blocks the spend, sends Telegram alert,
 * marks triggered_halt=true in DB.
 */
export async function checkSpendCap(
  plannedDeltaUsd: number,
  deps: SpendCapDeps,
): Promise<{ allowed: boolean; reason?: string; current_state: SpendCapState }> {
  const today = todayUtc();
  const capUsd = getCapUsd();

  const { advertisingSpendDaily: table } = await import('@/shared/lib/schema');
  const { eq } = await import('drizzle-orm');

  // Fetch today's meta spend (real-time)
  const metaInsights = await deps.metaApi.getInsights({
    time_range: { since: today, until: today },
    level: 'account',
    fields: ['spend'],
  });

  const metaSpentUsd = metaInsights.reduce((sum: number, m: { spend_usd: number }) => sum + m.spend_usd, 0);

  // Fetch today's DB row
  const dbRows = await deps.db.select().from(table).where(eq(table.date, today));
  const dbSpentUsd = dbRows[0]?.spentUsd ?? 0;

  // Take the greater of the two for safety
  const spentUsd = Math.max(metaSpentUsd, dbSpentUsd);
  const projected = spentUsd + plannedDeltaUsd;
  const allowed = projected <= capUsd;
  const remainingUsd = Math.max(0, capUsd - spentUsd);

  const state: SpendCapState = {
    date: today,
    spent_usd: spentUsd,
    cap_usd: capUsd,
    remaining_usd: remainingUsd,
    triggered_halt: !allowed,
  };

  // Persist latest spend to DB (upsert)
  await deps.db
    .insert(table)
    .values({
      date: today,
      spentUsd,
      capUsd,
      triggeredHalt: !allowed,
    })
    .onConflictDoUpdate({
      target: table.date,
      set: {
        spentUsd,
        capUsd,
        triggeredHalt: !allowed,
        updatedAt: new Date(),
      },
    });

  if (!allowed) {
    const reason =
      `spend_cap_exceeded: projected $${projected.toFixed(2)} > cap $${capUsd.toFixed(2)} ` +
      `(today $${spentUsd.toFixed(2)} + planned $${plannedDeltaUsd.toFixed(2)})`;

    // Alert via Telegram
    await deps.telegramBot.sendMessage({
      severity: 'critical',
      text:
        `[Advertising Agent] SPEND CAP TRIGGERED\n` +
        `Date: ${today}\n` +
        `Today spent: $${spentUsd.toFixed(2)}\n` +
        `Planned delta: $${plannedDeltaUsd.toFixed(2)}\n` +
        `Cap: $${capUsd.toFixed(2)}\n` +
        `All further spend is blocked for today.`,
    });

    return { allowed: false, reason, current_state: state };
  }

  return { allowed: true, current_state: state };
}
