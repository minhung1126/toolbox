import { api } from '../../../services/api';
import type {
  YoutubeActivateResponse,
  YoutubeAuthUrlResponse,
  YoutubeDisconnectResponse,
  YoutubePlaylistSettingsResponse,
  YoutubeQuotaResponse,
  YoutubeRoutingResponse,
  YoutubeSettingsApi,
  YoutubeSlotConfigResponse,
} from './youtubeSettingsTypes';

export type * from './youtubeSettingsTypes';

export class YoutubeSettingsContractError extends Error {
  code = 'youtube_settings_response_invalid';

  constructor() {
    super('YouTube 設定操作結果無法確認，請重新整理核對。');
  }
}

export function isAmbiguousYoutubeSettingsMutation(
  error: { code?: string; status?: number } | null | undefined
): boolean {
  return (
    error?.code === 'youtube_settings_response_invalid' ||
    error?.code === 'timeout' ||
    error?.code === 'network_error' ||
    (typeof error?.status === 'number' && error.status >= 500)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function requireResponse<T>(value: unknown, valid: (record: Record<string, unknown>) => boolean): T {
  if (!isRecord(value) || !valid(value)) throw new YoutubeSettingsContractError();
  return value as T;
}

function parseAuthUrl(value: unknown): YoutubeAuthUrlResponse {
  const response = requireResponse<YoutubeAuthUrlResponse>(value, (record) => typeof record.auth_url === 'string');
  try {
    const url = new URL(response.auth_url);
    if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') {
      throw new YoutubeSettingsContractError();
    }
  } catch {
    throw new YoutubeSettingsContractError();
  }
  return response;
}

export const youtubeSettingsApi: YoutubeSettingsApi = {
  async updatePlaylist(request) {
    return requireResponse<YoutubePlaylistSettingsResponse>(
      await api.updateYoutubePlaylist(request),
      (record) => record.status === 'success' && record.default_playlist_id === request.playlistId
    );
  },
  async updateSlotConfig(slot, patch) {
    return requireResponse<YoutubeSlotConfigResponse>(
      await api.updateYoutubeSlotConfig(slot, patch),
      (record) =>
        record.status === 'success' &&
        record.slot === slot &&
        typeof record.label === 'string' &&
        record.label.length > 0 &&
        typeof record.configured === 'boolean' &&
        typeof record.enabled === 'boolean' &&
        isCount(record.quota_limit) &&
        isCount(record.safety_buffer_units) &&
        (patch.label === undefined || record.label === patch.label.trim()) &&
        (slot === 'primary' || patch.enabled === undefined || record.enabled === patch.enabled)
    );
  },
  async updateRoutingMode(mode) {
    return requireResponse<YoutubeRoutingResponse>(
      await api.updateYoutubeRoutingMode(mode),
      (record) => record.status === 'success' && record.routing_mode === mode
    );
  },
  async updateQuota(request) {
    return requireResponse<YoutubeQuotaResponse>(
      await api.updateYoutubeQuota(request),
      (record) =>
        record.status === 'success' &&
        record.slot === request.slot &&
        record.quota_limit === request.quotaLimit &&
        record.safety_buffer_units === request.safetyBufferUnits
    );
  },
  async getAuthUrl(slot) {
    return parseAuthUrl(await api.getYoutubeAuthUrl(slot));
  },
  async activateSlot(slot) {
    return requireResponse<YoutubeActivateResponse>(
      await api.activateYoutubeSlot(slot),
      (record) => record.status === 'youtube_slot_activated' && record.active_slot === slot
    );
  },
  async disconnectSlot(slot, options) {
    return requireResponse<YoutubeDisconnectResponse>(
      await api.disconnectYoutube(slot, options),
      (record) => record.status === 'youtube_disconnected' && record.slot === slot
    );
  },
};
