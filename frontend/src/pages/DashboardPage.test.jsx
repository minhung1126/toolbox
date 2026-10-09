import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { PATHS } from '../routes/paths';
import { api } from '../services/api';
import { getAllTools } from '../tools/catalog';
import { ToolCatalogProvider } from '../tools/ToolCatalogProvider';
import { AccountWorkStateProvider } from '../hooks/useAccountWorkState';

function renderDashboard({ initialState = {}, catalog = false, ...props } = {}) {
  const dashboard = <DashboardPage authUser={{ email: 'creator@example.com' }} {...props} />;
  return render(
    <MemoryRouter>
      <AccountWorkStateProvider initialState={initialState}>
        {catalog ? <ToolCatalogProvider enabled>{dashboard}</ToolCatalogProvider> : dashboard}
      </AccountWorkStateProvider>
    </MemoryRouter>
  );
}

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
        routes:
          tool.id === 'creator-tools'
            ? [
                { path: PATHS.youtubeVideoDrafts, required_scopes: ['youtube', 'sheets_readonly'] },
                { path: PATHS.youtubeShortsDrafts, required_scopes: ['youtube', 'sheets_readonly'] },
                { path: PATHS.youtubePublishCleanup, required_scopes: ['youtube'] },
              ]
            : [],
      })),
    });
    render(
      <MemoryRouter>
        <ToolCatalogProvider enabled>
          <DashboardPage authUser={{ email: 'creator@example.com', youtube: { slots: {} } }} />
        </ToolCatalogProvider>
      </MemoryRouter>
    );

    expect((await screen.findAllByRole('link', { name: '連線 YouTube 頻道' }))[0]).toHaveAttribute(
      'href',
      PATHS.youtubeConnections
    );
    expect(screen.getAllByRole('link', { name: '連線 Google 試算表' })[0]).toHaveAttribute(
      'href',
      PATHS.googleSettings
    );
    const publishCard = screen.getByText('發布草稿').closest('.feature-card');
    expect(publishCard).toHaveTextContent('連線 YouTube 頻道');
    expect(publishCard).not.toHaveTextContent('連線 Google 試算表');
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

  it('searches titles and descriptions and lets an empty result return to all tools', () => {
    renderDashboard();
    const search = screen.getByRole('searchbox', { name: '搜尋工具' });

    fireEvent.change(search, { target: { value: '  ffmpeg  ' } });
    expect(screen.getByRole('link', { name: /進入生成器/ })).toHaveAttribute('href', PATHS.ffmpegGenerator);
    expect(screen.queryByRole('link', { name: /進入 Video 草稿/ })).not.toBeInTheDocument();
    expect(screen.getByText(/顯示 1 \/ .* 個工具入口/)).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '首圖橫排' } });
    expect(screen.getByRole('link', { name: /進入排版工作台/ })).toHaveAttribute('href', PATHS.photoCurator);
    expect(screen.queryByRole('link', { name: /進入生成器/ })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: '沒有這個工具' } });
    expect(screen.getByText('找不到符合的工具')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '顯示全部工具' }));
    expect(search).toHaveValue('');
    expect(screen.getByRole('link', { name: /進入 Video 草稿/ })).toBeInTheDocument();
  });

  it('pins and removes a shortcut while preserving the other navigation preferences', async () => {
    const update = vi
      .spyOn(api, 'updateWorkState')
      .mockImplementation(async (key, value) => ({ state: { [key]: value } }));
    renderDashboard({ initialState: { navigation: { sidebarCollapsed: true, youtubeOpen: false } } });
    const pin = screen.getByRole('button', { name: '將 FFmpeg 命令行生成器 加入常用工具' });

    expect(pin).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pin);
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    const favorites = screen.getByRole('region', { name: '常用工具' });
    expect(within(favorites).getByRole('link', { name: 'FFmpeg 命令行生成器' })).toHaveAttribute(
      'href',
      PATHS.ffmpegGenerator
    );
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith('navigation', {
        sidebarCollapsed: true,
        youtubeOpen: false,
        dashboardPinnedCardIds: ['ffmpeg_generator_card'],
      })
    );

    fireEvent.click(within(favorites).getByRole('button', { name: '從常用工具移除 FFmpeg 命令行生成器' }));
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    expect(within(favorites).queryByRole('link')).not.toBeInTheDocument();
    await waitFor(() => expect(update.mock.calls.at(-1)[1].dashboardPinnedCardIds).toEqual([]));
  });

  it('keeps recent dashboard entries unique and puts the latest opened tool first', async () => {
    const update = vi
      .spyOn(api, 'updateWorkState')
      .mockImplementation(async (key, value) => ({ state: { [key]: value } }));
    renderDashboard({ initialState: { navigation: { dashboardPinnedCardIds: ['ffmpeg_generator_card'] } } });

    fireEvent.click(screen.getByRole('link', { name: /進入生成器/ }));
    fireEvent.click(screen.getByRole('link', { name: /進入排版工作台/ }));
    fireEvent.click(screen.getByRole('link', { name: /進入生成器/ }));

    const recent = screen.getByRole('region', { name: '最近使用' });
    expect(
      within(recent)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
    ).toEqual([PATHS.ffmpegGenerator, PATHS.photoCurator]);
    await waitFor(() =>
      expect(update.mock.calls.at(-1)[1]).toEqual({
        dashboardPinnedCardIds: ['ffmpeg_generator_card'],
        dashboardRecentCardIds: ['ffmpeg_generator_card', 'photo_curator_card'],
      })
    );
  });

  it('hides saved shortcuts when their tool is unavailable in the server catalog', async () => {
    vi.spyOn(api, 'getTools').mockResolvedValue({
      tools: getAllTools().map((tool) => ({
        id: tool.id,
        name: tool.name,
        title: tool.title,
        description: tool.description,
        category: tool.category,
        status: tool.id === 'ffmpeg-generator' ? 'disabled' : 'active',
        version: '1.0.0',
        entry_url: tool.entryUrl,
        required_scopes: [],
      })),
    });
    renderDashboard({
      catalog: true,
      initialState: {
        navigation: {
          dashboardPinnedCardIds: ['ffmpeg_generator_card'],
          dashboardRecentCardIds: ['ffmpeg_generator_card'],
        },
      },
    });

    await screen.findByRole('link', { name: /進入 Video 草稿/ });
    expect(within(screen.getByRole('region', { name: '常用工具' })).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '最近使用' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /進入生成器/ })).not.toBeInTheDocument();
  });

  it('offers a retry when the catalog fails instead of showing a permanent loading state', async () => {
    vi.spyOn(api, 'getTools').mockRejectedValue(new Error('無法取得工具目錄'));
    renderDashboard({ catalog: true });

    const retry = await screen.findByRole('button', { name: '重新載入工具' });
    expect(screen.getByRole('alert')).toHaveTextContent('無法取得工具目錄');
    expect(screen.queryByText('工具目錄載入中…')).not.toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(api.getTools).toHaveBeenCalledTimes(2));
  });

  it('starts mobile authorization details collapsed and reveals them with the summary control', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    renderDashboard();

    const summary = screen.getByRole('region', { name: '登入與授權' });
    expect(summary).toHaveTextContent('控制台已登入 · YouTube 未連結 · 試算表未授權');
    const toggle = screen.getByRole('button', { name: '展開登入與授權狀態' });
    const details = document.getElementById(toggle.getAttribute('aria-controls'));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(details).not.toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(details).toBeVisible();
    expect(screen.getByText('creator@example.com')).toBeVisible();
    fireEvent.click(toggle);
    expect(details).not.toBeVisible();
  });
});
