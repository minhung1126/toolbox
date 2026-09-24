import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast';
import { systemSettingsApi } from '../features/settings/api/systemSettingsApi';
import SystemSettingsPage from './SystemSettingsPage';

vi.mock('../features/settings/api/systemSettingsApi', () => ({
  systemSettingsApi: {
    getCredentials: vi.fn(),
    updateCredentials: vi.fn(),
    getAllowlist: vi.fn(),
    addAllowlistEmail: vi.fn(),
    removeAllowlistEmail: vi.fn(),
    updateAllowNewUsers: vi.fn(),
  },
}));

function renderPage(props = {}) {
  return render(
    <ToastProvider>
      <SystemSettingsPage sysSettings={{ public_base_url: 'https://toolbox.example.com' }} {...props} />
    </ToastProvider>
  );
}

describe('SystemSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders security status, credentials, and allowlist', async () => {
    systemSettingsApi.getCredentials.mockResolvedValueOnce({
      status: 'success',
      credentials: {
        google: {
          client_id: 'google-client-xyz.apps.googleusercontent.com',
          has_client_secret: true,
          client_secret_masked: 'GOCSPX****1234',
          configured: true,
        },
      },
      public_base_url: 'https://toolbox.example.com',
      redirect_uri: 'https://toolbox.example.com/api/v1/auth/callback',
    });
    systemSettingsApi.getAllowlist.mockResolvedValueOnce({
      allowed_emails: ['admin@example.com', 'user@example.com'],
      current_user_email: 'admin@example.com',
      allowlist_required: true,
    });

    renderPage();

    await screen.findByText('系統密鑰與安全防護狀態');
    expect(screen.getByText(/AES-256 Fernet 憑證保險庫啟用/)).toBeInTheDocument();
    expect(screen.getByText('google-client-xyz.apps.googleusercontent.com')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('目前登入身分（您）')).toBeInTheDocument();
    expect(screen.getByText('不可自刪')).toBeInTheDocument();
  });

  it('allows editing and updating Google OAuth credentials', async () => {
    systemSettingsApi.getCredentials.mockResolvedValueOnce({
      status: 'success',
      credentials: {
        google: {
          client_id: 'old-client-id',
          has_client_secret: true,
          client_secret_masked: 'GOCSPX****1234',
          configured: true,
        },
      },
      redirect_uri: 'https://toolbox.example.com/api/v1/auth/callback',
    });
    systemSettingsApi.getAllowlist.mockResolvedValueOnce({
      allowed_emails: ['admin@example.com'],
      current_user_email: 'admin@example.com',
    });
    systemSettingsApi.updateCredentials.mockResolvedValueOnce({
      status: 'success',
      credentials: {
        google: {
          client_id: 'new-client-id',
          has_client_secret: true,
          client_secret_masked: 'new-secret****5678',
          configured: true,
        },
      },
    });

    renderPage();

    await screen.findByText('old-client-id');

    fireEvent.click(screen.getByRole('button', { name: '更新憑證' }));

    const clientInput = screen.getByDisplayValue('old-client-id');
    fireEvent.change(clientInput, { target: { value: 'new-client-id' } });

    const secretInput = screen.getByPlaceholderText(/已保存，輸入可覆蓋/);
    fireEvent.change(secretInput, { target: { value: 'new-secret-value' } });

    fireEvent.click(screen.getByRole('button', { name: '儲存憑證' }));

    await waitFor(() => {
      expect(systemSettingsApi.updateCredentials).toHaveBeenCalledWith({
        google_client_id: 'new-client-id',
        google_client_secret: 'new-secret-value',
      });
    });
  });

  it('allows adding and removing emails from the allowlist', async () => {
    systemSettingsApi.getCredentials.mockResolvedValueOnce({
      status: 'success',
      credentials: { google: { configured: true } },
    });
    systemSettingsApi.getAllowlist.mockResolvedValueOnce({
      allowed_emails: ['admin@example.com'],
      current_user_email: 'admin@example.com',
    });
    systemSettingsApi.addAllowlistEmail.mockResolvedValueOnce({
      status: 'success',
      allowed_emails: ['admin@example.com', 'newmember@example.com'],
    });
    systemSettingsApi.removeAllowlistEmail.mockResolvedValueOnce({
      status: 'success',
      allowed_emails: ['admin@example.com'],
    });

    renderPage();

    await screen.findByText('admin@example.com');

    // Add email
    const emailInput = screen.getByPlaceholderText('輸入要允許登入的 Google Email...');
    fireEvent.change(emailInput, { target: { value: 'newmember@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /新增成員/ }));

    await waitFor(() => {
      expect(systemSettingsApi.addAllowlistEmail).toHaveBeenCalledWith('newmember@example.com');
    });

    // Verify added email appears and delete button is available
    await screen.findByText('newmember@example.com');
    const deleteButton = screen.getByTitle('自白名單中移除此帳號');
    fireEvent.click(deleteButton);

    // Confirm dialog appears
    await screen.findByText('確認自白名單中移除帳號');
    fireEvent.click(screen.getByRole('button', { name: '確認移除' }));

    await waitFor(() => {
      expect(systemSettingsApi.removeAllowlistEmail).toHaveBeenCalledWith('newmember@example.com');
    });
  });

  it('allows toggling whether adding new user accounts is permitted', async () => {
    systemSettingsApi.getCredentials.mockResolvedValueOnce({
      status: 'success',
      credentials: { google: { configured: true } },
    });
    systemSettingsApi.getAllowlist.mockResolvedValueOnce({
      allowed_emails: ['admin@example.com'],
      current_user_email: 'admin@example.com',
      allow_new_users: true,
    });
    systemSettingsApi.updateAllowNewUsers.mockResolvedValueOnce({
      status: 'success',
      allow_new_users: false,
    });

    renderPage();

    await screen.findByText('允許新增使用者帳號');
    expect(screen.getByText('已啟用')).toBeInTheDocument();

    const toggleButton = screen.getByRole('button', { name: '關閉新增' });
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(systemSettingsApi.updateAllowNewUsers).toHaveBeenCalledWith(false);
    });

    // Verify disabled UI state
    await screen.findByText('已停用');
    expect(screen.getByText(/目前已關閉新增使用者帳號功能/)).toBeInTheDocument();
    const input = screen.getByPlaceholderText('已停用新增使用者帳號功能');
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: /新增成員/ })).toBeDisabled();

    // Re-enable
    systemSettingsApi.updateAllowNewUsers.mockResolvedValueOnce({
      status: 'success',
      allow_new_users: true,
    });
    const enableButton = screen.getByRole('button', { name: '開啟新增' });
    fireEvent.click(enableButton);

    await waitFor(() => {
      expect(systemSettingsApi.updateAllowNewUsers).toHaveBeenCalledWith(true);
    });
    await screen.findByText('已啟用');
    expect(screen.getByPlaceholderText('輸入要允許登入的 Google Email...')).not.toBeDisabled();
  });
});
