import { describe, it, expect } from 'vitest';
import { formatTelegram, formatMarkdown } from '../digest-renderers';
import type { DailyDigestReport } from '../telegram-bot';

const emptyReport: DailyDigestReport = {
  date: '2026-05-10',
  decisions: [],
  spend_total_usd: 0,
  impressions_total: 0,
};

const reportWithDecisions: DailyDigestReport = {
  date: '2026-05-10',
  decisions: [
    {
      ad_id: 'ad-42',
      action: 'pause',
      reason: 'fatigue',
      reasoning_tier: 'tier_1_rules',
      confidence: 0.95,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metrics_snapshot: {} as any,
    },
    {
      ad_id: 'ad-99',
      action: 'scale_up',
      reason: 'high ROAS',
      reasoning_tier: 'tier_2_bayesian',
      confidence: 0.78,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metrics_snapshot: {} as any,
    },
  ],
  spend_total_usd: 42.5,
  impressions_total: 12345,
};

describe('formatTelegram', () => {
  it('renders empty-decisions report as the legacy byte-anchored string', () => {
    const out = formatTelegram(emptyReport);
    const expected = [
      '📊 *Advertising Daily Digest — 2026-05-10*',
      '',
      '💰 Spend: $0.00 | 👁 Impressions: 0',
      '',
      '_No decisions taken today._',
      '',
    ].join('\n');
    expect(out).toBe(expected);
  });

  it('renders decisions with emoji icons, backtick ad_ids, and bold "Decisions taken" header', () => {
    const out = formatTelegram(reportWithDecisions);
    expect(out).toContain('*Decisions taken:*');
    expect(out).toContain('⏸ `ad-42` — pause (fatigue)');
    expect(out).toContain('📈 `ad-99` — scale_up (high ROAS)');
  });

  it('renders founder_action_required with 🚨 prefix when present, omits section when absent', () => {
    const withAction = formatTelegram({ ...emptyReport, founder_action_required: 'Review approval queue' });
    expect(withAction).toContain('🚨 *Action required:* Review approval queue');
    expect(formatTelegram(emptyReport)).not.toContain('Action required');
  });

  it('renders shadow_log_summary block when present', () => {
    const out = formatTelegram({ ...emptyReport, shadow_log_summary: 'Shadow log: 3 entries' });
    expect(out).toContain('*Shadow mode log:*');
    expect(out).toContain('Shadow log: 3 entries');
  });
});

describe('formatMarkdown', () => {
  it('renders CommonMark heading, ## sections, and **double-asterisk** bold', () => {
    const out = formatMarkdown(reportWithDecisions);
    expect(out).toContain('# Estrevia advertising — daily digest 2026-05-10');
    expect(out).toContain('## Spend');
    expect(out).toContain('## Agent decisions');
    expect(out).toContain('## Action required');
    expect(out).toContain('**pause**');
    expect(out).toContain('**scale_up**');
  });

  it('renders "Action required\\nNone." when founder_action_required absent', () => {
    const out = formatMarkdown(emptyReport);
    expect(out).toContain('## Action required\nNone.');
  });
});
