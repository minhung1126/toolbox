import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useBatchWorkflowState } from './useBatchWorkflowState';
import { useBatchExecution } from './useBatchExecution';
import { youtubeBatchApi } from '../api/youtubeBatchApi';
import type { YoutubeBatchUpdateResponse } from '../api/youtubeBatchTypes';

vi.mock('../api/youtubeBatchApi', () => ({ youtubeBatchApi: { updateMetadata: vi.fn() } }));

function setup() {
  const toast = { warning: vi.fn(), error: vi.fn(), success: vi.fn() };
  return renderHook(
    ({ accountKey }) => {
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
        toast,
        selectedTeam: 'team',
        youtubeConnected: true,
        sourceStale: false,
        activeSlot: 'primary',
        accountKey,
      });
      return { ...model, ...execution, requestVersion, toast };
    },
    { initialProps: { accountKey: 'account-1' } }
  );
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
        sourceReady: true,
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

  it('retains a completed write after the source request generation changes', async () => {
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
    expect(hook.result.current.state.result).toEqual(response);
    expect(hook.result.current.state.executing).toBe(false);
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

  it('does not display a previous account write result after switching accounts', async () => {
    let finish!: (value: YoutubeBatchUpdateResponse) => void;
    vi.mocked(youtubeBatchApi.updateMetadata).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const hook = setup();
    seed(hook);
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.doExecute();
    });
    hook.rerender({ accountKey: 'account-2' });
    await act(async () => {
      finish(response);
      await pending;
    });
    expect(hook.result.current.state.result).toBeNull();
    expect(hook.result.current.state.executing).toBe(false);
  });

  it.each(['success', 'failure'])('does not notify from an unmounted workflow after %s', async (outcome) => {
    let resolve!: (value: YoutubeBatchUpdateResponse) => void;
    let reject!: (error: Error) => void;
    vi.mocked(youtubeBatchApi.updateMetadata).mockReturnValue(
      new Promise((done, fail) => {
        resolve = done;
        reject = fail;
      })
    );
    const hook = setup();
    seed(hook);
    const { toast } = hook.result.current;
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.doExecute();
    });
    hook.unmount();
    await act(async () => {
      if (outcome === 'success') resolve(response);
      else reject(new Error('previous account write failed'));
      await pending;
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
