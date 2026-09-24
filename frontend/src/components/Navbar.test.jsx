import { vi } from 'vitest';
import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';
import { PATHS } from '../routes/paths';
import * as catalog from '../tools/catalog';
import { Wrench } from 'lucide-react';

function NavbarHarness({ initialEntry = '/dashboard' }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Navbar
        authUser={{ email: 'creator@example.com', youtube: { authenticated: false } }}
        onLogout={() => {}}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />
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
