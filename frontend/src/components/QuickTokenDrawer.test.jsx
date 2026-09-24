import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuickTokenDrawer from './QuickTokenDrawer';
import { ytmusicTokenApi } from '../features/ytmusic/api/ytmusicTokenApi';
import { ToastProvider } from './Toast';

vi.mock('../features/ytmusic/api/ytmusicTokenApi', () => ({
  ytmusicTokenApi: {
    validate: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
  },
}));

function renderDrawer(props = {}) {
  return render(
    <ToastProvider>
      <QuickTokenDrawer isOpen={true} onClose={vi.fn()} onTokenSaved={vi.fn()} onTokenCleared={vi.fn()} {...props} />
    </ToastProvider>
  );
}

describe('QuickTokenDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    render(
      <ToastProvider>
        <QuickTokenDrawer isOpen={false} />
      </ToastProvider>
    );
    expect(screen.queryByTestId('quick-token-drawer')).not.toBeInTheDocument();
  });

  it('renders drawer header, guide toggle, and inputs when open', () => {
    renderDrawer();
    expect(screen.getByTestId('quick-token-drawer')).toBeInTheDocument();
    expect(screen.getByText(/YouTube Music 瀏覽器 Token 快速配置/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/在此貼上右鍵複製/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /如何取得 Token？/ })).toBeInTheDocument();
  });

  it('toggles quick guide on click', () => {
    renderDrawer();
    const guideBtn = screen.getByRole('button', { name: /如何取得 Token？/ });
    fireEvent.click(guideBtn);

    expect(screen.getByText(/3 步驟快速取得/)).toBeInTheDocument();
    expect(screen.getByText(/收合教學/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /收合教學/ }));
    expect(screen.queryByText(/3 步驟快速取得/)).not.toBeInTheDocument();
  });

  it('displays active token metadata when hasCustomToken is true', () => {
    renderDrawer({
      hasCustomToken: true,
      tokenAccountName: '王小明',
      tokenChannelHandle: '@xiaoming',
      tokenUpdatedAt: '2026-09-18T12:00:00Z',
    });

    expect(screen.getByText(/目前 Token 綁定帳號/)).toBeInTheDocument();
    expect(screen.getByText('王小明')).toBeInTheDocument();
    expect(screen.getByText('(@xiaoming)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /清除/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /檢測有效性/ })).toBeInTheDocument();
  });

  it('validates token and displays result banner on success', async () => {
    ytmusicTokenApi.validate.mockResolvedValueOnce({
      valid: true,
      account_name: '測試音樂庫',
      channel_handle: '@testmusic',
      message: 'Token 有效！',
    });

    renderDrawer();
    const textarea = screen.getByPlaceholderText(/在此貼上右鍵複製/);
    fireEvent.change(textarea, { target: { value: 'curl "https://music.youtube.com" -H "cookie: SID=123"' } });

    const testBtn = screen.getByRole('button', { name: /測試此 Token/ });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(ytmusicTokenApi.validate).toHaveBeenCalledWith('curl "https://music.youtube.com" -H "cookie: SID=123"');
      expect(screen.getByText('Token 驗證成功')).toBeInTheDocument();
      expect(screen.getByText('測試音樂庫')).toBeInTheDocument();
    });
  });

  it('saves token and calls onTokenSaved callback', async () => {
    ytmusicTokenApi.save.mockResolvedValueOnce({ status: 'ok' });
    const onTokenSaved = vi.fn();

    renderDrawer({ onTokenSaved });
    const textarea = screen.getByPlaceholderText(/在此貼上右鍵複製/);
    fireEvent.change(textarea, { target: { value: 'curl "https://music.youtube.com" -H "cookie: SID=valid"' } });

    const saveBtn = screen.getByRole('button', { name: /儲存並啟用 0 配額模式/ });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(ytmusicTokenApi.save).toHaveBeenCalledWith('curl "https://music.youtube.com" -H "cookie: SID=valid"');
      expect(onTokenSaved).toHaveBeenCalled();
    });
  });

  it('clears token when clear button is clicked', async () => {
    ytmusicTokenApi.clear.mockResolvedValueOnce({ status: 'ok' });
    const onTokenCleared = vi.fn();

    renderDrawer({ hasCustomToken: true, onTokenCleared });
    const clearBtn = screen.getByRole('button', { name: /清除/ });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(ytmusicTokenApi.clear).toHaveBeenCalled();
      expect(onTokenCleared).toHaveBeenCalled();
    });
  });
});
