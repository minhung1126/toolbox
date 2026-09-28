import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { youtubeBatchApi } from './youtubeBatchApi';

vi.mock('../../../services/api', () => ({
  api: {
    getYoutubeDraftSettings: vi.fn(),
    updateYoutubeDraftSettings: vi.fn(),
    updateYoutubePlaylist: vi.fn(),
    getPlaylistVideos: vi.fn(),
    getBatchPreview: vi.fn(),
    batchUpdateMetadata: vi.fn(),
  },
}));

const request = {
  spreadsheetUrlOrId: 'sheet-1',
  playlistId: 'playlist-1',
  videoType: 'Video' as const,
  worksheetName: 'Videos',
  titleColumn: 'Title',
  descriptionColumn: 'Description',
  team: 'Team',
  assignments: [{ video_id: 'video-1', person: 'Alice' }],
};

const plan = [
  {
    videoId: 'video-1',
    person: 'Alice',
    currentTitle: 'Old',
    currentDescription: 'Old description',
    newTitle: 'New',
    newDescription: 'New description',
    status: 'ready',
    willUpdate: true,
  },
];

const preview = {
  preview_token: 'signed-token',
  preview_snapshot: { youtube_slot: 'primary', video_ids: ['video-1'], plan },
  plan,
};

const result = {
  operation: 'youtube.metadata_update',
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

describe('youtubeBatchApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates draft settings and confirms saved values before reporting success', async () => {
    const config = {
      spreadsheet_id: 'sheet-1',
      playlist_id: 'playlist-1',
      worksheet_name: 'Videos',
      title_column: 'Title',
      description_column: 'Description',
    };
    vi.mocked(api.getYoutubeDraftSettings).mockResolvedValueOnce({ video: config, shorts: {} });
    await expect(youtubeBatchApi.getDraftSettings()).resolves.toEqual({ video: config, shorts: {} });
    vi.mocked(api.getYoutubeDraftSettings).mockResolvedValueOnce({ video: null, shorts: {} } as unknown as Awaited<
      ReturnType<typeof api.getYoutubeDraftSettings>
    >);
    await expect(youtubeBatchApi.getDraftSettings()).rejects.toThrow('草稿設定結果無法確認');

    const saved = { status: 'success', video_type: 'Video', config };
    vi.mocked(api.updateYoutubeDraftSettings).mockResolvedValueOnce(saved);
    await expect(youtubeBatchApi.updateDraftSettings('Video', config)).resolves.toEqual(saved);
    vi.mocked(api.updateYoutubeDraftSettings).mockResolvedValueOnce({ ...saved, config: { ...config, title_column: 'Other' } });
    await expect(youtubeBatchApi.updateDraftSettings('Video', config)).rejects.toThrow('草稿設定結果無法確認');
  });

  it('uses the validated playlist setting response', async () => {
    vi.mocked(api.updateYoutubePlaylist).mockResolvedValueOnce({ status: 'success', default_playlist_id: 'playlist-1' });
    await expect(youtubeBatchApi.updatePlaylist({ playlistId: 'playlist-1' })).resolves.toMatchObject({ status: 'success' });
    vi.mocked(api.updateYoutubePlaylist).mockResolvedValueOnce({ status: 'success' });
    await expect(youtubeBatchApi.updatePlaylist({ playlistId: 'playlist-1' })).rejects.toThrow('操作結果無法確認');
  });

  it('rejects a missing draft video list instead of treating it as empty', async () => {
    const response = { playlist_id: 'playlist-1', videos: [{ video_id: 'video-1', title: 'Draft' }] };
    vi.mocked(api.getPlaylistVideos).mockResolvedValueOnce(response);
    await expect(youtubeBatchApi.getPlaylistVideos('playlist-1')).resolves.toEqual(response);

    vi.mocked(api.getPlaylistVideos).mockResolvedValueOnce({ playlist_id: 'playlist-1' });
    await expect(youtubeBatchApi.getPlaylistVideos('playlist-1')).rejects.toThrow('草稿播放清單回應格式不正確。');
  });

  it('rejects incomplete or contradictory batch plans before they can be confirmed', async () => {
    vi.mocked(api.getBatchPreview).mockResolvedValueOnce(preview);
    await expect(youtubeBatchApi.getBatchPreview(request)).resolves.toEqual(preview);

    vi.mocked(api.getBatchPreview).mockResolvedValueOnce({ ...preview, plan: undefined });
    await expect(youtubeBatchApi.getBatchPreview(request)).rejects.toThrow('批次更新預覽回應格式不正確。');

    vi.mocked(api.getBatchPreview).mockResolvedValueOnce({
      ...preview,
      preview_snapshot: { ...preview.preview_snapshot, video_ids: ['different-video'] },
    });
    await expect(youtubeBatchApi.getBatchPreview(request)).rejects.toThrow('批次更新預覽快照與計劃不一致。');
  });

  it('rejects incomplete execution results instead of reporting success', async () => {
    const updateRequest = { ...request, previewToken: 'signed-token', previewSnapshot: preview.preview_snapshot };
    vi.mocked(api.batchUpdateMetadata).mockResolvedValueOnce(result);
    await expect(youtubeBatchApi.updateMetadata(updateRequest)).resolves.toEqual(result);

    vi.mocked(api.batchUpdateMetadata).mockResolvedValueOnce({ ...result, results: undefined });
    await expect(youtubeBatchApi.updateMetadata(updateRequest)).rejects.toThrow('批次更新結果回應格式不正確。');

    vi.mocked(api.batchUpdateMetadata).mockResolvedValueOnce({ ...result, succeeded_count: 0 });
    await expect(youtubeBatchApi.updateMetadata(updateRequest)).rejects.toThrow('批次更新結果計數不一致。');
  });
});
