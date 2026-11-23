import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PlaylistSortPage, { TrackSubtitle } from './PlaylistSortPage';
import { ytmusicSettingsApi } from '../features/ytmusic/api/ytmusicSettingsApi';
import { api } from '../services/api';
import { usePlaylistSortController } from '../features/ytmusic/hooks/usePlaylistSortController';
import { usePlaylistSortState } from '../features/ytmusic/hooks/usePlaylistSortState';
import { usePlaylistSortWorkflow } from '../features/ytmusic/hooks/usePlaylistSortWorkflow';

vi.mock('../utils/navigation', () => ({ redirectToAuth: vi.fn() }));

vi.mock('../services/api', () => ({
  api: {
    getPlaylistSortPlaylists: vi.fn(),
    previewPlaylistSort: vi.fn(),
    applyPlaylistSort: vi.fn(),
    updateWorkState: vi.fn((key, value) => Promise.resolve({ state: { [key]: value } })),
    getWorkState: vi.fn(() => Promise.resolve({ state: {} })),
  },
}));

vi.mock('../features/ytmusic/api/ytmusicSettingsApi', () => ({
  ytmusicSettingsApi: {
    getAuthUrl: vi.fn(),
    disconnect: vi.fn(),
  },
}));

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../components/Toast', () => ({
  useToast: () => mockToast,
}));

const mockPlaylists = [
  {
    id: 'pl-1',
    title: '我的最愛音樂',
    description: '放鬆專用',
    item_count: 3,
    privacy_status: 'public',
  },
  {
    id: 'pl-2',
    title: '健身歌單',
    description: '跑步用',
    item_count: 5,
    privacy_status: 'private',
  },
];

const mockPreview = {
  total: 3,
  unchanged_count: 1,
  moved_count: 2,
  items: [
    {
      playlist_item_id: 'item-1',
      video_id: 'v1',
      title: 'Song A',
      channel_title: 'Artist X',
      duration_seconds: 180,
      status: 'unchanged',
      original_position: 0,
      new_position: 0,
    },
    {
      playlist_item_id: 'item-2',
      video_id: 'v2',
      title: 'Song C',
      channel_title: 'Artist Y',
      duration_seconds: 240,
      status: 'moved',
      original_position: 1,
      new_position: 2,
    },
    {
      playlist_item_id: 'item-3',
      video_id: 'v3',
      title: 'Song B',
      channel_title: 'Artist Z',
      duration_seconds: 210,
      status: 'moved',
      original_position: 2,
      new_position: 1,
    },
  ],
};

import { AccountWorkStateProvider } from '../hooks/useAccountWorkState';

const renderWithRouter = (ui, { initialState = {} } = {}) => {
  const defaultAuthUser = {
    authorizations: {
      ytmusic: { connected: true, user: { email: 'music@example.com' } },
    },
    youtube: { slots: { primary: { authenticated: true, channel_title: 'My Channel' } } },
  };
  const propAuthUser = ui.props?.authUser;
  const authUser = propAuthUser
    ? {
        ...defaultAuthUser,
        ...propAuthUser,
        authorizations: {
          ...defaultAuthUser.authorizations,
          ...(propAuthUser.authorizations || {}),
          ytmusic: {
            ...defaultAuthUser.authorizations.ytmusic,
            ...(propAuthUser.authorizations?.ytmusic || {}),
          },
        },
        youtube: {
          ...defaultAuthUser.youtube,
          ...(propAuthUser.youtube || {}),
        },
      }
    : defaultAuthUser;

  return render(
    <MemoryRouter>
      <AccountWorkStateProvider initialState={initialState}>
        {React.cloneElement(ui, { authUser })}
      </AccountWorkStateProvider>
    </MemoryRouter>
  );
};

describe('PlaylistSortPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores the saved selected playlist when the library loads', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    renderWithRouter(<PlaylistSortPage />, {
      initialState: { ytmusic_sort_config: { selectedPlaylistId: 'pl-2', presetMode: 'title-asc' } },
    });
    await screen.findByText('健身歌單 (5 首)');
    expect(screen.getByRole('combobox', { name: '選擇播放清單' })).toHaveValue('pl-2');
  });

  it('loads and displays user playlists', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });

    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => {
      expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
      expect(screen.getByText('健身歌單 (5 首)')).toBeInTheDocument();
    });
  });

  it('reports malformed playlist data without treating it as an empty list', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: [{ id: 'pl-1', title: 'Bad', item_count: '3' }] });

    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('載入播放清單失敗：播放清單回應格式不正確。'));
    expect(screen.queryByText('Bad (3 首)')).not.toBeInTheDocument();
  });

  it('uses the YouTube Music feature API to connect a dedicated account', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: [] });
    ytmusicSettingsApi.getAuthUrl.mockResolvedValueOnce({
      auth_url: 'https://accounts.google.com/o/oauth2/auth?ytmusic=1',
    });

    renderWithRouter(<PlaylistSortPage authUser={{ authorizations: { ytmusic: { connected: false } } }} />);

    fireEvent.click(screen.getByRole('button', { name: /連結 YouTube Music 專屬帳號/ }));
    await waitFor(() => expect(ytmusicSettingsApi.getAuthUrl).toHaveBeenCalledOnce());
  });

  it('triggers preview and displays comparison results', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    api.previewPlaylistSort.mockResolvedValueOnce({
      preview: mockPreview,
      preview_token: 'token-abc',
      quota_estimate: {
        moved_count: 2,
        units_per_move: 50,
        total_units: 100,
      },
    });

    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => {
      expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
    });

    const previewButton = screen.getByRole('button', { name: /模擬預覽/ });
    fireEvent.click(previewButton);

    await waitFor(() => {
      expect(api.previewPlaylistSort).toHaveBeenCalledWith({
        playlistId: 'pl-1',
        sortKeys: [{ field: 'title', direction: 'asc' }],
        language: 'zh_TW',
        location: 'TW',
      });
      expect(screen.getByText(/不變 1 首/)).toBeInTheDocument();
      expect(screen.getByText(/移動 2 首/)).toBeInTheDocument();
      expect(screen.getByText(/共 3 首/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /套用排序/ })).toBeInTheDocument();
    });
  });

  it('ignores a preview response after the selected playlist changes', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    let resolvePreview;
    api.previewPlaylistSort.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreview = resolve;
      })
    );

    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => {
      expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /模擬預覽/ }));
    await waitFor(() => expect(api.previewPlaylistSort).toHaveBeenCalledOnce());
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'pl-2' } });

    await act(async () => {
      resolvePreview({ preview: mockPreview, preview_token: 'stale-token' });
    });

    expect(screen.queryByRole('button', { name: /套用排序/ })).not.toBeInTheDocument();
    expect(mockToast.success).not.toHaveBeenCalledWith(expect.stringContaining('預覽完成'));
  });

  it('applies sort after confirmation in dialog', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    api.previewPlaylistSort.mockResolvedValueOnce({
      preview: mockPreview,
      preview_token: 'token-abc',
      quota_estimate: {
        moved_count: 2,
        units_per_move: 50,
        total_units: 100,
      },
    });
    api.applyPlaylistSort.mockResolvedValueOnce({
      operation: 'playlist_sort',
      mode: 'in_place',
      total: 3,
      moved: 2,
      succeeded: 2,
      failed: 0,
      failed_items: [],
      quota_used: 100,
    });

    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => {
      expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /模擬預覽/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /套用排序/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /套用排序/ }));

    await waitFor(() => {
      expect(screen.getByText('確認套用排序')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '確認套用' }));

    await waitFor(() => {
      expect(api.applyPlaylistSort).toHaveBeenCalledWith({
        playlistId: 'pl-1',
        sortKeys: [{ field: 'title', direction: 'asc' }],
        previewToken: 'token-abc',
        sortedItemIds: ['item-1', 'item-3', 'item-2'],
        language: 'zh_TW',
        location: 'TW',
      });
      expect(screen.getByText('排序成功套用')).toBeInTheDocument();
      expect(screen.getByText(/成功移動/)).toBeInTheDocument();
    });
  });

  it('shows the failed item ID and safe error after a partial apply', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    api.previewPlaylistSort.mockResolvedValueOnce({
      preview: mockPreview,
      preview_token: 'token-abc',
      quota_estimate: { moved_count: 2, units_per_move: 50, total_units: 100 },
    });
    api.applyPlaylistSort.mockResolvedValueOnce({
      operation: 'playlist_sort',
      mode: 'in_place',
      total: 3,
      moved: 2,
      succeeded: 1,
      failed: 1,
      failed_items: [{ playlist_item_id: 'item-3', error: '移動曲目失敗，請核對 YouTube Music 播放清單。' }],
      quota_used: 0,
    });

    renderWithRouter(<PlaylistSortPage />);
    fireEvent.click(await screen.findByRole('button', { name: /模擬預覽/ }));
    fireEvent.click(await screen.findByRole('button', { name: /套用排序/ }));
    fireEvent.click(await screen.findByRole('button', { name: '確認套用' }));

    expect(await screen.findByText('排序完成（有部分失敗）')).toBeInTheDocument();
    expect(screen.getByText('需要核對的曲目')).toBeInTheDocument();
    expect(screen.getByText('item-3：移動曲目失敗，請核對 YouTube Music 播放清單。')).toBeInTheDocument();
  });

  it('filters playlists by name and description', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });

    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => {
      expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
      expect(screen.getByText('健身歌單 (5 首)')).toBeInTheDocument();
    });

    const filterInput = screen.getByPlaceholderText('依播放清單名稱或說明快速篩選…');
    fireEvent.change(filterInput, { target: { value: '健身' } });

    expect(screen.getByText('健身歌單 (5 首)')).toBeInTheDocument();
    expect(screen.queryByText('我的最愛音樂 (3 首)')).not.toBeInTheDocument();
    expect(screen.getByText(/篩選符合 1 \/ 共 2 個/)).toBeInTheDocument();

    const clearButton = screen.getByLabelText('清除篩選');
    fireEvent.click(clearButton);

    expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
    expect(screen.getByText('健身歌單 (5 首)')).toBeInTheDocument();
  });

  it('renders album and track number metadata and displays zero quota message', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    api.previewPlaylistSort.mockResolvedValueOnce({
      preview: {
        total: 2,
        unchanged_count: 0,
        moved_count: 2,
        items: [
          {
            playlist_item_id: 'item-1',
            video_id: 'v1',
            title: 'Track A',
            channel_title: 'Artist One',
            album: 'Super Album',
            track_number: 1,
            year: 2024,
            duration_seconds: 200,
            status: 'moved',
            original_position: 1,
            new_position: 0,
          },
          {
            playlist_item_id: 'item-2',
            video_id: 'v2',
            title: 'Track B',
            channel_title: 'Artist One',
            album: 'Super Album',
            track_number: 2,
            year: 2024,
            duration_seconds: 210,
            status: 'moved',
            original_position: 0,
            new_position: 1,
          },
        ],
      },
      preview_token: 'token-ytm-0',
      quota_estimate: {
        moved_count: 2,
        units_per_move: 0,
        total_units: 0,
        engine: 'ytmusic_innertube',
      },
    });

    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => {
      expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /模擬預覽/ }));

    await waitFor(() => {
      expect(screen.getByText(/YouTube Music Token 協定運作中/)).toBeInTheDocument();
      expect(screen.getByText(/消耗 0 Google API 配額點數/)).toBeInTheDocument();
      expect(screen.getAllByText(/Super Album/)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/#1/)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/#2/)[0]).toBeInTheDocument();
    });
  });

  it('allows applying sort by creating a new sorted playlist', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    api.previewPlaylistSort.mockResolvedValueOnce({
      preview: mockPreview,
      preview_token: 'token-abc',
      quota_estimate: {
        moved_count: 2,
        units_per_move: 0,
        total_units: 0,
      },
    });
    api.applyPlaylistSort.mockResolvedValueOnce({
      operation: 'playlist_sort',
      mode: 'new_playlist',
      new_playlist_id: 'pl-new-sorted',
      new_playlist_url: 'https://music.youtube.com/playlist?list=pl-new-sorted',
      total: 3,
      moved: 3,
      succeeded: 3,
      failed: 0,
      failed_items: [],
      quota_used: 0,
    });

    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => {
      expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /模擬預覽/ }));

    await waitFor(() => {
      expect(screen.getByText('另存為新排序歌單（保留原歌單備份）')).toBeInTheDocument();
    });

    // Select "另存為新排序歌單" radio
    fireEvent.click(screen.getByLabelText('另存為新排序歌單（保留原歌單備份）'));

    const applyButton = screen.getByRole('button', { name: '建立新排序歌單' });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(screen.getByText('確認套用排序')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '確認套用' }));

    await waitFor(() => {
      expect(api.applyPlaylistSort).toHaveBeenCalledWith({
        playlistId: 'pl-1',
        sortKeys: [{ field: 'title', direction: 'asc' }],
        previewToken: 'token-abc',
        mode: 'new_playlist',
        newPlaylistTitle: '[已排序] 我的最愛音樂',
        sortedItemIds: ['item-1', 'item-3', 'item-2'],
        language: 'zh_TW',
        location: 'TW',
      });
      expect(screen.getByText(/前往 YouTube Music 查看新歌單/)).toBeInTheDocument();
    });
  });

  it.each([
    ['timeout', Object.assign(new Error('逾時'), { code: 'timeout' })],
    ['unknown write', Object.assign(new Error('待核對'), { code: 'playlist_write_unknown', status: 409 })],
  ])('requires reconciliation before another preview after %s', async (_name, error) => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    api.previewPlaylistSort.mockResolvedValue({
      preview: mockPreview,
      preview_token: 'token-abc',
      quota_estimate: { moved_count: 2, units_per_move: 0, total_units: 0 },
    });
    api.applyPlaylistSort.mockRejectedValueOnce(error);
    renderWithRouter(<PlaylistSortPage />);
    await screen.findByText('我的最愛音樂 (3 首)');
    fireEvent.click(screen.getByRole('button', { name: /模擬預覽/ }));
    await screen.findByText('另存為新排序歌單（保留原歌單備份）');
    fireEvent.click(screen.getByLabelText('另存為新排序歌單（保留原歌單備份）'));
    fireEvent.click(screen.getByRole('button', { name: '建立新排序歌單' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認套用' }));
    await screen.findByText('寫入結果待核對');
    expect(screen.queryByRole('button', { name: '建立新排序歌單' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /模擬預覽/ }));
    expect(api.previewPlaylistSort).toHaveBeenCalledTimes(1);
    expect(api.applyPlaylistSort).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '已核對播放清單' }));
    fireEvent.click(screen.getByRole('button', { name: /模擬預覽/ }));
    await waitFor(() => expect(api.previewPlaylistSort).toHaveBeenCalledTimes(2));
  });

  it('allows pinning and unpinning playlists to quickly find them', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => {
      expect(screen.getByText(/我的最愛音樂/)).toBeInTheDocument();
    });

    // Pin button should be present
    const pinBtn = screen.getByRole('button', { name: /釘選目前播放清單/ });
    expect(pinBtn).toBeInTheDocument();
    expect(pinBtn).toHaveTextContent('釘選');

    // Click to pin
    fireEvent.click(pinBtn);

    // It should now say 已釘選
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /取消釘選此播放清單/ })).toHaveTextContent('已釘選');
      expect(screen.getByText(/常用釘選：/)).toBeInTheDocument();
      expect(api.updateWorkState).toHaveBeenCalledWith('ytmusic_pinned_playlists', { ids: ['pl-1'] });
    });

    fireEvent.click(screen.getByRole('button', { name: '取消釘選「我的最愛音樂」' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '快速切換至「我的最愛音樂」' })).not.toBeInTheDocument();
      expect(api.updateWorkState).toHaveBeenCalledWith('ytmusic_pinned_playlists', { ids: [] });
    });
  });

  it('renders TrackSubtitle with all used items, full-width dot separator, and unparenthesized date', () => {
    const item = {
      artist: '周杰倫',
      album: '最偉大的作品',
      track_number: 1,
      release_date: '2022-07-15',
    };

    const { container } = render(<TrackSubtitle item={item} sortKeys={[{ field: 'title' }]} />);

    // Text content should contain artist, album, track number and date
    expect(container.textContent).toContain('周杰倫');
    expect(container.textContent).toContain('💿 最偉大的作品');
    expect(container.textContent).toContain('#1');
    expect(container.textContent).toContain('2022-07-15');
    // Date must not be wrapped in parentheses
    expect(container.textContent).not.toContain('(2022-07-15)');
    // Separator should be the full-width dot
    expect(container.textContent).toContain('・');
  });

  it('renders TrackSubtitle for non-album singles with date and no fake album icon', () => {
    const item = {
      artist: '周杰倫',
      album: '',
      release_date: '2020-06-12',
    };

    const { container } = render(<TrackSubtitle item={item} />);
    expect(container.textContent).toContain('周杰倫');
    expect(container.textContent).toContain('2020-06-12');
    expect(container.textContent).not.toContain('💿');
    expect(container.textContent).not.toContain('(2020-06-12)');
  });

  it('renders TrackSubtitle for video items with 🎬 影片 and no fake #1 track number', () => {
    const item = {
      title: "[DNFM] 'Embracing me' QWER Ver.",
      artist: 'QWER',
      album: '影片',
      release_date: '2023-11-09',
      is_video: true,
    };

    const { container } = render(<TrackSubtitle item={item} />);
    expect(container.textContent).toContain('QWER');
    expect(container.textContent).toContain('🎬 影片');
    expect(container.textContent).toContain('2023-11-09');
    expect(container.textContent).not.toContain('#1');
    expect(container.textContent).not.toContain('💿');
  });

  it('renders TrackSubtitle with normalized artist name stripping - Topic', () => {
    const item = {
      artist: 'QWER - Topic',
      album: 'MANITO',
      track_number: 1,
      release_date: '2024-04-01',
    };

    const { container } = render(<TrackSubtitle item={item} />);
    expect(container.textContent).toContain('QWER');
    expect(container.textContent).not.toContain('QWER - Topic');
    expect(container.textContent).not.toContain('- Topic');
  });

  it('displays Taiwan region badge by default linking to settings', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => {
      expect(screen.getByText(/地區：🇹🇼 台灣 \(繁中\)/)).toBeInTheDocument();
    });
    const settingsLink = screen.getByRole('link', { name: /地區：🇹🇼 台灣 \(繁中\)/ });
    expect(settingsLink).toHaveAttribute('href', '/ytmusic/settings');
  });

  it('toggles QuickTokenDrawer when clicking paste token button', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });

    renderWithRouter(
      <PlaylistSortPage
        authUser={{
          authorizations: {
            ytmusic: { connected: true, has_custom_token: false },
          },
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole('button', { name: /管理瀏覽器 Token/ });
    fireEvent.click(toggleBtn);

    expect(screen.getByTestId('quick-token-drawer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /收合面板/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /收合面板/ }));
    expect(screen.queryByTestId('quick-token-drawer')).not.toBeInTheDocument();
  });

  it('intercepts token failure with strict defense dialog and permits user to continue with quota', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    api.previewPlaylistSort.mockResolvedValueOnce({
      preview: mockPreview,
      preview_token: 'token-ytm-0',
      quota_estimate: { moved_count: 2, units_per_move: 0, total_units: 0 },
    });

    const tokenError = new Error('Token 已過期');
    tokenError.code = 'TOKEN_FALLBACK_BLOCKED';
    api.applyPlaylistSort.mockRejectedValueOnce(tokenError);

    renderWithRouter(
      <PlaylistSortPage
        authUser={{
          authorizations: {
            ytmusic: { connected: true, has_custom_token: true },
          },
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /模擬預覽/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /套用排序/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /套用排序/ }));

    await waitFor(() => {
      expect(screen.getByText('確認套用排序')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '確認套用' }));

    // Strict defense dialog pops up!
    await waitFor(() => {
      expect(screen.getByText(/YouTube Music Token 認證失效（嚴格防禦保護）/)).toBeInTheDocument();
      expect(screen.getByText(/嚴格防禦政策/)).toBeInTheDocument();
    });

    // Mock subsequent success when user confirms allowing quota fallback
    api.applyPlaylistSort.mockResolvedValueOnce({
      operation: 'playlist_sort',
      mode: 'in_place',
      total: 3,
      moved: 2,
      succeeded: 2,
      failed: 0,
      failed_items: [],
      quota_used: 100,
    });

    const fallbackBtn = screen.getByRole('button', { name: /以 Google API 配額繼續/ });
    fireEvent.click(fallbackBtn);

    await waitFor(() => {
      expect(api.applyPlaylistSort).toHaveBeenCalledWith(
        expect.objectContaining({
          allowQuotaFallback: true,
        })
      );
      expect(screen.getByText('排序成功套用')).toBeInTheDocument();
    });
  });

  it('triggers 429 quota exceeded recovery dialog and can open token drawer', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    const quotaError = new Error('Google YouTube Data API 配額已達每日上限');
    quotaError.status = 429;
    quotaError.code = 'quota_unavailable';
    api.previewPlaylistSort.mockRejectedValueOnce(quotaError);

    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => {
      expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /模擬預覽/ }));

    await waitFor(() => {
      expect(screen.getByText('Google API 每日配額已用盡')).toBeInTheDocument();
      expect(screen.getByText(/即刻救援方案/)).toBeInTheDocument();
    });

    const rescueBtn = screen.getByRole('button', { name: /展開 Token 面板啟用 0 配額救援/ });
    fireEvent.click(rescueBtn);

    await waitFor(() => {
      expect(screen.getByTestId('quick-token-drawer')).toBeInTheDocument();
    });
  });

  it('allows saving an already sorted playlist as a new playlist', async () => {
    const items = mockPreview.items.map((item, index) => ({
      ...item,
      title: `Song ${String.fromCharCode(65 + index)}`,
      original_position: index,
      new_position: index,
      status: 'unchanged',
    }));
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    api.previewPlaylistSort.mockResolvedValueOnce({
      preview: { total: 3, unchanged_count: 3, moved_count: 0, items },
      preview_token: 'sorted-token',
      quota_estimate: { moved_count: 0, units_per_move: 50, total_units: 0, engine: 'youtube_data_api_v3' },
    });
    api.applyPlaylistSort.mockResolvedValueOnce({
      mode: 'new_playlist',
      total: 3,
      moved: 3,
      succeeded: 3,
      failed: 0,
      failed_items: [],
      quota_used: 200,
      new_playlist_id: 'new-playlist',
      new_playlist_url: 'https://music.youtube.com/playlist?list=new-playlist',
    });
    renderWithRouter(<PlaylistSortPage />);
    fireEvent.click(await screen.findByRole('button', { name: /模擬預覽/ }));
    await screen.findByText(/不變 3 首/);
    expect(screen.getByRole('button', { name: '套用排序' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('另存為新排序歌單（保留原歌單備份）'));
    fireEvent.click(screen.getByRole('button', { name: '建立新排序歌單' }));
    fireEvent.click(screen.getByRole('button', { name: '確認套用' }));
    await waitFor(() =>
      expect(api.applyPlaylistSort).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'new_playlist',
          previewToken: 'sorted-token',
          sortedItemIds: ['item-1', 'item-2', 'item-3'],
        })
      )
    );
    expect(await screen.findByText(/前往 YouTube Music 查看新歌單/)).toBeInTheDocument();
  });

  it('keeps the API engine and updates quota when a zero-move preview changes locally', async () => {
    const items = mockPreview.items.map((item, index) => ({
      ...item,
      title: `Song ${String.fromCharCode(65 + index)}`,
      original_position: index,
      new_position: index,
      status: 'unchanged',
    }));
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    api.previewPlaylistSort.mockResolvedValueOnce({
      preview: { total: 3, unchanged_count: 3, moved_count: 0, items },
      preview_token: 'zero-token',
      quota_estimate: { moved_count: 0, units_per_move: 50, total_units: 0, engine: 'youtube_data_api_v3' },
    });
    renderWithRouter(<PlaylistSortPage />);
    fireEvent.click(await screen.findByRole('button', { name: /模擬預覽/ }));
    await screen.findByText(/不變 3 首/);
    fireEvent.change(screen.getByRole('combobox', { name: '排序預設模式' }), { target: { value: 'title-desc' } });
    await screen.findByText(/移動 2 首/);
    const sorted = screen.getByRole('heading', { name: '即時排序結果' }).closest('.playlist-preview-column');
    expect(
      within(sorted)
        .getAllByText(/^Song [ABC]$/)
        .map((item) => item.textContent)
    ).toEqual(['Song C', 'Song B', 'Song A']);
    expect(document.querySelector('.playlist-sort-quota-warning-row')).toHaveTextContent('100');
    expect(screen.queryByText(/YouTube Music Token 協定運作中/)).not.toBeInTheDocument();
    expect(api.previewPlaylistSort).toHaveBeenCalledOnce();
  });

  it('updates API quota for changed rules and for copying all songs to a new playlist', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    api.previewPlaylistSort.mockResolvedValueOnce({
      preview: mockPreview,
      preview_token: 'quota-token',
      quota_estimate: { moved_count: 2, units_per_move: 50, total_units: 100, engine: 'youtube_data_api_v3' },
    });
    renderWithRouter(<PlaylistSortPage />);
    fireEvent.click(await screen.findByRole('button', { name: /模擬預覽/ }));
    await screen.findByText(/移動 2 首/);
    fireEvent.change(screen.getByRole('combobox', { name: '排序預設模式' }), { target: { value: 'title-desc' } });
    await screen.findByText(/移動 3 首/);
    expect(document.querySelector('.playlist-sort-quota-warning-row')).toHaveTextContent('150');
    fireEvent.click(screen.getByLabelText('另存為新排序歌單（保留原歌單備份）'));
    expect(document.querySelector('.playlist-sort-quota-warning-row')).toHaveTextContent('200');
    expect(document.querySelector('.playlist-sort-quota-warning-row')).toHaveTextContent('加入 3 首歌曲');
    fireEvent.click(screen.getByRole('button', { name: '建立新排序歌單' }));
    expect(document.querySelector('.playlist-sort-confirm-warning')).toHaveTextContent('200');
  });

  it('locks playlist changes and rule/cache controls while applying and retains the write result', async () => {
    let finish;
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
    api.previewPlaylistSort.mockResolvedValueOnce({
      preview: mockPreview,
      preview_token: 'write-token',
      quota_estimate: { moved_count: 2, units_per_move: 50, total_units: 100 },
    });
    api.applyPlaylistSort.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    renderWithRouter(<PlaylistSortPage />);
    fireEvent.click(await screen.findByRole('button', { name: /模擬預覽/ }));
    fireEvent.click(await screen.findByRole('button', { name: '套用排序' }));
    fireEvent.click(screen.getByRole('button', { name: '確認套用' }));
    await waitFor(() => expect(api.applyPlaylistSort).toHaveBeenCalledOnce());
    expect(screen.getByRole('combobox', { name: '選擇播放清單' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '排序預設模式' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '依播放清單名稱或說明篩選' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重新讀取歌曲快取' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重新整理清單' })).toBeDisabled();
    expect(document.querySelector('.playlist-sort-preview-columns')).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: '重新讀取歌曲快取' }));
    expect(api.previewPlaylistSort).toHaveBeenCalledOnce();
    await act(async () =>
      finish({
        mode: 'in_place',
        total: 3,
        moved: 2,
        succeeded: 2,
        failed: 0,
        failed_items: [],
        quota_used: 100,
      })
    );
    expect(await screen.findByText('排序成功套用')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '選擇播放清單' })).toBeEnabled();
  });

  it.each(['success', 'unknown', 'late success'])(
    'retains the writing source and %s outcome after a background library refresh',
    async (outcome) => {
      api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });
      api.previewPlaylistSort.mockResolvedValueOnce({
        preview: mockPreview,
        preview_token: 'background-token',
        quota_estimate: { moved_count: 2, units_per_move: 50, total_units: 100 },
      });
      let finishWrite;
      let failWrite;
      api.applyPlaylistSort.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finishWrite = resolve;
            failWrite = reject;
          })
      );
      let finishRead;
      const hook = renderHook(() => usePlaylistSortController({ authUser: { sub: 'owner-1' } }), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <AccountWorkStateProvider>{children}</AccountWorkStateProvider>
          </MemoryRouter>
        ),
      });
      await waitFor(() => expect(hook.result.current.selectedPlaylistId).toBe('pl-1'));
      act(() => hook.result.current.setPlaylistFilterQuery('音樂'));
      await act(async () => {
        await hook.result.current.handlePreview();
      });
      let write;
      let read;
      act(() => {
        write = hook.result.current.handleApplyConfirm();
      });
      api.getPlaylistSortPlaylists.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRead = resolve;
          })
      );
      act(() => {
        read = hook.result.current.fetchPlaylists();
      });
      const settleWrite = async () => {
        if (outcome !== 'unknown')
          finishWrite({
            mode: 'in_place',
            total: 3,
            moved: 2,
            succeeded: 2,
            failed: 0,
            failed_items: [],
            quota_used: 100,
          });
        else failWrite(Object.assign(new Error('timeout'), { code: 'timeout' }));
        await write;
      };
      if (outcome === 'late success') await act(settleWrite);
      await act(async () => {
        finishRead({
          playlists: [
            { ...mockPlaylists[0], title: '已改名的清單', description: '' },
            { ...mockPlaylists[1], title: '另一個音樂清單' },
          ],
        });
        await read;
      });
      expect(hook.result.current.selectedPlaylistId).toBe('pl-1');
      expect(hook.result.current.selectedPlaylist.title).toBe('我的最愛音樂');
      expect(hook.result.current.filteredPlaylists.some((playlist) => playlist.id === 'pl-1')).toBe(true);
      if (outcome !== 'late success') await act(settleWrite);
      expect(hook.result.current.selectedPlaylistId).toBe('pl-1');
      expect(hook.result.current.applying).toBe(false);
      if (outcome !== 'unknown') {
        expect(hook.result.current.applyResult.succeeded).toBe(2);
        act(() => hook.result.current.setPlaylistFilterQuery('另一個'));
        await waitFor(() => expect(hook.result.current.selectedPlaylistId).toBe('pl-2'));
        api.previewPlaylistSort.mockResolvedValueOnce({
          preview: mockPreview,
          preview_token: 'next-source-token',
          quota_estimate: { moved_count: 2, units_per_move: 50, total_units: 100 },
        });
        await act(async () => {
          await hook.result.current.handlePreview();
        });
        expect(api.previewPlaylistSort).toHaveBeenCalledTimes(2);
        expect(api.previewPlaylistSort).toHaveBeenLastCalledWith(expect.objectContaining({ playlistId: 'pl-2' }));
        expect(hook.result.current.previewData.total).toBe(3);
      } else expect(hook.result.current.reconciliationMessage).toMatch(/無法確認排序寫入是否已完成/);
    }
  );
});

describe('playlist write result ownership', () => {
  beforeEach(() => vi.clearAllMocks());

  function setup() {
    const activeSortKeys = [{ field: 'title', direction: 'asc' }];
    const hook = renderHook(
      ({ accountKey }) => {
        const model = usePlaylistSortState();
        const workflow = usePlaylistSortWorkflow({
          ...model.state,
          ...model.setters,
          dispatchWorkflow: model.dispatch,
          accountKey,
          activeLanguage: 'zh_TW',
          activeLocation: 'TW',
          activeSortKeys,
          activeCollationLocale: 'zh-TW',
          applyMode: 'in_place',
          toast: mockToast,
        });
        return { ...model, ...workflow };
      },
      { initialProps: { accountKey: 'owner-1' } }
    );
    act(() =>
      hook.result.current.dispatch({
        type: 'patch',
        patch: {
          selectedPlaylistId: 'pl-1',
          previewData: mockPreview,
          previewToken: 'first-source-token',
        },
      })
    );
    return hook;
  }

  it.each(['success', 'unknown'])(
    'retains a same-account %s outcome without clearing a newer source preview',
    async (outcome) => {
      let finish;
      let fail;
      api.applyPlaylistSort.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = resolve;
            fail = reject;
          })
      );
      const hook = setup();
      let write;
      act(() => {
        write = hook.result.current.handleApplyConfirm();
      });
      act(() =>
        hook.result.current.dispatch({
          type: 'patch',
          patch: {
            selectedPlaylistId: 'pl-2',
            previewToken: 'new-source-token',
            previewData: { ...mockPreview, total: 0, moved_count: 0, unchanged_count: 0, items: [] },
          },
        })
      );
      await act(async () => {
        if (outcome === 'success')
          finish({ mode: 'in_place', total: 3, moved: 2, succeeded: 2, failed: 0, failed_items: [], quota_used: 100 });
        else fail(Object.assign(new Error('timeout'), { code: 'timeout' }));
        await write;
      });
      expect(hook.result.current.state.previewToken).toBe('new-source-token');
      expect(hook.result.current.state.previewData.total).toBe(0);
      expect(hook.result.current.state.applying).toBe(false);
      if (outcome === 'success') expect(hook.result.current.state.applyResult.succeeded).toBe(2);
      else {
        expect(hook.result.current.state.reconciliationMessage).toMatch(/無法確認排序寫入是否已完成/);
        expect(hook.result.current.state.reconciliationMessage).toContain('pl-1');
      }
    }
  );

  it.each(['switch', 'unmount'])('suppresses a previous-account result after %s', async (boundary) => {
    let finish;
    api.applyPlaylistSort.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const hook = setup();
    let write;
    act(() => {
      write = hook.result.current.handleApplyConfirm();
    });
    if (boundary === 'switch') hook.rerender({ accountKey: 'owner-2' });
    else hook.unmount();
    await act(async () => {
      finish({ mode: 'in_place', total: 3, moved: 2, succeeded: 2, failed: 0, failed_items: [], quota_used: 100 });
      await write;
    });
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(hook.result.current.state.applyResult).toBeNull();
    if (boundary === 'switch') expect(hook.result.current.state.applying).toBe(false);
  });
});
