import type {
  PlaylistListResponse,
  PlaylistSortApplyRequest,
  PlaylistSortApplyResponse,
  PlaylistSortPreviewRequest,
  PlaylistSortPreviewResponse,
} from '../features/ytmusic/api/types';
import type { CopyableSheetTable, SpreadsheetMetadata } from '../features/sheets/api/types';
import type {
  StickyNoteDeleteResponse,
  StickyNoteDraft,
  StickyNoteResponse,
  StickyNotesListResponse,
} from '../features/notes/api/types';
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
import type {
  RandomMemberPreviewResponse,
  YoutubeBatchPreviewRequest,
  YoutubeBatchPreviewResponse,
  YoutubeBatchUpdateRequest,
  YoutubeBatchUpdateResponse,
  YoutubeDraftConfig,
  YoutubeDraftSettingsResponse,
  YoutubeDraftVideoType,
  YoutubeQuotaEstimateRequest,
} from '../features/youtube/api/youtubeBatchTypes';
import type {
  LoginAuthConfig,
  LoginAuthUrlResponse,
  SetupRequest,
  SetupResponse,
  SetupStatusResponse,
} from '../features/auth/api/types';
import type {
  YtmusicCustomTokenMutationResponse,
  YtmusicCustomTokenValidationResponse,
} from '../features/ytmusic/api/tokenTypes';

export function normalizeYoutubePlaylistInput(value: unknown): string;

export const api: {
  getAuthConfig(): Promise<LoginAuthConfig>;
  getAuthUrl(): Promise<LoginAuthUrlResponse>;
  getSetupStatus(): Promise<SetupStatusResponse>;
  performSetup(request: SetupRequest): Promise<SetupResponse>;
  saveYtmusicCustomToken(token: string): Promise<YtmusicCustomTokenMutationResponse>;
  clearYtmusicCustomToken(): Promise<YtmusicCustomTokenMutationResponse>;
  validateYtmusicCustomToken(token?: string | null): Promise<YtmusicCustomTokenValidationResponse>;
  getPlaylistSortPlaylists(params?: { language?: string; location?: string }): Promise<PlaylistListResponse>;
  previewPlaylistSort(request: PlaylistSortPreviewRequest): Promise<PlaylistSortPreviewResponse>;
  applyPlaylistSort(request: PlaylistSortApplyRequest): Promise<PlaylistSortApplyResponse>;
  getSpreadsheetMetadata(spreadsheetUrlOrId: string): Promise<SpreadsheetMetadata>;
  getCopyableSheetTable(spreadsheetUrlOrId: string, worksheetName: string): Promise<CopyableSheetTable>;
  getYoutubeDraftSettings(): Promise<YoutubeDraftSettingsResponse>;
  updateYoutubeDraftSettings(videoType: YoutubeDraftVideoType, config: YoutubeDraftConfig): Promise<unknown>;
  getRandomMemberPreview(
    spreadsheetUrlOrId: string,
    worksheetName: string,
    team: string,
    columns: string[]
  ): Promise<RandomMemberPreviewResponse>;
  getNotes(query?: string): Promise<StickyNotesListResponse>;
  createNote(note?: StickyNoteDraft): Promise<StickyNoteResponse>;
  getNote(noteId: string): Promise<StickyNoteResponse>;
  updateNote(noteId: string, patch?: StickyNoteDraft): Promise<StickyNoteResponse>;
  deleteNote(noteId: string): Promise<StickyNoteDeleteResponse>;
  getPlaylistVideos(playlistId: string): Promise<PlaylistPreviewResponse>;
  getBatchPreview(request: YoutubeBatchPreviewRequest): Promise<YoutubeBatchPreviewResponse>;
  batchUpdateMetadata(request: YoutubeBatchUpdateRequest): Promise<YoutubeBatchUpdateResponse>;
  estimateYoutubeQuota(request: YoutubeQuotaEstimateRequest): Promise<PublishCleanupQuotaEstimate>;
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
