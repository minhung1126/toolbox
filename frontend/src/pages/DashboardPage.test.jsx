import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { PATHS } from '../routes/paths';
import { api } from '../services/api';
import { getAllTools } from '../tools/catalog';
import { ToolCatalogProvider } from '../tools/ToolCatalogProvider';

describe('DashboardPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows missing capabilities with reachable connection pages while leaving tool links available', async () => {
    vi.spyOn(api, 'getTools').mockResolvedValue({
      tools: getAllTools().map((tool) => ({
        id: tool.id,
        name: tool.name,
        title: tool.title,
        description: tool.description,
        category: tool.category,
        status: 'active',
        version: '1.0.0',
        entry_url: tool.entryUrl,
        required_scopes: tool.id === 'creator-tools' ? ['youtube', 'sheets_readonly'] : [],
      })),
    });
    render(
      <MemoryRouter>
        <ToolCatalogProvider enabled>
          <DashboardPage authUser={{ email: 'creator@example.com', youtube: { slots: {} } }} />
        </ToolCatalogProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole('link', { name: '連線 YouTube 頻道' })).toHaveAttribute(
      'href',
      PATHS.youtubeConnections
    );
    expect(screen.getByRole('link', { name: '連線 Google 試算表' })).toHaveAttribute('href', PATHS.googleSettings);
    expect(screen.getByRole('link', { name: /進入 Video 草稿/ })).toHaveAttribute('href', PATHS.youtubeVideoDrafts);
  });

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
    expect(screen.getByText('Sheet 內容複製')).toBeInTheDocument();
    expect(screen.getByText('系統設定')).toBeInTheDocument();
    expect(screen.getByText('系統／部署資訊')).toBeInTheDocument();
    expect(screen.getByText('API 健康度')).toBeInTheDocument();

    // Links
    expect(screen.getByRole('link', { name: /進入 Video 草稿/ })).toHaveAttribute('href', PATHS.youtubeVideoDrafts);
    expect(screen.getByRole('link', { name: /進入 Shorts 草稿/ })).toHaveAttribute('href', PATHS.youtubeShortsDrafts);
    expect(screen.getByRole('link', { name: /進入發布模組/ })).toHaveAttribute('href', PATHS.youtubePublishCleanup);
    expect(screen.getByRole('link', { name: /進入內容複製/ })).toHaveAttribute('href', PATHS.sheetCopy);
    expect(screen.getByRole('link', { name: /進入系統設定/ })).toHaveAttribute('href', PATHS.systemSettings);
  });
});
