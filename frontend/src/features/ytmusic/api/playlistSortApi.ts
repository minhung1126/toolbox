import { api } from '../../../services/api';
import type { PlaylistSortApi, PlaylistSortApplyRequest, PlaylistSortPreviewRequest } from './types';

export const playlistSortApi: PlaylistSortApi = {
  list: ({ language, location }) => api.getPlaylistSortPlaylists({ language, location }),
  preview: (request: PlaylistSortPreviewRequest) => api.previewPlaylistSort(request),
  apply: (request: PlaylistSortApplyRequest) => api.applyPlaylistSort(request),
};
