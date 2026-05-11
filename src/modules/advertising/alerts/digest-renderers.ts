/**
 * Pure renderers — DailyDigestReport → string.
 *
 * Two output flavors:
 *   - formatTelegram(): Telegram-flavored Markdown (single-asterisk bold,
 *     backtick code spans, emoji prefixes — matches the legacy inline
 *     output of TelegramBot.sendDailyDigest before this refactor).
 *   - formatMarkdown(): CommonMark for Cowork inbox + API consumers
 *     (double-asterisk bold, fenced code, no Telegram escapes).
 *
 * Both render the same DailyDigestReport. Drift between channels is
 * impossible by construction — only renderer logic differs.
 */

import type { DailyDigestReport } from './telegram-bot';

export function formatTelegram(report: DailyDigestReport): string {
  const lines: string[] = [];
  lines.push(`📊 *Advertising Daily Digest — ${report.date}*`);
  lines.push('');
  lines.push(`💰 Spend: $${report.spend_total_usd.toFixed(2)} | 👁 Impressions: ${report.impressions_total.toLocaleString()}`);
  lines.push('');

  if (report.decisions.length > 0) {
    lines.push('*Decisions taken:*');
    for (const d of report.decisions) {
      const icon =
        d.action === 'pause' ? '⏸' :
        d.action === 'scale_up' ? '📈' :
        d.action === 'maintain' ? '✅' :
        '→';
      lines.push(`${icon} \`${d.ad_id}\` — ${d.action} (${d.reason})`);
    }
    lines.push('');
  } else {
    lines.push('_No decisions taken today._');
    lines.push('');
  }

  if (report.brand_voice_scores && report.brand_voice_scores.length > 0) {
    const needsReview = report.brand_voice_scores.filter((s) => s.needs_review);
    if (needsReview.length > 0) {
      lines.push(`⚠️ *Brand voice review needed:* ${needsReview.map((s) => s.ad_id).join(', ')}`);
      lines.push('');
    }
  }

  if (report.shadow_log_summary) {
    lines.push('*Shadow mode log:*');
    lines.push(report.shadow_log_summary);
    lines.push('');
  }

  if (report.founder_action_required) {
    lines.push(`🚨 *Action required:* ${report.founder_action_required}`);
  }

  return lines.join('\n');
}

export function formatMarkdown(report: DailyDigestReport): string {
  const lines: string[] = [];
  lines.push(`# Estrevia advertising — daily digest ${report.date}`);
  lines.push('');
  lines.push('## Spend');
  lines.push(`- Today: $${report.spend_total_usd.toFixed(2)}`);
  lines.push(`- Impressions: ${report.impressions_total.toLocaleString()}`);
  lines.push('');

  lines.push('## Agent decisions');
  if (report.decisions.length > 0) {
    for (const d of report.decisions) {
      lines.push(`- \`${d.ad_id}\` — **${d.action}** (${d.reasoning_tier}, confidence ${(d.confidence * 100).toFixed(0)}%): ${d.reason}`);
    }
  } else {
    lines.push('- _No decisions taken today._');
  }
  lines.push('');

  if (report.brand_voice_scores && report.brand_voice_scores.length > 0) {
    const flagged = report.brand_voice_scores.filter((s) => s.needs_review);
    if (flagged.length > 0) {
      lines.push('## Brand voice — needs review');
      for (const s of flagged) {
        lines.push(`- \`${s.ad_id}\` (overall ${s.overall.toFixed(1)})`);
      }
      lines.push('');
    }
  }

  if (report.shadow_log_summary) {
    lines.push('## Shadow log');
    lines.push(report.shadow_log_summary);
    lines.push('');
  }

  lines.push('## Action required');
  lines.push(report.founder_action_required ?? 'None.');

  return lines.join('\n');
}
