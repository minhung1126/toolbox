import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WeverseUploaderPage from './WeverseUploaderPage';
import { api } from '../services/api';

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock('../components/Toast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../services/api', () => ({
  api: {
    getVideoUploaderAuthUrl: vi.fn(),
    disconnectVideoUploader: vi.fn(),
    scanWeverseFolder: vi.fn(),
    parseWeverseFiles: vi.fn(),
    uploadWeverseFromPath: vi.fn(),
    uploadWeverseFiles: vi.fn(),
    getWeverseUploadTask: vi.fn(),
    getWeverseUploadHistory: vi.fn().mockResolvedValue({ tasks: [] }),
    getWeverseRecentPaths: vi.fn().mockResolvedValue({ paths: ['C:\\downloads\\weverse_sample'] }),
  },
}));

function renderPage(props = {}) {
  return render(
    <MemoryRouter>
      <WeverseUploaderPage {...props} />
    </MemoryRouter>
  );
}

describe('WeverseUploaderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title, YouTube auth card, and folder picker dropzone', () => {
    const authUser = {
      authorizations: {
        video_uploader: { connected: false },
      },
    };

    renderPage({ authUser });

    expect(screen.getByRole('heading', { level: 1, name: /Weverse 影片與字幕上傳/ })).toBeInTheDocument();
    expect(screen.getByText('影片上傳專屬 YouTube 頻道')).toBeInTheDocument();
    expect(screen.getByText('按一下選擇資料夾，或將資料夾直接拖曳至此處')).toBeInTheDocument();
  });

  it('switches to manual path input and scans local path successfully', async () => {
    const authUser = {
      authorizations: {
        video_uploader: {
          connected: true,
          channel_title: 'My Video Channel',
          account_name: 'uploader@example.com',
        },
      },
    };

    api.scanWeverseFolder.mockResolvedValueOnce({
      packages: [
        {
          package_id: '20260923_Live_3-241665049',
          suggested_title: '20260923 Live 3-241665049',
          video: {
            filename: '20260923_Live_3-241665049.mp4',
            full_path: 'C:\\downloads\\20260923_Live_3-241665049.mp4',
            size_formatted: '450.5 MB',
          },
          subtitles: [
            {
              filename: '20260923_Live_3-241665049.zh_TW.vtt',
              full_path: 'C:\\downloads\\20260923_Live_3-241665049.zh_TW.vtt',
              raw_lang: 'zh_TW',
              bcp47: 'zh-TW',
              label: '繁體中文 (Chinese - Traditional)',
              size_formatted: '15.2 KB',
            },
            {
              filename: '20260923_Live_3-241665049.ko_KR.vtt',
              full_path: 'C:\\downloads\\20260923_Live_3-241665049.ko_KR.vtt',
              raw_lang: 'ko_KR',
              bcp47: 'ko',
              label: '韓文 (Korean)',
              size_formatted: '14.1 KB',
            },
          ],
        },
      ],
    });

    renderPage({ authUser });

    // Switch to manual path mode
    fireEvent.click(screen.getByRole('button', { name: '直接輸入本機路徑' }));

    const input = screen.getByPlaceholderText(/例如：D:\\Weverse/);
    fireEvent.change(input, { target: { value: 'C:\\downloads\\20260923_Live_3-241665049' } });

    fireEvent.click(screen.getByRole('button', { name: '掃描並辨識' }));

    await waitFor(() => {
      expect(api.scanWeverseFolder).toHaveBeenCalledWith('C:\\downloads\\20260923_Live_3-241665049');
    });

    // Step 2 review screen should appear
    await waitFor(() => {
      expect(screen.getByText('步驟二：辨識結果複查與編輯')).toBeInTheDocument();
      expect(screen.getByDisplayValue('20260923 Live 3-241665049')).toBeInTheDocument();
      expect(screen.getByText('20260923_Live_3-241665049.zh_TW.vtt')).toBeInTheDocument();
      expect(screen.getByText('20260923_Live_3-241665049.ko_KR.vtt')).toBeInTheDocument();
    });

    // Check quota preview
    // 1 video (1600) + 2 subtitles (800) = 2,400
    expect(screen.getByText(/YouTube API 配額預估消耗：2,400 單位/)).toBeInTheDocument();
  });

  it('allows toggling subtitles selection', async () => {
    const authUser = {
      authorizations: {
        video_uploader: { connected: true },
      },
    };

    api.scanWeverseFolder.mockResolvedValueOnce({
      packages: [
        {
          package_id: 'test',
          suggested_title: 'Test Video',
          video: { filename: 'test.mp4', full_path: 'C:\\test.mp4', size_formatted: '10 MB' },
          subtitles: [
            { filename: 'test.zh_TW.vtt', bcp47: 'zh-TW', label: '繁中', size_formatted: '10 KB' },
            { filename: 'test.en_US.vtt', bcp47: 'en-US', label: '英文', size_formatted: '10 KB' },
          ],
        },
      ],
    });

    renderPage({ authUser });

    fireEvent.click(screen.getByRole('button', { name: '直接輸入本機路徑' }));
    fireEvent.change(screen.getByPlaceholderText(/例如：D:\\Weverse/), { target: { value: 'C:\\test' } });
    fireEvent.click(screen.getByRole('button', { name: '掃描並辨識' }));

    await waitFor(() => {
      expect(screen.getByText('步驟二：辨識結果複查與編輯')).toBeInTheDocument();
    });

    // Click "全消"
    fireEvent.click(screen.getByRole('button', { name: '全消' }));
    // Only video quota: 1600
    expect(screen.getByText(/YouTube API 配額預估消耗：1,600 單位/)).toBeInTheDocument();

    // Click "全選"
    fireEvent.click(screen.getByRole('button', { name: '全選' }));
    // 1600 + 2 * 400 = 2400
    expect(screen.getByText(/YouTube API 配額預估消耗：2,400 單位/)).toBeInTheDocument();
  });
});
