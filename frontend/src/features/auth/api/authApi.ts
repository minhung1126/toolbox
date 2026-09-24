import { api } from '../../../services/api';
import type { AuthApi } from './types';

export type * from './types';

export const authApi: AuthApi = {
  getLoginConfig: () => api.getAuthConfig(),
  getLoginUrl: () => api.getAuthUrl(),
  getSetupStatus: () => api.getSetupStatus(),
  performSetup: (request) => api.performSetup(request),
};
