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
}

export interface YtmusicTokenApi {
  save(token: string): Promise<YtmusicCustomTokenMutationResponse>;
  clear(): Promise<YtmusicCustomTokenMutationResponse>;
  validate(token?: string | null): Promise<YtmusicCustomTokenValidationResponse>;
}
