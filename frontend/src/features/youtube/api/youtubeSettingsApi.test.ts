import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import {
  isAmbiguousYoutubeSettingsMutation,
  YoutubeSettingsContractError,
  youtubeSettingsApi,
} from './youtubeSettingsApi';

vi.mock('../../../services/api', () => ({
  api: {
    updateYoutubePlaylist: vi.fn(),
    updateYoutubeSlotConfig: vi.fn(),
    updateYoutubeRoutingMode: vi.fn(),
    updateYoutubeQuota: vi.fn(),
    getYoutubeAuthUrl: vi.fn(),
    activateYoutubeSlot: vi.fn(),
    disconnectYoutube: vi.fn(),
  },
}));

describe('youtubeSettingsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts matching write confirmations and rejects malformed or stale confirmations', async () => {
    const operations = [
      {
        mock: vi.mocked(api.updateYoutubePlaylist),
        call: () => youtubeSettingsApi.updatePlaylist({ playlistId: 'playlist-1' }),
        valid: { status: 'success', default_playlist_id: 'playlist-1' },
        stale: { status: 'success', default_playlist_id: 'playlist-2' },
      },
      {
        mock: vi.mocked(api.updateYoutubeSlotConfig),
        call: () => youtubeSettingsApi.updateSlotConfig('primary', { label: 'Creator' }),
        valid: {
          status: 'success',
          slot: 'primary',
          label: 'Creator',
          configured: true,
          enabled: true,
          quota_limit: 10000,
          safety_buffer_units: 1000,
        },
        stale: {
          status: 'success',
          slot: 'secondary',
          label: 'Creator',
          configured: true,
          enabled: true,
          quota_limit: 10000,
          safety_buffer_units: 1000,
        },
      },
      {
        mock: vi.mocked(api.updateYoutubeRoutingMode),
        call: () => youtubeSettingsApi.updateRoutingMode('manual'),
        valid: { status: 'success', routing_mode: 'manual' },
        stale: { status: 'success', routing_mode: 'auto_primary' },
      },
      {
        mock: vi.mocked(api.updateYoutubeQuota),
        call: () => youtubeSettingsApi.updateQuota({ slot: 'primary', quotaLimit: 8000, safetyBufferUnits: 500 }),
        valid: { status: 'success', slot: 'primary', quota_limit: 8000, safety_buffer_units: 500 },
        stale: { status: 'success', slot: 'primary', quota_limit: 10000, safety_buffer_units: 500 },
      },
      {
        mock: vi.mocked(api.activateYoutubeSlot),
        call: () => youtubeSettingsApi.activateSlot('primary'),
        valid: { status: 'youtube_slot_activated', active_slot: 'primary' },
        stale: { status: 'youtube_slot_activated', active_slot: 'secondary' },
      },
      {
        mock: vi.mocked(api.disconnectYoutube),
        call: () => youtubeSettingsApi.disconnectSlot('primary', { confirm: true }),
        valid: { status: 'youtube_disconnected', slot: 'primary' },
        stale: { status: 'youtube_disconnected', slot: 'secondary' },
      },
    ];

    for (const operation of operations) {
      operation.mock.mockResolvedValueOnce(operation.valid);
      await expect(operation.call()).resolves.toEqual(operation.valid);
      operation.mock.mockResolvedValueOnce(operation.stale);
      await expect(operation.call()).rejects.toBeInstanceOf(YoutubeSettingsContractError);
      operation.mock.mockResolvedValueOnce({});
      await expect(operation.call()).rejects.toBeInstanceOf(YoutubeSettingsContractError);
    }
  });

  it('accepts only an HTTPS OAuth URL', async () => {
    vi.mocked(api.getYoutubeAuthUrl).mockResolvedValueOnce({
      auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    });
    await expect(youtubeSettingsApi.getAuthUrl('primary')).resolves.toEqual({
      auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    });

    for (const auth_url of [
      'javascript:alert(1)',
      'http://accounts.google.com/auth',
      'https://accounts.google.com.evil.test/auth',
      'not-a-url',
    ]) {
      vi.mocked(api.getYoutubeAuthUrl).mockResolvedValueOnce({ auth_url });
      await expect(youtubeSettingsApi.getAuthUrl('primary')).rejects.toBeInstanceOf(YoutubeSettingsContractError);
    }
  });

  it('marks an uncertain write outcome for reconciliation', () => {
    expect(isAmbiguousYoutubeSettingsMutation(new YoutubeSettingsContractError())).toBe(true);
    expect(isAmbiguousYoutubeSettingsMutation({ code: 'timeout' })).toBe(true);
    expect(isAmbiguousYoutubeSettingsMutation({ status: 503 })).toBe(true);
    expect(isAmbiguousYoutubeSettingsMutation({ status: 400 })).toBe(false);
  });
});
