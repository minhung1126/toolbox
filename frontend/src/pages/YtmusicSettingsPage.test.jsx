import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import YtmusicSettingsPage from './YtmusicSettingsPage';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getYtmusicAuthUrl: vi.fn(),
    disconnectYtmusic: vi.fn(),
  },
}));

vi.mock('../components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

describe('YtmusicSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders disconnected state correctly', () => {
    render(
      <MemoryRouter>
        <YtmusicSettingsPage
          authUser={{
            email: 'admin@example.com',
            authorizations: {
              ytmusic: { connected: false },
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('YouTube Music 設定')).toBeInTheDocument();
    expect(screen.getByText('YouTube Music 帳號授權狀態')).toBeInTheDocument();
    expect(screen.getByText('尚未授權')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /連結 YouTube Music 專屬帳號/ })).toBeInTheDocument();
    expect(screen.getByLabelText('預設排序規則')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /進入播放清單排序/ })).toHaveAttribute('href', '/ytmusic/playlist-sort');
  });

  it('renders fallback state when primary YouTube channel is connected', () => {
    render(
      <MemoryRouter>
        <YtmusicSettingsPage
          authUser={{
            email: 'admin@example.com',
            youtube: {
              slots: {
                primary: { authenticated: true, channel_title: 'My Creator Channel' },
              },
            },
            authorizations: {
              ytmusic: { connected: false },
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('共用 YouTube 授權中')).toBeInTheDocument();
    expect(screen.getByText(/目前沿用主要 YouTube 頻道授權/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /連結 YouTube Music 專屬帳號/ })).toBeInTheDocument();
  });

  it('renders connected state with token health information', () => {
    render(
      <MemoryRouter>
        <YtmusicSettingsPage
          authUser={{
            email: 'admin@example.com',
            authorizations: {
              ytmusic: {
                connected: true,
                user: { email: 'music_fan@example.com' },
                token_status: 'active',
                last_refreshed_at: '2026-09-15T12:00:00Z',
                token_expires_at: '2026-09-15T13:00:00Z',
              },
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('專屬帳號已授權')).toBeInTheDocument();
    expect(screen.getByText(/music_fan@example.com/)).toBeInTheDocument();
    expect(screen.getByText('憑證健康狀態')).toBeInTheDocument();
    expect(screen.getByText('Token 狀態')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重新授權 YouTube Music/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /解除專屬授權/ })).toBeInTheDocument();
  });

  it('allows changing the default sort preset', () => {
    render(
      <MemoryRouter>
        <YtmusicSettingsPage
          authUser={{
            email: 'admin@example.com',
            authorizations: { ytmusic: { connected: true } },
          }}
        />
      </MemoryRouter>
    );

    const select = screen.getByLabelText('預設排序規則');
    expect(select.value).toBe('title-asc');

    fireEvent.change(select, { target: { value: 'artist-desc' } });
    expect(select.value).toBe('artist-desc');
  });

  it('allows disconnecting YouTube Music via confirm dialog', async () => {
    api.disconnectYtmusic.mockResolvedValue({});
    const refreshAuthUser = vi.fn().mockResolvedValue({});

    render(
      <MemoryRouter>
        <YtmusicSettingsPage
          authUser={{
            email: 'admin@example.com',
            authorizations: {
              ytmusic: {
                connected: true,
                user: { email: 'music_fan@example.com' },
              },
            },
          }}
          refreshAuthUser={refreshAuthUser}
        />
      </MemoryRouter>
    );

    const disconnectBtn = screen.getByRole('button', { name: /解除專屬授權/ });
    fireEvent.click(disconnectBtn);

    expect(screen.getByText('解除 YouTube Music 授權')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: '確認解除' });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(api.disconnectYtmusic).toHaveBeenCalledTimes(1));
    expect(refreshAuthUser).toHaveBeenCalled();
  });

  it('triggers connect flow when clicking connect', async () => {
    api.getYtmusicAuthUrl.mockResolvedValue({ auth_url: 'https://accounts.google.com/o/oauth2/auth?ytmusic=1' });

    render(
      <MemoryRouter>
        <YtmusicSettingsPage
          authUser={{
            email: 'admin@example.com',
            authorizations: { ytmusic: { connected: false } },
          }}
        />
      </MemoryRouter>
    );

    const connectBtn = screen.getByRole('button', { name: /連結 YouTube Music 專屬帳號/ });
    fireEvent.click(connectBtn);

    await waitFor(() => expect(api.getYtmusicAuthUrl).toHaveBeenCalledTimes(1));
  });
});
