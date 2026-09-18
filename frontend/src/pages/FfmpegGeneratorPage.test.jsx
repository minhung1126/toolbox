import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

    const codeEl = screen.getByText((content) =>
      content.includes('-ss 00:01:15.000') && content.includes('-to 00:02:30.000')
    );
    expect(codeEl).toBeInTheDocument();
  });

  it('applies preset and updates encoding flags in command', () => {
    render(<FfmpegGeneratorPage />);

    // Click H.264 preset
    const h264Btn = screen.getByRole('button', { name: /H\.264 高相容/ });
    fireEvent.click(h264Btn);

    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('H.264 高相容'));

    const codeEl = screen.getByText((content) =>
      content.includes('-c:v libx264') && content.includes('-crf 23')
    );
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
    await fireEvent.click(copyBtn);

    expect(copyToClipboard).toHaveBeenCalledWith(expect.stringContaining('ffmpeg'));
    expect(await screen.findByText('已複製指令！')).toBeInTheDocument();
  });
});
