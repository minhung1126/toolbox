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
  playlist_id: string;
  total?: number;
  videos: PublishCleanupVideo[];
  source?: string;
  fallback_reason?: string;
  youtube_slot?: string;
  youtube_slot_reason?: string;
  data_version?: string | number | null;
  preview_token?: string;
  preview_snapshot?: PlaylistPreviewSnapshot;
  [field: string]: unknown;
}
export type CleanupStatus = 'succeeded' | 'skipped' | 'failed' | 'not_attempted' | 'needs_reconciliation';
export type CleanupPrivacy = 'public' | 'private' | 'unlisted' | 'unknown';
export interface CleanupItem {
  playlist_id: string;
  playlist_item_id: string;
  video_id: string;
  title: string;
  description: string;
  observed_privacy: CleanupPrivacy;
  candidate: boolean;
  reason: string;
}
export interface CleanupSnapshot extends PlaylistPreviewSnapshot {
  version: 2;
  mode: 'cleanup_only';
  youtube_channel_id: string;
  youtube_slot: string;
  playlist_id: string;
  items: CleanupItem[];
}
export interface CleanupPreview {
  version: 2;
  mode: 'cleanup_only';
  playlist_id: string;
  youtube_channel_id: string;
  youtube_slot: string;
  total_count: number;
  candidate_count: number;
  counts: Record<CleanupPrivacy, number>;
  items: CleanupItem[];
  preview_token: string;
  preview_snapshot: CleanupSnapshot;
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
  version: 2;
  mode: 'cleanup_only';
  operation: 'youtube.publish_cleanup';
  operation_id?: string;
  completed: boolean;
  total_count: number;
  succeeded_count: number;
  skipped_count: number;
  failed_count: number;
  not_attempted_count: number;
  needs_reconciliation_count: number;
  quota_blocked: boolean;
  results: Array<CleanupItem & { status: CleanupStatus }>;
  [field: string]: unknown;
}
// The general metadata API remains compatible; cleanup has no metadata method.
export interface PublishCleanupMetadataUpdate {
  videoId: string;
  title: string;
  description: string;
}
export interface PublishCleanupApi {
  previewCleanup(playlistId: string): Promise<CleanupPreview>;
  estimateQuota(request: {
    operation: 'youtube.publish_cleanup';
    itemCount: number;
    slot?: string;
  }): Promise<PublishCleanupQuotaEstimate>;
  cleanupPublicItems(playlistId: string, options: PublishCleanupOptions): Promise<PublishCleanupResult>;
}
