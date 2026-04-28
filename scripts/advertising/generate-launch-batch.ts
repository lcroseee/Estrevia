import 'dotenv/config';

const REQUIRED_ENV_VARS = [
  'GEMINI_API_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'ANTHROPIC_API_KEY',
  'DATABASE_URL',
] as const;

export type ValidateEnvResult =
  | { ok: true }
  | { ok: false; missing: string[] };

export function validateEnv(): ValidateEnvResult {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true };
}
