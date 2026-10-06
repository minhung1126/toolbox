import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useBatchWorkflowState } from './useBatchWorkflowState';
import { useBatchExecution } from './useBatchExecution';
import { youtubeBatchApi } from '../api/youtubeBatchApi';
import type { YoutubeBatchUpdateResponse } from '../api/youtubeBatchTypes';

vi.mock('../api/youtubeBatchApi', () => ({ youtubeBatchApi: { updateMetadata: vi.fn() } }));

function setup() {
  return renderHook(() => {
    const model = useBatchWorkflowState(
      {
        spreadsheetId: 'sheet',
        playlistId: 'playlist',
        worksheetName: 'Sheet1',
        titleColumn: 'title',
        descriptionColumn: 'description',
      },
      {}
    );
    const requestVersion = useRef(0);
    const execution = useBatchExecution({
      state: model.state,
      setters: model.setters,
      dispatchWorkflow: model.dispatch,
      playlistRequestRef: requestVersion,
      currentPreviewFingerprint: 'current',
      videoType: 'Video',
      toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
      selectedTeam: 'team',
      youtubeConnected: true,
      sourceStale: false,
      activeSlot: 'primary',
    });
    return { ...model, ...execution, requestVersion };
  });
}
function seed(hook: ReturnType<typeof setup>) {
  act(() =>
    hook.result.current.dispatch({
      type: 'transition',
      phase: 'ready',
      patch: {
        previewToken: 'signed',
        previewSnapshot: { youtube_slot: 'primary' },
        previewFingerprint: 'current',
        videos: [{ video_id: 'video' }],
        assignments: { video: 'person' },
      },
    })
  );
}
const response: YoutubeBatchUpdateResponse = {
  operation: 'youtube.metadata_update',
  completed: true,
  quota_blocked: false,
  total_count: 1,
  succeeded_count: 1,
  warning_count: 0,
  skipped_count: 0,
  failed_count: 0,
  not_attempted_count: 0,
  results: [{ video_id: 'video', status: 'succeeded' }],
};

describe('batch execution boundaries', () => {
  it('sends only once when confirmation is invoked twice in the same turn', async () => {
    vi.mocked(youtubeBatchApi.updateMetadata).mockClear();
    let resolve!: (value: YoutubeBatchUpdateResponse) => void;
    vi.mocked(youtubeBatchApi.updateMetadata).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const hook = setup();
    seed(hook);
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.doExecute();
      void hook.result.current.doExecute();
    });
    expect(youtubeBatchApi.updateMetadata).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(response);
      await first;
    });
    expect(hook.result.current.state.phase).toBe('completed');
  });

  it('ignores a completed write after the account/source request generation changes', async () => {
    let resolve!: (value: YoutubeBatchUpdateResponse) => void;
    vi.mocked(youtubeBatchApi.updateMetadata).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const hook = setup();
    seed(hook);
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.doExecute();
      hook.result.current.requestVersion.current += 1;
    });
    await act(async () => {
      resolve(response);
      await pending;
    });
    expect(hook.result.current.state.result).toBeNull();
  });

  it('clears the signed preview and gates immediate replay after a timeout', async () => {
    vi.mocked(youtubeBatchApi.updateMetadata).mockClear();
    vi.mocked(youtubeBatchApi.updateMetadata).mockRejectedValue(
      Object.assign(new Error('timeout'), { code: 'timeout' })
    );
    const hook = setup();
    seed(hook);
    await act(async () => {
      await hook.result.current.doExecute();
    });
    expect(hook.result.current.state.phase).toBe('reconciliation');
    expect(hook.result.current.state.previewToken).toBe('');
    await act(async () => {
      await hook.result.current.doExecute();
    });
    expect(youtubeBatchApi.updateMetadata).toHaveBeenCalledTimes(1);
  });
});
