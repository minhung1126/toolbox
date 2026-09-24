export interface LoginAuthConfig {
  has_client_id: boolean;
  has_client_secret: boolean;
}

export interface LoginAuthUrlResponse {
  auth_url?: string;
}

export interface SetupStatusResponse {
  is_configured: boolean;
  setup_completed: boolean;
  needs_pin: boolean;
  redirect_uri: string;
  development_pin?: string | null;
}

export interface SetupRequest {
  googleClientId: string;
  googleClientSecret: string;
  adminEmail: string;
  pin?: string;
  publicBaseUrl?: string;
}

export interface SetupResponse {
  status: 'success';
  message: string;
  admin_email?: string;
  redirect_uri?: string;
}

export interface AuthApi {
  getLoginConfig(): Promise<LoginAuthConfig>;
  getLoginUrl(): Promise<LoginAuthUrlResponse>;
  getSetupStatus(): Promise<SetupStatusResponse>;
  performSetup(request: SetupRequest): Promise<SetupResponse>;
}
