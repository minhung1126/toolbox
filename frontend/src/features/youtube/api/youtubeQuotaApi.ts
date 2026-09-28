import { api } from '../../../services/api';
import type { YoutubeQuotaApi, YoutubeQuotaUsage } from './youtubeQuotaTypes';

export type * from './youtubeQuotaTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseQuotaUsage(value: unknown, slot: string): YoutubeQuotaUsage {
  if (
    !isRecord(value) ||
    value.slot !== slot ||
    typeof value.state !== 'string' ||
    !['normal', 'warning', 'safety_blocked', 'confirmed_exhausted'].includes(value.state) ||
    !isNonnegativeInteger(value.official_default_limit) ||
    !isNonnegativeInteger(value.configured_project_limit) ||
    !isNonnegativeInteger(value.estimated_used_units) ||
    !isNonnegativeInteger(value.estimated_remaining_units) ||
    !isNonnegativeInteger(value.safety_buffer_units) ||
    !isNonnegativeInteger(value.policy_cap_units) ||
    !isNonnegativeInteger(value.effective_available_units) ||
    typeof value.confirmed_by_google !== 'boolean' ||
    typeof value.reset_at !== 'string' ||
    typeof value.reset_timezone !== 'string' ||
    typeof value.quota_rules_verified_at !== 'string' ||
    typeof value.note !== 'string' ||
    (value.updated_at != null && typeof value.updated_at !== 'string') ||
    !Array.isArray(value.methods) ||
    !value.methods.every(
      (method) =>
        isRecord(method) &&
        typeof method.method === 'string' &&
        isNonnegativeInteger(method.calls) &&
        isNonnegativeInteger(method.cost_per_call) &&
        isNonnegativeInteger(method.units)
    )
  ) {
    throw new Error('YouTube 配額回應格式不正確，請稍後重試。');
  }
  return value as unknown as YoutubeQuotaUsage;
}

export const youtubeQuotaApi: YoutubeQuotaApi = {
  getUsage: async (slot) => parseQuotaUsage(await api.getYoutubeQuotaUsage(slot), slot),
};
