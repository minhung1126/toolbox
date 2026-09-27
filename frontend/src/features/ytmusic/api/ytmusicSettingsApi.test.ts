import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { isAmbiguousYtmusicSettingsMutation, ytmusicSettingsApi } from './ytmusicSettingsApi';

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

  it('rejects malformed OAuth and disconnect responses', async () => {
    vi.mocked(api.getYtmusicAuthUrl).mockResolvedValue({ auth_url: 'javascript:alert(1)' });
    vi.mocked(api.disconnectYtmusic).mockResolvedValue({ status: 'success' });

    await expect(ytmusicSettingsApi.getAuthUrl()).rejects.toMatchObject({ code: 'ytmusic_settings_response_invalid' });
    await expect(ytmusicSettingsApi.disconnect()).rejects.toMatchObject({ code: 'ytmusic_settings_response_invalid' });
  });

  it('does not accept malformed token mutation or validation responses as success', async () => {
    vi.mocked(api.saveYtmusicCustomToken).mockResolvedValue({ status: 'success' });
    vi.mocked(api.clearYtmusicCustomToken).mockResolvedValue({ status: 'failed', message: 'not cleared' });
    vi.mocked(api.validateYtmusicCustomToken).mockResolvedValue({ status: 'success', valid: false });

    await expect(ytmusicSettingsApi.save('cookie')).rejects.toMatchObject({
      code: 'ytmusic_settings_response_invalid',
    });
    await expect(ytmusicSettingsApi.clear()).rejects.toMatchObject({ code: 'ytmusic_settings_response_invalid' });
    await expect(ytmusicSettingsApi.validate('cookie')).rejects.toMatchObject({
      code: 'ytmusic_settings_response_invalid',
    });
  });

  it('accepts nullable provider identity fields and distinguishes uncertain writes', async () => {
    vi.mocked(api.validateYtmusicCustomToken).mockResolvedValue({
      status: 'success',
      valid: true,
      account_name: null,
      channel_handle: null,
      account_photo_url: null,
    });
    await expect(ytmusicSettingsApi.validate()).resolves.toMatchObject({ valid: true });
    expect(isAmbiguousYtmusicSettingsMutation({ code: 'ytmusic_settings_response_invalid' })).toBe(true);
    expect(isAmbiguousYtmusicSettingsMutation({ code: 'network_error' })).toBe(true);
    expect(isAmbiguousYtmusicSettingsMutation({ status: 503 })).toBe(true);
    expect(isAmbiguousYtmusicSettingsMutation({ status: 400 })).toBe(false);
  });
});
