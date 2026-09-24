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
  message?: string;
  account_name?: string;
  channel_handle?: string;
  account_photo_url?: string;
}

export interface YtmusicSettingsApi {
  getAuthUrl(): Promise<YtmusicAuthUrlResponse>;
  disconnect(): Promise<YtmusicDisconnectResponse>;
  save(token: string): Promise<YtmusicCustomTokenMutationResponse>;
  clear(): Promise<YtmusicCustomTokenMutationResponse>;
  validate(token?: string | null): Promise<YtmusicCustomTokenValidationResponse>;
}
