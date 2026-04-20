import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './redis';

// ---------------------------------------------------------------------------
// Per-endpoint rate limiters (sliding window)
// ---------------------------------------------------------------------------

const limiters: Record<string, Ratelimit> = {
  'chart/calculate': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1m'),
    prefix: 'rl:chart/calculate',
  }),
  'chart/save': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1m'),
    prefix: 'rl:chart/save',
  }),
  cities: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1m'),
    prefix: 'rl:cities',
  }),
  'passport/create': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1m'),
    prefix: 'rl:passport/create',
  }),
  'passport/view': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '1m'),
    prefix: 'rl:passport/view',
  }),
  moon: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1m'),
    prefix: 'rl:moon',
  }),
  'moon/calendar': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1m'),
    prefix: 'rl:moon/calendar',
  }),
  'moon/voc': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1m'),
    prefix: 'rl:moon/voc',
  }),
  hours: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1m'),
    prefix: 'rl:hours',
  }),
  health: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '1m'),
    prefix: 'rl:health',
  }),
  'stripe/checkout': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1m'),
    prefix: 'rl:stripe/checkout',
  }),
  'stripe/portal': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1m'),
    prefix: 'rl:stripe/portal',
  }),
  'avatar/generate': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '1m'),
    prefix: 'rl:avatar/generate',
  }),
  'synastry/calculate': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1m'),
    prefix: 'rl:synastry/calculate',
  }),
  'synastry/view': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1m'),
    prefix: 'rl:synastry/view',
  }),
  'tarot/daily': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1m'),
    prefix: 'rl:tarot/daily',
  }),
  'tarot/interpret': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1m'),
    prefix: 'rl:tarot/interpret',
  }),
  'chart/sun-sign': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(15, '1m'),
    prefix: 'rl:chart/sun-sign',
  }),
  'user/account': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '1h'),
    prefix: 'rl:user/account',
  }),
  'push/subscribe': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1m'),
    prefix: 'rl:push/subscribe',
  }),
  'push/preferences': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(15, '1m'),
    prefix: 'rl:push/preferences',
  }),
  'user/subscription': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1m'),
    prefix: 'rl:user/subscription',
  }),
  'support/contact': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '5m'),
    prefix: 'rl:support/contact',
  }),
};

// Fallback limiter for endpoints not explicitly configured (general API limit)
const defaultLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1m'),
  prefix: 'rl:default',
});

/**
 * Returns the rate limiter for a given endpoint key.
 * Falls back to the default (100 req/min) limiter if the key is unknown.
 */
export function getRateLimiter(endpoint: string): Ratelimit {
  return limiters[endpoint] ?? defaultLimiter;
}
