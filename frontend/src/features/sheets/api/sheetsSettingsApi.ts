import { api } from '../../../services/api';
import type {
  SheetsSettingsApi,
  SheetsAuthUrlResponse,
  SheetsDisconnectResponse,
  SharedSheetSettings,
  SharedSheetSettingsUpdateResponse,
} from './sheetsSettingsTypes';

export type * from './sheetsSettingsTypes';

export class SheetsSettingsContractError extends Error {
  code = 'sheets_settings_response_invalid';

  constructor() {
    super('Sheet 設定操作結果無法確認，請重新整理後核對。');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireResponse<T>(value: unknown, valid: (record: Record<string, unknown>) => boolean): T {
  if (!isRecord(value) || !valid(value)) throw new SheetsSettingsContractError();
  return value as T;
}

export const sheetsSettingsApi: SheetsSettingsApi = {
  async getAuthUrl() {
    const response = requireResponse<SheetsAuthUrlResponse>(
      await api.getSheetsAuthUrl(),
      (value) => typeof value.auth_url === 'string'
    );
    try {
      const url = new URL(response.auth_url);
      if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') throw new SheetsSettingsContractError();
    } catch {
      throw new SheetsSettingsContractError();
    }
    return response;
  },
  async disconnect() {
    return requireResponse<SheetsDisconnectResponse>(
      await api.disconnectSheets(),
      (value) => value.status === 'sheets_disconnected'
    );
  },
  async getSettings() {
    return requireResponse<SharedSheetSettings>(
      await api.getSharedSettings(),
      (value) => typeof value.default_spreadsheet_id === 'string'
    );
  },
  async updateSettings(settings) {
    const normalizedSettings = { ...settings, default_spreadsheet_id: settings.default_spreadsheet_id.trim() };
    return requireResponse<SharedSheetSettingsUpdateResponse>(
      await api.updateSharedSettings(normalizedSettings),
      (value) =>
        value.status === 'success' &&
        isRecord(value.settings) &&
        value.settings.default_spreadsheet_id === normalizedSettings.default_spreadsheet_id
    );
  },
};
