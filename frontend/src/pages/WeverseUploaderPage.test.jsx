import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WeverseUploaderPage from './WeverseUploaderPage';
import { weverseUploadApi } from '../features/weverse/api/weverseUploadApi';

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock('../components/Toast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../features/weverse/api/weverseUploadApi', () => ({
  weverseUploadApi: {
    getUploaderAuthUrl: vi.fn(),
    disconnectUploader: vi.fn(),
    scanFolder: vi.fn(),
    parseFiles: vi.fn(),
    uploadFromPath: vi.fn(),
    uploadFiles: vi.fn(),
    getTask: vi.fn(),
    getHistory: vi.fn().mockResolvedValue({ tasks: [] }),
    getRecentPaths: vi.fn().mockResolvedValue({ paths: ['C:\\downloads\\weverse_sample'] }),
  },
}));

async function renderPage(props = {}) {
  let rendered;
  await act(async () => {
    rendered = render(
      <MemoryRouter>
        <WeverseUploaderPage {...props} />
      </MemoryRouter>
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return rendered;
}

describe('WeverseUploaderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title, YouTube auth card, and folder picker dropzone', async () => {
    const authUser = {
      authorizations: {
        video_uploader: { connected: false },
      },
    };

    await renderPage({ authUser });

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

    weverseUploadApi.scanFolder.mockResolvedValueOnce({
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

    await renderPage({ authUser });

    // Switch to manual path mode
    fireEvent.click(screen.getByRole('button', { name: '直接輸入本機路徑' }));

    const input = screen.getByPlaceholderText(/例如：D:\\Weverse/);
    fireEvent.change(input, { target: { value: 'C:\\downloads\\20260923_Live_3-241665049' } });

    fireEvent.click(screen.getByRole('button', { name: '掃描並辨識' }));

    await waitFor(() => {
      expect(weverseUploadApi.scanFolder).toHaveBeenCalledWith('C:\\downloads\\20260923_Live_3-241665049');
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

    weverseUploadApi.scanFolder.mockResolvedValueOnce({
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

    await renderPage({ authUser });

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

  it.each([
    { code: 'weverse_upload_result_invalid', message: '回應缺少任務 ID' },
    { code: 'timeout', message: '請求逾時' },
    { status: 503, message: '服務暫時不可用' },
  ])('blocks a direct resend when the upload start result cannot be confirmed: %j', async (uploadError) => {
    weverseUploadApi.scanFolder.mockResolvedValueOnce({
      packages: [
        {
          package_id: 'sample',
          suggested_title: 'Sample Live',
          video: { filename: 'sample.mp4', full_path: 'C:\\sample.mp4', size_formatted: '10 MB' },
          subtitles: [],
        },
      ],
    });
    weverseUploadApi.uploadFromPath.mockRejectedValueOnce(uploadError);
    await renderPage({ authUser: { authorizations: { video_uploader: { connected: true } } } });

    fireEvent.click(screen.getByRole('button', { name: '直接輸入本機路徑' }));
    fireEvent.change(screen.getByPlaceholderText(/例如：D:\\Weverse/), { target: { value: 'C:\\sample' } });
    fireEvent.click(screen.getByRole('button', { name: '掃描並辨識' }));
    const uploadButton = await screen.findByRole('button', { name: '確認並開始上傳至 YouTube' });
    fireEvent.click(uploadButton);
    fireEvent.click(screen.getByRole('button', { name: '立即上傳' }));

    expect(await screen.findByText('上傳結果待核對')).toBeInTheDocument();
    expect(screen.getByText(/請先檢查下方上傳歷史及 YouTube Studio/)).toBeInTheDocument();
    expect(uploadButton).toBeDisabled();
    expect(weverseUploadApi.getHistory).toHaveBeenCalledWith(10);
    expect(mockToast.success).not.toHaveBeenCalledWith('上傳任務已啟動！正在背景傳輸至 YouTube。');
  });

  it('keeps the selected files and review locked while the browser upload is being transferred', async () => {
    const video = new File(['fake video'], 'sample.mp4', { type: 'video/mp4' });
    weverseUploadApi.parseFiles.mockResolvedValueOnce({
      packages: [
        {
          package_id: 'sample',
          suggested_title: 'Sample Live',
          video: { filename: 'sample.mp4', relative_path: 'sample/sample.mp4', size_formatted: '10 MB' },
          subtitles: [{ filename: 'sample.ko.vtt', bcp47: 'ko', label: '韓文', size_formatted: '10 KB' }],
        },
      ],
    });
    let resolveUpload;
    weverseUploadApi.uploadFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );
    weverseUploadApi.getTask.mockResolvedValueOnce({
      task: { task_id: 'queued', title: 'Sample Live', status: 'completed', progress_percent: 100 },
    });
    const { container } = await renderPage({
      authUser: { authorizations: { video_uploader: { connected: true } } },
    });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [video] } });
    fireEvent.click(await screen.findByRole('button', { name: '確認並開始上傳至 YouTube' }));
    fireEvent.click(screen.getByRole('button', { name: '立即上傳' }));

    expect(await screen.findByText('正在傳送影片與字幕')).toBeInTheDocument();
    expect(screen.getByText(/完成後會加入 YouTube 上傳佇列/)).toBeInTheDocument();
    const reset = screen.getByRole('button', { name: '重新選擇資料夾' });
    const cancel = screen.getByRole('button', { name: '取消', exact: true });
    expect(reset).toBeDisabled();
    expect(cancel).toBeDisabled();
    expect(screen.getByLabelText(/影片標題/)).toBeDisabled();
    expect(screen.getByRole('button', { name: '全選' })).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    fireEvent.click(reset);
    fireEvent.click(cancel);
    expect(screen.getByText('步驟二：辨識結果複查與編輯')).toBeInTheDocument();
    expect(weverseUploadApi.uploadFiles).toHaveBeenCalledTimes(1);

    await act(async () => resolveUpload({ task_id: 'queued' }));
    expect(await screen.findByText('上傳成功！')).toBeInTheDocument();
    expect(weverseUploadApi.getTask).toHaveBeenCalledWith('queued');
    expect(screen.queryByText('正在傳送影片與字幕')).not.toBeInTheDocument();
  });

  it('unlocks the review after the upload start is definitively rejected', async () => {
    weverseUploadApi.scanFolder.mockResolvedValueOnce({
      packages: [
        {
          package_id: 'sample',
          suggested_title: 'Sample Live',
          video: { filename: 'sample.mp4', full_path: 'C:\\sample.mp4', size_formatted: '10 MB' },
          subtitles: [],
        },
      ],
    });
    let rejectUpload;
    weverseUploadApi.uploadFromPath.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpload = reject;
        })
    );
    await renderPage({ authUser: { authorizations: { video_uploader: { connected: true } } } });
    fireEvent.click(screen.getByRole('button', { name: '直接輸入本機路徑' }));
    fireEvent.change(screen.getByPlaceholderText(/例如：D:\\Weverse/), { target: { value: 'C:\\sample' } });
    fireEvent.click(screen.getByRole('button', { name: '掃描並辨識' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認並開始上傳至 YouTube' }));
    fireEvent.click(screen.getByRole('button', { name: '立即上傳' }));
    expect(await screen.findByText('正在建立上傳任務')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消', exact: true })).toBeDisabled();

    await act(async () => rejectUpload({ status: 403, message: '授權失效' }));
    expect(screen.getByRole('button', { name: '取消', exact: true })).toBeEnabled();
    expect(screen.getByLabelText(/影片標題/)).toBeEnabled();
    expect(screen.queryByText('正在建立上傳任務')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
    expect(screen.getByRole('button', { name: '掃描並辨識' })).toBeInTheDocument();
  });
});
