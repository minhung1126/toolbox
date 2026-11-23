import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { useVideoEditStatus } from './useVideoEditStatus';
vi.mock('../../../services/api', () => ({ api: { getYoutubeEditStatuses: vi.fn() } }));
const read = vi.mocked(api.getYoutubeEditStatuses);
describe('durable video edit history reads', () => {
  beforeEach(() => vi.resetAllMocks());
  it('resolves every batch before returning filterable results', async () => {
    const ids = Array.from({ length: 501 }, (_, index) => `video-${index}`);
    read.mockImplementation(async (batch) => ({
      channel_id: 'channel',
      statuses: Object.fromEntries(batch.map((id) => [id, id === 'video-0' ? 'applied' : 'unknown'])),
    }));
    const hook = renderHook(() => useVideoEditStatus('owner', 'channel', ids));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(read.mock.calls.map(([batch]) => batch.length)).toEqual([500, 1]);
    expect(Object.keys(hook.result.current.statuses)).toHaveLength(501);
    expect(hook.result.current.statuses['video-0']).toBe('applied');
    expect(hook.result.current.statuses['video-500']).toBe('unknown');
  });
  it('rejects mismatched channel data and ignores late replies across account changes', async () => {
    let finish: (value: unknown) => void = () => {};
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const hook = renderHook(({ owner, channel }) => useVideoEditStatus(owner, channel, ['same-id']), {
      initialProps: { owner: 'one', channel: 'first' },
    });
    read.mockResolvedValue({ channel_id: 'second', statuses: { 'same-id': 'unknown' } });
    hook.rerender({ owner: 'two', channel: 'second' });
    await waitFor(() => expect(hook.result.current.statuses['same-id']).toBe('unknown'));
    await act(async () => {
      finish({ channel_id: 'first', statuses: { 'same-id': 'applied' } });
    });
    expect(hook.result.current.statuses['same-id']).toBe('unknown');
    read.mockResolvedValue({ channel_id: 'first', statuses: { 'same-id': 'applied' } });
    act(() => hook.result.current.refresh());
    await waitFor(() => expect(hook.result.current.error).toContain('頻道不符'));
    expect(hook.result.current.statuses['same-id']).toBe('unknown');
  });
  it('keeps verified history during transient refresh failures and recovers incomplete responses', async () => {
    read.mockResolvedValue({ channel_id: 'channel', statuses: { id: 'applied' } });
    const hook = renderHook(() => useVideoEditStatus('owner', 'channel', ['id']));
    await waitFor(() => expect(hook.result.current.statuses.id).toBe('applied'));
    read.mockResolvedValue({ channel_id: 'channel', statuses: {} });
    act(() => hook.result.current.refresh());
    await waitFor(() => expect(hook.result.current.error).toContain('不完整'));
    expect(hook.result.current.statuses.id).toBe('applied');
    read.mockResolvedValue({ channel_id: 'channel', statuses: { id: 'applied' } });
    act(() => hook.result.current.refresh());
    await waitFor(() => expect(hook.result.current.error).toBe(''));
  });
});
