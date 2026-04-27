/**
 * Pre-launch verification script for the Estrevia advertising agent.
 *
 * Runs all critical checks before the founder activates the agent:
 *   - Required env vars present (no values logged, only presence + format hints)
 *   - API health checks: Meta, CAPI, Telegram, Anthropic Claude, Gemini
 *   - Database connection + advertising tables exist + feature gates seeded
 *   - CRON_SECRET entropy
 *
 * Usage: npx tsx scripts/advertising/pre-launch-check.ts
 * Exit:  0 if all errors = 0 (warnings are OK), 1 if any errors
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = 'info' | 'warning' | 'error';

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  severity: Severity;
}

// ---------------------------------------------------------------------------
// Terminal helpers — chalk v4 (CommonJS) is available in node_modules
// ---------------------------------------------------------------------------

// chalk v4 is CJS — require() works fine under tsx
// eslint-disable-next-line @typescript-eslint/no-require-imports
const chalk = require('chalk') as typeof import('chalk');

function symbol(result: CheckResult): string {
  if (!result.passed) {
    return result.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
  }
  return chalk.green('✓');
}

function label(result: CheckResult): string {
  if (!result.passed) {
    return result.severity === 'error'
      ? chalk.red(result.name)
      : chalk.yellow(result.name);
  }
  return chalk.green(result.name);
}

// ---------------------------------------------------------------------------
// Fetch with timeout (10 s)
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ---------------------------------------------------------------------------
// Individual check helpers
// ---------------------------------------------------------------------------

// ---- ENV checks -----

interface EnvCheckOptions {
  name: string;
  severity: Severity;
  /** Optional format hint shown alongside length (no value!) */
  formatHint?: (value: string) => string;
}

function checkEnvVar(opts: EnvCheckOptions): CheckResult {
  const value = process.env[opts.name];
  if (!value) {
    return {
      name: `ENV: ${opts.name}`,
      passed: false,
      message: 'not set',
      severity: opts.severity,
    };
  }
  const hint = opts.formatHint ? ` — ${opts.formatHint(value)}` : '';
  return {
    name: `ENV: ${opts.name}`,
    passed: true,
    message: `set, ${value.length} chars${hint}`,
    severity: 'info',
  };
}

// ---- Meta /me -----

async function checkMetaMe(): Promise<CheckResult> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return {
      name: 'API: Meta /me',
      passed: false,
      message: 'skipped — META_ACCESS_TOKEN not set',
      severity: 'error',
    };
  }
  try {
    const res = await fetchWithTimeout(
      `https://graph.facebook.com/v22.0/me?access_token=${token}`,
    );
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok || !body['id']) {
      return {
        name: 'API: Meta /me',
        passed: false,
        message: `HTTP ${res.status} — ${JSON.stringify(body).slice(0, 120)}`,
        severity: 'error',
      };
    }
    return {
      name: 'API: Meta /me',
      passed: true,
      message: `200 OK, app_id=${body['id']}`,
      severity: 'info',
    };
  } catch (err) {
    return {
      name: 'API: Meta /me',
      passed: false,
      message: `request failed: ${String(err)}`,
      severity: 'error',
    };
  }
}

// ---- Meta Ad Account -----

async function checkMetaAdAccount(): Promise<CheckResult> {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) {
    return {
      name: 'API: Meta ad account',
      passed: false,
      message: 'skipped — META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not set',
      severity: 'error',
    };
  }
  try {
    const res = await fetchWithTimeout(
      `https://graph.facebook.com/v22.0/${encodeURIComponent(accountId)}?fields=name,account_status&access_token=${token}`,
    );
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return {
        name: 'API: Meta ad account',
        passed: false,
        message: `HTTP ${res.status} — ${JSON.stringify(body).slice(0, 120)}`,
        severity: 'error',
      };
    }
    // account_status: 1 = active, other values = disabled/restricted/etc.
    const status = body['account_status'];
    const name = body['name'] ?? '(no name)';
    if (status !== 1) {
      return {
        name: 'API: Meta ad account',
        passed: false,
        message: `account "${name}" is not active (account_status=${status})`,
        severity: 'error',
      };
    }
    return {
      name: 'API: Meta ad account',
      passed: true,
      message: `active — "${name}"`,
      severity: 'info',
    };
  } catch (err) {
    return {
      name: 'API: Meta ad account',
      passed: false,
      message: `request failed: ${String(err)}`,
      severity: 'error',
    };
  }
}

// ---- CAPI test event -----

async function checkCapiTestEvent(): Promise<CheckResult> {
  const pixelId = process.env.META_PIXEL_ID;
  const capiToken = process.env.META_CAPI_TOKEN;
  if (!pixelId || !capiToken) {
    return {
      name: 'API: CAPI test event',
      passed: false,
      message: 'skipped — META_PIXEL_ID or META_CAPI_TOKEN not set',
      severity: 'error',
    };
  }

  const payload = {
    data: [
      {
        event_name: 'PageView',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: 'https://estrevia.app/pre-launch-check',
        user_data: {
          client_ip_address: '127.0.0.1',
          client_user_agent: 'Mozilla/5.0 (pre-launch-check)',
        },
      },
    ],
    test_event_code: 'TEST00000',
    access_token: capiToken,
  };

  try {
    const res = await fetchWithTimeout(
      `https://graph.facebook.com/v22.0/${encodeURIComponent(pixelId)}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return {
        name: 'API: CAPI test event',
        passed: false,
        message: `HTTP ${res.status} — ${JSON.stringify(body).slice(0, 120)}`,
        severity: 'error',
      };
    }

    // Check Event Match Quality if present
    const events = body['events_received'];
    // Some response shapes include 'num_processed_entries' / no EMQ in test mode
    const numReceived = typeof events === 'number' ? events : null;

    // Parse any EMQ data if present (field: event_match_quality)
    const emqData = (body as Record<string, Record<string, unknown>>)?.['event_match_quality'];
    if (emqData && typeof emqData['score'] === 'number') {
      const score = emqData['score'] as number;
      if (score < 6.0) {
        return {
          name: 'API: CAPI test event',
          passed: true,
          message: `200 OK — EMQ score ${score.toFixed(1)} (recommend ≥6.0 — improve email/phone hashing)`,
          severity: 'warning',
        };
      }
      return {
        name: 'API: CAPI test event',
        passed: true,
        message: `200 OK — EMQ score ${score.toFixed(1)} (good)`,
        severity: 'info',
      };
    }

    const eventsNote = numReceived !== null ? `, ${numReceived} event(s) received` : '';
    return {
      name: 'API: CAPI test event',
      passed: true,
      message: `200 OK${eventsNote} (test_event_code accepted)`,
      severity: 'info',
    };
  } catch (err) {
    return {
      name: 'API: CAPI test event',
      passed: false,
      message: `request failed: ${String(err)}`,
      severity: 'error',
    };
  }
}

// ---- Telegram getMe -----

async function checkTelegramGetMe(): Promise<CheckResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return {
      name: 'API: Telegram getMe',
      passed: false,
      message: 'skipped — TELEGRAM_BOT_TOKEN not set',
      severity: 'error',
    };
  }
  try {
    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${token}/getMe`,
    );
    const body = await res.json() as { ok: boolean; result?: { username?: string } };
    if (!res.ok || !body.ok) {
      return {
        name: 'API: Telegram getMe',
        passed: false,
        message: `HTTP ${res.status} — ${JSON.stringify(body).slice(0, 120)}`,
        severity: 'error',
      };
    }
    const username = body.result?.username ?? '(no username)';
    return {
      name: 'API: Telegram getMe',
      passed: true,
      message: `bot username @${username}`,
      severity: 'info',
    };
  } catch (err) {
    return {
      name: 'API: Telegram getMe',
      passed: false,
      message: `request failed: ${String(err)}`,
      severity: 'error',
    };
  }
}

// ---- Telegram send test message -----

async function checkTelegramSendMessage(): Promise<CheckResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) {
    return {
      name: 'API: Telegram chat reachable',
      passed: false,
      message: 'skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_FOUNDER_CHAT_ID not set',
      severity: 'error',
    };
  }
  try {
    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '🤖 Estrevia advertising agent — pre-launch check successful. You can ignore this message.',
        }),
      },
    );
    const body = await res.json() as { ok: boolean; result?: { message_id?: number } };
    if (!res.ok || !body.ok) {
      return {
        name: 'API: Telegram chat reachable',
        passed: false,
        message: `HTTP ${res.status} — ${JSON.stringify(body).slice(0, 120)}`,
        severity: 'error',
      };
    }
    const msgId = body.result?.message_id;
    return {
      name: 'API: Telegram chat reachable',
      passed: true,
      message: `message delivered (message_id=${msgId})`,
      severity: 'info',
    };
  } catch (err) {
    return {
      name: 'API: Telegram chat reachable',
      passed: false,
      message: `request failed: ${String(err)}`,
      severity: 'error',
    };
  }
}

// ---- Anthropic Claude -----

async function checkAnthropicClaude(): Promise<CheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      name: 'API: Claude (Anthropic)',
      passed: false,
      message: 'skipped — ANTHROPIC_API_KEY not set',
      severity: 'error',
    };
  }
  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 16,
        messages: [{ role: 'user', content: "Reply with the single word 'ok'." }],
      }),
    });
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return {
        name: 'API: Claude (Anthropic)',
        passed: false,
        message: `HTTP ${res.status} — ${JSON.stringify(body).slice(0, 120)}`,
        severity: 'error',
      };
    }
    const content = (body['content'] as Array<{ text?: string }> | undefined)?.[0]?.text?.trim();
    return {
      name: 'API: Claude (Anthropic)',
      passed: true,
      message: `responded "${content ?? '(empty)'}"`,
      severity: 'info',
    };
  } catch (err) {
    return {
      name: 'API: Claude (Anthropic)',
      passed: false,
      message: `request failed: ${String(err)}`,
      severity: 'error',
    };
  }
}

// ---- Gemini API -----

async function checkGeminiApi(): Promise<CheckResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      name: 'API: Gemini',
      passed: false,
      message: 'skipped — GEMINI_API_KEY not set',
      severity: 'error',
    };
  }
  try {
    // List available models — lightweight auth check, no generation cost
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return {
        name: 'API: Gemini',
        passed: false,
        message: `HTTP ${res.status} — ${JSON.stringify(body).slice(0, 120)}`,
        severity: 'error',
      };
    }
    const models = (body['models'] as unknown[]) ?? [];
    return {
      name: 'API: Gemini',
      passed: true,
      message: `auth ok — ${models.length} models listed`,
      severity: 'info',
    };
  } catch (err) {
    return {
      name: 'API: Gemini',
      passed: false,
      message: `request failed: ${String(err)}`,
      severity: 'error',
    };
  }
}

// ---- DB connection -----

async function checkDbConnection(): Promise<CheckResult> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return {
      name: 'DB: connection',
      passed: false,
      message: 'skipped — DATABASE_URL not set',
      severity: 'error',
    };
  }
  try {
    const sql = neon(url);
    await sql`SELECT 1`;
    return {
      name: 'DB: connection',
      passed: true,
      message: 'SELECT 1 — ok',
      severity: 'info',
    };
  } catch (err) {
    return {
      name: 'DB: connection',
      passed: false,
      message: `connection failed: ${String(err)}`,
      severity: 'error',
    };
  }
}

// ---- Advertising tables -----

const EXPECTED_ADVERTISING_TABLES = [
  'advertising_decisions',
  'advertising_creatives',
  'advertising_feature_gates',
  'advertising_spend_daily',
  'advertising_audiences',
  'advertising_shadow_comparisons',
] as const;

async function checkAdvertisingTables(): Promise<CheckResult> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return {
      name: 'DB: advertising tables',
      passed: false,
      message: 'skipped — DATABASE_URL not set',
      severity: 'error',
    };
  }
  try {
    const sql = neon(url);
    const rows = (await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name LIKE 'advertising_%'
    `) as Array<{ table_name: string }>;
    const found = new Set(rows.map((r) => r.table_name));
    const missing = EXPECTED_ADVERTISING_TABLES.filter((t) => !found.has(t));

    if (missing.length > 0) {
      return {
        name: 'DB: advertising tables',
        passed: false,
        message: `missing ${missing.length} table(s): ${missing.join(', ')}`,
        severity: 'error',
      };
    }
    return {
      name: 'DB: advertising tables',
      passed: true,
      message: `all ${EXPECTED_ADVERTISING_TABLES.length} advertising_* tables present`,
      severity: 'info',
    };
  } catch (err) {
    return {
      name: 'DB: advertising tables',
      passed: false,
      message: `query failed: ${String(err)}`,
      severity: 'error',
    };
  }
}

// ---- Feature gates seeded -----

const EXPECTED_FEATURE_GATES = [
  'bayesianDecisions',
  'anomalyDetection',
  'retargetingCampaigns',
  'exclusionsCampaigns',
] as const;

async function checkFeatureGatesSeeded(): Promise<CheckResult> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return {
      name: 'DB: feature gates seeded',
      passed: false,
      message: 'skipped — DATABASE_URL not set',
      severity: 'error',
    };
  }
  try {
    const sql = neon(url);

    // Check if table exists first
    const tableCheck = (await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'advertising_feature_gates'
      ) AS exists
    `) as Array<{ exists: boolean }>;
    if (!tableCheck[0]?.exists) {
      return {
        name: 'DB: feature gates seeded',
        passed: false,
        message: 'table advertising_feature_gates does not exist — run migrations first',
        severity: 'error',
      };
    }

    const rows = (await sql`
      SELECT feature_id FROM advertising_feature_gates
    `) as Array<{ feature_id: string }>;
    const found = new Set(rows.map((r) => r.feature_id));
    const missing = EXPECTED_FEATURE_GATES.filter((id) => !found.has(id));

    if (missing.length > 0) {
      return {
        name: 'DB: feature gates seeded',
        passed: false,
        message: `${missing.length} gate(s) missing: ${missing.join(', ')} — run npm run advertising:seed-gates`,
        severity: 'warning',
      };
    }
    return {
      name: 'DB: feature gates seeded',
      passed: true,
      message: `all ${EXPECTED_FEATURE_GATES.length} gates present`,
      severity: 'info',
    };
  } catch (err) {
    return {
      name: 'DB: feature gates seeded',
      passed: false,
      message: `query failed: ${String(err)}`,
      severity: 'error',
    };
  }
}

// ---- CRON_SECRET entropy -----

function checkCronSecretLength(): CheckResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      name: 'CONFIG: CRON_SECRET',
      passed: false,
      message: 'not set',
      severity: 'error',
    };
  }
  if (secret.length < 32) {
    return {
      name: 'CONFIG: CRON_SECRET',
      passed: false,
      message: `too short (${secret.length} chars, minimum 32)`,
      severity: 'error',
    };
  }
  return {
    name: 'CONFIG: CRON_SECRET',
    passed: true,
    message: `length OK (${secret.length} chars)`,
    severity: 'info',
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runAllChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ---- Critical env vars (errors if missing) ----
  const criticalVars = [
    { name: 'META_ACCESS_TOKEN' },
    { name: 'META_AD_ACCOUNT_ID', formatHint: (v: string) => (v.startsWith('act_') ? 'format act_*' : `format: "${v.slice(0, 4)}…"`) },
    { name: 'META_PIXEL_ID' },
    { name: 'META_CAPI_TOKEN' },
    { name: 'ANTHROPIC_API_KEY' },
    { name: 'GEMINI_API_KEY' },
    { name: 'TELEGRAM_BOT_TOKEN' },
    { name: 'TELEGRAM_FOUNDER_CHAT_ID' },
    { name: 'DATABASE_URL', formatHint: (_v: string) => 'value hidden' },
    { name: 'ADMIN_ALLOWED_EMAILS' },
    { name: 'CRON_SECRET' },
  ] as const;

  for (const v of criticalVars) {
    results.push(
      checkEnvVar({
        name: v.name,
        severity: 'error',
        formatHint: 'formatHint' in v ? v.formatHint as (val: string) => string : undefined,
      }),
    );
  }

  // ---- Optional env vars (warnings if missing) ----
  const optionalVars: string[] = [
    'META_BUSINESS_ID',
    'IDEOGRAM_API_KEY',
    'RUNWAY_API_KEY',
  ];
  for (const name of optionalVars) {
    results.push(checkEnvVar({ name, severity: 'warning' }));
  }

  // ---- API checks (run concurrently, failures are isolated) ----
  const apiChecks = await Promise.allSettled([
    checkMetaMe(),
    checkMetaAdAccount(),
    checkCapiTestEvent(),
    checkTelegramGetMe(),
    checkTelegramSendMessage(),
    checkAnthropicClaude(),
    checkGeminiApi(),
  ]);

  for (const outcome of apiChecks) {
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value);
    } else {
      // Should not happen — each helper catches internally, but guard anyway
      results.push({
        name: 'API: unknown',
        passed: false,
        message: `unexpected error: ${String(outcome.reason)}`,
        severity: 'error',
      });
    }
  }

  // ---- DB checks (sequential — each depends on prior pass to make sense) ----
  results.push(await checkDbConnection());
  results.push(await checkAdvertisingTables());
  results.push(await checkFeatureGatesSeeded());

  // ---- Config checks (synchronous) ----
  results.push(checkCronSecretLength());

  return results;
}

// ---------------------------------------------------------------------------
// Summary + exit
// ---------------------------------------------------------------------------

function printHeader(title: string) {
  const line = '═'.repeat(55);
  console.log(chalk.cyan(`\n${line}`));
  console.log(chalk.cyan.bold(`  ${title}`));
  console.log(chalk.cyan(`${line}\n`));
}

function printFooter(line: string) {
  console.log(chalk.cyan(line));
}

async function main() {
  printHeader('ESTREVIA ADVERTISING AGENT — PRE-LAUNCH CHECK');

  const results = await runAllChecks();

  // Print each result
  for (const r of results) {
    const sym = symbol(r);
    const lbl = label(r);
    const msg = r.passed
      ? chalk.gray(r.message)
      : r.severity === 'error'
        ? chalk.red(r.message)
        : chalk.yellow(r.message);
    console.log(`${sym} ${lbl} — ${msg}`);
  }

  // Count outcomes
  const passed = results.filter((r) => r.passed).length;
  const warnings = results.filter((r) => !r.passed && r.severity === 'warning').length;
  const errors = results.filter((r) => !r.passed && r.severity === 'error').length;

  const sep = '═'.repeat(55);
  console.log(chalk.cyan(`\n${sep}`));
  const summaryLine = [
    chalk.green(`${passed} passed`),
    warnings > 0 ? chalk.yellow(`${warnings} warnings`) : chalk.gray('0 warnings'),
    errors > 0 ? chalk.red(`${errors} errors`) : chalk.gray('0 errors'),
  ].join(', ');
  console.log(`SUMMARY: ${summaryLine}`);
  console.log(chalk.cyan(`${sep}`));

  // Collect actionable recommendations
  const recommendations: string[] = [];

  const capiResult = results.find((r) => r.name === 'API: CAPI test event');
  if (capiResult?.passed && capiResult.severity === 'warning') {
    recommendations.push('Improve CAPI EMQ by adding email/phone hashing in browser pixel');
  }

  const gatesResult = results.find((r) => r.name === 'DB: feature gates seeded');
  if (gatesResult && !gatesResult.passed) {
    recommendations.push('Run `npm run advertising:seed-gates` to initialize feature gates');
  }

  const missingCritical = results.filter((r) => !r.passed && r.severity === 'error' && r.name.startsWith('ENV:'));
  if (missingCritical.length > 0) {
    recommendations.push(
      `Set missing env vars: ${missingCritical.map((r) => r.name.replace('ENV: ', '')).join(', ')}`,
    );
  }

  if (recommendations.length > 0) {
    console.log(chalk.yellow('\nRecommended actions:'));
    recommendations.forEach((rec, i) => {
      console.log(chalk.yellow(`  ${i + 1}. ${rec}`));
    });
  }

  if (errors === 0) {
    console.log(chalk.green('\nReady for dry-run smoke test.'));
    console.log(chalk.gray('   Set ADVERTISING_AGENT_ENABLED=true and'));
    console.log(chalk.gray('   ADVERTISING_AGENT_DRY_RUN=true to begin.\n'));
    process.exit(0);
  } else {
    console.log(chalk.red(`\n${errors} error(s) must be resolved before activating the agent.\n`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(chalk.red('Fatal error in pre-launch check:'), err);
  process.exit(1);
});
