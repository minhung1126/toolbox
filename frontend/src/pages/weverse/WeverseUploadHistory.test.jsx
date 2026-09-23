import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WeverseUploadHistory from './WeverseUploadHistory';

describe('WeverseUploadHistory', () => {
  it('shows an empty state and disables refresh while loading', () => {
    render(<WeverseUploadHistory items={[]} loading onRefresh={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('正在載入上傳紀錄');
    expect(screen.getByRole('button', { name: /重新整理/ })).toBeDisabled();
  });

  it('renders task status and a safe external video link', () => {
    render(
      <WeverseUploadHistory
        items={[
          {
            task_id: 'task-1',
            title: '測試影片',
            video_filename: 'video.mp4',
            privacy_status: 'unlisted',
            subtitles_count: 2,
            status: 'completed',
            created_at: '2026-09-24T00:00:00Z',
            video_url: 'https://youtube.com/watch?v=example',
          },
          {
            task_id: 'task-2',
            title: '中斷的影片',
            status: 'interrupted',
          },
        ]}
      />
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('已完成')).toBeInTheDocument();
    expect(screen.getByText('已中斷，請確認 YouTube 狀態')).toBeInTheDocument();
    expect(screen.getByText('video.mp4')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /YouTube/ })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('refreshes the upload history on request', () => {
    const onRefresh = vi.fn();
    render(<WeverseUploadHistory onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: /重新整理/ }));

    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
