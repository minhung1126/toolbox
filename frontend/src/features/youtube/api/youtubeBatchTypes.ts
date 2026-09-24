import type { SpreadsheetMetadata } from '../../sheets/api/types';
import type {
  PlaylistPreviewResponse,
  PlaylistPreviewSnapshot,
  PublishCleanupQuotaEstimate,
} from './publishCleanupTypes';

export type YoutubeDraftVideoType = 'Video' | 'Shorts';

export interface YoutubeDraftConfig {
  spreadsheet_id: string;
  playlist_id: string;
  worksheet_name: string;
  title_column: string;
  description_column: string;
}

export interface YoutubeDraftSettingsResponse {
  video?: Partial<YoutubeDraftConfig>;
  shorts?: Partial<YoutubeDraftConfig>;
}

export interface RandomMemberPreviewResponse {
  spreadsheet_id: string;
  worksheet_name: string;
  team: string;
  person: string;
  values: Record<string, unknown>;
}

export interface VideoAssignment {
  video_id: string;
  person: string;
}

export interface YoutubeBatchPreviewRequest {
  spreadsheetUrlOrId: string;
  playlistId: string;
  videoType: YoutubeDraftVideoType;
  worksheetName: string;
  titleColumn: string;
  descriptionColumn: string;
  team: string;
  assignments: VideoAssignment[];
}

export interface YoutubeBatchPreviewItem {
  videoId?: string;
  video_id?: string;
  person: string;
  currentTitle?: string;
  currentDescription?: string;
  newTitle?: string;
  newDescription?: string;
  status: 'ready' | 'skipped' | 'failed' | 'unchanged';
  willUpdate?: boolean;
  reason?: string;
  thumbnailUrl?: string;
}

export interface YoutubeBatchPreviewSnapshot extends PlaylistPreviewSnapshot {
  spreadsheet_id?: string;
  worksheet_name?: string;
  youtube_channel_id?: string;
  youtube_routing_mode?: string;
  youtube_slot_reason?: string;
  sheet_digest?: string;
  playlist_digest?: string;
  plan?: YoutubeBatchPreviewItem[];
}

export interface YoutubeBatchPreviewResponse {
  preview_token?: string;
  preview_snapshot?: YoutubeBatchPreviewSnapshot;
  plan?: YoutubeBatchPreviewItem[];
  playlist_id?: string;
  youtube_slot?: string;
  youtube_routing_mode?: string;
  youtube_slot_reason?: string;
  youtube_preferred_slot?: string;
  youtube_estimated_units?: number;
}

export interface YoutubeBatchUpdateRequest extends YoutubeBatchPreviewRequest {
  youtubeSlot?: string;
  previewToken: string;
  previewSnapshot: YoutubeBatchPreviewSnapshot;
}

export interface YoutubeBatchUpdateResult {
  video_id: string;
  youtube_slot?: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  person?: string;
  status: 'succeeded' | 'succeeded_with_warnings' | 'skipped' | 'failed' | 'not_attempted';
  reason?: string | null;
  error?: Record<string, unknown> | null;
}

export interface YoutubeBatchUpdateResponse {
  operation?: string;
  youtube_slot?: string;
  completed?: boolean;
  total_count?: number;
  succeeded_count?: number;
  warning_count?: number;
  skipped_count?: number;
  failed_count?: number;
  not_attempted_count?: number;
  quota_blocked?: boolean;
  results?: YoutubeBatchUpdateResult[];
  [field: string]: unknown;
}

export interface YoutubeQuotaEstimateRequest {
  operation: 'youtube.metadata_update' | 'youtube.publish_cleanup';
  itemCount: number;
  slot?: string;
}

export interface YoutubeBatchApi {
  getDraftSettings(): Promise<YoutubeDraftSettingsResponse>;
  updateDraftSettings(videoType: YoutubeDraftVideoType, config: YoutubeDraftConfig): Promise<unknown>;
  updatePlaylist(request: { playlistId: string }): Promise<unknown>;
  getRandomMemberPreview(
    spreadsheetUrlOrId: string,
    worksheetName: string,
    team: string,
    columns: string[]
  ): Promise<RandomMemberPreviewResponse>;
  getSpreadsheetMetadata(spreadsheetUrlOrId: string): Promise<SpreadsheetMetadata>;
  getPlaylistVideos(playlistId: string): Promise<PlaylistPreviewResponse>;
  getBatchPreview(request: YoutubeBatchPreviewRequest): Promise<YoutubeBatchPreviewResponse>;
  updateMetadata(request: YoutubeBatchUpdateRequest): Promise<YoutubeBatchUpdateResponse>;
  estimateQuota(request: YoutubeQuotaEstimateRequest): Promise<PublishCleanupQuotaEstimate>;
}
