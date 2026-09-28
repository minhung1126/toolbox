import { api } from '../../../services/api';
import type {
  AllowNewUsersUpdateResponse,
  SystemAllowlistMutationResponse,
  SystemAllowlistResponse,
  SystemCredentialsResponse,
  SystemSettingsApi,
} from './systemSettingsTypes';

export type * from './systemSettingsTypes';

export class SystemSettingsContractError extends Error {
  code = 'system_settings_response_invalid';

  constructor() {
    super('系統設定操作結果無法確認，請重新整理後核對。');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmailList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((email) => typeof email === 'string');
}

function validCredentialSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.client_id === 'string' &&
    typeof value.has_client_secret === 'boolean' &&
    typeof value.client_secret_masked === 'string' &&
    typeof value.configured === 'boolean'
  );
}

function validCredentials(value: Record<string, unknown>): boolean {
  return (
    value.status === 'success' &&
    isRecord(value.credentials) &&
    validCredentialSummary(value.credentials.google) &&
    validCredentialSummary(value.credentials.youtube_primary) &&
    validCredentialSummary(value.credentials.youtube_secondary) &&
    typeof value.public_base_url === 'string' &&
    typeof value.redirect_uri === 'string'
  );
}

function validAllowlist(value: Record<string, unknown>): boolean {
  return (
    isEmailList(value.allowed_emails) &&
    typeof value.current_user_email === 'string' &&
    typeof value.allow_new_users === 'boolean'
  );
}

function requireResponse<T>(value: unknown, valid: (record: Record<string, unknown>) => boolean): T {
  if (!isRecord(value) || !valid(value)) throw new SystemSettingsContractError();
  return value as T;
}

export const systemSettingsApi: SystemSettingsApi = {
  async getCredentials() {
    return requireResponse<SystemCredentialsResponse>(await api.getSystemCredentials(), validCredentials);
  },
  async updateCredentials(payload) {
    return requireResponse<SystemCredentialsResponse>(await api.updateSystemCredentials(payload), validCredentials);
  },
  async getAllowlist() {
    return requireResponse<SystemAllowlistResponse>(
      await api.getAllowlist(),
      (value) => validAllowlist(value) && typeof value.allowlist_required === 'boolean'
    );
  },
  async addAllowlistEmail(email) {
    return requireResponse<SystemAllowlistMutationResponse>(
      await api.addAllowlistEmail(email),
      (value) =>
        value.status === 'success' &&
        validAllowlist(value) &&
        isEmailList(value.allowed_emails) &&
        value.allowed_emails.includes(email)
    );
  },
  async removeAllowlistEmail(email) {
    return requireResponse<SystemAllowlistMutationResponse>(
      await api.removeAllowlistEmail(email),
      (value) =>
        value.status === 'success' &&
        validAllowlist(value) &&
        isEmailList(value.allowed_emails) &&
        !value.allowed_emails.includes(email)
    );
  },
  async updateAllowNewUsers(allowNewUsers) {
    return requireResponse<AllowNewUsersUpdateResponse>(
      await api.updateAllowNewUsers(allowNewUsers),
      (value) => value.status === 'success' && value.allow_new_users === allowNewUsers
    );
  },
};
