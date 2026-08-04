/**
 * One-shot: populate the 4 PostHog Vercel env vars for production + preview.
 * Reads Vercel token from CLI auth.json, project id from .vercel/project.json,
 * source values from local .env (+ phc_ client key fetched live via personal API).
 *
 * Safe to re-run; uses DELETE-then-POST pattern (no upsert) so empty values are
 * fully overwritten. Never logs secret values.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { config } from 'dotenv';
config({ path: '.env' });

// ─── Vercel auth + project ───────────────────────────────────────────────
const auth = JSON.parse(readFileSync(`${homedir()}/Library/Application Support/com.vercel.cli/auth.json`, 'utf8'));
const proj = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
const TOKEN = auth.token;
const PROJECT = proj.projectId;
const TEAM = proj.orgId;
const API = `https://api.vercel.com`;

function maskValue(v) {
  if (!v || v.length < 12) return '(short)';
  return `${v.slice(0, 6)}…${v.slice(-4)} (len=${v.length})`;
}

async function api(path, opts = {}) {
  const url = `${API}${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM}`;
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!r.ok) {
    console.log(`  ✗ ${r.status} ${opts.method ?? 'GET'} ${path}`);
    console.log(`    ${JSON.stringify(json).slice(0, 300)}`);
  }
  return { ok: r.ok, status: r.status, json };
}

// ─── Fetch PostHog client api_token via personal API key ─────────────────
const PH_PERSONAL = process.env.POSTHOG_PERSONAL_API_KEY;
const PH_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
if (!PH_PERSONAL || !PH_PROJECT_ID) {
  console.error('Missing POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID in local .env');
  process.exit(1);
}
const phResp = await fetch(`https://us.posthog.com/api/projects/${PH_PROJECT_ID}/`, {
  headers: { Authorization: `Bearer ${PH_PERSONAL}` },
});
const phData = await phResp.json();
if (!phResp.ok) {
  console.error('PostHog API failed:', JSON.stringify(phData).slice(0, 200));
  process.exit(1);
}
const PH_CLIENT_KEY = phData.api_token;
if (!PH_CLIENT_KEY || !PH_CLIENT_KEY.startsWith('phc_')) {
  console.error('Did not get phc_ client key from PostHog');
  process.exit(1);
}
console.log(`✓ Fetched phc_ client key: ${maskValue(PH_CLIENT_KEY)}`);

// ─── Target values ───────────────────────────────────────────────────────
const TARGETS = ['production', 'preview'];
const DESIRED = [
  { key: 'NEXT_PUBLIC_POSTHOG_KEY', value: PH_CLIENT_KEY, type: 'encrypted' },
  { key: 'NEXT_PUBLIC_POSTHOG_HOST', value: 'https://us.i.posthog.com', type: 'plain' },
  { key: 'POSTHOG_PROJECT_ID', value: PH_PROJECT_ID, type: 'encrypted' },
  { key: 'POSTHOG_PERSONAL_API_KEY', value: PH_PERSONAL, type: 'sensitive' },
];

// ─── Read existing env vars ──────────────────────────────────────────────
console.log('\n═════ Existing PostHog env entries ═════');
const list = await api(`/v10/projects/${PROJECT}/env`);
if (!list.ok) process.exit(1);
const existing = (list.json.envs || []).filter((e) => DESIRED.some((d) => d.key === e.key));
for (const e of existing) {
  console.log(`  ${e.key.padEnd(28)} id=${e.id}  target=${(e.target || []).join(',')}  type=${e.type}  value=${maskValue(e.value)}`);
}

// ─── Delete each existing PostHog entry ──────────────────────────────────
console.log('\n═════ Deleting existing entries ═════');
for (const e of existing) {
  const del = await api(`/v9/projects/${PROJECT}/env/${e.id}`, { method: 'DELETE' });
  console.log(`  ${del.ok ? '✓' : '✗'} delete ${e.key} (id=${e.id})`);
}

// ─── Create fresh entries with values ────────────────────────────────────
console.log('\n═════ Creating new entries (production + preview) ═════');
for (const d of DESIRED) {
  const body = {
    key: d.key,
    value: d.value,
    type: d.type,
    target: TARGETS,
  };
  const res = await api(`/v10/projects/${PROJECT}/env`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  console.log(`  ${res.ok ? '✓' : '✗'} create ${d.key.padEnd(28)} type=${d.type}  value=${maskValue(d.value)}`);
}

// ─── Verify ─────────────────────────────────────────────────────────────
console.log('\n═════ Verify final state ═════');
const final = await api(`/v10/projects/${PROJECT}/env`);
const finalPH = (final.json.envs || []).filter((e) => DESIRED.some((d) => d.key === e.key));
for (const e of finalPH) {
  const v = e.value ?? '';
  const status = v && v.length > 0 ? '✓' : '✗';
  console.log(`  ${status} ${e.key.padEnd(28)} target=${(e.target || []).join(',').padEnd(20)} value=${maskValue(v)}`);
}
