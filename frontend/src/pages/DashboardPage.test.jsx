import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { PATHS } from '../routes/paths';

describe('DashboardPage', () => {
  it('renders dashboard with user status and tool feature cards', () => {
    render(
      <MemoryRouter>
        <DashboardPage
          authUser={{
            email: 'creator@example.com',
            authorizations: {
              sheets: { connected: true },
              drive: { connected: true },
            },
            youtube: {
              slots: {
                primary: { authenticated: true, user: { email: 'brand@youtube.test' } },
              },
            },
          }}
          sysSettings={{
            default_spreadsheet_id: 'sheet-123',
            default_playlist_id: 'playlist-456',
          }}
        />
      </MemoryRouter>
    );

    // Hero title & descriptions
    expect(screen.getByText('Toolbox 控制台')).toBeInTheDocument();
    expect(screen.getByText(/Toolbox 工具箱平台/)).toBeInTheDocument();

    // Status cards
    expect(screen.getByText('creator@example.com')).toBeInTheDocument();
    expect(screen.getByText('brand@youtube.test')).toBeInTheDocument();
    expect(screen.getByText('已設定預設試算表')).toBeInTheDocument();
    expect(screen.getByText('playlist-456')).toBeInTheDocument();

    // Feature cards
    expect(screen.getByText('Video 草稿')).toBeInTheDocument();
    expect(screen.getByText('Shorts 草稿')).toBeInTheDocument();
    expect(screen.getByText('發布草稿')).toBeInTheDocument();
    expect(screen.getByText('Drive 上傳 YouTube')).toBeInTheDocument();

    // Links
    expect(screen.getByRole('link', { name: /進入 Video 草稿/ })).toHaveAttribute(
      'href',
      PATHS.youtubeVideoDrafts
    );
    expect(screen.getByRole('link', { name: /進入 Shorts 草稿/ })).toHaveAttribute(
      'href',
      PATHS.youtubeShortsDrafts
    );
    expect(screen.getByRole('link', { name: /進入發布模組/ })).toHaveAttribute(
      'href',
      PATHS.youtubePublishCleanup
    );
    expect(screen.getByRole('link', { name: /建立上傳工作/ })).toHaveAttribute(
      'href',
      PATHS.youtubeUploadNew
    );
  });
});
