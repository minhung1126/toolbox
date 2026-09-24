export interface SystemOAuthCredentialSummary {
  client_id: string;
  has_client_secret: boolean;
  client_secret_masked: string;
  configured: boolean;
}

export interface SystemOAuthCredentials {
  google: SystemOAuthCredentialSummary;
  youtube_primary: SystemOAuthCredentialSummary;
  youtube_secondary: SystemOAuthCredentialSummary;
}

export interface SystemCredentialsResponse {
  status: 'success';
  credentials: SystemOAuthCredentials;
  public_base_url: string;
  redirect_uri: string;
  message?: string;
}

export interface SystemCredentialsUpdateRequest {
  google_client_id?: string;
  google_client_secret?: string;
  youtube_primary_client_id?: string;
  youtube_primary_client_secret?: string;
  youtube_secondary_client_id?: string;
  youtube_secondary_client_secret?: string;
}

export interface SystemAllowlistResponse {
  allowed_emails: string[];
  current_user_email: string;
  allowlist_required: boolean;
  allow_new_users: boolean;
}

export interface SystemAllowlistMutationResponse {
  status: 'success';
  allowed_emails: string[];
  current_user_email: string;
  allow_new_users: boolean;
}

export interface AllowNewUsersUpdateResponse {
  status: 'success';
  allow_new_users: boolean;
  message: string;
}

export interface SystemSettingsApi {
  getCredentials(): Promise<SystemCredentialsResponse>;
  updateCredentials(payload: SystemCredentialsUpdateRequest): Promise<SystemCredentialsResponse>;
  getAllowlist(): Promise<SystemAllowlistResponse>;
  addAllowlistEmail(email: string): Promise<SystemAllowlistMutationResponse>;
  removeAllowlistEmail(email: string): Promise<SystemAllowlistMutationResponse>;
  updateAllowNewUsers(allowNewUsers: boolean): Promise<AllowNewUsersUpdateResponse>;
}
