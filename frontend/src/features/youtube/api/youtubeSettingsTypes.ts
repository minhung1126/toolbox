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
  auth_url?: string;
}

export interface YoutubeSettingsApi {
  updatePlaylist(request: { playlistId: string }): Promise<unknown>;
  updateSlotConfig(slot: YoutubeSlot, patch: YoutubeSlotConfigPatch): Promise<unknown>;
  updateRoutingMode(mode: YoutubeRoutingMode): Promise<unknown>;
  updateQuota(request: { slot: YoutubeSlot; quotaLimit: number; safetyBufferUnits: number }): Promise<unknown>;
  getAuthUrl(slot: YoutubeSlot): Promise<YoutubeAuthUrlResponse>;
  activateSlot(slot: YoutubeSlot): Promise<unknown>;
  disconnectSlot(slot: YoutubeSlot, options: { confirm: boolean }): Promise<unknown>;
}
