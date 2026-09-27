import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { weverseUploadApi, WeverseUploadResultError } from './weverseUploadApi';

vi.mock('../../../services/api', () => ({
  api: {
    getVideoUploaderAuthUrl: vi.fn(),
    disconnectVideoUploader: vi.fn(),
    uploadWeverseFromPath: vi.fn(),
    uploadWeverseFiles: vi.fn(),
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

describe('weverseUploadApi queued upload response', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a tracked task ID for both upload modes', async () => {
    const queued = { status: 'queued' as const, task_id: 'task-123' };
    vi.mocked(api.uploadWeverseFromPath).mockResolvedValue(queued);
    vi.mocked(api.uploadWeverseFiles).mockResolvedValue(queued);

    await expect(weverseUploadApi.uploadFromPath({ video_path: 'video.mp4', title: 'Video' })).resolves.toEqual(queued);
    await expect(weverseUploadApi.uploadFiles(new FormData())).resolves.toEqual(queued);
  });

  it.each([{}, { task_id: 'task-123' }, { status: 'queued', task_id: '' }, { status: 'success', task_id: 'task-123' }])(
    'rejects an untrackable upload response: %j',
    async (response) => {
      vi.mocked(api.uploadWeverseFromPath).mockResolvedValue(response as { status: 'queued'; task_id: string });
      await expect(weverseUploadApi.uploadFromPath({ video_path: 'video.mp4', title: 'Video' })).rejects.toBeInstanceOf(
        WeverseUploadResultError
      );
    }
  );
});
