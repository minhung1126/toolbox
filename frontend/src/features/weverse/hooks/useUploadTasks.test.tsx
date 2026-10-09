import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useUploadTasks } from './useUploadTasks';
import { weverseUploadApi } from '../api/weverseUploadApi';
vi.mock('../api/weverseUploadApi', () => ({ weverseUploadApi: { getTask: vi.fn(), getHistory: vi.fn() } }));
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
const task = (id: string) => ({
  task_id: id,
  title: id,
  status: 'completed' as const,
  progress_percent: 100,
  current_step: 'done',
  video_id: 'video',
  video_url: 'https://youtu.be/video',
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/weverse-uploader?task=first']}>{children}</MemoryRouter>
);
describe('task navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(weverseUploadApi.getHistory).mockResolvedValue({ status: 'success', tasks: [] });
  });
  it('ignores a late response after selecting a different task', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    vi.mocked(weverseUploadApi.getTask).mockImplementation((id) =>
      id === 'first'
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve({ status: 'success', task: task(id) })
    );
    const setView = vi.fn();
    const { result } = renderHook(() => useUploadTasks(toast, setView), { wrapper });
    await act(async () => result.current.openTask('second'));
    await waitFor(() => expect(result.current.taskStatus?.task_id).toBe('second'));
    await act(async () => resolveFirst({ status: 'success', task: task('first') }));
    expect(result.current.taskStatus?.task_id).toBe('second');
  });
  it('can reopen the same task to refresh a stopped read', async () => {
    vi.mocked(weverseUploadApi.getTask).mockRejectedValueOnce({ status: 404 });
    const setView = vi.fn();
    const { result } = renderHook(() => useUploadTasks(toast, setView), { wrapper });
    await waitFor(() => expect(result.current.taskPollingError).toContain('無法確認'));
    vi.mocked(weverseUploadApi.getTask).mockResolvedValue({ status: 'success', task: task('first') });
    await act(async () => result.current.openTask('first'));
    await waitFor(() => expect(result.current.taskStatus?.task_id).toBe('first'));
    expect(result.current.taskPollingError).toBe('');
  });
});
