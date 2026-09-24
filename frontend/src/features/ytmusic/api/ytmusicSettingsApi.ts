import { api } from '../../../services/api';
import type { YtmusicSettingsApi } from './tokenTypes';

export type * from './tokenTypes';

export const ytmusicSettingsApi: YtmusicSettingsApi = {
  getAuthUrl: () => api.getYtmusicAuthUrl(),
  disconnect: () => api.disconnectYtmusic(),
  save: (token) => api.saveYtmusicCustomToken(token),
  clear: () => api.clearYtmusicCustomToken(),
  validate: (token) => api.validateYtmusicCustomToken(token),
};
