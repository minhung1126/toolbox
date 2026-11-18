import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublishCleanerPage from './PublishCleanerPage';

const mocks = vi.hoisted(() => ({
  api: { previewCleanup: vi.fn(), estimateQuota: vi.fn(), cleanupPublicItems: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('../features/youtube/api/publishCleanupApi', () => ({ publishCleanupApi: mocks.api }));
vi.mock('../components/Toast', () => ({ useToast: () => mocks.toast }));
const auth = {
  sub: 'owner',
  youtube: { active_slot: 'primary', slots: { primary: { authenticated: true, channel_id: 'channel' } } },
};
const item = {
  playlist_id: 'playlist',
  playlist_item_id: 'item',
  video_id: 'video',
  title: '已公開影片',
  description: '',
  observed_privacy: 'public',
  candidate: true,
  reason: '可清理',
};
const snapshot = {
  version: 2,
  mode: 'cleanup_only',
  youtube_channel_id: 'channel',
  youtube_slot: 'primary',
  playlist_id: 'playlist',
  items: [item],
};
const preview = {
  ...snapshot,
  total_count: 1,
  candidate_count: 1,
  counts: { public: 1, private: 0, unlisted: 0, unknown: 0 },
  preview_token: 'signed',
  preview_snapshot: snapshot,
};
const result = {
  version: 2,
  mode: 'cleanup_only',
  operation: 'youtube.publish_cleanup',
  operation_id: 'operation',
  completed: true,
  total_count: 1,
  succeeded_count: 1,
  skipped_count: 0,
  failed_count: 0,
  not_attempted_count: 0,
  needs_reconciliation_count: 0,
  quota_blocked: false,
  results: [{ ...item, status: 'succeeded' }],
};
const element = (playlist = 'playlist', user = auth) => (
  <MemoryRouter>
    <PublishCleanerPage authUser={user} sysSettings={{ default_playlist_id: playlist }} />
  </MemoryRouter>
);
async function load() {
  fireEvent.click(screen.getByRole('button', { name: '讀取 To-Post 播放清單' }));
  await screen.findByText('已公開影片');
}

describe('cleanup-only page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.previewCleanup.mockResolvedValue(preview);
    mocks.api.estimateQuota.mockResolvedValue({ projected_units: 57 });
    mocks.api.cleanupPublicItems.mockResolvedValue(result);
  });
  it('previews without writes and only cleans after a second confirmation', async () => {
    render(element());
    await load();
    expect(mocks.api.cleanupPublicItems).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /編輯/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清理已公開影片' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('只移除預覽中的 1 筆清單成員');
    fireEvent.click(within(dialog).getByRole('button', { name: '確認清理' }));
    await screen.findByText(/已移除 1 · 保留 0/);
    expect(mocks.api.cleanupPublicItems).toHaveBeenCalledTimes(1);
    expect(mocks.api.cleanupPublicItems).toHaveBeenCalledWith('playlist', {
      youtubeSlot: 'primary',
      previewToken: 'signed',
      previewSnapshot: snapshot,
    });
  });
  it('has a clear empty candidate state and no edit or publication action', async () => {
    mocks.api.previewCleanup.mockResolvedValue({
      ...preview,
      candidate_count: 0,
      counts: { public: 0, private: 1, unlisted: 0, unknown: 0 },
      items: [{ ...item, candidate: false, observed_privacy: 'private' }],
    });
    render(element());
    await load();
    expect(screen.getByText(/目前沒有可清理的已公開影片/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清理已公開影片' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /編輯/ })).not.toBeInTheDocument();
  });
  it('ignores old reads and closes confirmation when source changes', async () => {
    let resolve;
    mocks.api.previewCleanup.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    const view = render(element());
    fireEvent.click(screen.getByRole('button', { name: '讀取 To-Post 播放清單' }));
    view.rerender(element('other'));
    await act(async () => resolve(preview));
    expect(screen.queryByText('已公開影片')).not.toBeInTheDocument();
    expect(mocks.api.cleanupPublicItems).not.toHaveBeenCalled();
  });
  it('shows unknown and quota interruption without a success toast', async () => {
    mocks.api.cleanupPublicItems.mockResolvedValue({
      ...result,
      completed: false,
      succeeded_count: 0,
      needs_reconciliation_count: 1,
      quota_blocked: true,
      results: [{ ...item, status: 'needs_reconciliation' }],
    });
    render(element());
    await load();
    fireEvent.click(screen.getByRole('button', { name: '清理已公開影片' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '確認清理' }));
    await waitFor(() => expect(screen.getByText(/待核對 1/)).toBeInTheDocument());
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(screen.getByText(/配額中止/)).toBeInTheDocument();
  });
});
