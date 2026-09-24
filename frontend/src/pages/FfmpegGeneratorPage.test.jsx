import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import FfmpegGeneratorPage from './FfmpegGeneratorPage';
import { copyToClipboard } from '../utils/clipboard';

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock('../components/Toast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../utils/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

describe('FfmpegGeneratorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn(() => 'blob:mock-video-url');
    window.URL.revokeObjectURL = vi.fn();
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  it('renders workbench title, dropzone, and default command output', () => {
    render(<FfmpegGeneratorPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'FFmpeg 命令行生成器' })).toBeInTheDocument();
    expect(screen.getByText('點擊或拖曳本機影片至此處')).toBeInTheDocument();
    expect(screen.getByText('極速無損剪切')).toBeInTheDocument();

    // Default command block should include ffmpeg and -c copy
    const codeEl = screen.getByText((content) => content.includes('ffmpeg') && content.includes('-c copy'));
    expect(codeEl).toBeInTheDocument();
  });

  it('updates command when changing start and end cut times', () => {
    render(<FfmpegGeneratorPage />);

    const startInput = screen.getByLabelText('剪輯起始時間');
    fireEvent.change(startInput, { target: { value: '00:01:15.000' } });

    const endInput = screen.getByLabelText('剪輯結束時間或長度');
    fireEvent.change(endInput, { target: { value: '00:02:30.000' } });

    const codeEl = screen.getByText(
      (content) => content.includes('-ss 00:01:15.000') && content.includes('-to 00:02:30.000')
    );
    expect(codeEl).toBeInTheDocument();
  });

  it('applies preset and updates encoding flags in command', () => {
    render(<FfmpegGeneratorPage />);

    // Click H.264 preset
    const h264Btn = screen.getByRole('button', { name: /H\.264 高相容/ });
    fireEvent.click(h264Btn);

    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('H.264 高相容'));

    const codeEl = screen.getByText((content) => content.includes('-c:v libx264') && content.includes('-crf 23'));
    expect(codeEl).toBeInTheDocument();
  });

  it('switches shell formatting to PowerShell', () => {
    const { container } = render(<FfmpegGeneratorPage />);

    const psBtn = screen.getByRole('button', { name: /PowerShell/ });
    fireEvent.click(psBtn);

    // Multiline powershell command uses backtick `
    const codeEl = container.querySelector('pre.command-code code');
    expect(codeEl).not.toBeNull();
    expect(codeEl.textContent).toContain('`');
  });

  it('calls copyToClipboard when clicking copy command button', async () => {
    copyToClipboard.mockResolvedValueOnce();

    render(<FfmpegGeneratorPage />);

    const copyBtn = screen.getByRole('button', { name: /一鍵複製命令行/ });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(copyToClipboard).toHaveBeenCalledWith(expect.stringContaining('ffmpeg'));
    expect(await screen.findByText('已複製指令！')).toBeInTheDocument();
  });

  it('loads video file and displays preview player with timeline cut indicators', async () => {
    const { container } = render(<FfmpegGeneratorPage />);

    const fileInput = container.querySelector('input[type="file"]');
    const mp4File = new File(['dummy-video'], 'holiday.mp4', { type: 'video/mp4' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mp4File] } });
    });

    expect(await screen.findByText('更換影片')).toBeInTheDocument();
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('holiday.mp4'));

    // The timeline track with cut range highlight should be rendered
    const slider = screen.getByLabelText('影片時間軸滑桿');
    expect(slider).toBeInTheDocument();

    // The preview button should be available
    const previewBtn = screen.getByRole('button', { name: /預覽選取片段/ });
    expect(previewBtn).toBeInTheDocument();
  });

  it('accepts video files by extension even when mime type is empty', async () => {
    const { container } = render(<FfmpegGeneratorPage />);

    const mkvFile = new File(['dummy-content'], 'holiday_clip.mkv', { type: '' });
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mkvFile] } });
    });

    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('holiday_clip.mkv'));
    expect(screen.getByText('更換影片')).toBeInTheDocument();
  });

  it('toggles trimmed preview playback state when clicking preview segment button', async () => {
    const { container } = render(<FfmpegGeneratorPage />);

    const fileInput = container.querySelector('input[type="file"]');
    const mp4File = new File(['dummy-video'], 'clip.mp4', { type: 'video/mp4' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mp4File] } });
    });

    const previewBtn = await screen.findByRole('button', { name: /預覽選取片段/ });
    await act(async () => {
      fireEvent.click(previewBtn);
    });

    // Should switch to stop button and show trimmed preview badge
    expect(screen.getByText('停止片段預覽')).toBeInTheDocument();
    expect(screen.getByText('正在預覽 Cut 選取片段')).toBeInTheDocument();

    // Click again to stop
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /停止預覽片段/ }));
    });
    expect(screen.getByText('預覽選取片段')).toBeInTheDocument();
  });
});
