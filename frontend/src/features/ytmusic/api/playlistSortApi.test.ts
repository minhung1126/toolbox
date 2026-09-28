import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { playlistSortApi } from './playlistSortApi';

vi.mock('../../../services/api', () => ({
  api: {
    getPlaylistSortPlaylists: vi.fn(),
    previewPlaylistSort: vi.fn(),
    applyPlaylistSort: vi.fn(),
  },
}));

const request = { playlistId: 'playlist-1', sortKeys: [], language: 'en', location: 'US' };

describe('playlistSortApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a playlist list and rejects malformed entries before page state changes', async () => {
    const playlists = { playlists: [{ id: 'playlist-1', title: 'Music', item_count: 2 }] };
    vi.mocked(api.getPlaylistSortPlaylists).mockResolvedValueOnce(playlists);
    await expect(playlistSortApi.list({ language: 'en', location: 'US' })).resolves.toEqual(playlists);

    vi.mocked(api.getPlaylistSortPlaylists).mockResolvedValueOnce({
      playlists: [{ id: 'playlist-1', item_count: '2' }],
    });
    await expect(playlistSortApi.list({ language: 'en', location: 'US' })).rejects.toThrow('播放清單回應格式不正確。');
  });

  it('rejects an incomplete preview instead of allowing malformed tracks into drag sorting', async () => {
    const preview = {
      preview: {
        total: 1,
        moved_count: 1,
        unchanged_count: 0,
        items: [{ playlist_item_id: 'item-1', original_position: 0, new_position: 0, status: 'moved' }],
      },
      preview_token: 'token-1',
      quota_estimate: { total_units: 50, moved_count: 1, units_per_move: 50 },
    };
    vi.mocked(api.previewPlaylistSort).mockResolvedValueOnce(preview);
    await expect(playlistSortApi.preview(request)).resolves.toEqual(preview);

    vi.mocked(api.previewPlaylistSort).mockResolvedValueOnce({
      ...preview,
      preview: { ...preview.preview, items: [{ playlist_item_id: 'item-1' }] },
    });
    await expect(playlistSortApi.preview(request)).rejects.toThrow('排序預覽曲目回應格式不正確。');

    vi.mocked(api.previewPlaylistSort).mockResolvedValueOnce({
      ...preview,
      preview: { ...preview.preview, items: [{ ...preview.preview.items[0], title: { malformed: true } }] },
    });
    await expect(playlistSortApi.preview(request)).rejects.toThrow('排序預覽曲目回應格式不正確。');

    vi.mocked(api.previewPlaylistSort).mockResolvedValueOnce({ ...preview, quota_estimate: { total_units: '50' } });
    await expect(playlistSortApi.preview(request)).rejects.toThrow('排序預覽配額回應格式不正確。');
  });

  it('rejects a malformed apply result instead of reporting a false success', async () => {
    const result = { mode: 'in_place', total: 3, moved: 2, succeeded: 2, failed: 0, failed_items: [], quota_used: 100 };
    vi.mocked(api.applyPlaylistSort).mockResolvedValueOnce(result);
    await expect(playlistSortApi.apply({ ...request, previewToken: 'token-1' })).resolves.toEqual(result);

    const partial = {
      ...result,
      mode: 'new_playlist',
      moved: 3,
      succeeded: 2,
      failed: 1,
      failed_items: [{ playlist_item_id: 'missing-video', error: '缺少影片 ID，無法加入新播放清單。' }],
      new_playlist_url: 'https://music.youtube.com/playlist?list=new',
    };
    vi.mocked(api.applyPlaylistSort).mockResolvedValueOnce(partial);
    await expect(playlistSortApi.apply({ ...request, previewToken: 'token-1' })).resolves.toEqual(partial);

    vi.mocked(api.applyPlaylistSort).mockResolvedValueOnce({ ...result, succeeded: '2' });
    await expect(playlistSortApi.apply({ ...request, previewToken: 'token-1' })).rejects.toThrow(
      '排序套用回應格式不正確。'
    );

    for (const malformed of [
      { ...result, total: 1 },
      { ...result, failed: 1 },
      { ...result, failed_items: [{ error: '失敗' }] },
      { ...result, mode: 'new_playlist' },
    ]) {
      vi.mocked(api.applyPlaylistSort).mockResolvedValueOnce(malformed);
      await expect(playlistSortApi.apply({ ...request, previewToken: 'token-1' })).rejects.toThrow(
        '排序套用回應格式不正確。'
      );
    }
  });
});
