import { api } from '../../../services/api';
import type { YoutubeQuotaApi } from './youtubeQuotaTypes';

export type * from './youtubeQuotaTypes';

export const youtubeQuotaApi: YoutubeQuotaApi = {
  getUsage: (slot) => api.getYoutubeQuotaUsage(slot),
};
