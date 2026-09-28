import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { sheetsSettingsApi } from './sheetsSettingsApi';

vi.mock('../../../services/api', () => ({
  api: {
    getSheetsAuthUrl: vi.fn(),
    disconnectSheets: vi.fn(),
    getSharedSettings: vi.fn(),
    updateSharedSettings: vi.fn(),
  },
}));

describe('sheetsSettingsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards Sheets OAuth operations and preserves API response shapes', async () => {
    const authUrl = { auth_url: 'https://accounts.google.com/o/oauth2/auth?sheets=1' };
    const disconnected = { status: 'sheets_disconnected' };
    vi.mocked(api.getSheetsAuthUrl).mockResolvedValueOnce(authUrl);
    vi.mocked(api.disconnectSheets).mockResolvedValueOnce(disconnected);

    await expect(sheetsSettingsApi.getAuthUrl()).resolves.toBe(authUrl);
    await expect(sheetsSettingsApi.disconnect()).resolves.toBe(disconnected);

    expect(api.getSheetsAuthUrl).toHaveBeenCalledOnce();
    expect(api.disconnectSheets).toHaveBeenCalledOnce();
  });

  it('forwards account scoped shared setting reads and updates', async () => {
    const settings = { default_spreadsheet_id: 'spreadsheet-1' };
    const updated = { status: 'success', settings };
    vi.mocked(api.getSharedSettings).mockResolvedValueOnce(settings);
    vi.mocked(api.updateSharedSettings).mockResolvedValueOnce(updated);

    await expect(sheetsSettingsApi.getSettings()).resolves.toBe(settings);
    await expect(sheetsSettingsApi.updateSettings(settings)).resolves.toBe(updated);

    expect(api.getSharedSettings).toHaveBeenCalledOnce();
    expect(api.updateSharedSettings).toHaveBeenCalledWith(settings);
  });

  it('rejects malformed responses and mismatched write confirmations', async () => {
    vi.mocked(api.getSharedSettings).mockResolvedValueOnce({});
    vi.mocked(api.updateSharedSettings).mockResolvedValueOnce({
      status: 'success',
      settings: { default_spreadsheet_id: 'previous-sheet' },
    });
    vi.mocked(api.disconnectSheets).mockResolvedValueOnce({});

    await expect(sheetsSettingsApi.getSettings()).rejects.toMatchObject({ code: 'sheets_settings_response_invalid' });
    await expect(sheetsSettingsApi.updateSettings({ default_spreadsheet_id: 'new-sheet' })).rejects.toMatchObject({
      code: 'sheets_settings_response_invalid',
    });
    await expect(sheetsSettingsApi.disconnect()).rejects.toMatchObject({ code: 'sheets_settings_response_invalid' });
  });
});
