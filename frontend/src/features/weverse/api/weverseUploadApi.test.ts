import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { weverseUploadApi, WeverseTaskContractError, WeverseUploadResultError } from './weverseUploadApi';

vi.mock('../../../services/api', () => ({
  api: {
    getVideoUploaderAuthUrl: vi.fn(),
    disconnectVideoUploader: vi.fn(),
    uploadWeverseFromPath: vi.fn(),
    uploadWeverseFiles: vi.fn(),
    getWeverseUploadTask: vi.fn(),
    getWeverseUploadHistory: vi.fn(),
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

const completedTask = () => ({
  task_id: 'task-123',
  title: 'Sample Live',
  status: 'completed' as const,
  progress_percent: 100,
  current_step: '上傳完成',
  video_id: 'video-123',
  video_url: 'https://youtu.be/video-123',
});

describe('weverseUploadApi task and history contracts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a completed task only with provider video evidence', async () => {
    const response = { status: 'success' as const, task: completedTask() };
    vi.mocked(api.getWeverseUploadTask).mockResolvedValue(response);
    await expect(weverseUploadApi.getTask('task-123')).resolves.toEqual(response);
  });

  it.each([
    { task: { ...completedTask(), video_id: undefined } },
    { task: { ...completedTask(), task_id: 'another-task' } },
    { task: { ...completedTask(), progress_percent: 140 } },
    { task: { ...completedTask(), status: 'unknown' } },
  ])('rejects an untrustworthy task response: %j', async (patch) => {
    vi.mocked(api.getWeverseUploadTask).mockResolvedValue({
      status: 'success',
      ...patch,
    } as Awaited<ReturnType<typeof api.getWeverseUploadTask>>);
    await expect(weverseUploadApi.getTask('task-123')).rejects.toBeInstanceOf(WeverseTaskContractError);
  });

  it('rejects malformed history instead of displaying incomplete records', async () => {
    vi.mocked(api.getWeverseUploadHistory).mockResolvedValue({ status: 'success', tasks: [completedTask()] });
    await expect(weverseUploadApi.getHistory(10)).resolves.toMatchObject({ tasks: [completedTask()] });

    vi.mocked(api.getWeverseUploadHistory).mockResolvedValue({
      status: 'success',
      tasks: [{ ...completedTask(), video_url: undefined }],
    } as Awaited<ReturnType<typeof api.getWeverseUploadHistory>>);
    await expect(weverseUploadApi.getHistory(10)).rejects.toBeInstanceOf(WeverseTaskContractError);
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
