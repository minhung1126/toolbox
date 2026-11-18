import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { useDraftPublishOperation } from './useDraftPublishOperation';
import { parsePublishOperation } from '../api/draftPublishOperation';

vi.mock('../../../services/api', () => ({
  api: { getOperation: vi.fn(), findYoutubePublishJob: vi.fn(), findYoutubePublishStage: vi.fn() },
}));
const pending: any = {
  request_id: 'request',
  stage_snapshot: { stage_id: 'stage', youtube_channel_id: 'channel' },
  edits: [{ video_id: 'video', title: 'Final', description: 'Final text', skip: false }],
};
function operation(status = 'running', revision = 1): any {
  const statuses = [
    'queued',
    'running',
    'succeeded',
    'unchanged',
    'skipped',
    'failed',
    'not_attempted',
    'needs_reconciliation',
  ];
  return {
    id: 'operation',
    kind: 'youtube.metadata_publish',
    channel_id: 'channel',
    state: status === 'running' ? 'running' : 'completed',
    plan: { stage_snapshot: pending.stage_snapshot, edits: pending.edits },
    progress: {
      version: 1,
      revision,
      total: 1,
      counts: Object.fromEntries(statuses.map((key) => [key, key === status ? 1 : 0])),
      rows: [
        {
          ...pending.edits[0],
          status,
          attempted_parts: [],
          confirmation: status === 'succeeded' ? 'provider_response' : null,
        },
      ],
    },
  };
}
const tick = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('publish operation polling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('polls one read at a time, shows revisions, and stops at terminal rows', async () => {
    const receive = vi.fn();
    vi.mocked(api.getOperation).mockResolvedValueOnce(operation()).mockResolvedValueOnce(operation('succeeded', 2));
    const view = renderHook(() =>
      useDraftPublishOperation({
        pending,
        reference: { version: 1, operation_id: 'operation' },
        enabled: true,
        onOperation: receive,
      })
    );
    await tick();
    expect(receive).toHaveBeenCalledTimes(1);
    await tick(999);
    expect(api.getOperation).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(view.result.current.operation?.progress.counts.succeeded).toBe(1);
    await tick(10000);
    expect(api.getOperation).toHaveBeenCalledTimes(2);
  });
  it('backs off 2/5/10 seconds and respects longer Retry-After without losing progress', async () => {
    vi.mocked(api.getOperation)
      .mockResolvedValueOnce(operation())
      .mockRejectedValueOnce({ message: 'busy', status: 429, retryAfter: 3 })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(operation('succeeded', 2));
    const view = renderHook(() =>
      useDraftPublishOperation({
        pending,
        reference: { version: 1, operation_id: 'operation' },
        enabled: true,
        onOperation: vi.fn(),
      })
    );
    await tick();
    await tick(1000);
    expect(view.result.current.operation?.progress.counts.running).toBe(1);
    expect(view.result.current.pollError).toContain('暫停');
    await tick(2999);
    expect(api.getOperation).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(api.getOperation).toHaveBeenCalledTimes(3);
    await tick(4999);
    expect(api.getOperation).toHaveBeenCalledTimes(3);
    await tick(1);
    expect(api.getOperation).toHaveBeenCalledTimes(4);
  });
  it('recovers by the saved request instead of scanning recent operations or resubmitting', async () => {
    vi.mocked(api.findYoutubePublishJob).mockResolvedValue(operation('succeeded', 3));
    const receive = vi.fn();
    renderHook(() => useDraftPublishOperation({ pending, enabled: true, onOperation: receive }));
    await tick();
    expect(api.findYoutubePublishJob).toHaveBeenCalledWith(
      'request',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(receive).toHaveBeenCalledTimes(1);
  });
  it('ignores old revisions and late responses after unmount', async () => {
    const receive = vi.fn();
    let resolve: any;
    vi.mocked(api.getOperation)
      .mockResolvedValueOnce(operation('running', 1))
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
    const view = renderHook(() =>
      useDraftPublishOperation({
        pending,
        reference: { version: 1, operation_id: 'operation', revision: 2 },
        enabled: true,
        onOperation: receive,
      })
    );
    await tick();
    expect(receive).not.toHaveBeenCalled();
    await tick(1000);
    await tick(5000);
    expect(api.getOperation).toHaveBeenCalledTimes(2);
    view.unmount();
    await act(async () => resolve(operation('succeeded', 4)));
    expect(receive).not.toHaveBeenCalled();
  });
  it('rejects cross-channel identities and inconsistent counts', () => {
    expect(() => parsePublishOperation({ ...operation(), channel_id: 'other' }, pending)).toThrow();
    const unconfirmed = operation('succeeded');
    unconfirmed.progress.rows[0].confirmation = null;
    expect(() => parsePublishOperation(unconfirmed, pending)).toThrow();
    const broken = operation();
    broken.progress.counts.succeeded = 1;
    expect(() => parsePublishOperation(broken, pending)).toThrow();
    expect(() =>
      parsePublishOperation(
        { ...operation(), plan: { stage_snapshot: { stage_id: 'other' }, edits: pending.edits } },
        pending
      )
    ).toThrow();
  });
});
