import type { PlaylistSortKey, PlaylistSortPreview } from '../model/types';
export type { SortDirection, PlaylistSortKey, PlaylistSortTrack, PlaylistSortPreview } from '../model/types';
export type PlaylistSortApplyMode = 'in_place' | 'new_playlist';

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

export interface PlaylistSortQuotaEstimate {
  total_units: number;
  moved_count: number;
  units_per_move: number;
  [field: string]: unknown;
}

export interface PlaylistSortPreviewRequest {
  playlistId: string;
  sortKeys: PlaylistSortKey[];
  language: string;
  location: string;
}

export interface PlaylistSortPreviewResponse {
  preview: PlaylistSortPreview;
  preview_token: string;
  quota_estimate: PlaylistSortQuotaEstimate;
}

export interface PlaylistSortApplyRequest extends PlaylistSortPreviewRequest {
  previewToken: string;
  mode?: PlaylistSortApplyMode;
  newPlaylistTitle?: string;
  sortedItemIds?: string[];
  allowQuotaFallback?: boolean;
}

export interface PlaylistSortApplyResponse {
  mode: PlaylistSortApplyMode;
  total: number;
  moved: number;
  succeeded: number;
  failed: number;
  failed_items: Array<{ playlist_item_id?: string; video_id?: string; error: string }>;
  quota_used: number;
  new_playlist_url?: string;
  [field: string]: unknown;
}

export interface PlaylistSortApi {
  list(params: { language: string; location: string }): Promise<PlaylistListResponse>;
  preview(request: PlaylistSortPreviewRequest): Promise<PlaylistSortPreviewResponse>;
  apply(request: PlaylistSortApplyRequest): Promise<PlaylistSortApplyResponse>;
}
