export type YoutubeSlot = 'primary' | 'secondary';
export type YoutubeRoutingMode = 'auto_primary' | 'manual';

export interface YoutubeSlotConfigPatch {
  label?: string;
  enabled?: boolean;
  client_id?: string;
  client_secret?: string;
  use_system_google_oauth?: boolean;
}

export interface YoutubeAuthUrlResponse {
  auth_url: string;
}

export interface YoutubeMutationResponse {
  status: 'success';
}

export interface YoutubePlaylistSettingsResponse extends YoutubeMutationResponse {
  default_playlist_id: string;
}

export interface YoutubeSlotConfigResponse extends YoutubeMutationResponse {
  slot: YoutubeSlot;
  label: string;
  configured: boolean;
  enabled: boolean;
  quota_limit: number;
  safety_buffer_units: number;
}

export interface YoutubeRoutingResponse extends YoutubeMutationResponse {
  routing_mode: YoutubeRoutingMode;
}

export interface YoutubeQuotaResponse extends YoutubeMutationResponse {
  slot: YoutubeSlot;
  quota_limit: number;
  safety_buffer_units: number;
}

export interface YoutubeActivateResponse {
  status: 'youtube_slot_activated';
  active_slot: YoutubeSlot;
}

export interface YoutubeDisconnectResponse {
  status: 'youtube_disconnected';
  slot: YoutubeSlot;
}

export interface YoutubeSettingsApi {
  updatePlaylist(request: { playlistId: string }): Promise<YoutubePlaylistSettingsResponse>;
  updateSlotConfig(slot: YoutubeSlot, patch: YoutubeSlotConfigPatch): Promise<YoutubeSlotConfigResponse>;
  updateRoutingMode(mode: YoutubeRoutingMode): Promise<YoutubeRoutingResponse>;
  updateQuota(request: {
    slot: YoutubeSlot;
    quotaLimit: number;
    safetyBufferUnits: number;
  }): Promise<YoutubeQuotaResponse>;
  getAuthUrl(slot: YoutubeSlot): Promise<YoutubeAuthUrlResponse>;
  activateSlot(slot: YoutubeSlot): Promise<YoutubeActivateResponse>;
  disconnectSlot(slot: YoutubeSlot, options: { confirm: boolean }): Promise<YoutubeDisconnectResponse>;
}
