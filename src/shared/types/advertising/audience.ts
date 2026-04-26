export type AudienceKind = 'exclusion' | 'retargeting_calc_no_register'
  | 'retargeting_register_no_paid' | 'lookalike_seed';

export interface CustomAudience {
  id: string;
  kind: AudienceKind;
  meta_audience_id?: string;
  size: number;
  last_refreshed_at: Date;
  source_query: string;
  active_in_campaigns: string[];
}

type AudienceMemberBase = {
  email_hash?: string; // SHA-256
  fbp?: string;
  fbc?: string;
  ip_hash?: string;
  external_id_hash?: string;
};

export type AudienceMember =
  | (AudienceMemberBase & { email_hash: string })
  | (AudienceMemberBase & { fbp: string })
  | (AudienceMemberBase & { fbc: string })
  | (AudienceMemberBase & { ip_hash: string })
  | (AudienceMemberBase & { external_id_hash: string });
