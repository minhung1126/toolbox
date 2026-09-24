export interface SheetsAuthUrlResponse {
  auth_url: string;
}

export interface SheetsDisconnectResponse {
  status: 'sheets_disconnected';
}

export interface SharedSheetSettings {
  default_spreadsheet_id: string;
}

export interface SharedSheetSettingsUpdateResponse {
  status: 'success';
  settings: SharedSheetSettings;
}

export interface SheetsSettingsApi {
  getAuthUrl(): Promise<SheetsAuthUrlResponse>;
  disconnect(): Promise<SheetsDisconnectResponse>;
  getSettings(): Promise<SharedSheetSettings>;
  updateSettings(settings: SharedSheetSettings): Promise<SharedSheetSettingsUpdateResponse>;
}
