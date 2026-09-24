import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { weverseUploadApi } from './weverseUploadApi';

vi.mock('../../../services/api', () => ({
  api: {
    getVideoUploaderAuthUrl: vi.fn(),
    disconnectVideoUploader: vi.fn(),
  },
}));

describe('weverseUploadApi uploader authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards uploader authorization operations and response contracts', async () => {
    const authUrl = { auth_url: 'https://accounts.google.com/o/oauth2/auth?uploader=1' };
    const disconnected = { status: 'video_uploader_disconnected' };
    vi.mocked(api.getVideoUploaderAuthUrl).mockResolvedValueOnce(authUrl);
    vi.mocked(api.disconnectVideoUploader).mockResolvedValueOnce(disconnected);

    await expect(weverseUploadApi.getUploaderAuthUrl()).resolves.toBe(authUrl);
    await expect(weverseUploadApi.disconnectUploader()).resolves.toBe(disconnected);
    expect(api.getVideoUploaderAuthUrl).toHaveBeenCalledOnce();
    expect(api.disconnectVideoUploader).toHaveBeenCalledOnce();
  });
});
