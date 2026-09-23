import type {
  PlaylistListResponse,
  PlaylistSortApplyRequest,
  PlaylistSortApplyResponse,
  PlaylistSortPreviewRequest,
  PlaylistSortPreviewResponse,
} from '../features/ytmusic/api/types';

export const api: {
  getPlaylistSortPlaylists(params?: { language?: string; location?: string }): Promise<PlaylistListResponse>;
  previewPlaylistSort(request: PlaylistSortPreviewRequest): Promise<PlaylistSortPreviewResponse>;
  applyPlaylistSort(request: PlaylistSortApplyRequest): Promise<PlaylistSortApplyResponse>;
};
