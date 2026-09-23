import { api, normalizeYoutubePlaylistInput } from '../../../services/api';

/** YouTube Batch Update's API boundary; the shared client remains compatible with legacy pages. */
export const youtubeBatchApi = Object.freeze({
  getDraftSettings: (...args) => api.getYoutubeDraftSettings(...args),
  updateDraftSettings: (...args) => api.updateYoutubeDraftSettings(...args),
  updatePlaylist: (...args) => api.updateYoutubePlaylist(...args),
  getRandomMemberPreview: (...args) => api.getRandomMemberPreview(...args),
  getSpreadsheetMetadata: (...args) => api.getSpreadsheetMetadata(...args),
  getPlaylistVideos: (...args) => api.getPlaylistVideos(...args),
  getBatchPreview: (...args) => api.getBatchPreview(...args),
  updateMetadata: (...args) => api.batchUpdateMetadata(...args),
  estimateQuota: (...args) => api.estimateYoutubeQuota(...args),
});

export { normalizeYoutubePlaylistInput };
