export interface YtmusicAuthUrlResponse {
  auth_url: string;
}

export interface YtmusicDisconnectResponse {
  status: 'ytmusic_disconnected';
}

export interface YtmusicCustomTokenMutationResponse {
  status: 'success';
  message: string;
}

export interface YtmusicCustomTokenValidationResponse {
  status: 'success';
  valid: boolean;
  message?: string | null;
  account_name?: string | null;
  channel_handle?: string | null;
  account_photo_url?: string | null;
}

export interface YtmusicSettingsApi {
  getAuthUrl(): Promise<YtmusicAuthUrlResponse>;
  disconnect(): Promise<YtmusicDisconnectResponse>;
  save(token: string): Promise<YtmusicCustomTokenMutationResponse>;
  clear(): Promise<YtmusicCustomTokenMutationResponse>;
  validate(token?: string | null): Promise<YtmusicCustomTokenValidationResponse>;
}
