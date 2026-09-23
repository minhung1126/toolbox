import type {
  PlaylistListResponse,
  PlaylistSortApplyRequest,
  PlaylistSortApplyResponse,
  PlaylistSortPreviewRequest,
  PlaylistSortPreviewResponse,
} from '../features/ytmusic/api/types';
import type { CopyableSheetTable, SpreadsheetMetadata } from '../features/sheets/api/types';
import type {
  PlaylistPreviewResponse,
  PublishCleanupMetadataUpdate,
  PublishCleanupOptions,
  PublishCleanupQuotaEstimate,
  PublishCleanupResult,
} from '../features/youtube/api/publishCleanupTypes';
import type {
  YoutubeAuthUrlResponse,
  YoutubeRoutingMode,
  YoutubeSlot,
  YoutubeSlotConfigPatch,
} from '../features/youtube/api/youtubeSettingsTypes';

export const api: {
  getPlaylistSortPlaylists(params?: { language?: string; location?: string }): Promise<PlaylistListResponse>;
  previewPlaylistSort(request: PlaylistSortPreviewRequest): Promise<PlaylistSortPreviewResponse>;
  applyPlaylistSort(request: PlaylistSortApplyRequest): Promise<PlaylistSortApplyResponse>;
  getSpreadsheetMetadata(spreadsheetUrlOrId: string): Promise<SpreadsheetMetadata>;
  getCopyableSheetTable(spreadsheetUrlOrId: string, worksheetName: string): Promise<CopyableSheetTable>;
  getPlaylistVideos(playlistId: string): Promise<PlaylistPreviewResponse>;
  estimateYoutubeQuota(request: {
    operation: string;
    itemCount: number;
    slot?: string;
  }): Promise<PublishCleanupQuotaEstimate>;
  publishAndCleanup(playlistId: string, options?: PublishCleanupOptions): Promise<PublishCleanupResult>;
  updateYoutubeVideoMetadata(request: PublishCleanupMetadataUpdate): Promise<unknown>;
  updateYoutubePlaylist(request: { playlistId: string }): Promise<unknown>;
  updateYoutubeSlotConfig(slot: YoutubeSlot, patch: YoutubeSlotConfigPatch): Promise<unknown>;
  updateYoutubeRoutingMode(mode: YoutubeRoutingMode): Promise<unknown>;
  updateYoutubeQuota(request: { slot: YoutubeSlot; quotaLimit: number; safetyBufferUnits: number }): Promise<unknown>;
  getYoutubeAuthUrl(slot: YoutubeSlot): Promise<YoutubeAuthUrlResponse>;
  activateYoutubeSlot(slot: YoutubeSlot): Promise<unknown>;
  disconnectYoutube(slot: YoutubeSlot, options: { confirm: boolean }): Promise<unknown>;
};
