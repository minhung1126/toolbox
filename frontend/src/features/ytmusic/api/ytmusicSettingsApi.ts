import { api } from '../../../services/api';
import type {
  YtmusicAuthUrlResponse,
  YtmusicCustomTokenMutationResponse,
  YtmusicCustomTokenValidationResponse,
  YtmusicDisconnectResponse,
  YtmusicSettingsApi,
} from './tokenTypes';

export type * from './tokenTypes';

export class YtmusicSettingsContractError extends Error {
  code: 'ytmusic_settings_response_invalid';

  constructor() {
    super('YouTube Music 設定回應格式不正確，請重新整理核對。');
    this.code = 'ytmusic_settings_response_invalid';
  }
}

export function isAmbiguousYtmusicSettingsMutation(
  error: { code?: string; status?: number } | null | undefined
): boolean {
  return (
    error?.code === 'ytmusic_settings_response_invalid' ||
    error?.code === 'timeout' ||
    error?.code === 'network_error' ||
    (typeof error?.status === 'number' && error.status >= 500)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function parseAuthUrl(value: unknown): YtmusicAuthUrlResponse {
  if (!isRecord(value) || typeof value.auth_url !== 'string') {
    throw new YtmusicSettingsContractError();
  }
  try {
    const url = new URL(value.auth_url);
    if (url.protocol !== 'https:' || !url.hostname) throw new YtmusicSettingsContractError();
  } catch {
    throw new YtmusicSettingsContractError();
  }
  return value as unknown as YtmusicAuthUrlResponse;
}

function parseDisconnect(value: unknown): YtmusicDisconnectResponse {
  if (!isRecord(value) || value.status !== 'ytmusic_disconnected') {
    throw new YtmusicSettingsContractError();
  }
  return value as unknown as YtmusicDisconnectResponse;
}

function parseMutation(value: unknown): YtmusicCustomTokenMutationResponse {
  if (!isRecord(value) || value.status !== 'success' || typeof value.message !== 'string' || !value.message.trim()) {
    throw new YtmusicSettingsContractError();
  }
  return value as unknown as YtmusicCustomTokenMutationResponse;
}

function parseValidation(value: unknown): YtmusicCustomTokenValidationResponse {
  if (
    !isRecord(value) ||
    value.status !== 'success' ||
    value.valid !== true ||
    !isOptionalString(value.message) ||
    !isOptionalString(value.account_name) ||
    !isOptionalString(value.channel_handle) ||
    !isOptionalString(value.account_photo_url)
  ) {
    throw new YtmusicSettingsContractError();
  }
  return value as unknown as YtmusicCustomTokenValidationResponse;
}

export const ytmusicSettingsApi: YtmusicSettingsApi = {
  getAuthUrl: async () => parseAuthUrl(await api.getYtmusicAuthUrl()),
  disconnect: async () => parseDisconnect(await api.disconnectYtmusic()),
  save: async (token) => parseMutation(await api.saveYtmusicCustomToken(token)),
  clear: async () => parseMutation(await api.clearYtmusicCustomToken()),
  validate: async (token) => parseValidation(await api.validateYtmusicCustomToken(token)),
};
