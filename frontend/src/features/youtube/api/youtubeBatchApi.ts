import { api, normalizeYoutubePlaylistInput } from '../../../services/api';
import type { YoutubeBatchApi } from './youtubeBatchTypes';

export type * from './youtubeBatchTypes';

const client: YoutubeBatchApi = {
  getDraftSettings: () => api.getYoutubeDraftSettings(),
  updateDraftSettings: (videoType, config) => api.updateYoutubeDraftSettings(videoType, config),
  updatePlaylist: ({ playlistId }) => api.updateYoutubePlaylist({ playlistId }),
  getRandomMemberPreview: (spreadsheetUrlOrId, worksheetName, team, columns) =>
    api.getRandomMemberPreview(spreadsheetUrlOrId, worksheetName, team, columns),
  getSpreadsheetMetadata: (spreadsheetUrlOrId) => api.getSpreadsheetMetadata(spreadsheetUrlOrId),
  getPlaylistVideos: (playlistId) => api.getPlaylistVideos(playlistId),
  getBatchPreview: (request) => api.getBatchPreview(request),
  updateMetadata: (request) => api.batchUpdateMetadata(request),
  estimateQuota: (request) => api.estimateYoutubeQuota(request),
};

export const youtubeBatchApi: Readonly<YoutubeBatchApi> = Object.freeze(client);

export { normalizeYoutubePlaylistInput };
