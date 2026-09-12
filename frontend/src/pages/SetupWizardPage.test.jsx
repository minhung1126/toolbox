import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast';
import { api } from '../services/api';
import SetupWizardPage from './SetupWizardPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../services/api', () => ({
  api: {
    getSetupStatus: vi.fn(),
    performSetup: vi.fn(),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/setup']}>
      <ToastProvider>
        <SetupWizardPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('SetupWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders completed state when system is already set up', async () => {
    api.getSetupStatus.mockResolvedValueOnce({
      is_configured: true,
      setup_completed: true,
      needs_pin: false,
    });

    renderPage();

    await screen.findByText('系統已完成設定');
    expect(screen.getByText('前往登入頁面')).toBeInTheDocument();

    fireEvent.click(screen.getByText('前往登入頁面'));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('renders setup form with development PIN auto-filled when in dev mode', async () => {
    api.getSetupStatus.mockResolvedValueOnce({
      is_configured: false,
      setup_completed: false,
      needs_pin: false,
      redirect_uri: 'http://localhost:8000/api/v1/auth/callback',
      development_pin: '999888',
    });

    renderPage();

    await screen.findByText('Toolbox 初始安裝嚮導');
    expect(screen.getByText('http://localhost:8000/api/v1/auth/callback')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/123456789-abc.apps.googleusercontent.com/)).toBeInTheDocument();
  });

  it('submits form successfully and redirects to login', async () => {
    api.getSetupStatus.mockResolvedValueOnce({
      is_configured: false,
      setup_completed: false,
      needs_pin: true,
      redirect_uri: 'https://toolbox.example.com/api/v1/auth/callback',
    });
    api.performSetup.mockResolvedValueOnce({
      status: 'success',
      message: '初始設定完成！',
    });

    renderPage();

    await screen.findByText('Toolbox 初始安裝嚮導');

    fireEvent.change(screen.getByPlaceholderText(/123456789-abc.apps.googleusercontent.com/), {
      target: { value: 'client-id-test.apps.googleusercontent.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/GOCSPX-xxxxxxxxxxxxxxxx/), {
      target: { value: 'client-secret-test' },
    });
    fireEvent.change(screen.getByPlaceholderText('admin@yourcompany.com'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('請輸入 6 位數安全碼'), {
      target: { value: '123456' },
    });

    fireEvent.click(screen.getByRole('button', { name: '儲存並完成系統初始化' }));

    await waitFor(() => {
      expect(api.performSetup).toHaveBeenCalledWith({
        googleClientId: 'client-id-test.apps.googleusercontent.com',
        googleClientSecret: 'client-secret-test',
        adminEmail: 'admin@example.com',
        pin: '123456',
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('displays error alert when setup fails', async () => {
    api.getSetupStatus.mockResolvedValueOnce({
      is_configured: false,
      setup_completed: false,
      needs_pin: false,
      redirect_uri: 'http://localhost:8000/api/v1/auth/callback',
    });
    api.performSetup.mockRejectedValueOnce(new Error('PIN 碼驗證錯誤'));

    renderPage();

    await screen.findByText('Toolbox 初始安裝嚮導');

    fireEvent.change(screen.getByPlaceholderText(/123456789-abc.apps.googleusercontent.com/), {
      target: { value: 'client-id' },
    });
    fireEvent.change(screen.getByPlaceholderText(/GOCSPX-xxxxxxxxxxxxxxxx/), {
      target: { value: 'client-secret' },
    });
    fireEvent.change(screen.getByPlaceholderText('admin@yourcompany.com'), {
      target: { value: 'admin@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: '儲存並完成系統初始化' }));

    await screen.findByText('PIN 碼驗證錯誤');
  });
});
