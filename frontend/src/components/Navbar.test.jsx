import { afterEach, beforeEach, vi } from 'vitest';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';
import { PATHS } from '../routes/paths';
import * as catalog from '../tools/catalog';
import { Wrench } from 'lucide-react';
import DashboardPage from '../pages/DashboardPage';
import { AccountWorkStateProvider } from '../hooks/useAccountWorkState';
import { api } from '../services/api';

function NavbarHarness({ initialEntry = '/dashboard', children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Navbar
        authUser={{ email: 'creator@example.com', youtube: { authenticated: false } }}
        onLogout={() => {}}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />
      {children}
    </MemoryRouter>
  );
}

describe('Navbar', () => {
  it('renders an additional manifest without changing Navbar and expands its active route', () => {
    const groups = catalog.getToolNavGroups();
    const spy = vi.spyOn(catalog, 'getToolNavGroups').mockReturnValue([
      ...groups,
      {
        id: 'new-tool',
        label: '新工具',
        icon: Wrench,
        items: [
          { id: 'new-start', to: '/new/start', label: '新工具首頁', icon: Wrench },
          { id: 'new-settings', to: '/new/settings', label: '新工具設定', icon: Wrench },
        ],
      },
    ]);
    try {
      render(<NavbarHarness initialEntry="/new/settings" />);
      expect(screen.getByRole('button', { name: '新工具' })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('link', { name: '新工具設定' })).toHaveAttribute('aria-current', 'page');
      fireEvent.click(screen.getByRole('button', { name: '新工具' }));
      expect(screen.queryByRole('link', { name: '新工具設定' })).not.toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps settings sub-navigation out of the sidebar', () => {
    render(<NavbarHarness />);
    expect(screen.queryByRole('button', { name: '整合與配額' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '便利貼' })).toHaveAttribute('href', PATHS.notes);
  });

  it('keeps labels available until the user toggles the sidebar', () => {
    window.localStorage.clear();
    render(<NavbarHarness />);

    expect(screen.getByText('儀表板總覽')).toBeVisible();
    expect(screen.getByRole('button', { name: '收起側邊選單' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: '收起側邊選單' }));

    expect(screen.getByText('儀表板總覽')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展開側邊選單' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('preserves newly pinned dashboard tools when the sidebar preferences are saved', async () => {
    const update = vi
      .spyOn(api, 'updateWorkState')
      .mockImplementation(async (key, value) => ({ state: { [key]: value } }));
    try {
      render(
        <AccountWorkStateProvider initialState={{ navigation: { sidebarCollapsed: false } }}>
          <NavbarHarness>
            <DashboardPage authUser={{ email: 'creator@example.com' }} />
          </NavbarHarness>
        </AccountWorkStateProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: '將 FFmpeg 命令行生成器 加入常用工具' }));
      await waitFor(() =>
        expect(update.mock.calls.at(-1)[1].dashboardPinnedCardIds).toEqual(['ffmpeg_generator_card'])
      );

      fireEvent.click(screen.getByRole('button', { name: '收起側邊選單' }));
      await waitFor(() => expect(update.mock.calls.at(-1)[1].sidebarCollapsed).toBe(true));
      expect(update.mock.calls.at(-1)[1].dashboardPinnedCardIds).toEqual(['ffmpeg_generator_card']);
      expect(
        within(screen.getByRole('region', { name: '常用工具' })).getByRole('link', { name: 'FFmpeg 命令行生成器' })
      ).toHaveAttribute('href', PATHS.ffmpegGenerator);
    } finally {
      update.mockRestore();
    }
  });

  it('lists YouTube workflow pages in process order', () => {
    window.localStorage.clear();
    render(<NavbarHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'YouTube' }));
    const submenu = document.getElementById('youtube-submenu');
    expect(
      within(submenu)
        .getAllByRole('link')
        .map((link) => link.textContent.trim())
    ).toEqual(['Video 草稿', 'Shorts 草稿', '發布草稿', 'YouTube 設定']);
  });

  it('lists Sheet workflow pages and settings', () => {
    window.localStorage.clear();
    render(<NavbarHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Sheet' }));
    const submenu = document.getElementById('sheet-submenu');
    expect(
      within(submenu)
        .getAllByRole('link')
        .map((link) => link.textContent.trim())
    ).toEqual(['內容複製', 'Sheet 設定']);
  });

  it('exposes system and deployment information next to API health with active state', () => {
    window.localStorage.clear();
    render(<NavbarHarness initialEntry={PATHS.systemInfo} />);

    const systemInfoLink = screen.getByRole('link', { name: '系統／部署資訊' });
    expect(systemInfoLink).toHaveAttribute('href', PATHS.systemInfo);
    expect(systemInfoLink).toHaveAttribute('aria-current', 'page');
    expect(systemInfoLink).toHaveClass('active');
  });

  it('lists System management pages in process order', () => {
    window.localStorage.clear();
    render(<NavbarHarness />);

    fireEvent.click(screen.getByRole('button', { name: '系統管理' }));
    const submenu = document.getElementById('system-submenu');
    expect(
      within(submenu)
        .getAllByRole('link')
        .map((link) => link.textContent.trim())
    ).toEqual(['系統設定', '系統／部署資訊', 'API 健康度']);
  });

  it('exposes Instagram curation tool in navigation with active state', () => {
    window.localStorage.clear();
    render(<NavbarHarness initialEntry={PATHS.photoCurator} />);

    const igLink = screen.getByRole('link', { name: 'Instagram 排版' });
    expect(igLink).toBeVisible();
    expect(igLink).toHaveAttribute('href', PATHS.photoCurator);
    expect(igLink).toHaveAttribute('aria-current', 'page');
    expect(igLink).toHaveClass('active');
  });

  it('exposes YouTube Music Playlist Sorter tool in navigation with active state', () => {
    window.localStorage.clear();
    render(<NavbarHarness initialEntry={PATHS.ytmusicPlaylistSort} />);

    const sortLink = screen.getByRole('link', { name: '播放清單排序' });
    expect(sortLink).toBeVisible();
    expect(sortLink).toHaveAttribute('href', PATHS.ytmusicPlaylistSort);
    expect(sortLink).toHaveAttribute('aria-current', 'page');
    expect(sortLink).toHaveClass('active');
  });

  it('exposes FFmpeg generator in navigation with active state', () => {
    window.localStorage.clear();
    render(<NavbarHarness initialEntry={PATHS.ffmpegGenerator} />);

    const ffmpegLink = screen.getByRole('link', { name: 'FFmpeg 生成器' });
    expect(ffmpegLink).toBeVisible();
    expect(ffmpegLink).toHaveAttribute('href', PATHS.ffmpegGenerator);
    expect(ffmpegLink).toHaveAttribute('aria-current', 'page');
    expect(ffmpegLink).toHaveClass('active');
  });

  it('exposes Weverse Uploader in navigation with active state', () => {
    window.localStorage.clear();
    render(<NavbarHarness initialEntry={PATHS.weverseUploader} />);

    const weverseLink = screen.getByRole('link', { name: 'Weverse 影片上傳' });
    expect(weverseLink).toBeVisible();
    expect(weverseLink).toHaveAttribute('href', PATHS.weverseUploader);
    expect(weverseLink).toHaveAttribute('aria-current', 'page');
    expect(weverseLink).toHaveClass('active');
  });
});

describe('Navbar drawer keyboard focus', () => {
  let frames;

  const runFrame = () => {
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(0));
    });
  };

  const openDrawer = () => {
    render(<NavbarHarness />);
    fireEvent.click(screen.getByRole('button', { name: '開啟導覽選單' }));
    runFrame();
    const drawer = screen.getByRole('complementary', { name: '主要導覽' });
    const close = within(drawer).getByRole('button', { name: '關閉導覽選單' });
    const logout = within(drawer).getByRole('button', { name: '登出控制台' });
    expect(close).toHaveFocus();
    return { drawer, close, logout };
  };

  beforeEach(() => {
    frames = new Map();
    let frameId = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback) => {
        const id = ++frameId;
        frames.set(id, callback);
        return id;
      })
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id) => frames.delete(id))
    );
    // jsdom does not lay out the drawer; model its mobile visible controls.
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function () {
      return this.matches('.sidebar-toggle') ? [] : [{ width: 44, height: 44 }];
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('recovers ignored native focus calls at both ends of the drawer', () => {
    const { close, logout } = openDrawer();
    const focusLogout = vi.spyOn(logout, 'focus').mockImplementationOnce(() => {});
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
    expect(focusLogout).toHaveBeenCalledTimes(1);
    runFrame();
    expect(logout).toHaveFocus();
    expect(focusLogout).toHaveBeenCalledTimes(2);

    const focusClose = vi.spyOn(close, 'focus').mockImplementationOnce(() => {});
    fireEvent.keyDown(logout, { key: 'Tab' });
    expect(logout).toHaveFocus();
    runFrame();
    expect(close).toHaveFocus();
    expect(focusClose).toHaveBeenCalledTimes(2);
  });

  it('does not override focus moved by the user before the retry', () => {
    const { drawer, close, logout } = openDrawer();
    const focusLogout = vi.spyOn(logout, 'focus').mockImplementationOnce(() => {});
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    const dashboard = within(drawer).getByRole('link', { name: '儀表板總覽' });
    dashboard.focus();
    runFrame();
    expect(dashboard).toHaveFocus();
    expect(focusLogout).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending retry when the drawer closes', () => {
    const { close, logout } = openDrawer();
    const focusLogout = vi.spyOn(logout, 'focus').mockImplementationOnce(() => {});
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    const retryFrame = [...frames.keys()][0];
    fireEvent.click(close);
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(retryFrame);
    runFrame();
    expect(screen.getByRole('button', { name: '開啟導覽選單' })).toHaveFocus();
    expect(focusLogout).toHaveBeenCalledTimes(1);
  });
});
