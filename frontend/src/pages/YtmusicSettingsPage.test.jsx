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
    updateWorkState: vi.fn((key, value) => Promise.resolve({ state: { [key]: value } })),
    getWorkState: vi.fn(() => Promise.resolve({ state: {} })),
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

  it('renders region and language selector defaulting to Taiwan and explains standards', () => {
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

    const regionSelect = screen.getByLabelText('顯示地區與語言偏好');
    expect(regionSelect).toBeInTheDocument();
    expect(regionSelect.value).toBe('TW');

    // Check that preset options exist
    expect(screen.getByText(/台灣（繁體中文）/)).toBeInTheDocument();
    expect(screen.getByText(/英文 \(English\)/)).toBeInTheDocument();
    expect(screen.getByText(/韓文 \(한국어\)/)).toBeInTheDocument();
    expect(screen.getByText(/日文 \(日本語\)/)).toBeInTheDocument();
    expect(screen.getByText(/其他（自訂地區與語言代碼）/)).toBeInTheDocument();

    // Check ISO standards reference
    expect(screen.getByText(/ISO 3166-1 alpha-2/)).toBeInTheDocument();
    expect(screen.getByText(/ISO 639-1/)).toBeInTheDocument();
  });

  it('allows switching to custom region and entering custom language and location', async () => {
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

    const regionSelect = screen.getByLabelText('顯示地區與語言偏好');
    fireEvent.change(regionSelect, { target: { value: 'custom' } });

    expect(screen.getByLabelText('語言代碼 (Language)')).toBeInTheDocument();
    expect(screen.getByLabelText('地區縮寫 (Location / Country)')).toBeInTheDocument();

    const langInput = screen.getByLabelText('語言代碼 (Language)');
    const locInput = screen.getByLabelText('地區縮寫 (Location / Country)');

    fireEvent.change(langInput, { target: { value: 'fr' } });
    fireEvent.change(locInput, { target: { value: 'fr' } });

    expect(langInput.value).toBe('fr');
    expect(locInput.value).toBe('FR');

    const saveBtn = screen.getByRole('button', { name: /儲存偏好設定/ });
    fireEvent.click(saveBtn);
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
