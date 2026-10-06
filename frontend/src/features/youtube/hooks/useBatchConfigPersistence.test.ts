import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBatchWorkflowState } from './useBatchWorkflowState';
import { useBatchConfigPersistence } from './useBatchConfigPersistence';
import { youtubeBatchApi } from '../api/youtubeBatchApi';

vi.mock('../api/youtubeBatchApi', () => ({
  youtubeBatchApi: { updateDraftSettings: vi.fn(), updatePlaylist: vi.fn() },
  normalizeYoutubePlaylistInput: (value: string) => value,
}));

describe('account-scoped batch persistence', () => {
  afterEach(() => vi.useRealTimers());
  it('cancels queued draft and playlist saves on an account switch', async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const hook = renderHook(
      ({ account }) => {
        const model = useBatchWorkflowState(
          {
            spreadsheetId: 'sheet',
            worksheetName: 'Sheet1',
            titleColumn: 'title',
            descriptionColumn: 'description',
            playlistId: 'playlist',
          },
          {}
        );
        return useBatchConfigPersistence({
          state: model.state,
          setters: model.setters,
          authUser: { sub: account },
          videoType: 'Video',
          toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
        });
      },
      { initialProps: { account: 'first' } }
    );
    act(() => {
      hook.result.current.scheduleDraftSave();
      hook.result.current.schedulePlaylistSave('new-playlist');
    });
    hook.rerender({ account: 'second' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(youtubeBatchApi.updateDraftSettings).not.toHaveBeenCalled();
    expect(youtubeBatchApi.updatePlaylist).not.toHaveBeenCalled();
  });
});
