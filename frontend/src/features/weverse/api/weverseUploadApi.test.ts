import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import {
  weverseUploadApi,
  WeversePackageContractError,
  WeverseTaskContractError,
  WeverseUploadResultError,
} from './weverseUploadApi';

vi.mock('../../../services/api', () => ({
  api: {
    getVideoUploaderAuthUrl: vi.fn(),
    disconnectVideoUploader: vi.fn(),
    uploadWeverseFromPath: vi.fn(),
    uploadWeverseFiles: vi.fn(),
    getWeverseUploadTask: vi.fn(),
    getWeverseUploadHistory: vi.fn(),
    getWeverseRecentPaths: vi.fn(),
    scanWeverseFolder: vi.fn(),
    parseWeverseFiles: vi.fn(),
  },
}));

const packageResult = () => ({
  package_id: 'sample-live',
  folder_name: 'sample-live',
  suggested_title: 'Sample Live',
  suggested_description: '',
  video: {
    filename: 'sample.mp4',
    full_path: 'C:\\weverse\\sample.mp4',
    relative_path: 'sample-live/sample.mp4',
    size_bytes: 1024,
    size_formatted: '1 KB',
    extension: '.mp4',
  },
  other_videos: [],
  subtitles: [
    {
      filename: 'sample.ko.vtt',
      full_path: 'C:\\weverse\\sample.ko.vtt',
      relative_path: 'sample-live/sample.ko.vtt',
      size_bytes: 12,
      size_formatted: '12 B',
      raw_lang: 'ko',
      bcp47: 'ko',
      label: '韓文',
      enabled: true,
    },
  ],
});

describe('weverseUploadApi package and recent path contracts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts complete local scan and browser file results', async () => {
    const scan = {
      status: 'success' as const,
      scanned_path: 'C:\\weverse',
      packages_count: 1,
      packages: [packageResult()],
    };
    const browser = { status: 'success' as const, packages_count: 1, packages: [packageResult()] };
    vi.mocked(api.scanWeverseFolder).mockResolvedValue(scan);
    vi.mocked(api.parseWeverseFiles).mockResolvedValue(browser);

    await expect(weverseUploadApi.scanFolder('C:\\weverse')).resolves.toEqual(scan);
    await expect(
      weverseUploadApi.parseFiles([{ name: 'sample.mp4', size: 1024, relative_path: 'sample-live/sample.mp4' }])
    ).resolves.toEqual(browser);
  });

  it.each([
    { packages_count: 2 },
    { packages: undefined },
    { packages: [{ ...packageResult(), video: { ...packageResult().video, full_path: undefined } }] },
    {
      packages: [{ ...packageResult(), subtitles: [{ ...packageResult().subtitles[0], full_path: undefined }] }],
    },
    { packages: [{ ...packageResult(), subtitles: [{ filename: 'sample.ko.vtt' }] }] },
  ])('rejects an incomplete local scan result: %j', async (patch) => {
    vi.mocked(api.scanWeverseFolder).mockResolvedValue({
      status: 'success',
      scanned_path: 'C:\\weverse',
      packages_count: 1,
      packages: [packageResult()],
      ...patch,
    } as Awaited<ReturnType<typeof api.scanWeverseFolder>>);
    await expect(weverseUploadApi.scanFolder('C:\\weverse')).rejects.toBeInstanceOf(WeversePackageContractError);
  });

  it('rejects a browser package missing the relative video path', async () => {
    vi.mocked(api.parseWeverseFiles).mockResolvedValue({
      status: 'success',
      packages_count: 1,
      packages: [{ ...packageResult(), video: { ...packageResult().video, relative_path: undefined } }],
    } as Awaited<ReturnType<typeof api.parseWeverseFiles>>);
    await expect(weverseUploadApi.parseFiles([])).rejects.toBeInstanceOf(WeversePackageContractError);
  });

  it('validates the recent path list before rendering shortcuts', async () => {
    vi.mocked(api.getWeverseRecentPaths).mockResolvedValue({ status: 'success', paths: ['C:\\weverse'] });
    await expect(weverseUploadApi.getRecentPaths()).resolves.toEqual({ status: 'success', paths: ['C:\\weverse'] });
    vi.mocked(api.getWeverseRecentPaths).mockResolvedValue({ status: 'success', paths: [17] } as unknown as Awaited<
      ReturnType<typeof api.getWeverseRecentPaths>
    >);
    await expect(weverseUploadApi.getRecentPaths()).rejects.toBeInstanceOf(WeversePackageContractError);
  });
});

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
