/**
 * Postgres unique-violation detector (SQLSTATE 23505).
 * Drizzle + @neondatabase/serverless surface the code either directly on the
 * thrown object or on its `cause` — check both.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } | null };
  if (e.code === '23505') return true;
  if (typeof e.cause === 'object' && e.cause !== null && e.cause.code === '23505') return true;
  return false;
}
