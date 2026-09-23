import { api } from '../../../services/api';
import type { YoutubeSettingsApi } from './youtubeSettingsTypes';

export type * from './youtubeSettingsTypes';

export const youtubeSettingsApi: YoutubeSettingsApi = {
  updatePlaylist: (request) => api.updateYoutubePlaylist(request),
  updateSlotConfig: (slot, patch) => api.updateYoutubeSlotConfig(slot, patch),
  updateRoutingMode: (mode) => api.updateYoutubeRoutingMode(mode),
  updateQuota: (request) => api.updateYoutubeQuota(request),
  getAuthUrl: (slot) => api.getYoutubeAuthUrl(slot),
  activateSlot: (slot) => api.activateYoutubeSlot(slot),
  disconnectSlot: (slot, options) => api.disconnectYoutube(slot, options),
};
