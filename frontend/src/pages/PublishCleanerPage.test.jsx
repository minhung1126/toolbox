import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/api';
import PublishCleanerPage from './PublishCleanerPage';

const mocks = vi.hoisted(() => ({
  api: {
    getPlaylistVideos: vi.fn(),
    estimateYoutubeQuota: vi.fn(),
    publishAndCleanup: vi.fn(),
    updateYoutubeVideoMetadata: vi.fn(),
  },
  saveWorkState: vi.fn(),
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../services/api', () => ({
  api: mocks.api,
  normalizeYoutubePlaylistInput: (value) => String(value || '').trim(),
}));
vi.mock('../hooks/useAccountWorkState', () => ({
  default: () => ({ value: {}, error: '', save: mocks.saveWorkState }),
}));
vi.mock('../components/Toast', () => ({
  useToast: () => mocks.toast,
}));

const primaryAuthUser = {
  sub: 'owner-1',
  youtube: {
    active_slot: 'primary',
    slots: {
      primary: {
        authenticated: true,
        channel_id: 'channel-1',
        channel_title: '工作頻道',
        client_fingerprint: 'client-1',
        token_status: 'active',
        user: { email: 'creator@example.com' },
      },
    },
  },
};

const videoOne = {
  video_id: 'video-1',
  title: '影片一',
  description: '描述一',
  published_at: '2026-01-01T00:00:00Z',
};

const videoTwo = {
  video_id: 'video-2',
  title: '影片二',
  description: '描述二',
  published_at: '2026-01-02T00:00:00Z',
};

function playlistResponse(playlistId, videos = [videoOne], overrides = {}) {
  return {
    playlist_id: playlistId,
    videos,
    source: 'youtube-api',
    preview_snapshot: {
      playlist_id: playlistId,
      youtube_slot: 'primary',
      data_version: 'version-1',
      video_ids: videos.map((video) => video.video_id),
    },
    preview_token: `token-${playlistId}`,
    data_version: 'version-1',
    ...overrides,
  };
}

function renderPage({ authUser = primaryAuthUser, sysSettings = { default_playlist_id: 'playlist-a' } } = {}) {
  return render(<PublishCleanerPage authUser={authUser} sysSettings={sysSettings} />);
}

function loadButton() {
  return screen.getByRole('button', { name: /讀取 To-Post 播放清單/ });
}

async function loadCurrentPlaylist() {
  fireEvent.click(loadButton());
  await waitFor(() => expect(api.getPlaylistVideos).toHaveBeenCalled());
}

describe('PublishCleanerPage snapshot safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.estimateYoutubeQuota.mockResolvedValue({ projected_units: 200, max_items_today: 2 });
    api.publishAndCleanup.mockResolvedValue({
      operation: 'youtube.publish_cleanup',
      completed: true,
      total_count: 1,
      succeeded_count: 1,
      warning_count: 0,
      skipped_count: 0,
      failed_count: 0,
      not_attempted_count: 0,
      quota_blocked: false,
      results: [{ video_id: 'video-1', status: 'succeeded', title: '影片一' }],
    });
    api.updateYoutubeVideoMetadata.mockResolvedValue({});
  });

  it('keeps the shared playlist read-only and ignores stale responses after settings change', async () => {
    const pending = {};
    api.getPlaylistVideos.mockImplementation(
      (playlistId) =>
        new Promise((resolve) => {
          pending[playlistId] = resolve;
        })
    );
    const { rerender } = renderPage();

    const input = screen.getByPlaceholderText('YouTube Playlist ID');
    expect(input).toHaveAttribute('readonly');
    await loadCurrentPlaylist();
    rerender(<PublishCleanerPage authUser={primaryAuthUser} sysSettings={{ default_playlist_id: 'playlist-b' }} />);
    await waitFor(() => expect(input).toHaveValue('playlist-b'));
    await loadCurrentPlaylist();

    await act(async () => {
      pending['playlist-b'](playlistResponse('playlist-b', [{ ...videoTwo, title: 'B 影片' }]));
    });
    expect(await screen.findByText('B 影片')).toBeInTheDocument();

    await act(async () => {
      pending['playlist-a'](playlistResponse('playlist-a', [{ ...videoOne, title: 'A 舊影片' }]));
    });
    await waitFor(() => expect(screen.queryByText('A 舊影片')).not.toBeInTheDocument());
    expect(screen.getByText('B 影片')).toBeInTheDocument();
  });

  it('clears executable data on a failed read and shows an empty playlist explicitly', async () => {
    api.getPlaylistVideos
      .mockResolvedValueOnce(playlistResponse('playlist-a'))
      .mockRejectedValueOnce(new Error('網路中斷'))
      .mockResolvedValueOnce(playlistResponse('playlist-c', []));
    const { rerender } = renderPage();

    await loadCurrentPlaylist();
    expect(await screen.findByText('影片一')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('YouTube Playlist ID');
    rerender(<PublishCleanerPage authUser={primaryAuthUser} sysSettings={{ default_playlist_id: 'playlist-b' }} />);
    await waitFor(() => expect(input).toHaveValue('playlist-b'));
    await loadCurrentPlaylist();
    expect(await screen.findByText('讀取 To-Post 播放清單失敗：網路中斷')).toBeInTheDocument();
    expect(screen.queryByText('影片一')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '設為公開並移出清單' })).not.toBeInTheDocument();

    rerender(<PublishCleanerPage authUser={primaryAuthUser} sysSettings={{ default_playlist_id: 'playlist-c' }} />);
    await waitFor(() => expect(input).toHaveValue('playlist-c'));
    await loadCurrentPlaylist();
    expect(await screen.findByText(/播放清單「playlist-c」目前沒有影片/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '設為公開並移出清單' })).not.toBeInTheDocument();
  });

  it('shows the exact confirmation snapshot and sends its complete preview payload', async () => {
    api.getPlaylistVideos.mockResolvedValue(playlistResponse('playlist-a', [videoTwo, videoOne]));
    renderPage();
    await loadCurrentPlaylist();
    expect(await screen.findByText('影片一')).toBeInTheDocument();
    const pageList = screen.getByRole('list', { name: '待處理影片清單' });
    const pageItems = within(pageList).getAllByRole('listitem');
    expect(pageItems).toHaveLength(2);
    expect(pageItems[0]).toHaveTextContent('影片一');
    expect(pageItems[1]).toHaveTextContent('影片二');

    fireEvent.click(screen.getByRole('button', { name: '設為公開並移出清單' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('播放清單：playlist-a');
    expect(dialog).toHaveTextContent('授權組合：primary／頻道 工作頻道／帳號 creator@example.com');
    expect(dialog).toHaveTextContent('影片數量：2 支影片');
    expect(dialog).toHaveTextContent('#1 影片一');
    expect(dialog).toHaveTextContent('影片 ID：video-1');
    expect(dialog).toHaveTextContent('#2 影片二');
    expect(dialog).toHaveTextContent('影片 ID：video-2');
    const videoList = within(dialog).getByRole('list', { name: '實際確認影片' });
    expect(videoList).toBeInTheDocument();
    expect(within(videoList).getAllByRole('listitem')).toHaveLength(2);

    fireEvent.click(within(dialog).getByRole('button', { name: '設為公開並移出清單' }));
    await waitFor(() => expect(api.publishAndCleanup).toHaveBeenCalledTimes(1));
    expect(api.publishAndCleanup).toHaveBeenCalledWith('playlist-a', {
      youtubeSlot: 'primary',
      previewSnapshot: expect.objectContaining({
        playlist_id: 'playlist-a',
        video_ids: ['video-2', 'video-1'],
      }),
      previewToken: 'token-playlist-a',
    });
  });

  it('rejects malformed playlist data instead of showing an empty executable preview', async () => {
    api.getPlaylistVideos.mockResolvedValue(playlistResponse('playlist-a', [videoOne], { videos: undefined }));
    renderPage();

    await loadCurrentPlaylist();
    expect(await screen.findByText('讀取 To-Post 播放清單失敗：播放清單預覽回應格式不正確。')).toBeInTheDocument();
    expect(screen.queryByText(/播放清單「playlist-a」目前沒有影片/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '設為公開並移出清單' })).not.toBeInTheDocument();
  });

  it('requires provider reconciliation when a publish request returns an invalid result', async () => {
    api.getPlaylistVideos.mockResolvedValue(playlistResponse('playlist-a'));
    api.publishAndCleanup.mockResolvedValueOnce({ completed: true });
    renderPage();

    await loadCurrentPlaylist();
    expect(await screen.findByText('影片一')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '設為公開並移出清單' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '設為公開並移出清單' }));

    expect(await screen.findByText(/伺服器結果格式不正確，發布操作可能已執行/)).toBeInTheDocument();
    expect(mocks.toast.warning).toHaveBeenCalledWith('發布結果待核對，請先檢查 YouTube Studio');
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '設為公開並移出清單' })).not.toBeInTheDocument();
  });

  it('requires provider reconciliation after an ambiguous publish timeout', async () => {
    api.getPlaylistVideos.mockResolvedValue(playlistResponse('playlist-a'));
    api.publishAndCleanup.mockRejectedValueOnce(Object.assign(new Error('連線逾時'), { code: 'timeout' }));
    renderPage();

    await loadCurrentPlaylist();
    expect(await screen.findByText('影片一')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '設為公開並移出清單' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '設為公開並移出清單' }));

    expect(await screen.findByText(/無法確認發布操作是否已完成/)).toBeInTheDocument();
    expect(mocks.toast.warning).toHaveBeenCalledWith('發布結果待核對，請先檢查 YouTube Studio');
    expect(screen.queryByRole('button', { name: '設為公開並移出清單' })).not.toBeInTheDocument();
  });

  it('invalidates an open confirmation when the shared setting or authorization changes', async () => {
    api.getPlaylistVideos.mockResolvedValue(playlistResponse('playlist-a'));
    const { rerender } = renderPage();
    await loadCurrentPlaylist();
    fireEvent.click(screen.getByRole('button', { name: '設為公開並移出清單' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('YouTube Playlist ID');
    rerender(<PublishCleanerPage authUser={primaryAuthUser} sysSettings={{ default_playlist_id: 'playlist-b' }} />);
    await waitFor(() => expect(input).toHaveValue('playlist-b'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '設為公開並移出清單' })).not.toBeInTheDocument();

    rerender(
      <PublishCleanerPage
        authUser={{
          ...primaryAuthUser,
          youtube: { ...primaryAuthUser.youtube, active_slot: 'secondary' },
        }}
        sysSettings={{ default_playlist_id: 'playlist-b' }}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '設為公開並移出清單' })).not.toBeInTheDocument();
  });

  it('invalidates the loaded snapshot when the data version changes', async () => {
    api.getPlaylistVideos.mockResolvedValue(playlistResponse('playlist-a'));
    const versionedAuth = {
      ...primaryAuthUser,
      youtube: { ...primaryAuthUser.youtube, data_version: 'version-1' },
    };
    const { rerender } = renderPage({ authUser: versionedAuth });
    await loadCurrentPlaylist();
    expect(await screen.findByText('影片一')).toBeInTheDocument();

    rerender(
      <PublishCleanerPage
        authUser={{ ...versionedAuth, youtube: { ...versionedAuth.youtube, data_version: 'version-2' } }}
        sysSettings={{ default_playlist_id: 'playlist-a' }}
      />
    );
    expect(screen.queryByText('影片一')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '設為公開並移出清單' })).not.toBeInTheDocument();
  });
});
