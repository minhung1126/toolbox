import { api } from '../../../services/api';
import type { YtmusicTokenApi } from './tokenTypes';

export type * from './tokenTypes';

export const ytmusicTokenApi: YtmusicTokenApi = {
  save: (token) => api.saveYtmusicCustomToken(token),
  clear: () => api.clearYtmusicCustomToken(),
  validate: (token) => api.validateYtmusicCustomToken(token),
};
