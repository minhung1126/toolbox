import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { ytmusicSettingsApi } from './ytmusicSettingsApi';

vi.mock('../../../services/api', () => ({
  api: {
    getYtmusicAuthUrl: vi.fn(),
    disconnectYtmusic: vi.fn(),
    saveYtmusicCustomToken: vi.fn(),
    clearYtmusicCustomToken: vi.fn(),
    validateYtmusicCustomToken: vi.fn(),
  },
}));

describe('ytmusicSettingsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates OAuth connection operations to the shared HTTP client', async () => {
    const authUrl = { auth_url: 'https://accounts.google.com/o/oauth2/auth' };
    const disconnectResult = { status: 'ytmusic_disconnected' };
    vi.mocked(api.getYtmusicAuthUrl).mockResolvedValue(authUrl);
    vi.mocked(api.disconnectYtmusic).mockResolvedValue(disconnectResult);

    await expect(ytmusicSettingsApi.getAuthUrl()).resolves.toEqual(authUrl);
    await expect(ytmusicSettingsApi.disconnect()).resolves.toEqual(disconnectResult);
  });

  it('delegates custom token save, validation, and clear operations', async () => {
    const token = 'cookie: SAPISID=value';
    const validation = { status: 'success', valid: true, account_name: 'Music User' };
    const mutation = { status: 'success', message: 'done' };
    vi.mocked(api.validateYtmusicCustomToken).mockResolvedValue(validation);
    vi.mocked(api.saveYtmusicCustomToken).mockResolvedValue(mutation);
    vi.mocked(api.clearYtmusicCustomToken).mockResolvedValue(mutation);

    await expect(ytmusicSettingsApi.validate(token)).resolves.toEqual(validation);
    await expect(ytmusicSettingsApi.save(token)).resolves.toEqual(mutation);
    await expect(ytmusicSettingsApi.clear()).resolves.toEqual(mutation);
    expect(api.validateYtmusicCustomToken).toHaveBeenCalledWith(token);
    expect(api.saveYtmusicCustomToken).toHaveBeenCalledWith(token);
  });
});
