import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PlaylistSortPage, { getLocaleCollation, normalizeArtistName, sortTracksLocally, TrackSubtitle } from './PlaylistSortPage';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getPlaylistSortPlaylists: vi.fn(),
    previewPlaylistSort: vi.fn(),
    applyPlaylistSort: vi.fn(),
    getYtmusicAuthUrl: vi.fn(),
    disconnectYtmusic: vi.fn(),
    updateWorkState: vi.fn((key, value) => Promise.resolve({ state: { [key]: value } })),
    getWorkState: vi.fn(() => Promise.resolve({ state: {} })),
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

const renderWithRouter = (ui, { initialState = {} } = {}) =>
  render(
    <MemoryRouter>
      <AccountWorkStateProvider initialState={initialState}>
        {React.cloneElement(ui, {
          authUser: {
            authorizations: {
              ytmusic: { connected: true, user: { email: 'music@example.com' } },
            },
            youtube: { slots: { primary: { authenticated: true, channel_title: 'My Channel' } } },
          },
        })}
      </AccountWorkStateProvider>
    </MemoryRouter>
  );

describe('PlaylistSortPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and displays user playlists', async () => {
    api.getPlaylistSortPlaylists.mockResolvedValueOnce({ playlists: mockPlaylists });

    renderWithRouter(<PlaylistSortPage />);

    await waitFor(() => {
      expect(screen.getByText('我的最愛音樂 (3 首)')).toBeInTheDocument();
      expect(screen.getByText('健身歌單 (5 首)')).toBeInTheDocument();
    });
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
      total: 3,
      moved: 2,
      succeeded: 2,
      failed: 0,
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
    });
  });

  it('respects track order within albums when sorting tracks locally', () => {
    const tracks = [
      { title: 'Track 3', album: 'Midnights', track_number: 3 },
      { title: 'Track 1', album: 'Midnights', track_number: 1 },
      { title: 'Track 2', album: 'Midnights', track_number: 2 },
      { title: 'Bonus', album: 'Midnights', track_number: null },
      { title: '1989 Track 2', album: '1989', track_number: 2 },
      { title: '1989 Track 1', album: '1989', track_number: 1 },
    ];

    const sortedAsc = sortTracksLocally(tracks, [{ field: 'album', direction: 'asc' }]);
    expect(sortedAsc.map((t) => t.title)).toEqual([
      '1989 Track 1',
      '1989 Track 2',
      'Track 1',
      'Track 2',
      'Track 3',
      'Bonus',
    ]);

    const sortedDesc = sortTracksLocally(tracks, [{ field: 'album', direction: 'desc' }]);
    expect(sortedDesc.map((t) => t.title)).toEqual([
      'Track 1',
      'Track 2',
      'Track 3',
      'Bonus',
      '1989 Track 1',
      '1989 Track 2',
    ]);
  });

  it('orders non-album singles chronologically with albums by release year instead of shoving to front', () => {
    const tracks = [
      { title: '2024 Single', album: '', release_date: '2024-05-20', year: 2024 },
      { title: '2003 Album Track', album: '葉惠美', release_date: '2003-07-31', year: 2003, track_number: 1 },
      { title: '2010 Album Track', album: '跨時代', release_date: '2010-05-18', year: 2010, track_number: 1 },
      { title: '2000 Single', album: '單曲', release_date: '2000-11-06', year: 2000 },
    ];

    const sortedAsc = sortTracksLocally(tracks, [{ field: 'album', direction: 'asc' }]);
    expect(sortedAsc.map((t) => t.title)).toEqual([
      '2000 Single',
      '2003 Album Track',
      '2010 Album Track',
      '2024 Single',
    ]);
  });

  it('orders videos (album="影片") chronologically with albums by release date instead of throwing to end', () => {
    const tracks = [
      { title: '2026 Album Track', album: 'To Be Continued', track_number: 1, release_date: '2026-06-01', year: 2026 },
      { title: "[DNFM] 'Embracing me' (Video)", album: '影片', release_date: '2023-11-09', year: 2023 },
      { title: 'Good Bye Bye (Cover Video)', album: '影片', release_date: '2024-02-08', year: 2024 },
    ];

    const sortedAsc = sortTracksLocally(tracks, [{ field: 'album', direction: 'asc' }]);
    expect(sortedAsc.map((t) => t.title)).toEqual([
      "[DNFM] 'Embracing me' (Video)",
      'Good Bye Bye (Cover Video)',
      '2026 Album Track',
    ]);
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

  it('normalizes Topic channel suffixes with normalizeArtistName', () => {
    expect(normalizeArtistName('QWER - Topic')).toBe('QWER');
    expect(normalizeArtistName('QWER - 主題')).toBe('QWER');
    expect(normalizeArtistName('QWER - 主题')).toBe('QWER');
    expect(normalizeArtistName('QWER (Topic)')).toBe('QWER');
    expect(normalizeArtistName('QWER（主題）')).toBe('QWER');
    expect(normalizeArtistName('QWER-Topic')).toBe('QWER');
    expect(normalizeArtistName('QWER')).toBe('QWER');
    expect(normalizeArtistName('Topic')).toBe('Topic');
    expect(normalizeArtistName('- Topic')).toBe('- Topic');
    expect(normalizeArtistName('')).toBe('');
    expect(normalizeArtistName(null)).toBe('');
  });

  it('groups Artist and Artist - Topic together and sorts chronologically', () => {
    const tracks = [
      { title: '2024 Single', artist: 'QWER', album: '單曲', release_date: '2024-02-08', year: 2024 },
      { title: '2023 Album Track', artist: 'QWER - Topic', album: 'Harmony from Discord', release_date: '2023-10-18', year: 2023, track_number: 1 },
      { title: '2023 Single', artist: 'QWER', album: '單曲', release_date: '2023-11-09', year: 2023 },
      { title: '2024 Album Track', artist: 'QWER - 主題', album: 'MANITO', release_date: '2024-04-01', year: 2024, track_number: 1 },
    ];

    const sorted = sortTracksLocally(tracks, [
      { field: 'artist', direction: 'asc' },
      { field: 'album', direction: 'asc' },
    ]);

    expect(sorted.map((t) => t.title)).toEqual([
      '2023 Album Track',
      '2023 Single',
      '2024 Single',
      '2024 Album Track',
    ]);
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

  it('maps language codes to appropriate collation locales in getLocaleCollation', () => {
    expect(getLocaleCollation('zh_TW')).toBe('zh-Hant-TW');
    expect(getLocaleCollation('zh-TW')).toBe('zh-Hant-TW');
    expect(getLocaleCollation('en')).toBe('en-US');
    expect(getLocaleCollation('ja')).toBe('ja-JP');
    expect(getLocaleCollation('ko')).toBe('ko-KR');
    expect(getLocaleCollation('fr')).toBe('fr');
    expect(getLocaleCollation(null)).toBe('zh-Hant-TW');
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
});
