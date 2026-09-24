import { api } from '../../../services/api';
import type { PublishCleanupApi } from './publishCleanupTypes';

export type * from './publishCleanupTypes';

export const publishCleanupApi: PublishCleanupApi = {
  getPlaylistVideos: (playlistId) => api.getPlaylistVideos(playlistId),
  estimateQuota: (request) => api.estimateYoutubeQuota(request),
  publishAndCleanup: (playlistId, options) => api.publishAndCleanup(playlistId, options),
  updateVideoMetadata: (request) => api.updateYoutubeVideoMetadata(request),
};
