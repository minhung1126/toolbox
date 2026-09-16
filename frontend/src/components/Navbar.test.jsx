import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';
import { PATHS } from '../routes/paths';

function NavbarHarness({ initialEntry = '/dashboard' }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return <MemoryRouter initialEntries={[initialEntry]}><Navbar
    authUser={{ email: 'creator@example.com', youtube: { authenticated: false } }}
    onLogout={() => {}}
    sidebarCollapsed={sidebarCollapsed}
    setSidebarCollapsed={setSidebarCollapsed}
  /></MemoryRouter>;
}

describe('Navbar', () => {
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
    expect(within(submenu).getAllByRole('link').map((link) => link.textContent.trim())).toEqual([
      'Video 草稿',
      'Shorts 草稿',
      '發布草稿',
      'YouTube 設定',
    ]);
  });

  it('lists Sheet workflow pages and settings', () => {
    window.localStorage.clear();
    render(<NavbarHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Sheet' }));
    const submenu = document.getElementById('sheet-submenu');
    expect(within(submenu).getAllByRole('link').map((link) => link.textContent.trim())).toEqual([
      '內容複製',
      'Sheet 設定',
    ]);
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
    expect(within(submenu).getAllByRole('link').map((link) => link.textContent.trim())).toEqual([
      '系統設定',
      '系統／部署資訊',
      'API 健康度',
    ]);
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
});

