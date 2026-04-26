import type { AdDecision } from './decide';

export interface DecisionRecord {
  id: string;
  timestamp: Date;
  decision: AdDecision;
  applied: boolean;
  apply_error?: string;
  applied_at?: Date;
  meta_response?: unknown;
}

export interface CreativeAuditRecord {
  id: string;
  creative_bundle_id: string; // references CreativeBundle.id
  event: 'generated' | 'reviewed' | 'approved' | 'rejected' | 'uploaded' | 'paused';
  actor: 'agent' | 'founder' | 'meta';
  details: Record<string, unknown>;
  timestamp: Date;
}

export interface SpendCapState {
  date: string; // YYYY-MM-DD UTC
  spent_usd: number;
  cap_usd: number;
  remaining_usd: number;
  triggered_halt: boolean;
}
