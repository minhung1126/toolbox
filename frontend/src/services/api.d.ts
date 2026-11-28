import type {
  PlaylistListResponse,
  PlaylistSortApplyRequest,
  PlaylistSortApplyResponse,
  PlaylistSortPreviewRequest,
  PlaylistSortPreviewResponse,
} from '../features/ytmusic/api/types';
import type { CopyableSheetTable, SpreadsheetMetadata } from '../features/sheets/api/types';
import type {
  SharedTeamPersonFilter,
  SharedTeamPersonFilterResponse,
  SheetTeamOptions,
  SheetTeamPeople,
} from '../features/sheets/api/sheetsFilterTypes';
import type {
  StickyNoteCreatedResponse,
  StickyNoteDeleteResponse,
  StickyNoteDraft,
  StickyNoteResponse,
  StickyNoteUpdatedResponse,
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
import type { YoutubeQuotaUsage } from '../features/youtube/api/youtubeQuotaTypes';
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
  YtmusicAuthUrlResponse,
  YtmusicDisconnectResponse,
} from '../features/ytmusic/api/tokenTypes';
import type {
  AllowNewUsersUpdateResponse,
  SystemAllowlistMutationResponse,
  SystemAllowlistResponse,
  SystemCredentialsResponse,
  SystemCredentialsUpdateRequest,
} from '../features/settings/api/systemSettingsTypes';
import type {
  SheetsAuthUrlResponse,
  SheetsDisconnectResponse,
  SharedSheetSettings,
  SharedSheetSettingsUpdateResponse,
} from '../features/sheets/api/sheetsSettingsTypes';

import type { AccountWorkStateResponse, WorkStateValue } from '../features/settings/api/workStateTypes';
import type {
  DraftSource,
  DraftStage,
  DraftPublishRequest,
  DraftPreview,
  DraftResult,
} from '../features/youtube/api/draftPublishApi';

export function normalizeYoutubePlaylistInput(value: unknown): string;

export function resetSessionExpiredNotification(): void;

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown> | null;
  retryAfter: number | null;
  retryable: boolean;
  fieldErrors: Record<string, string[] | string>;
  field_errors: Record<string, string[] | string>;
  constructor(
    message: string,
    options?: {
      status?: number;
      code?: string;
      details?: Record<string, unknown> | null;
      retryAfter?: number | null;
      retryable?: boolean;
      fieldErrors?: Record<string, string[] | string>;
      field_errors?: Record<string, string[] | string>;
    }
  );
}

export const api: {
  getHealth(): Promise<Record<string, unknown>>;
  getTools(): Promise<Record<string, unknown>>;
  getUserStatus(): Promise<Record<string, unknown>>;
  logout(): Promise<Record<string, unknown>>;
  getSystemInfo(): Promise<Record<string, unknown>>;
  getYoutubeSettings(): Promise<Record<string, unknown>>;
  getYoutubeSlotSettings(): Promise<Record<string, unknown>>;
  getOperations(): Promise<{ version: number; operations: Array<Record<string, unknown>> }>;
  getOperation(id: string, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  reconcileOperation(id: string, kind: string): Promise<Record<string, unknown>>;
  getWorkState(): Promise<AccountWorkStateResponse>;
  updateWorkState(key: string, value: WorkStateValue): Promise<AccountWorkStateResponse>;
  getAuthConfig(): Promise<LoginAuthConfig>;
  getAuthUrl(): Promise<LoginAuthUrlResponse>;
  getSetupStatus(): Promise<SetupStatusResponse>;
  performSetup(request?: SetupRequest): Promise<SetupResponse>;
  getYtmusicAuthUrl(): Promise<YtmusicAuthUrlResponse>;
  disconnectYtmusic(): Promise<YtmusicDisconnectResponse>;
  saveYtmusicCustomToken(token: string): Promise<YtmusicCustomTokenMutationResponse>;
  clearYtmusicCustomToken(): Promise<YtmusicCustomTokenMutationResponse>;
  validateYtmusicCustomToken(token?: string | null): Promise<YtmusicCustomTokenValidationResponse>;
  getPlaylistSortPlaylists(params?: { language?: string; location?: string }): Promise<PlaylistListResponse>;
  previewPlaylistSort(
    request: Omit<PlaylistSortPreviewRequest, 'language' | 'location'> & {
      fetchAlbumDetails?: boolean;
      useYoutubeApi?: boolean;
      language?: string | null;
      location?: string | null;
    }
  ): Promise<PlaylistSortPreviewResponse>;
  applyPlaylistSort(
    request: Omit<PlaylistSortApplyRequest, 'language' | 'location' | 'newPlaylistTitle' | 'sortedItemIds'> & {
      useYoutubeApi?: boolean;
      newPlaylistTitle?: string | null;
      sortedItemIds?: string[] | null;
      language?: string | null;
      location?: string | null;
      requestId?: string | null;
      request_id?: string | null;
    }
  ): Promise<PlaylistSortApplyResponse>;
  getSpreadsheetMetadata(spreadsheetUrlOrId: string): Promise<SpreadsheetMetadata>;
  parseSheetOptions(spreadsheetUrlOrId: string, worksheetName: string): Promise<SheetTeamOptions>;
  getTeamPeople(spreadsheetUrlOrId: string, worksheetName: string, team: string): Promise<SheetTeamPeople>;
  getTeamPersonFilter(): Promise<SharedTeamPersonFilterResponse>;
  updateTeamPersonFilter(filter: SharedTeamPersonFilter): Promise<SharedTeamPersonFilterResponse>;
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
  createNote(note?: StickyNoteDraft): Promise<StickyNoteCreatedResponse>;
  getNote(noteId: string): Promise<StickyNoteResponse>;
  updateNote(noteId: string, patch?: StickyNoteDraft): Promise<StickyNoteUpdatedResponse>;
  deleteNote(noteId: string): Promise<StickyNoteDeleteResponse>;
  getPhotoCuratorPresets(): Promise<unknown>;
  generatePhotoCuratorChecklist(payload?: { posts?: unknown[]; notes?: string }): Promise<unknown>;
  getFfmpegPresets(): Promise<unknown>;
  parseFfmpegTime(payload: Record<string, unknown>): Promise<unknown>;
  buildFfmpegCommand(payload: Record<string, unknown>): Promise<unknown>;
  getPlaylistVideos(playlistId: string): Promise<PlaylistPreviewResponse>;
  getBatchPreview(request: YoutubeBatchPreviewRequest): Promise<YoutubeBatchPreviewResponse>;
  getYoutubeEditStatuses(videoIds: string[]): Promise<unknown>;
  prepareYoutubeDrafts(payload: DraftSource, options?: { signal?: AbortSignal }): Promise<DraftStage>;
  previewYoutubeDrafts(payload: DraftPublishRequest): Promise<DraftPreview>;
  submitYoutubePublishJob(payload: DraftPublishRequest): Promise<unknown>;
  findYoutubePublishJob(requestId: string, options?: { signal?: AbortSignal }): Promise<unknown>;
  findYoutubePublishStage(stageId: string, options?: { signal?: AbortSignal }): Promise<unknown>;
  publishYoutubeDrafts(payload: DraftPublishRequest): Promise<DraftResult>;
  batchUpdateMetadata(request: YoutubeBatchUpdateRequest): Promise<YoutubeBatchUpdateResponse>;
  estimateYoutubeQuota(request: YoutubeQuotaEstimateRequest): Promise<PublishCleanupQuotaEstimate>;
  getYoutubeQuotaUsage(slot?: YoutubeSlot): Promise<YoutubeQuotaUsage>;
  previewYoutubeCleanup(playlistId: string): Promise<unknown>;
  cleanupPublicItems(playlistId: string, options?: PublishCleanupOptions): Promise<PublishCleanupResult>;
  updateYoutubeVideoMetadata(request: PublishCleanupMetadataUpdate): Promise<unknown>;
  updateYoutubePlaylist(request?: { playlistId?: string; defaultPlaylistId?: string }): Promise<unknown>;
  updateYoutubeSlotConfig(slot: YoutubeSlot, patch: YoutubeSlotConfigPatch): Promise<unknown>;
  updateYoutubeRoutingMode(mode: YoutubeRoutingMode): Promise<unknown>;
  updateYoutubeQuota(request?: {
    slot?: YoutubeSlot;
    quotaLimit?: number;
    safetyBufferUnits?: number;
    quotaBuffer?: number;
  }): Promise<unknown>;
  getYoutubeAuthUrl(slot?: YoutubeSlot): Promise<YoutubeAuthUrlResponse>;
  activateYoutubeSlot(slot: YoutubeSlot): Promise<unknown>;
  disconnectYoutube(slot?: YoutubeSlot, options?: { confirm?: boolean }): Promise<unknown>;
  getSystemCredentials(): Promise<SystemCredentialsResponse>;
  updateSystemCredentials(payload: SystemCredentialsUpdateRequest): Promise<SystemCredentialsResponse>;
  getAllowlist(): Promise<SystemAllowlistResponse>;
  addAllowlistEmail(email: string): Promise<SystemAllowlistMutationResponse>;
  removeAllowlistEmail(email: string): Promise<SystemAllowlistMutationResponse>;
  updateAllowNewUsers(allowNewUsers: boolean): Promise<AllowNewUsersUpdateResponse>;
  getSheetsAuthUrl(): Promise<SheetsAuthUrlResponse>;
  disconnectSheets(): Promise<SheetsDisconnectResponse>;
  getSharedSettings(): Promise<SharedSheetSettings>;
  updateSharedSettings(settings: SharedSheetSettings): Promise<SharedSheetSettingsUpdateResponse>;
};
