import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { publishCleanupApi } from './publishCleanupApi';

vi.mock('../../../services/api', () => ({
  api: {
    getPlaylistVideos: vi.fn(),
    estimateYoutubeQuota: vi.fn(),
    publishAndCleanup: vi.fn(),
    updateYoutubeVideoMetadata: vi.fn(),
  },
}));

const preview = {
  playlist_id: 'playlist-1',
  videos: [{ video_id: 'video-1', title: 'First' }],
  preview_token: 'signed-token',
  preview_snapshot: { video_ids: ['video-1'], youtube_slot: 'primary' },
};

const result = {
  operation: 'youtube.publish_cleanup',
  completed: true,
  total_count: 1,
  succeeded_count: 1,
  warning_count: 0,
  skipped_count: 0,
  failed_count: 0,
  not_attempted_count: 0,
  quota_blocked: false,
  results: [{ video_id: 'video-1', status: 'succeeded' }],
};

describe('publishCleanupApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps a valid playlist preview and rejects a missing or mismatched video list', async () => {
    vi.mocked(api.getPlaylistVideos).mockResolvedValueOnce(preview);
    await expect(publishCleanupApi.getPlaylistVideos('playlist-1')).resolves.toEqual(preview);

    vi.mocked(api.getPlaylistVideos).mockResolvedValueOnce({ ...preview, videos: undefined });
    await expect(publishCleanupApi.getPlaylistVideos('playlist-1')).rejects.toThrow('播放清單預覽回應格式不正確。');

    vi.mocked(api.getPlaylistVideos).mockResolvedValueOnce({
      ...preview,
      preview_snapshot: { video_ids: ['different-video'] },
    });
    await expect(publishCleanupApi.getPlaylistVideos('playlist-1')).rejects.toThrow(
      '播放清單預覽快照與影片清單不一致。'
    );
  });

  it('rejects incomplete publish results instead of reporting a false success', async () => {
    const options = { previewToken: 'signed-token', previewSnapshot: preview.preview_snapshot };
    vi.mocked(api.publishAndCleanup).mockResolvedValueOnce(result);
    await expect(publishCleanupApi.publishAndCleanup('playlist-1', options)).resolves.toEqual(result);

    vi.mocked(api.publishAndCleanup).mockResolvedValueOnce({ ...result, results: undefined });
    await expect(publishCleanupApi.publishAndCleanup('playlist-1', options)).rejects.toThrow(
      '發布草稿結果回應格式不正確。'
    );

    vi.mocked(api.publishAndCleanup).mockResolvedValueOnce({ ...result, succeeded_count: 0 });
    await expect(publishCleanupApi.publishAndCleanup('playlist-1', options)).rejects.toThrow(
      '發布草稿結果計數不一致。'
    );
  });

  it('requires a matching single-video update confirmation', async () => {
    const request = { videoId: 'video-1', title: 'New', description: 'Updated description' };
    const result = { video_id: 'video-1', title: 'New', description: 'Updated description', status: 'succeeded' };
    vi.mocked(api.updateYoutubeVideoMetadata).mockResolvedValueOnce(result);
    await expect(publishCleanupApi.updateVideoMetadata(request)).resolves.toEqual(result);
    vi.mocked(api.updateYoutubeVideoMetadata).mockResolvedValueOnce({ ...result, title: 'Other' });
    await expect(publishCleanupApi.updateVideoMetadata(request)).rejects.toThrow('結果無法確認');
  });
});
