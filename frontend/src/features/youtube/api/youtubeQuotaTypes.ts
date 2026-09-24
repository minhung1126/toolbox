import type { YoutubeSlot } from './youtubeSettingsTypes';

export type YoutubeQuotaState = 'normal' | 'warning' | 'safety_blocked' | 'confirmed_exhausted';

export interface YoutubeQuotaMethodUsage {
  method: string;
  calls: number;
  cost_per_call: number;
  units: number;
}

export interface YoutubeQuotaUsage {
  slot: YoutubeSlot;
  state: YoutubeQuotaState;
  official_default_limit: number;
  configured_project_limit: number;
  estimated_used_units: number;
  estimated_remaining_units: number;
  safety_buffer_units: number;
  policy_cap_units: number;
  effective_available_units: number;
  confirmed_by_google: boolean;
  reset_at: string;
  reset_timezone: string;
  methods: YoutubeQuotaMethodUsage[];
  quota_rules_verified_at: string;
  note: string;
  updated_at?: string | null;
}

export interface YoutubeQuotaApi {
  getUsage(slot: YoutubeSlot): Promise<YoutubeQuotaUsage>;
}
