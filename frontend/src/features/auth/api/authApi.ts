import { api } from '../../../services/api';
import type { AuthApi, LoginAuthConfig, LoginAuthUrlResponse, SetupResponse, SetupStatusResponse } from './types';

export type * from './types';

export class AuthContractError extends Error {
  code = 'auth_response_invalid';

  constructor() {
    super('驗證服務的回應無法確認，請重新整理後核對狀態。');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireResponse<T>(value: unknown, valid: (record: Record<string, unknown>) => boolean): T {
  if (!isRecord(value) || !valid(value)) throw new AuthContractError();
  return value as T;
}

export const authApi: AuthApi = {
  async getLoginConfig() {
    return requireResponse<LoginAuthConfig>(
      await api.getAuthConfig(),
      (value) => typeof value.has_client_id === 'boolean' && typeof value.has_client_secret === 'boolean'
    );
  },
  async getLoginUrl() {
    const response = requireResponse<LoginAuthUrlResponse>(
      await api.getAuthUrl(),
      (value) => typeof value.auth_url === 'string'
    );
    try {
      const url = new URL(response.auth_url);
      if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') throw new AuthContractError();
    } catch {
      throw new AuthContractError();
    }
    return response;
  },
  async getSetupStatus() {
    return requireResponse<SetupStatusResponse>(
      await api.getSetupStatus(),
      (value) =>
        typeof value.is_configured === 'boolean' &&
        typeof value.setup_completed === 'boolean' &&
        typeof value.needs_pin === 'boolean' &&
        typeof value.redirect_uri === 'string'
    );
  },
  async performSetup(request) {
    const normalizedRequest = { ...request, adminEmail: request.adminEmail.trim().toLowerCase() };
    return requireResponse<SetupResponse>(
      await api.performSetup(normalizedRequest),
      (value) =>
        value.status === 'success' &&
        typeof value.message === 'string' &&
        value.admin_email === normalizedRequest.adminEmail
    );
  },
};
