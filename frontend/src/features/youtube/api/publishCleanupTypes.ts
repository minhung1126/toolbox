export interface PublishCleanupVideo {
  video_id: string;
  title?: string;
  description?: string;
  published_at?: string;
  [field: string]: unknown;
}

export interface PlaylistPreviewSnapshot {
  playlist_id?: string;
  youtube_slot?: string;
  data_version?: string | number | null;
  video_ids?: string[];
  [field: string]: unknown;
}

export interface PlaylistPreviewResponse {
  playlist_id?: string;
  total?: number;
  videos?: PublishCleanupVideo[];
  source?: string;
  fallback_reason?: string;
  youtube_slot?: string;
  youtube_slot_reason?: string;
  data_version?: string | number | null;
  preview_token?: string;
  preview_snapshot?: PlaylistPreviewSnapshot;
  preview?: { token?: string; snapshot?: PlaylistPreviewSnapshot } | null;
  snapshot?: PlaylistPreviewSnapshot | null;
}

export interface PublishCleanupQuotaEstimate {
  operation?: string;
  item_count?: number;
  projected_units?: number;
  effective_available_units?: number;
  can_complete_today?: boolean;
  [field: string]: unknown;
}

export interface PublishCleanupOptions {
  youtubeSlot?: string;
  previewToken?: string;
  previewSnapshot?: PlaylistPreviewSnapshot;
}

export interface PublishCleanupResult {
  operation?: string;
  completed?: boolean;
  total_count?: number;
  succeeded_count?: number;
  warning_count?: number;
  skipped_count?: number;
  failed_count?: number;
  not_attempted_count?: number;
  quota_blocked?: boolean;
  results?: Array<Record<string, unknown>>;
  [field: string]: unknown;
}

export interface PublishCleanupMetadataUpdate {
  videoId: string;
  title: string;
  description: string;
}

export interface PublishCleanupApi {
  getPlaylistVideos(playlistId: string): Promise<PlaylistPreviewResponse>;
  estimateQuota(request: {
    operation: 'youtube.publish_cleanup';
    itemCount: number;
    slot?: string;
  }): Promise<PublishCleanupQuotaEstimate>;
  publishAndCleanup(playlistId: string, options: PublishCleanupOptions): Promise<PublishCleanupResult>;
  updateVideoMetadata(request: PublishCleanupMetadataUpdate): Promise<unknown>;
}
