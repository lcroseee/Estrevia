import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// Lazy initialization — safe for build time when DATABASE_URL may not be present.
// neon() throws synchronously if DATABASE_URL is missing, so we defer the call
// until the first actual DB usage (inside a request handler, not at module load).

type DrizzleDb = ReturnType<typeof createDb>;

function createDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

let _db: DrizzleDb | null = null;

export function getDb(): DrizzleDb {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

// Convenience re-export for the common case where build-time safety is not a concern
// (e.g., server-only modules that are never bundled at build time).
export { schema };
