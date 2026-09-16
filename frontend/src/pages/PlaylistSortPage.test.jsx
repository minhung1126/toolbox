import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PlaylistSortPage from './PlaylistSortPage';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getPlaylistSortPlaylists: vi.fn(),
    previewPlaylistSort: vi.fn(),
    applyPlaylistSort: vi.fn(),
    getYtmusicAuthUrl: vi.fn(),
    disconnectYtmusic: vi.fn(),
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

const renderWithRouter = (ui) =>
  render(
    <MemoryRouter>
      {React.cloneElement(ui, {
        authUser: {
          authorizations: {
            ytmusic: { connected: true, user: { email: 'music@example.com' } },
          },
          youtube: { slots: { primary: { authenticated: true, channel_title: 'My Channel' } } },
        },
      })}
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
});
