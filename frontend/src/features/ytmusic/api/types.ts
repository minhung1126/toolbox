export type SortDirection = 'asc' | 'desc';
export type PlaylistSortApplyMode = 'in_place' | 'new_playlist';

export interface PlaylistSortKey {
  field: string;
  direction: SortDirection;
}

export interface PlaylistSummary {
  id: string;
  title: string;
  description?: string;
  item_count: number;
  privacy_status?: 'public' | 'unlisted' | 'private' | string;
}

export interface PlaylistListResponse {
  playlists: PlaylistSummary[];
}

export interface PlaylistSortTrack {
  playlist_item_id: string;
  video_id?: string;
  title?: string;
  channel_title?: string;
  duration_seconds?: number;
  original_position?: number | null;
  new_position?: number | null;
  status?: string;
  [field: string]: unknown;
}

export interface PlaylistSortPreview {
  items: PlaylistSortTrack[];
  total: number;
  moved_count: number;
  unchanged_count?: number;
  [field: string]: unknown;
}

export interface PlaylistSortQuotaEstimate {
  total_units?: number;
  moved_count?: number;
  units_per_move?: number;
  [field: string]: unknown;
}

export interface PlaylistSortPreviewRequest {
  playlistId: string;
  sortKeys: PlaylistSortKey[];
  language: string;
  location: string;
}

export interface PlaylistSortPreviewResponse {
  preview: PlaylistSortPreview | null;
  preview_token: string;
  quota_estimate?: PlaylistSortQuotaEstimate | null;
}

export interface PlaylistSortApplyRequest extends PlaylistSortPreviewRequest {
  previewToken: string;
  mode?: PlaylistSortApplyMode;
  newPlaylistTitle?: string;
  sortedItemIds?: string[];
  allowQuotaFallback?: boolean;
}

export interface PlaylistSortApplyResponse {
  mode?: PlaylistSortApplyMode;
  succeeded?: number;
  failed?: number;
  [field: string]: unknown;
}

export interface PlaylistSortApi {
  list(params: { language: string; location: string }): Promise<PlaylistListResponse>;
  preview(request: PlaylistSortPreviewRequest): Promise<PlaylistSortPreviewResponse>;
  apply(request: PlaylistSortApplyRequest): Promise<PlaylistSortApplyResponse>;
}
