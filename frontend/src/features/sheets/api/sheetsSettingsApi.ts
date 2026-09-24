import { api } from '../../../services/api';
import type { SheetsSettingsApi } from './sheetsSettingsTypes';

export type * from './sheetsSettingsTypes';

export const sheetsSettingsApi: SheetsSettingsApi = {
  getAuthUrl: () => api.getSheetsAuthUrl(),
  disconnect: () => api.disconnectSheets(),
  getSettings: () => api.getSharedSettings(),
  updateSettings: (settings) => api.updateSharedSettings(settings),
};
