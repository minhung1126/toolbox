import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import GoogleAccountSettingsPage from './GoogleAccountSettingsPage';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getAuthUrl: vi.fn(),
    getSheetsAuthUrl: vi.fn(),
    disconnectSheets: vi.fn(),
    getDriveAuthUrl: vi.fn(),
    disconnectDrive: vi.fn(),
  },
}));

vi.mock('../components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe('GoogleAccountSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 4 decoupled authorization sections', () => {
    render(
      <MemoryRouter>
        <GoogleAccountSettingsPage
          authUser={{
            email: 'admin@example.com',
            token_status: 'active',
            last_refreshed_at: '2026-09-12T00:00:00Z',
            token_expires_at: '2026-09-12T01:00:00Z',
            authorizations: {
              sheets: { connected: true, user: { email: 'sheets@example.com' } },
              drive: { connected: true, user: { email: 'drive@example.com' } },
            },
          }}
          sysSettings={{ google_client_configured: true, redirect_uri: 'http://localhost:8000/auth/callback' }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('控制台登入帳號')).toBeInTheDocument();
    expect(screen.getByText('Google 試算表授權')).toBeInTheDocument();
    expect(screen.getByText('Google 雲端硬碟授權')).toBeInTheDocument();
    expect(screen.getByText('YouTube 頻道授權')).toBeInTheDocument();

    expect(screen.getByText('已登入：admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('已授權試算表')).toBeInTheDocument();
    expect(screen.getByText('已授權雲端硬碟')).toBeInTheDocument();
  });

  it('allows connecting Sheets and Drive when not connected', async () => {
    api.getSheetsAuthUrl.mockResolvedValue({ auth_url: 'https://accounts.google.com/o/oauth2/auth?sheets=1' });
    api.getDriveAuthUrl.mockResolvedValue({ auth_url: 'https://accounts.google.com/o/oauth2/auth?drive=1' });

    render(
      <MemoryRouter>
        <GoogleAccountSettingsPage
          authUser={{
            email: 'admin@example.com',
            token_status: 'active',
            authorizations: {
              sheets: { connected: false },
              drive: { connected: false },
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('尚未授權試算表')).toBeInTheDocument();
    expect(screen.getByText('尚未授權雲端硬碟')).toBeInTheDocument();

    const connectSheetsBtn = screen.getByRole('button', { name: '連結 Google 試算表' });
    fireEvent.click(connectSheetsBtn);
    await waitFor(() => expect(api.getSheetsAuthUrl).toHaveBeenCalledTimes(1));

    const connectDriveBtn = screen.getByRole('button', { name: '連結 Google 雲端硬碟' });
    fireEvent.click(connectDriveBtn);
    await waitFor(() => expect(api.getDriveAuthUrl).toHaveBeenCalledTimes(1));
  });

  it('allows disconnecting Sheets and Drive via confirmation dialog', async () => {
    api.disconnectSheets.mockResolvedValue({});
    api.disconnectDrive.mockResolvedValue({});
    const refreshAuthUser = vi.fn().mockResolvedValue({});

    render(
      <MemoryRouter>
        <GoogleAccountSettingsPage
          authUser={{
            email: 'admin@example.com',
            authorizations: {
              sheets: { connected: true, user: { email: 'sheets@example.com' } },
              drive: { connected: true, user: { email: 'drive@example.com' } },
            },
          }}
          refreshAuthUser={refreshAuthUser}
        />
      </MemoryRouter>
    );

    // Disconnect Sheets
    const disconnectSheetsBtn = screen.getByRole('button', { name: '解除試算表授權' });
    fireEvent.click(disconnectSheetsBtn);
    expect(screen.getByText('解除 Google 試算表授權')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: '確認解除' });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(api.disconnectSheets).toHaveBeenCalledTimes(1));
    expect(refreshAuthUser).toHaveBeenCalled();

    // Disconnect Drive
    const disconnectDriveBtn = screen.getByRole('button', { name: '解除雲端硬碟授權' });
    fireEvent.click(disconnectDriveBtn);
    expect(screen.getByText('解除 Google 雲端硬碟授權')).toBeInTheDocument();
    const confirmDriveBtn = screen.getByRole('button', { name: '確認解除' });
    fireEvent.click(confirmDriveBtn);
    await waitFor(() => expect(api.disconnectDrive).toHaveBeenCalledTimes(1));
  });
});
