export type SortDirection = 'asc' | 'desc';

export interface PlaylistSortKey {
  field: string;
  direction: SortDirection;
}

export interface PlaylistSortTrack {
  playlist_item_id: string;
  artist?: string | null;
  album?: string | null;
  album_artist?: string | null;
  track_number?: number | string | null;
  year?: number | string | null;
  release_date?: string | null;
  published_at?: string | null;
  added_at?: string | null;
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
