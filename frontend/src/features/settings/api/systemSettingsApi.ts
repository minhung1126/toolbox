import { api } from '../../../services/api';
import type { SystemSettingsApi } from './systemSettingsTypes';

export type * from './systemSettingsTypes';

export const systemSettingsApi: SystemSettingsApi = {
  getCredentials: () => api.getSystemCredentials(),
  updateCredentials: (payload) => api.updateSystemCredentials(payload),
  getAllowlist: () => api.getAllowlist(),
  addAllowlistEmail: (email) => api.addAllowlistEmail(email),
  removeAllowlistEmail: (email) => api.removeAllowlistEmail(email),
  updateAllowNewUsers: (allowNewUsers) => api.updateAllowNewUsers(allowNewUsers),
};
