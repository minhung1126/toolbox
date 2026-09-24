import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { authApi } from '../features/auth/api/authApi';
import LoginPage from './LoginPage';

vi.mock('../features/auth/api/authApi', () => ({
  authApi: {
    getLoginConfig: vi.fn(),
    getLoginUrl: vi.fn(),
  },
}));

function renderLoginPage(props = {}) {
  return render(
    <MemoryRouter>
      <LoginPage {...props} />
    </MemoryRouter>
  );
}

describe('LoginPage readiness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prevents a dead-end OAuth attempt and can recover after configuration changes', async () => {
    authApi.getLoginConfig
      .mockResolvedValueOnce({ has_client_id: false, has_client_secret: false })
      .mockResolvedValueOnce({ has_client_id: true, has_client_secret: true });
    renderLoginPage();

    const loginButton = await screen.findByRole('button', { name: '使用 Google 帳號登入' });
    await waitFor(() => expect(loginButton).toBeDisabled());
    expect(screen.getByText(/OAuth 憑證/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新檢查' }));

    await waitFor(() => expect(loginButton).toBeEnabled());
    expect(screen.queryByText(/OAuth 憑證/)).not.toBeInTheDocument();
  });

  it('keeps an OAuth callback error visible when readiness later succeeds', async () => {
    authApi.getLoginConfig.mockResolvedValue({ has_client_id: true, has_client_secret: true });
    renderLoginPage({ initialError: 'Google 登入 callback 失敗，請重新嘗試。' });

    await waitFor(() => expect(authApi.getLoginConfig).toHaveBeenCalledOnce());
    expect(screen.getByText('Google 登入 callback 失敗，請重新嘗試。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用 Google 帳號登入' })).toBeEnabled();
  });

  it('clears only the readiness error after a successful recheck', async () => {
    authApi.getLoginConfig
      .mockResolvedValueOnce({ has_client_id: false, has_client_secret: false })
      .mockResolvedValueOnce({ has_client_id: true, has_client_secret: true });
    renderLoginPage({ initialError: 'Google OAuth callback 失敗。' });

    await screen.findByText(/OAuth 憑證/);
    expect(screen.getByText('Google OAuth callback 失敗。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新檢查' }));

    await waitFor(() => expect(screen.queryByText(/OAuth 憑證/)).not.toBeInTheDocument());
    expect(screen.getByText('Google OAuth callback 失敗。')).toBeInTheDocument();
  });

  it('describes the modular decoupled authorizations', async () => {
    authApi.getLoginConfig.mockResolvedValue({ has_client_id: true, has_client_secret: true });
    renderLoginPage();

    await waitFor(() => expect(screen.getByText(/模組化權限拆分/)).toBeInTheDocument());
    expect(screen.getByText(/Google 試算表、雲端硬碟、YouTube 頻道分別獨立授權/)).toBeInTheDocument();
  });
});
