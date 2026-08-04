// src/shared/lib/__tests__/portrait-guards.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isPortraitEnabled,
  dailyBudgetKey,
  checkDailyBudget,
  consumeDailyBudget,
  DAILY_CAP_DEFAULT,
} from '../portrait-guards';

function fakeRedis(initial: number | null = null) {
  let value = initial;
  return {
    get: vi.fn(async () => value),
    incr: vi.fn(async () => {
      value = (value ?? 0) + 1;
      return value;
    }),
    expire: vi.fn(async () => 1),
    peek: () => value,
  };
}

describe('isPortraitEnabled', () => {
  const prev = process.env.AVATAR_PORTRAIT_ENABLED;
  afterEach(() => {
    if (prev === undefined) delete process.env.AVATAR_PORTRAIT_ENABLED;
    else process.env.AVATAR_PORTRAIT_ENABLED = prev;
  });

  it('is off when the variable is absent — the feature must be opted into', () => {
    delete process.env.AVATAR_PORTRAIT_ENABLED;
    expect(isPortraitEnabled()).toBe(false);
  });

  it.each(['false', '0', '', 'yes', 'TRUE '])('is off for %o', (v) => {
    process.env.AVATAR_PORTRAIT_ENABLED = v;
    expect(isPortraitEnabled()).toBe(false);
  });

  it('is on only for the exact string "true"', () => {
    process.env.AVATAR_PORTRAIT_ENABLED = 'true';
    expect(isPortraitEnabled()).toBe(true);
  });
});

describe('dailyBudgetKey', () => {
  it('is scoped to the UTC day', () => {
    expect(dailyBudgetKey(new Date('2026-08-02T23:59:00Z'))).toBe('portrait:budget:2026-08-02');
    expect(dailyBudgetKey(new Date('2026-08-03T00:01:00Z'))).toBe('portrait:budget:2026-08-03');
  });
});

describe('daily budget', () => {
  const prev = process.env.AVATAR_PORTRAIT_DAILY_CAP;
  beforeEach(() => { delete process.env.AVATAR_PORTRAIT_DAILY_CAP; });
  afterEach(() => {
    if (prev === undefined) delete process.env.AVATAR_PORTRAIT_DAILY_CAP;
    else process.env.AVATAR_PORTRAIT_DAILY_CAP = prev;
  });

  it('allows when the counter is unset', async () => {
    expect(await checkDailyBudget(fakeRedis(null))).toBe(true);
  });

  it('allows one below the cap and blocks at the cap', async () => {
    expect(await checkDailyBudget(fakeRedis(DAILY_CAP_DEFAULT - 1))).toBe(true);
    expect(await checkDailyBudget(fakeRedis(DAILY_CAP_DEFAULT))).toBe(false);
  });

  it('honours AVATAR_PORTRAIT_DAILY_CAP', async () => {
    process.env.AVATAR_PORTRAIT_DAILY_CAP = '5';
    expect(await checkDailyBudget(fakeRedis(4))).toBe(true);
    expect(await checkDailyBudget(fakeRedis(5))).toBe(false);
  });

  it('treats a string counter value from Redis as a number', async () => {
    const r = { get: vi.fn(async () => '200'), incr: vi.fn(), expire: vi.fn() };
    expect(await checkDailyBudget(r as never)).toBe(false);
  });

  it('fails OPEN when Redis is unreachable — a monitoring outage must not block paying users', async () => {
    const r = { get: vi.fn(async () => { throw new Error('down'); }), incr: vi.fn(), expire: vi.fn() };
    expect(await checkDailyBudget(r as never)).toBe(true);
  });

  it('consume increments and sets a 48h TTL', async () => {
    const r = fakeRedis(0);
    await consumeDailyBudget(r);
    expect(r.incr).toHaveBeenCalledTimes(1);
    expect(r.expire).toHaveBeenCalledWith(expect.stringContaining('portrait:budget:'), 172800);
    expect(r.peek()).toBe(1);
  });

  it('consume never throws when Redis is down', async () => {
    const r = { get: vi.fn(), incr: vi.fn(async () => { throw new Error('down'); }), expire: vi.fn() };
    await expect(consumeDailyBudget(r as never)).resolves.toBeUndefined();
  });
});
