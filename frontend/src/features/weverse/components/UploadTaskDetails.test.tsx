import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UploadTaskDetails from './UploadTaskDetails';
import { weverseUploadApi } from '../api/weverseUploadApi';
import type { WeverseUploadTask } from '../api/types';
vi.mock('../api/weverseUploadApi', () => ({ weverseUploadApi: { retryCaptions: vi.fn() } }));
const task: WeverseUploadTask = {
  task_id: 'task',
  title: '影片',
  status: 'completed',
  progress_percent: 100,
  current_step: '字幕待處理',
  video_id: 'existing',
  updated_at: 'v1',
  caption_results: [{ filename: 'en.vtt', language: 'en', name: 'English', status: 'unknown' }],
};
const props = { connected: true, onQueued: vi.fn(), onOpen: vi.fn(), onReset: vi.fn() };
describe('upload task details', () => {
  beforeEach(() => vi.clearAllMocks());
  it('reports partial success and requires reconciliation confirmation before resending an unknown caption', async () => {
    vi.mocked(weverseUploadApi.retryCaptions).mockResolvedValue({ status: 'queued', task_id: 'child' });
    render(<UploadTaskDetails {...props} task={task} />);
    expect(screen.getByRole('heading', { name: '上傳部分完成' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '上傳成功！' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('選取待補傳字幕'), { target: { files: [new File(['WEBVTT'], 'en.vtt')] } });
    expect(screen.getByRole('button', { name: '核對與補傳字幕' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '核對與補傳字幕' }));
    fireEvent.click(screen.getByRole('button', { name: '確認執行字幕核對與補傳' }));
    await waitFor(() => expect(props.onQueued).toHaveBeenCalledWith('child', '影片'));
    const [id, body] = vi.mocked(weverseUploadApi.retryCaptions).mock.calls[0];
    expect(id).toBe('task');
    expect(body.get('expected_updated_at')).toBe('v1');
    expect(body.get('confirmed_missing')).toBe('["en.vtt"]');
  });
  it('locks direct retry after a timeout and preserves the original video link', async () => {
    vi.mocked(weverseUploadApi.retryCaptions).mockRejectedValue({ code: 'timeout' });
    render(<UploadTaskDetails {...props} task={task} />);
    fireEvent.click(screen.getByRole('button', { name: '核對與補傳字幕' }));
    fireEvent.click(screen.getByRole('button', { name: '確認執行字幕核對與補傳' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: '核對與補傳字幕' })).toBeDisabled();
    expect(screen.getByRole('link', { name: '在 YouTube Studio 編輯' })).toHaveAttribute(
      'href',
      'https://studio.youtube.com/video/existing/edit'
    );
  });
});
