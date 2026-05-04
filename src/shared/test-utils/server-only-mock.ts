// No-op mock for `server-only` in vitest (node environment).
// The real package throws at import time in non-Next.js bundler context.
// This alias is configured in vitest.config.ts so tests can import server
// modules without crashing.
export {};
